"""
Synchronisation des utilisateurs depuis l'Active Directory de l'entreprise via
LDAP — « local » dans le sens réseau (le contrôleur de domaine interne de
l'entreprise, par opposition à Azure AD/Entra ID dans le cloud), pas dans le
sens « application hébergée en local » : que l'app tourne sur un poste de
développement ou un serveur en ligne (VPS), c'est toujours CE serveur-là qui
doit joindre le contrôleur de domaine sur le réseau (même réseau, ou VPN
site-à-site si l'hébergement est distant).

Utilise un compte de service (bind DN) pour lister tous les utilisateurs
sans qu'un utilisateur soit connecté (équivalent du client credentials flow Azure).

Configuration : saisie par l'administrateur depuis l'application
(Administration > Active Directory, modèle ParametreLDAP). À défaut, on
retombe sur les variables .env historiques :
    LDAP_SERVER_URI    = ldap://192.168.1.10
    LDAP_BIND_DN       = CN=svcOseor,OU=Services,DC=oseor,DC=local
    LDAP_BIND_PASSWORD = motdepasse
    LDAP_BASE_DN       = DC=oseor,DC=local
"""

from ldap3 import Server, Connection, ALL, SIMPLE, SUBTREE
from django.conf import settings
from django.contrib.auth import get_user_model

from applications.utilisateurs.ldap_backend import (
    _detecter_role, generer_username,
)

User = get_user_model()


def _config_ldap() -> tuple[str, str, str, str]:
    """
    Renvoie (server_uri, bind_dn, bind_password, base_dn) : priorité à la
    configuration enregistrée en base par l'administrateur, sinon repli
    sur les variables .env.
    """
    from applications.utilisateurs.models import ParametreLDAP

    parametres = ParametreLDAP.charger()
    if parametres.configure:
        return (
            parametres.server_uri,
            parametres.bind_dn,
            parametres.bind_password,
            parametres.base_dn,
        )
    return (
        getattr(settings, 'LDAP_SERVER_URI', ''),
        getattr(settings, 'LDAP_BIND_DN', ''),
        getattr(settings, 'LDAP_BIND_PASSWORD', ''),
        getattr(settings, 'LDAP_BASE_DN', ''),
    )


def lister_utilisateurs_ad() -> list:
    """
    Retourne toutes les entrées person actives qui ont un email,
    via le compte de service configuré (base ou .env).
    """
    server_uri, bind_dn, bind_password, base_dn = _config_ldap()

    server = Server(server_uri, get_info=ALL, connect_timeout=5)
    conn = Connection(
        server,
        user=bind_dn,
        password=bind_password,
        authentication=SIMPLE,
        auto_bind=True,
        receive_timeout=30,
    )

    # Filtre : personnes avec un email, excluant les comptes désactivés
    conn.search(
        base_dn,
        '(&(objectClass=person)(mail=*)'
        '(!(userAccountControl:1.2.840.113556.1.4.803:=2)))',
        search_scope=SUBTREE,
        attributes=[
            'sAMAccountName', 'givenName', 'sn', 'mail',
            'telephoneNumber', 'title', 'memberOf', 'userAccountControl',
        ],
        paged_size=500,
    )

    entries = list(conn.entries)
    conn.unbind()
    return entries


def tester_connexion_ad(server_uri: str, bind_dn: str, bind_password: str, base_dn: str) -> int:
    """
    Tente un bind + une recherche minimale avec les valeurs fournies (utilisé
    par le bouton "Tester la connexion", avant enregistrement).
    Renvoie le nombre d'entrées trouvées, ou lève une exception explicite.
    """
    server = Server(server_uri, get_info=ALL, connect_timeout=5)
    conn = Connection(
        server,
        user=bind_dn,
        password=bind_password,
        authentication=SIMPLE,
        auto_bind=True,
        receive_timeout=10,
    )
    conn.search(
        base_dn,
        '(objectClass=person)',
        search_scope=SUBTREE,
        attributes=['cn'],
        paged_size=1,
        size_limit=1,
    )
    nb = len(conn.entries)
    conn.unbind()
    return nb


def synchroniser_utilisateur_ad(entry) -> str:
    """
    Crée ou met à jour un Utilisateur OSEOR depuis une entrée LDAP.
    Retourne 'cree', 'mis_a_jour' ou 'ignore'.
    """
    email = str(entry.mail).lower() if entry.mail else ''
    if not email:
        return 'ignore'

    username_ad = str(entry.sAMAccountName).lower() if entry.sAMAccountName else ''
    first_name = str(entry.givenName) if entry.givenName else ''
    last_name = str(entry.sn) if entry.sn else ''
    telephone = str(entry.telephoneNumber) if entry.telephoneNumber else ''
    titre = str(entry.title) if entry.title else ''
    groups = [str(g) for g in entry.memberOf] if entry.memberOf else []

    try:
        user = User.objects.get(email__iexact=email)
        created = False
    except User.DoesNotExist:
        uname = username_ad or generer_username(email)
        user = User(username=uname, email=email)
        user.set_unusable_password()
        created = True

    user.first_name = first_name
    user.last_name = last_name

    if telephone and not user.telephone:
        user.telephone = telephone

    if created or user.role == 'EMPLOYE':
        user.role = _detecter_role(groups, titre)

    user.actif = True
    user.save()
    return 'cree' if created else 'mis_a_jour'
