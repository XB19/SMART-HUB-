# -*- coding: utf-8 -*-
"""
Authentification Microsoft Entra ID.

On ne peut pas joindre un tenant depuis les tests : ce qui est vérifié
ici, c'est *notre* part du contrat — la traduction des claims en
Utilisateur OSEOR, et le code d'échange qui évite de promener les jetons
dans les URL. La poignée de main OIDC elle-même est celle de
mozilla_django_oidc, déjà testée chez elle.
"""

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from applications.filiales.models import Filiale
from .models import CodeConnexionSSO
from .oidc import OseorOIDCBackend

User = get_user_model()


class CodeConnexionSSOTest(TestCase):
    """
    Le code d'échange remplace les jetons dans l'URL de redirection.

    Il doit donc se comporter comme un mot de passe à usage unique : une
    seule fois, peu de temps, et illisible dans la base.
    """

    def setUp(self):
        self.utilisateur = User.objects.create_user("paulin", password="x")

    def test_le_code_rend_son_utilisateur(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)
        self.assertEqual(CodeConnexionSSO.consommer(code), self.utilisateur)

    def test_usage_unique(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)
        CodeConnexionSSO.consommer(code)

        self.assertIsNone(CodeConnexionSSO.consommer(code))

    def test_code_perime_refuse(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)
        ligne = CodeConnexionSSO.objects.get()
        CodeConnexionSSO.objects.filter(pk=ligne.pk).update(
            date_creation=timezone.now() - timedelta(minutes=5))

        self.assertIsNone(CodeConnexionSSO.consommer(code))

    def test_code_inconnu_refuse(self):
        self.assertIsNone(CodeConnexionSSO.consommer("nimporte-quoi"))
        self.assertIsNone(CodeConnexionSSO.consommer(""))

    def test_le_code_en_clair_n_est_pas_stocke(self):
        """Lire la table ne doit pas suffire à se connecter."""
        code = CodeConnexionSSO.emettre(self.utilisateur)
        ligne = CodeConnexionSSO.objects.get()

        self.assertNotEqual(ligne.empreinte, code)
        self.assertNotIn(code, ligne.empreinte)


class EchangeCodeSSOAPITest(APITestCase):
    """Le frontend troque son code contre une paire de JWT."""

    def setUp(self):
        self.utilisateur = User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com")

    def test_echange_reussi(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)

        reponse = self.client.post("/api/auth/sso/echange/", {"code": code},
                                   format="json")

        self.assertEqual(reponse.status_code, 200)
        self.assertIn("access", reponse.data)
        self.assertIn("refresh", reponse.data)

    def test_le_jeton_obtenu_ouvre_bien_l_application(self):
        """Un JWT issu du SSO vaut celui du formulaire : même clé, même usage."""
        code = CodeConnexionSSO.emettre(self.utilisateur)
        acces = self.client.post("/api/auth/sso/echange/", {"code": code},
                                 format="json").data["access"]

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {acces}")
        profil = self.client.get("/api/auth/me/")

        self.assertEqual(profil.status_code, 200)
        self.assertEqual(profil.data["username"], "paulin")

    def test_code_rejoue_refuse(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)
        self.client.post("/api/auth/sso/echange/", {"code": code}, format="json")

        reponse = self.client.post("/api/auth/sso/echange/", {"code": code},
                                   format="json")

        self.assertEqual(reponse.status_code, 400)

    def test_compte_desactive_refuse(self):
        code = CodeConnexionSSO.emettre(self.utilisateur)
        self.utilisateur.actif = False
        self.utilisateur.save(update_fields=["actif"])

        reponse = self.client.post("/api/auth/sso/echange/", {"code": code},
                                   format="json")

        self.assertEqual(reponse.status_code, 403)

    def test_echange_ouvert_sans_authentification(self):
        """Par construction : on n'a pas encore de jeton à présenter."""
        reponse = self.client.post("/api/auth/sso/echange/", {"code": "faux"},
                                   format="json")

        self.assertEqual(reponse.status_code, 400)


