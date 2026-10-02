"""
Retour d'authentification Entra ID.

Entra a authentifié la personne et le backend OIDC a créé ou retrouvé son
Utilisateur OSEOR. Reste à faire entrer le frontend Angular, qui, lui, ne
connaît que les JWT maison.

On ne lui envoie pas les jetons dans l'URL de redirection : ils
s'inscriraient dans l'historique du navigateur, dans les journaux nginx et
dans l'en-tête `Referer`. On lui remet un code à usage unique, valable une
minute, qu'il échange en POST contre la paire de jetons (voir
`EchangeCodeSSOView`).
"""

import logging
from urllib.parse import urlencode

from django.conf import settings
from django.shortcuts import redirect
from mozilla_django_oidc.views import OIDCAuthenticationCallbackView

from applications.journalisation.services import enregistrer_action
from .models import CodeConnexionSSO

logger = logging.getLogger(__name__)

FRONTEND_URL_DEFAUT = 'http://localhost:4200'


def _frontend() -> str:
    return getattr(settings, 'FRONTEND_URL', FRONTEND_URL_DEFAUT).rstrip('/')


class OseorOIDCCallbackView(OIDCAuthenticationCallbackView):
    """Retour d'Entra : émet le code d'échange, puis renvoie vers Angular."""

    def login_success(self):
        utilisateur = self.request.user
        code = CodeConnexionSSO.emettre(utilisateur)

        try:
            enregistrer_action(
                utilisateur, 'CONNEXION_SSO',
                f"Connexion Microsoft Entra ID — {utilisateur.email or utilisateur.username}",
                objet=utilisateur,
            )
        except Exception:
            # Tracer la connexion ne doit jamais empêcher de se connecter.
            logger.warning("Entra ID : journalisation de la connexion échouée.",
                           exc_info=True)

        return redirect(f"{_frontend()}/auth/callback?{urlencode({'code': code})}")

    def login_failure(self):
        logger.warning("Entra ID : authentification refusée.")
        return redirect(f"{_frontend()}/connexion?{urlencode({'erreur': 'sso_echec'})}")
