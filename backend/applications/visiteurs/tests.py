# -*- coding: utf-8 -*-
"""Registre des visiteurs : numéro de badge remis à l'arrivée."""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from applications.filiales.models import Filiale
from .models import Visite
from .pdf import generer_pdf_registre_visiteurs

User = get_user_model()


class BadgeVisiteurTest(APITestCase):

    def setUp(self):
        self.oseor = Filiale.objects.create(nom="OSEOR SA", code="OSEOR")
        self.agent = User.objects.create_user(
            "agent", password="x", role=User.Role.AGENT_SECURITE, filiale=self.oseor)
        self.secretaire = User.objects.create_user(
            "secretaire", password="x", role=User.Role.SECRETAIRE, filiale=self.oseor)
        self.hote = User.objects.create_user("hote", password="x", filiale=self.oseor)
        self.client.force_authenticate(self.agent)

    def arrivee(self, **champs):
        donnees = {
            "nom": "Kossi", "prenom": "Ama", "type_piece": "CNI",
            "numero_piece": "123456", "numero_badge": "B-12", "motif": "Rendez-vous",
            "filiale": self.oseor.pk, "personne_visitee": self.hote.pk,
        }
        donnees.update(champs)
        return self.client.post("/api/visites/", donnees, format="json")

    def test_badge_enregistre_et_mis_en_majuscules(self):
        reponse = self.arrivee(numero_badge="  b-12 ")

        self.assertEqual(reponse.status_code, 201, reponse.data)
        self.assertEqual(reponse.data["numero_badge"], "B-12")
        self.assertEqual(Visite.objects.get().numero_badge, "B-12")

    def test_badge_obligatoire(self):
        reponse = self.arrivee(numero_badge="")
        self.assertEqual(reponse.status_code, 400)
        self.assertIn("numero_badge", reponse.data)

    def test_format_refuse(self):
        reponse = self.arrivee(numero_badge="B 12!")
        self.assertEqual(reponse.status_code, 400)
        self.assertIn("numero_badge", reponse.data)

    def test_badge_deja_porte_par_un_visiteur_present(self):
        self.arrivee()

        reponse = self.arrivee(nom="Mensah", numero_badge="b-12")

        self.assertEqual(reponse.status_code, 400)
        self.assertIn("Ama Kossi", str(reponse.data["numero_badge"]))

    def test_badge_libere_au_depart(self):
        visite_id = self.arrivee().data["id"]
        Visite.objects.filter(pk=visite_id).update(statut=Visite.Statut.VALIDEE)
        self.client.post(f"/api/visites/{visite_id}/marquer_depart/")

        self.assertEqual(self.arrivee(nom="Mensah").status_code, 201)

    def test_badge_libere_au_refus(self):
        visite_id = self.arrivee().data["id"]
        self.client.force_authenticate(self.secretaire)
        self.client.post(f"/api/visites/{visite_id}/refuser/", {"motif": "Absent"})
        self.client.force_authenticate(self.agent)

        self.assertEqual(self.arrivee(nom="Mensah").status_code, 201)

    def test_filiale_desactivee_refusee(self):
        Filiale.objects.filter(pk=self.oseor.pk).update(active=False)
        reponse = self.arrivee()
        self.assertEqual(reponse.status_code, 400)
        self.assertIn("filiale", reponse.data)

    def test_registre_pdf_avec_badge(self):
        self.arrivee()
        contenu = generer_pdf_registre_visiteurs(list(Visite.objects.all()), "Groupe")
        self.assertTrue(contenu.startswith(b"%PDF"))
