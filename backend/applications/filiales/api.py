from django.db.models import Count
from rest_framework import viewsets

from applications.journalisation.services import enregistrer_action
from config.permissions import ADMINISTRATEUR, LectureSeulePourTous, LectureTousEcriture
from .models import Filiale, Service
from .serializers import FilialeSerializer, ServiceSerializer


class FilialeViewSet(viewsets.ModelViewSet):
    """
    Filiales du groupe. Lecture pour tous (sert aux listes déroulantes),
    création et modification réservées à l'administrateur
    (Administration > Filiales).

    Pas de suppression : utilisateurs, salles, documents, visites… y sont
    rattachés. Une filiale qui n'a plus cours se désactive.
    """

    queryset = (
        Filiale.objects
        .prefetch_related("parametres")
        .annotate(
            nb_utilisateurs=Count("utilisateurs", distinct=True),
            nb_services=Count("services", distinct=True),
            nb_salles=Count("salles", distinct=True),
        )
    )
    serializer_class = FilialeSerializer
    permission_classes = [LectureTousEcriture(ADMINISTRATEUR)]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    filterset_fields = ("active",)
    search_fields = ("nom", "code")
    ordering_fields = ("nom",)

    def perform_create(self, serializer):
        from applications.documents.configurations_defaut import configurer_filiale

        filiale = serializer.save()
        # Sans configuration, ses employés ne pourraient soumettre aucun
        # document administratif : on pose celle par défaut tout de suite.
        configurer_filiale(filiale)
        enregistrer_action(self.request.user, "FILIALE_CREEE",
                           f"{filiale.nom} ({filiale.code})", objet=filiale)

    def perform_update(self, serializer):
        filiale = serializer.save()
        enregistrer_action(self.request.user, "FILIALE_MODIFIEE",
                           f"{filiale.nom} ({filiale.code})", objet=filiale)


class ServiceViewSet(viewsets.ModelViewSet):
    """
    Services (départements) d'une filiale. Lecture pour tous — les listes
    déroulantes « service » en ont besoin — écriture réservée
    admin/secrétaire, comme les filiales.
    """

    serializer_class = ServiceSerializer
    permission_classes = [LectureSeulePourTous]
    filterset_fields = ("filiale", "actif")
    search_fields = ("nom", "code")
    ordering_fields = ("nom",)

    def get_queryset(self):
        return (
            Service.objects
            .select_related("filiale", "chef")
            .prefetch_related("membres")
            .all()
        )