class EtatSSOTest(APITestCase):
    """La page de connexion n'affiche le bouton que si le SSO répond."""

    @override_settings(ENTRA_ID_ACTIF=False)
    def test_sans_configuration_aucun_bouton(self):
        reponse = self.client.get("/api/auth/sso/etat/")

        self.assertEqual(reponse.status_code, 200)
        self.assertFalse(reponse.data["actif"])
        self.assertEqual(reponse.data["url_connexion"], "")

    def test_consultable_sans_etre_connecte(self):
        """Par construction : c'est la page de connexion qui la demande."""
        self.assertEqual(self.client.get("/api/auth/sso/etat/").status_code, 200)

    def test_avec_configuration_donne_l_url_de_depart(self):
        from django.conf import settings

        if not getattr(settings, "ENTRA_ID_ACTIF", False):
            self.skipTest("SSO non configuré dans cet environnement.")

        reponse = self.client.get("/api/auth/sso/etat/")

        self.assertTrue(reponse.data["actif"])
        self.assertEqual(reponse.data["url_connexion"], "/oidc/authenticate/")


#: Réglages minimaux attendus par le constructeur de la bibliothèque.
#: Aucun appel réseau n'est fait : ces tests n'exercent que notre code.
REGLAGES_OIDC = dict(
    ENTRA_ID_ACTIF=True,
    OIDC_RP_CLIENT_ID="client-de-test",
    OIDC_RP_CLIENT_SECRET="secret-de-test",
    OIDC_RP_SIGN_ALGO="RS256",
    OIDC_OP_AUTHORIZATION_ENDPOINT="https://exemple.invalid/authorize",
    OIDC_OP_TOKEN_ENDPOINT="https://exemple.invalid/token",
    OIDC_OP_USER_ENDPOINT="https://exemple.invalid/userinfo",
    OIDC_OP_JWKS_ENDPOINT="https://exemple.invalid/keys",
)


class RetourEntraTest(TestCase):
    """
    Ce que la vue de retour dépose dans l'URL de redirection.

    C'est là que se joue la promesse : un code, jamais un jeton.
    """

    def setUp(self):
        self.utilisateur = User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com")

    def _vue(self):
        from unittest.mock import Mock

        from .views_oidc import OseorOIDCCallbackView

        vue = OseorOIDCCallbackView()
        vue.request = Mock(user=self.utilisateur)
        return vue

    @override_settings(FRONTEND_URL="https://smarthub.oseor.com")
    def test_redirige_avec_un_code_echangeable(self):
        reponse = self._vue().login_success()

        self.assertEqual(reponse.status_code, 302)
        self.assertTrue(
            reponse.url.startswith("https://smarthub.oseor.com/auth/callback?code="),
            reponse.url)

        code = reponse.url.split("code=")[1]
        self.assertEqual(CodeConnexionSSO.consommer(code), self.utilisateur)

    @override_settings(FRONTEND_URL="https://smarthub.oseor.com")
    def test_aucun_jeton_dans_l_url(self):
        """
        Régression : l'ébauche initiale y mettait `access` et `refresh`, qui
        se seraient retrouvés dans l'historique et les journaux nginx.
        """
        url = self._vue().login_success().url

        self.assertNotIn("access=", url)
        self.assertNotIn("refresh=", url)

    @override_settings(FRONTEND_URL="https://smarthub.oseor.com")
    def test_echec_renvoie_au_formulaire(self):
        reponse = self._vue().login_failure()

        self.assertEqual(reponse.status_code, 302)
        self.assertEqual(
            reponse.url,
            "https://smarthub.oseor.com/connexion?erreur=sso_echec")

    def test_connexion_tracee_au_journal(self):
        from applications.journalisation.models import JournalAction

        self._vue().login_success()

        self.assertTrue(
            JournalAction.objects.filter(action="CONNEXION_SSO",
                                         acteur=self.utilisateur).exists())


