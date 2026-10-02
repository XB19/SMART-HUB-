"""
Authentification Microsoft Entra ID (ex-Azure AD) par OpenID Connect.

Déroulé :
  1. L'utilisateur clique « Se connecter avec Microsoft » dans Angular
  2. Le navigateur part sur Django (GET /oidc/authenticate/), qui redirige
     vers Entra
  3. Entra authentifie — mot de passe, MFA, accès conditionnel : tout se
     joue chez Microsoft, l'application ne voit jamais le mot de passe
  4. Entra renvoie un code sur /oidc/callback/ ; ce backend crée ou met à
     jour l'Utilisateur OSEOR à partir des claims
  5. La vue de callback (views_oidc.py) remet un code d'échange à usage
     unique, que le frontend troque contre une paire de JWT maison

Autrement dit, Entra dit *qui* se connecte ; l'application reste seule
maîtresse de ses propres jetons et de ses propres rôles. Rien en aval —
intercepteur Angular, garde de rôle, authentification WebSocket — ne
change selon qu'on est entré par mot de passe ou par Microsoft.

Configuration : voir le bloc « Entra ID » de config/settings.py.
"""

import logging

from django.conf import settings
from mozilla_django_oidc.auth import OIDCAuthenticationBackend

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Correspondance groupes Entra ID → rôles OSEOR.
#
# Les groupes n'arrivent dans le jeton que si le tenant les y met :
# Entra > App registrations > Token configuration > Add groups claim.
# À défaut, on retombe sur le titre de poste, puis sur EMPLOYE.
#
# Entra peut émettre les ObjectID des groupes plutôt que leurs noms ; les
# deux sont acceptés, il suffit de mettre l'un ou l'autre en clé.
# ---------------------------------------------------------------------------
GROUPES_ROLES = {
    'OSEOR-Administrateurs': 'ADMINISTRATEUR',
    'OSEOR-DG':              'DIRECTEUR',
    'OSEOR-Secretariat':     'SECRETAIRE',
    'OSEOR-RH':              'RH',
    'OSEOR-Comptabilite':    'COMPTABLE',
    'OSEOR-Chefs-Service':   'CHEF_SERVICE',
}

#: Repli sur le titre de poste (claim `jobTitle`), à ajouter lui aussi en
#: claim optionnel côté Entra pour qu'il parvienne jusqu'ici.
TITRES_ROLES = {
    'directeur':            'DIRECTEUR',
    'director':             'DIRECTEUR',
    'secrétaire':           'SECRETAIRE',
    'secretaire':           'SECRETAIRE',
    'secretary':            'SECRETAIRE',
    'assistante':           'SECRETAIRE',
    'rh':                   'RH',
    'ressources humaines':  'RH',
    'comptable':            'COMPTABLE',
    'comptabilité':         'COMPTABLE',
    'chef de service':      'CHEF_SERVICE',
}


