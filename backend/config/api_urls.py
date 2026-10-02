"""Routeur principal de l'API REST OSEOR Digitalisation."""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from applications.utilisateurs.api import (
    UtilisateurViewSet, MoiView, ParametreLDAPView, TesterConnexionLDAPView,
    EtatSSOView, EchangeCodeSSOView,
)
from applications.filiales.api import FilialeViewSet, ServiceViewSet
from applications.salles.api import SalleViewSet
from applications.reservations.api import ReservationViewSet, SerieRecurrenceViewSet
from applications.audiences.api import AudienceViewSet, DelegationViewSet
from applications.notifications.api import NotificationViewSet
from applications.journalisation.api import JournalActionViewSet
from applications.tableau_bord.api import StatistiquesView
from applications.tableau_bord.rapports import RapportAdministratifView, RapportAdministratifExportView
from applications.documents.api import DocumentViewSet
from applications.stocks.api import ArticleViewSet, MouvementStockViewSet
from applications.contrats.api import ContratViewSet
from applications.caisse.api import BonSortieViewSet, CaisseViewSet
from applications.conges.api import DemandeCongeViewSet, JourFerieViewSet
from applications.discipline.api import ProcedureDisciplinaireViewSet
from applications.evenements.api import EvenementViewSet
from applications.galerie.api import AlbumViewSet, PhotoViewSet
from applications.prestations.api import (
    JalonPrestationViewSet, PrestationViewSet,
)
from applications.notes.api import NoteRecueViewSet
from applications.aide.api import EntreeAideViewSet
from applications.visiteurs.api import VisiteViewSet

router = DefaultRouter()
router.register("utilisateurs", UtilisateurViewSet, basename="utilisateur")
router.register("filiales", FilialeViewSet, basename="filiale")
router.register("services", ServiceViewSet, basename="service")
router.register("salles", SalleViewSet, basename="salle")
router.register("reservations", ReservationViewSet, basename="reservation")
router.register("series-recurrence", SerieRecurrenceViewSet, basename="serie")
router.register("audiences", AudienceViewSet, basename="audience")
router.register("delegations", DelegationViewSet, basename="delegation")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("journal", JournalActionViewSet, basename="journal")
router.register("documents", DocumentViewSet, basename="document")
router.register("articles", ArticleViewSet, basename="article")
router.register("mouvements-stock", MouvementStockViewSet, basename="mouvement-stock")
router.register("contrats", ContratViewSet, basename="contrat")
router.register("evenements", EvenementViewSet, basename="evenement")
router.register("conges", DemandeCongeViewSet, basename="conge")
router.register("jours-feries", JourFerieViewSet, basename="jour-ferie")
router.register("caisses", CaisseViewSet, basename="caisse")
router.register("procedures-disciplinaires",
                ProcedureDisciplinaireViewSet, basename="discipline")
router.register("bons-sortie", BonSortieViewSet, basename="bon-sortie")
router.register("albums", AlbumViewSet, basename="album")
router.register("photos", PhotoViewSet, basename="photo")
router.register("prestations", PrestationViewSet, basename="prestation")
router.register("jalons", JalonPrestationViewSet, basename="jalon")
router.register("notes-recues", NoteRecueViewSet, basename="note-recue")
router.register("aide", EntreeAideViewSet, basename="entree-aide")
router.register("visites", VisiteViewSet, basename="visite")

urlpatterns = [
    # Authentification JWT (dev)
    path("auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("auth/me/", MoiView.as_view(), name="auth_me"),

    # Microsoft Entra ID : la page de connexion demande si le SSO est
    # disponible, puis échange le code du retour contre des JWT.
    path("auth/sso/etat/", EtatSSOView.as_view(), name="sso_etat"),
    path("auth/sso/echange/", EchangeCodeSSOView.as_view(), name="sso_echange"),

    path("parametres/ldap/", ParametreLDAPView.as_view(), name="parametres_ldap"),
    path("parametres/ldap/tester/", TesterConnexionLDAPView.as_view(), name="parametres_ldap_tester"),

    path("tableau-bord/stats/", StatistiquesView.as_view(), name="tableau_bord_stats"),
    path("rapports/administratif/", RapportAdministratifView.as_view(), name="rapport_administratif"),
    path(
        "rapports/administratif/export/", RapportAdministratifExportView.as_view(),
        name="rapport_administratif_export",
    ),

    path("", include(router.urls)),
]
