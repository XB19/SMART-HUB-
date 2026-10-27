"""
Socle de permissions : vocabulaire des rôles, fabriques de permissions DRF
et restriction des querysets par filiale et par service.

Ces helpers décident ce que chaque utilisateur voit. Une régression ici
ouvre silencieusement les données d'une filiale à une autre — d'où une
couverture plus fine que la moyenne du projet.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIRequestFactory

from applications.filiales.models import Filiale, Service
from applications.salles.models import Salle
from config.permissions import (
    ADMINISTRATEUR, COMPTABLE, RH,
    EstUnDes, LectureTousEcriture,
    est_direction, restreindre_a_la_filiale, restreindre_au_service,
)

User = get_user_model()


class BaseSocle:
    def creer_donnees(self):
        self.kapi = Filiale.objects.create(nom="KAPI Consult", code="KAPI")
        self.oseor = Filiale.objects.create(nom="OSEOR SA", code="OSEOR")

        self.salle_kapi = Salle.objects.create(
            nom="Émeraude", filiale=self.kapi, capacite=10)
        self.salle_oseor = Salle.objects.create(
            nom="Saphir", filiale=self.oseor, capacite=8)

        self.compta = Service.objects.create(
            nom="Comptabilité", code="COMPTA", filiale=self.kapi)
        self.moyens_generaux = Service.objects.create(
            nom="Moyens Généraux", code="MG", filiale=self.kapi)

        self.admin = User.objects.create_user(
            "admin", password="x", role=User.Role.ADMINISTRATEUR, filiale=self.kapi)
        self.directeur = User.objects.create_user(
            "dg", password="x", role=User.Role.DIRECTEUR, filiale=self.kapi)
        self.employe = User.objects.create_user(
            "employe", password="x", role=User.Role.EMPLOYE,
            filiale=self.kapi, service=self.compta)
        self.sans_filiale = User.objects.create_user(
            "orphelin", password="x", role=User.Role.EMPLOYE)


class EstDirectionTests(BaseSocle, TestCase):
    def setUp(self):
        self.creer_donnees()

    def test_administrateur_et_directeur(self):
        self.assertTrue(est_direction(self.admin))
        self.assertTrue(est_direction(self.directeur))

    def test_les_autres_roles_non(self):
        self.assertFalse(est_direction(self.employe))

    def test_none_et_anonyme(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertFalse(est_direction(None))
        self.assertFalse(est_direction(AnonymousUser()))


class FabriquesPermissionTests(BaseSocle, TestCase):
    def setUp(self):
        self.creer_donnees()
        self.factory = APIRequestFactory()

    def _autorise(self, permission, utilisateur, methode="get"):
        requete = getattr(self.factory, methode)("/")
        requete.user = utilisateur
        return permission().has_permission(requete, None)

    def test_est_un_des_accepte_les_roles_listes(self):
        permission = EstUnDes(RH, ADMINISTRATEUR)
        self.assertTrue(self._autorise(permission, self.admin))
        self.assertFalse(self._autorise(permission, self.employe))

    def test_est_un_des_refuse_l_anonyme(self):
        from django.contrib.auth.models import AnonymousUser
        permission = EstUnDes(ADMINISTRATEUR)
        self.assertFalse(self._autorise(permission, AnonymousUser()))

    def test_la_direction_n_est_pas_privilegiee_implicitement(self):
        """
        `EstUnDes` est littérale : le DG n'entre pas s'il n'est pas listé.
        Aux appelants d'ajouter DIRECTION quand c'est voulu.
        """
        permission = EstUnDes(COMPTABLE)
        self.assertFalse(self._autorise(permission, self.directeur))

    def test_lecture_ouverte_ecriture_restreinte(self):
        permission = LectureTousEcriture(ADMINISTRATEUR)
        self.assertTrue(self._autorise(permission, self.employe, "get"))
        self.assertFalse(self._autorise(permission, self.employe, "post"))
        self.assertTrue(self._autorise(permission, self.admin, "post"))


class RestreindreALaFilialeTests(BaseSocle, TestCase):
    def setUp(self):
        self.creer_donnees()

    def _noms(self, utilisateur):
        return set(
            restreindre_a_la_filiale(Salle.objects.all(), utilisateur)
            .values_list("nom", flat=True)
        )

    def test_direction_voit_tout_le_groupe(self):
        self.assertEqual(self._noms(self.admin), {"Émeraude", "Saphir"})
        self.assertEqual(self._noms(self.directeur), {"Émeraude", "Saphir"})

    def test_employe_limite_a_sa_filiale(self):
        self.assertEqual(self._noms(self.employe), {"Émeraude"})

    def test_compte_sans_filiale_ne_voit_rien(self):
        self.assertEqual(self._noms(self.sans_filiale), set())

    def test_anonyme_ne_voit_rien(self):
        from django.contrib.auth.models import AnonymousUser
        self.assertEqual(self._noms(AnonymousUser()), set())

    def test_champ_personnalisable(self):
        """Les modèles qui nomment autrement leur rattachement restent servis."""
        resultat = restreindre_a_la_filiale(
            User.objects.all(), self.employe, champ="filiale")
        self.assertNotIn(self.sans_filiale, resultat)


class RestreindreAuServiceTests(BaseSocle, TestCase):
    def setUp(self):
        self.creer_donnees()
        self.chef = User.objects.create_user(
            "chef", password="x", role=User.Role.CHEF_SERVICE,
            filiale=self.kapi, service=self.compta)
        self.moyens_generaux.chef = self.chef
        self.moyens_generaux.save()

    def _services(self, utilisateur):
        return set(
            restreindre_au_service(User.objects.all(), utilisateur)
            .values_list("service__code", flat=True)
        )

    def test_direction_voit_tout(self):
        self.assertEqual(
            restreindre_au_service(User.objects.all(), self.admin).count(),
            User.objects.count(),
        )

    def test_membre_limite_a_son_service(self):
        self.assertEqual(self._services(self.employe), {"COMPTA"})

    def test_chef_voit_son_service_et_ceux_qu_il_dirige(self):
        """
        Le chef appartient à COMPTA mais dirige MG : les deux périmètres
        s'additionnent, sinon il ne verrait pas l'équipe qu'il encadre.
        """
        membre_mg = User.objects.create_user(
            "membre_mg", password="x", role=User.Role.EMPLOYE,
            filiale=self.kapi, service=self.moyens_generaux)

        resultat = restreindre_au_service(User.objects.all(), self.chef)

        self.assertIn(membre_mg, resultat)
        self.assertIn(self.employe, resultat)

    def test_compte_sans_service_ne_voit_rien(self):
        self.assertEqual(
            restreindre_au_service(User.objects.all(), self.sans_filiale).count(), 0)


class ParametresServeurTests(TestCase):
    """
    Interface d'écoute de l'API.

    Régression : `serve_api.py` était figé sur 127.0.0.1 alors qu'il sert
    de commande au conteneur `api`. L'API n'était joignable que depuis
    l'intérieur de son propre conteneur — nginx recevait « connection
    refused » et le frontend ne pouvait appeler aucune API.
    """

    def test_ecoute_toutes_interfaces_par_defaut(self):
        from serve_api import parametres_serveur

        hote, port, threads = parametres_serveur({})

        self.assertEqual(hote, "0.0.0.0")
        self.assertEqual(port, 8000)
        self.assertEqual(threads, 4)

    def test_surcharge_par_l_environnement(self):
        from serve_api import parametres_serveur

        hote, port, threads = parametres_serveur({
            "API_HOST": "127.0.0.1", "API_PORT": "9000", "API_THREADS": "8",
        })

        self.assertEqual((hote, port, threads), ("127.0.0.1", 9000, 8))

    def test_aucun_proxy_de_confiance_par_defaut(self):
        from serve_api import parametres_proxy

        self.assertEqual(parametres_proxy({}), {})

    def test_proxy_de_confiance_pour_x_forwarded_proto(self):
        """
        Régression : sur le VPS, waitress effaçait X-Forwarded-Proto ;
        Django (DEBUG=False) redirigeait alors le POST de connexion vers
        https et aucun utilisateur ne pouvait se connecter.
        """
        from serve_api import parametres_proxy

        self.assertEqual(
            parametres_proxy({"API_TRUSTED_PROXY": "*"}),
            {"trusted_proxy": "*", "trusted_proxy_headers": "x-forwarded-proto"},
        )
