"""
Synchronisation des utilisateurs depuis Microsoft Entra ID (Microsoft Graph).

Importe dans SMART HUB les comptes de l'annuaire Microsoft de l'entreprise,
sans attendre que chacun se connecte une première fois. L'application
s'authentifie elle-même auprès de Graph (flux « client credentials ») avec
la même inscription que la connexion Microsoft : AZURE_TENANT_ID,
AZURE_CLIENT_ID et AZURE_CLIENT_SECRET.

Côté Entra, une seule chose en plus du SSO :
    App registrations > SmartHub > API permissions > Microsoft Graph >
    Application permissions > User.Read.All, puis « Grant admin consent ».

Les comptes sont rapprochés et complétés exactement comme lors d'une
connexion Microsoft (voir oidc.py) : même rattachement par e-mail, même
déduction du rôle, même respect de ce qui a été réglé dans SMART HUB.
"""

import requests
from django.conf import settings

GRAPH = 'https://graph.microsoft.com/v1.0'
DELAI = 15

CHAMPS_GRAPH = ','.join([
    'givenName', 'surname', 'mail', 'userPrincipalName', 'jobTitle',
    'department', 'mobilePhone', 'businessPhones', 'accountEnabled', 'userType',
])


class ErreurEntra(Exception):
    """Entra ID injoignable, mal configuré ou permission manquante."""


def entra_configure() -> bool:
    return bool(getattr(settings, 'ENTRA_ID_ACTIF', False))


def _detail(reponse) -> str:
    try:
        erreur = reponse.json()
    except ValueError:
        return f'HTTP {reponse.status_code}'
    if isinstance(erreur.get('error'), dict):
        return erreur['error'].get('message') or erreur['error'].get('code', '')
    return erreur.get('error_description') or erreur.get('error') or f'HTTP {reponse.status_code}'


def obtenir_jeton() -> str:
    """Jeton applicatif Microsoft Graph (client credentials)."""
    try:
        reponse = requests.post(
            f'https://login.microsoftonline.com/{settings.AZURE_TENANT_ID}/oauth2/v2.0/token',
            data={
                'grant_type': 'client_credentials',
                'client_id': settings.AZURE_CLIENT_ID,
                'client_secret': settings.AZURE_CLIENT_SECRET,
                'scope': 'https://graph.microsoft.com/.default',
            },
            timeout=DELAI,
        )
    except requests.RequestException as exc:
        raise ErreurEntra(f'Microsoft injoignable : {exc}') from exc

    if reponse.status_code != 200:
        raise ErreurEntra(
            "Microsoft refuse l'authentification de l'application "
            f"(vérifiez le tenant, l'ID client et le secret) : {_detail(reponse)}")
    return reponse.json()['access_token']


def _get(url, jeton, params=None) -> dict:
    try:
        reponse = requests.get(url, params=params, timeout=DELAI,
                               headers={'Authorization': f'Bearer {jeton}'})
    except requests.RequestException as exc:
        raise ErreurEntra(f'Microsoft Graph injoignable : {exc}') from exc

    if reponse.status_code == 403:
        raise ErreurEntra(
            "Permission manquante : accordez « User.Read.All » (permission "
            "d'application Microsoft Graph) à l'application dans Entra, puis "
            "« Grant admin consent ».")
    if reponse.status_code != 200:
        raise ErreurEntra(f'Microsoft Graph : {_detail(reponse)}')
    return reponse.json()


def lister_utilisateurs_entra() -> list[dict]:
    """Tous les utilisateurs de l'annuaire, pages Graph suivies."""
    jeton = obtenir_jeton()
    page = _get(f'{GRAPH}/users', jeton, {'$select': CHAMPS_GRAPH, '$top': 999})
    utilisateurs = list(page.get('value', []))

    while page.get('@odata.nextLink'):
        page = _get(page['@odata.nextLink'], jeton)
        utilisateurs.extend(page.get('value', []))

    return utilisateurs


def tester_connexion_entra() -> None:
    """Jeton + lecture d'un utilisateur : lève ErreurEntra en cas d'échec."""
    _get(f'{GRAPH}/users', obtenir_jeton(), {'$select': 'id', '$top': 1})


def claims_depuis_graph(utilisateur: dict) -> dict:
    """Fiche Graph → claims au format attendu par le backend OIDC."""
    telephones = utilisateur.get('businessPhones') or []
    return {
        'email': utilisateur.get('mail') or '',
        'preferred_username': utilisateur.get('userPrincipalName') or '',
        'given_name': utilisateur.get('givenName') or '',
        'family_name': utilisateur.get('surname') or '',
        'jobTitle': utilisateur.get('jobTitle') or '',
        'department': utilisateur.get('department') or '',
        'mobilePhone': utilisateur.get('mobilePhone') or '',
        'telephoneNumber': telephones[0] if telephones else '',
    }


def synchroniser_utilisateur_entra(utilisateur: dict, backend=None) -> str:
    """
    Crée ou met à jour un Utilisateur SMART HUB depuis une fiche Graph.
    Renvoie 'cree', 'mis_a_jour' ou 'ignore'.

    Ignorés : comptes désactivés dans Entra et invités (autre tenant).
    """
    from .oidc import OseorOIDCBackend

    if utilisateur.get('accountEnabled') is False:
        return 'ignore'
    if (utilisateur.get('userType') or 'Member') != 'Member':
        return 'ignore'

    backend = backend or OseorOIDCBackend()
    claims = claims_depuis_graph(utilisateur)
    if not backend.verify_claims(claims):
        return 'ignore'

    existants = backend.filter_users_by_claims(claims)
    if existants.exists():
        backend.update_user(existants.first(), claims)
        return 'mis_a_jour'

    backend.create_user(claims)
    return 'cree'