def generer_username(email: str) -> str:
    """
    Identifiant OSEOR déduit de l'adresse Entra.

    paulin.tcheouafe@oseor.com → paulin.tcheouafe
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    base = (email or '').split('@')[0].lower().replace(' ', '.') or 'utilisateur'

    username, n = base, 1
    while User.objects.filter(username=username).exists():
        username = f"{base}{n}"
        n += 1
    return username


class OseorOIDCBackend(OIDCAuthenticationBackend):
    """
    Backend OIDC OSEOR.

    Rapproche le compte Entra d'un Utilisateur OSEOR *par l'adresse
    e-mail* : un salarié déjà créé par l'administrateur retrouve son
    compte, son rôle et sa place dans l'organigramme au lieu d'en obtenir
    un second.
    """

    # ------------------------------------------------------------------
    # Claims
    # ------------------------------------------------------------------

    def get_userinfo(self, access_token, id_token, payload):
        """
        Réunit les claims du jeton d'identité et ceux de l'endpoint
        userinfo.

        La bibliothèque n'interroge par défaut que `userinfo`, or celui de
        Microsoft est volontairement maigre : nom, prénom, e-mail, et rien
        d'autre. `groups` et `jobTitle`, dont dépend la détection du rôle,
        ne voyagent que dans le jeton d'identité. Sans cette fusion, tout
        le monde arriverait en EMPLOYE et le mappage des groupes ne
        servirait à rien.
        """
        infos = dict(payload or {})
        try:
            infos.update(super().get_userinfo(access_token, id_token, payload) or {})
        except Exception:
            # Le jeton d'identité est signé et vérifié : il suffit à
            # identifier la personne. Perdre userinfo n'est pas une raison
            # de refuser la connexion.
            logger.warning("Entra ID : endpoint userinfo injoignable, "
                           "on s'en tient au jeton d'identité.", exc_info=True)
        return infos

    @staticmethod
    def _adresse(claims) -> str:
        """
        Adresse de rattachement.

        `email` n'est présent que si le compte Entra a une boîte ; sinon
        c'est l'UPN (`preferred_username`) qui fait foi.
        """
        return (claims.get('email')
                or claims.get('preferred_username')
                or claims.get('upn')
                or '').strip().lower()

    def verify_claims(self, claims):
        """
        La bibliothèque exige `email`. On accepte aussi l'UPN, faute de
        quoi un compte Entra sans boîte mail se verrait refuser l'entrée.
        """
        return bool(self._adresse(claims))

    def filter_users_by_claims(self, claims):
        adresse = self._adresse(claims)
        if not adresse:
            return self.UserModel.objects.none()

        # `username` en second recours : les comptes importés jadis par
        # LDAP portent l'identifiant AD sans toujours avoir l'e-mail.
        correspondances = self.UserModel.objects.filter(email__iexact=adresse)
        if correspondances.exists():
            return correspondances

        return self.UserModel.objects.filter(
            username__iexact=adresse.split('@')[0])

    # ------------------------------------------------------------------
    # Création / mise à jour
    # ------------------------------------------------------------------

    def create_user(self, claims):
        adresse = self._adresse(claims)
        utilisateur = self.UserModel.objects.create_user(
            username=generer_username(adresse),
            email=adresse,
        )
        # `create_user` sans mot de passe en pose un inutilisable : c'est
        # ce qui fait dire `source_auth = SSO` au sérialiseur, et ce qui
        # interdit d'ouvrir ce compte par le formulaire classique.
        utilisateur.set_unusable_password()
        utilisateur.save(update_fields=['password'])

        self._synchroniser(utilisateur, claims, creation=True)
        return utilisateur

    def update_user(self, user, claims):
        self._synchroniser(user, claims, creation=False)
        return user

    def _synchroniser(self, user, claims, creation=False):
        """
        Reporte les claims Entra sur l'Utilisateur OSEOR.

        Ce qui se gère dans l'application ne se laisse pas écraser par
        l'annuaire : le rôle d'un compte déjà qualifié, le téléphone ou
        l'e-mail saisis à la main restent en place. L'annuaire complète,
        il ne corrige pas.
        """
        champs = []

        if claims.get('given_name'):
            user.first_name = claims['given_name']
            champs.append('first_name')
        if claims.get('family_name'):
            user.last_name = claims['family_name']
            champs.append('last_name')

        adresse = self._adresse(claims)
        if adresse and not user.email:
            user.email = adresse
            champs.append('email')

        telephone = (claims.get('mobilePhone')
                     or claims.get('telephoneNumber') or '')
        if telephone and not user.telephone:
            user.telephone = telephone
            champs.append('telephone')

        # Le rôle ne se recalcule qu'à la création, ou tant que le compte
        # est resté au rôle par défaut. Sans cela, un administrateur promu
        # dans SmartHub redeviendrait EMPLOYE à sa prochaine connexion.
        if creation or user.role == 'EMPLOYE':
            role = self._detecter_role(claims)
            if role and role != user.role:
                user.role = role
                champs.append('role')

        # La filiale ne se déduit du département Entra que si un nom
        # correspond exactement, et seulement à la création : le
        # rattachement se règle ensuite dans SmartHub.
        if creation and claims.get('department'):
            filiale = self._filiale_depuis_departement(claims['department'])
            if filiale is not None:
                user.filiale = filiale
                champs.append('filiale')

        if creation:
            user.actif = True
            champs.append('actif')

        if champs:
            user.save(update_fields=champs)

    # ------------------------------------------------------------------
    # Déductions
    # ------------------------------------------------------------------

    def _detecter_role(self, claims) -> str:
        """Rôle OSEOR : d'abord les groupes, puis le titre, sinon EMPLOYE."""
        groupes = claims.get('groups') or []
        if isinstance(groupes, str):
            groupes = [groupes]

        for cle, role in GROUPES_ROLES.items():
            if cle in groupes:
                return role

        titre = (claims.get('jobTitle') or '').lower()
        for mot_cle, role in TITRES_ROLES.items():
            if mot_cle in titre:
                return role

        return 'EMPLOYE'

    @staticmethod
    def _filiale_depuis_departement(departement: str):
        from applications.filiales.models import Filiale

        return Filiale.objects.filter(nom__iexact=departement.strip()).first()

    # ------------------------------------------------------------------
    # Garde-fous
    # ------------------------------------------------------------------

    def get_or_create_user(self, access_token, id_token, payload):
        """
        Refuse l'entrée aux comptes désactivés dans SmartHub.

        Un départ se traite ici : décocher « actif » doit fermer la porte,
        y compris par Microsoft, sans attendre que le compte Entra soit
        lui-même supprimé.
        """
        utilisateur = super().get_or_create_user(access_token, id_token, payload)

        if utilisateur is not None and not (utilisateur.actif and utilisateur.is_active):
            logger.warning("Entra ID : connexion refusée, compte inactif (%s).",
                           utilisateur.username)
            return None

        return utilisateur
