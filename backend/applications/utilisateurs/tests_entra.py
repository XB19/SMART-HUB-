# -*- coding: utf-8 -*-
"""
Synchronisation de l'annuaire Microsoft Entra ID, et rôle des
super-utilisateurs.

Microsoft Graph n'est pas joignable depuis les tests : ses réponses sont
simulées, ce qui est vérifié est la traduction en Utilisateurs SMART HUB.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from .services_entra import ErreurEntra, synchroniser_utilisateur_entra
from .tests_sso import REGLAGES_OIDC

User = get_user_model()


def fiche(**champs):
    """Fiche utilisateur telle que la renvoie Graph /users."""
    base = {
        "givenName": "Paulin", "surname": "Tcheouafe",
        "mail": "paulin.tcheouafe@oseor.com",
        "userPrincipalName": "paulin.tcheouafe@oseor.com",
        "jobTitle": "", "department": "", "mobilePhone": None,
        "businessPhones": [], "accountEnabled": True, "userType": "Member",
    }
    base.update(champs)
    return base


class SuperUtilisateurTest(TestCase):
    """Régression : createsuperuser créait un compte EMPLOYE dans SMART HUB."""

    def test_create_superuser_est_administrateur(self):
        u = User.objects.create_superuser("admin", "admin@oseor.com", "x")
        self.assertEqual(u.role, User.Role.ADMINISTRATEUR)
        self.assertTrue(u.is_staff and u.is_superuser)

    def test_commande_createsuperuser(self):
        call_command("createsuperuser", interactive=False, username="chef",
                     email="chef@oseor.com", verbosity=0)
        self.assertEqual(User.objects.get(username="chef").role,
                         User.Role.ADMINISTRATEUR)

    def test_utilisateur_ordinaire_reste_employe(self):
        u = User.objects.create_user("employe", password="x")
        self.assertEqual(u.role, User.Role.EMPLOYE)


@override_settings(**REGLAGES_OIDC)
class SynchronisationFicheTest(TestCase):

    def test_creation_sans_mot_de_passe_local(self):
        self.assertEqual(synchroniser_utilisateur_entra(fiche()), "cree")

        u = User.objects.get(email="paulin.tcheouafe@oseor.com")
        self.assertEqual((u.username, u.first_name, u.last_name),
                         ("paulin.tcheouafe", "Paulin", "Tcheouafe"))
        self.assertFalse(u.has_usable_password())

    def test_compte_existant_rapproche_par_email(self):
        existant = User.objects.create_user(
            "ptcheouafe", email="Paulin.Tcheouafe@oseor.com", password="x",
            role=User.Role.DIRECTEUR)

        self.assertEqual(synchroniser_utilisateur_entra(fiche()), "mis_a_jour")

        existant.refresh_from_db()
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(existant.role, User.Role.DIRECTEUR)
        self.assertTrue(existant.has_usable_password())

    def test_upn_a_defaut_de_mail(self):
        synchroniser_utilisateur_entra(fiche(mail=None))
        self.assertTrue(User.objects.filter(email="paulin.tcheouafe@oseor.com").exists())

    def test_role_deduit_du_titre(self):
        synchroniser_utilisateur_entra(fiche(jobTitle="Directeur financier"))
        self.assertEqual(User.objects.get().role, User.Role.DIRECTEUR)

    def test_comptes_desactives_et_invites_ignores(self):
        self.assertEqual(synchroniser_utilisateur_entra(fiche(accountEnabled=False)), "ignore")
        self.assertEqual(synchroniser_utilisateur_entra(fiche(userType="Guest")), "ignore")
        self.assertFalse(User.objects.exists())


@override_settings(**REGLAGES_OIDC)
class SynchronisationAPITest(APITestCase):

    def setUp(self):
        self.admin = User.objects.create_user(
            "admin", password="x", role=User.Role.ADMINISTRATEUR)
        self.client.force_authenticate(self.admin)

    @patch("applications.utilisateurs.services_entra.lister_utilisateurs_entra")
    def test_compte_rendu(self, lister):
        lister.return_value = [
            fiche(),
            fiche(mail="awa@oseor.com", userPrincipalName="awa@oseor.com"),
            fiche(mail="invite@ailleurs.com", userType="Guest"),
        ]

        reponse = self.client.post("/api/utilisateurs/synchroniser_entra/")

        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(reponse.data, {
            "crees": 2, "mis_a_jour": 0, "ignores": 1, "total": 3})

    @patch("applications.utilisateurs.services_entra.lister_utilisateurs_entra",
           side_effect=ErreurEntra("Permission manquante"))
    def test_erreur_microsoft_remontee(self, _lister):
        reponse = self.client.post("/api/utilisateurs/synchroniser_entra/")
        self.assertEqual(reponse.status_code, 502)
        self.assertIn("Permission manquante", reponse.data["detail"])

    @override_settings(ENTRA_ID_ACTIF=False)
    def test_refus_sans_configuration(self):
        reponse = self.client.post("/api/utilisateurs/synchroniser_entra/")
        self.assertEqual(reponse.status_code, 400)

    @override_settings(AZURE_TENANT_ID="tenant", AZURE_CLIENT_ID="client")
    def test_etat_sans_secret(self):
        reponse = self.client.get("/api/parametres/entra/")
        self.assertEqual(reponse.status_code, 200)
        self.assertTrue(reponse.data["actif"])
        self.assertEqual(reponse.data["url_retour"], "http://testserver/oidc/callback/")
        self.assertNotIn("client_secret", reponse.data)

    def test_etat_reserve_a_l_administrateur(self):
        employe = User.objects.create_user("employe", password="x")
        self.client.force_authenticate(employe)
        self.assertEqual(self.client.get("/api/parametres/entra/").status_code, 403)
