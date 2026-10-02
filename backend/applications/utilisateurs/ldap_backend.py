"""
Backend d'authentification Active Directory de l'entreprise via LDAP (protocole standard).
Utilise ldap3 (pure Python — fonctionne sur Windows et Linux sans compilation C).

.env requis :
    LDAP_SERVER_URI   = ldap://192.168.1.10     (ou ldaps:// pour chiffrement TLS)
    LDAP_DOMAIN       = OSEOR                   (nom NetBIOS du domaine Windows)
    LDAP_BASE_DN      = DC=oseor,DC=local
    LDAP_BIND_DN      = CN=svcOseor,OU=Services,DC=oseor,DC=local
    LDAP_BIND_PASSWORD= motdepasse

Flux d'authentification :
    1. L'utilisateur saisit son identifiant Windows + mot de passe sur le formulaire OSEOR.
    2. Django tente un bind NTLM (DOMAINE\\user) contre le contrôleur de domaine.
    3. Si réussi, on lit les attributs (nom, email, groupes, titre) pour créer/MAJ le compte OSEOR.
    4. On émet un JWT simplejwt — identique au flux local.
"""

import re
from ldap3 import Server, Connection, ALL, NTLM, SUBTREE
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.conf import settings

User = get_user_model()

# Mapping : CN du groupe AD → rôle OSEOR
# Adapter les noms de groupes à ceux configurés dans ton AD.
GROUPES_ROLES: dict[str, str] = {
    'OSEOR-Admin':       'ADMINISTRATEUR',
    'OSEOR-Directeur':   'DIRECTEUR',
    'OSEOR-Secretaire':  'SECRETAIRE',
    'OSEOR-ChefService': 'CHEF_SERVICE',
    'OSEOR-Comptable':   'COMPTABLE',
    'OSEOR-RH':          'RH',
}

# Fallback : mots-clés dans le champ « Titre » (jobTitle) de l'AD
TITRES_ROLES: dict[str, str] = {
    'directeur':           'DIRECTEUR',
    'director':            'DIRECTEUR',
    'secrétaire':          'SECRETAIRE',
    'secretaire':          'SECRETAIRE',
    'secretary':           'SECRETAIRE',
    'chef de service':     'CHEF_SERVICE',
    'head of department':  'CHEF_SERVICE',
    'comptable':           'COMPTABLE',
    'accountant':          'COMPTABLE',
    ' rh ':                'RH',
    'ressources humaines': 'RH',
    'human resources':     'RH',
}


def _extraire_cn(dn: str) -> str:
    """Extrait le CN depuis un DN complet. Ex: 'CN=OSEOR-Admin,OU=...' → 'OSEOR-Admin'"""
    m = re.match(r'CN=([^,]+)', dn, re.IGNORECASE)
    return m.group(1) if m else ''


def _detecter_role(member_of: list[str], titre: str) -> str:
    """Déduit le rôle OSEOR depuis les groupes AD, puis le titre de poste en fallback."""
    for dn in member_of:
        cn = _extraire_cn(dn)
        if cn in GROUPES_ROLES:
            return GROUPES_ROLES[cn]

    titre_lower = titre.lower()
    for mot_cle, role in TITRES_ROLES.items():
        if mot_cle in titre_lower:
            return role

    return 'EMPLOYE'


def generer_username(email: str) -> str:
    """Génère un username unique depuis l'email. Ex: paul.dupont@oseor.local → paul.dupont"""
    base = email.split('@')[0].lower()
    base = re.sub(r'[^a-z0-9._]', '_', base)
    username, n = base, 1
    while User.objects.filter(username=username).exists():
        username = f'{base}_{n}'
        n += 1
    return username


class OseorLDAPBackend(ModelBackend):
    """
    Authentifie via NTLM contre l'Active Directory de l'entreprise.
    Crée ou synchronise le compte OSEOR à chaque connexion réussie.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        uri = getattr(settings, 'LDAP_SERVER_URI', '')
        domain = getattr(settings, 'LDAP_DOMAIN', '')
        base_dn = getattr(settings, 'LDAP_BASE_DN', '')

        if not (uri and domain and base_dn):
            return None

        if not username or not password:
            return None

        try:
            server = Server(uri, get_info=ALL, connect_timeout=5)
            conn = Connection(
                server,
                user=f'{domain}\\{username}',
                password=password,
                authentication=NTLM,
                auto_bind=True,
                receive_timeout=10,
            )
        except Exception:
            return None

        try:
            conn.search(
                base_dn,
                f'(sAMAccountName={username})',
                search_scope=SUBTREE,
                attributes=[
                    'givenName', 'sn', 'mail', 'telephoneNumber',
                    'title', 'memberOf', 'userAccountControl',
                ],
            )

            if not conn.entries:
                return None

            entry = conn.entries[0]

            # Compte désactivé dans AD (bit ACCOUNTDISABLE = 0x2)
            uac = int(str(entry.userAccountControl)) if entry.userAccountControl else 0
            if uac & 0x2:
                return None

            email = str(entry.mail) if entry.mail else f'{username}@{domain}.local'.lower()
            first_name = str(entry.givenName) if entry.givenName else ''
            last_name = str(entry.sn) if entry.sn else ''
            telephone = str(entry.telephoneNumber) if entry.telephoneNumber else ''
            titre = str(entry.title) if entry.title else ''
            groups = [str(g) for g in entry.memberOf] if entry.memberOf else []

        finally:
            conn.unbind()

        # Créer ou mettre à jour le compte OSEOR
        try:
            user = User.objects.get(username__iexact=username)
            created = False
        except User.DoesNotExist:
            user = User(username=username.lower())
            user.set_unusable_password()
            created = True

        user.first_name = first_name
        user.last_name = last_name
        user.email = email
        if telephone and not user.telephone:
            user.telephone = telephone

        if created or user.role == 'EMPLOYE':
            user.role = _detecter_role(groups, titre)

        user.actif = True
        user.is_active = True
        user.save()
        return user