@override_settings(**REGLAGES_OIDC)
class ClaimsVersUtilisateurTest(TestCase):
    """
    Traduction des claims Entra en Utilisateur OSEOR.

    `_synchroniser` et la détection de rôle sont appelés directement : le
    reste de la chaîne appartient à la bibliothèque.
    """

    def setUp(self):
        self.backend = OseorOIDCBackend()
        self.kapi = Filiale.objects.create(nom="KAPI Consult", code="KAPI")

    # ---------------------------------------------------------- adresse

    def test_upn_accepte_a_defaut_d_email(self):
        """Un compte Entra sans boîte mail doit pouvoir entrer."""
        claims = {"preferred_username": "Paulin@oseor.com"}

        self.assertTrue(self.backend.verify_claims(claims))
        self.assertEqual(self.backend._adresse(claims), "paulin@oseor.com")

    def test_claims_sans_identite_refuses(self):
        self.assertFalse(self.backend.verify_claims({"given_name": "Paulin"}))

    # ------------------------------------------------------------ rôles

    def test_role_depuis_le_groupe(self):
        role = self.backend._detecter_role(
            {"groups": ["OSEOR-RH", "Tout-le-monde"]})

        self.assertEqual(role, "RH")

    def test_role_depuis_le_titre_a_defaut_de_groupe(self):
        role = self.backend._detecter_role({"jobTitle": "Directeur Général"})

        self.assertEqual(role, "DIRECTEUR")

    def test_role_par_defaut(self):
        self.assertEqual(self.backend._detecter_role({}), "EMPLOYE")

    def test_groupe_prioritaire_sur_le_titre(self):
        role = self.backend._detecter_role(
            {"groups": ["OSEOR-Comptabilite"], "jobTitle": "Directeur"})

        self.assertEqual(role, "COMPTABLE")

    # --------------------------------------------------- rapprochement

    def test_compte_existant_retrouve_par_email(self):
        """
        Le salarié déjà créé par l'administrateur ne doit pas obtenir un
        second compte : il garde son rôle et sa place dans l'organigramme.
        """
        existant = User.objects.create_user(
            "paulin.t", password="x", email="Paulin@oseor.com",
            role=User.Role.COMPTABLE, filiale=self.kapi)

        trouves = self.backend.filter_users_by_claims(
            {"email": "paulin@oseor.com"})

        self.assertEqual(list(trouves), [existant])

    def test_compte_ldap_retrouve_par_username(self):
        """Les comptes importés jadis par LDAP n'ont pas tous un e-mail."""
        existant = User.objects.create_user("paulin.tcheouafe", password="x")

        trouves = self.backend.filter_users_by_claims(
            {"preferred_username": "paulin.tcheouafe@oseor.com"})

        self.assertEqual(list(trouves), [existant])

    # ------------------------------------------------ synchronisation

    def test_creation_renseigne_identite_et_role(self):
        with patch.object(OseorOIDCBackend, "get_userinfo"):
            utilisateur = self.backend.create_user({
                "email": "ama.k@oseor.com",
                "given_name": "Ama",
                "family_name": "Koffi",
                "groups": ["OSEOR-Secretariat"],
            })

        self.assertEqual(utilisateur.username, "ama.k")
        self.assertEqual(utilisateur.first_name, "Ama")
        self.assertEqual(utilisateur.role, "SECRETAIRE")
        self.assertTrue(utilisateur.actif)

    def test_compte_sso_sans_mot_de_passe_utilisable(self):
        """
        Un compte SSO ne doit pas pouvoir s'ouvrir par le formulaire : sans
        cela, le SSO deviendrait facultatif là où il est imposé.
        """
        with patch.object(OseorOIDCBackend, "get_userinfo"):
            utilisateur = self.backend.create_user({"email": "ama.k@oseor.com"})

        self.assertFalse(utilisateur.has_usable_password())

    def test_username_deduplique(self):
        User.objects.create_user("ama.k", password="x")

        with patch.object(OseorOIDCBackend, "get_userinfo"):
            utilisateur = self.backend.create_user({"email": "ama.k@oseor.com"})

        self.assertEqual(utilisateur.username, "ama.k1")

    def test_filiale_depuis_le_departement_a_la_creation(self):
        with patch.object(OseorOIDCBackend, "get_userinfo"):
            utilisateur = self.backend.create_user({
                "email": "ama.k@oseor.com",
                "department": "kapi consult",
            })

        self.assertEqual(utilisateur.filiale, self.kapi)

    def test_le_role_applicatif_n_est_pas_ecrase(self):
        """
        Régression : un compte promu dans SmartHub redeviendrait EMPLOYE à
        chaque connexion si l'annuaire avait le dernier mot.
        """
        utilisateur = User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com",
            role=User.Role.ADMINISTRATEUR)

        self.backend.update_user(utilisateur, {"email": "paulin@oseor.com",
                                               "groups": []})

        utilisateur.refresh_from_db()
        self.assertEqual(utilisateur.role, "ADMINISTRATEUR")

    def test_la_filiale_n_est_pas_ecrasee_a_la_connexion(self):
        autre = Filiale.objects.create(nom="ZIH", code="ZIH")
        utilisateur = User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com", filiale=autre)

        self.backend.update_user(utilisateur, {"email": "paulin@oseor.com",
                                               "department": "KAPI Consult"})

        utilisateur.refresh_from_db()
        self.assertEqual(utilisateur.filiale, autre)

    def test_telephone_saisi_a_la_main_conserve(self):
        utilisateur = User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com",
            telephone="+228 90 00 00 00")

        self.backend.update_user(utilisateur, {"email": "paulin@oseor.com",
                                               "mobilePhone": "+228 91 11 11 11"})

        utilisateur.refresh_from_db()
        self.assertEqual(utilisateur.telephone, "+228 90 00 00 00")

    # ---------------------------------------------------------- garde

    def test_compte_desactive_refuse_meme_par_microsoft(self):
        """Un départ se traite dans SmartHub, sans attendre le tenant."""
        User.objects.create_user(
            "paulin", password="x", email="paulin@oseor.com", actif=False)

        with patch.object(OseorOIDCBackend, "get_userinfo",
                          return_value={"email": "paulin@oseor.com"}):
            resultat = self.backend.get_or_create_user("jeton", "id", {})

        self.assertIsNone(resultat)


@override_settings(ENTRA_ID_ACTIF=False)
class SansEntraTest(TestCase):
    """
    Sans configuration Entra, l'application doit se comporter exactement
    comme avant : c'est ce qui rend le déploiement sans risque.
    """

    def test_connexion_par_mot_de_passe_intacte(self):
        User.objects.create_user("paulin", password="secret123")

        self.assertTrue(self.client.login(username="paulin",
                                          password="secret123"))


@override_settings(ALLOWED_HOSTS=["testserver"])
class DepartVersMicrosoftTest(TestCase):
    """
    Le départ vers Entra, bout de chaîne que le reste ne couvre pas.

    Les routes /oidc/ ne sont montées que si le SSO est configuré : ce test
    ne s'exécute donc que lorsque les identifiants Azure sont présents dans
    l'environnement. Pour le lancer :

        AZURE_TENANT_ID=... AZURE_CLIENT_ID=... AZURE_CLIENT_SECRET=... \
            python manage.py test applications.utilisateurs.tests_sso

    Aucun appel n'est fait à Microsoft : on vérifie l'URL construite, pas
    la réponse du tenant.
    """

    def setUp(self):
        from django.conf import settings

        if not getattr(settings, 'ENTRA_ID_ACTIF', False):
            self.skipTest("SSO non configuré dans cet environnement.")

    def test_redirection_vers_le_portail_microsoft(self):
        from urllib.parse import parse_qs, urlparse

        from django.conf import settings

        reponse = self.client.get("/oidc/authenticate/")

        self.assertEqual(reponse.status_code, 302)

        cible = urlparse(reponse.url)
        parametres = parse_qs(cible.query)

        self.assertIn("login.microsoftonline.com", cible.netloc)
        self.assertEqual(parametres["client_id"], [settings.OIDC_RP_CLIENT_ID])
        self.assertEqual(parametres["response_type"], ["code"])
        self.assertIn("openid", parametres["scope"][0])

        # Le redirect_uri doit désigner notre callback : c'est lui qui doit
        # figurer à l'identique dans l'inscription Entra.
        self.assertTrue(parametres["redirect_uri"][0].endswith("/oidc/callback/"),
                        parametres["redirect_uri"][0])

        # PKCE : Microsoft le recommande, et la protection est gratuite.
        self.assertIn("code_challenge", parametres)
