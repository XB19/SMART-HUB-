from django.conf import settings
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import viewsets, generics, permissions
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from config.permissions import EstAdministrateur
from applications.journalisation.services import enregistrer_action
from .models import CodeConnexionSSO
from .serializers import (
    DatesNaissanceSerializer,
    UtilisateurSerializer,
    UtilisateurEcritureSerializer,
    MoiSerializer,
    MoiEcritureSerializer,
)

User = get_user_model()


class UtilisateurViewSet(viewsets.ModelViewSet):
    """
    Gestion des utilisateurs (annuaire + administration).

    - Lecture : tout utilisateur authentifié (sert à l'annuaire, la
      délégation, la liste de présence interne).
    - Écriture : administrateur uniquement.
    """

    queryset = User.objects.select_related("filiale").all()
    filterset_fields = ("role", "filiale", "actif")
    search_fields = ("first_name", "last_name", "username", "email")
    ordering_fields = ("last_name", "first_name")

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return UtilisateurEcritureSerializer
        return UtilisateurSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [EstAdministrateur()]

        # Délègue à DRF pour tout le reste. Une action qui déclare ses
        # propres `permission_classes` les voit placées dans
        # `self.permission_classes` ; renvoyer une liste en dur ici les
        # écrasait, si bien que la synchronisation de l'annuaire était
        # ouverte à n'importe quel compte authentifié.
        return super().get_permissions()

    def perform_create(self, serializer):
        u = serializer.save()
        enregistrer_action(
            self.request.user, "UTILISATEUR_CREE",
            f"{u.nom_complet} ({u.get_role_display()})", objet=u,
        )

    def perform_update(self, serializer):
        u = serializer.save()
        enregistrer_action(
            self.request.user, "UTILISATEUR_MODIFIE",
            f"{u.nom_complet} ({u.get_role_display()})", objet=u,
        )

    @action(detail=False, methods=["get", "post"],
            permission_classes=[EstAdministrateur])
    def dates_naissance(self, request):
        """
        Consulte ou renseigne les dates de naissance, d'un bloc.

        Réservé à l'administrateur : c'est une donnée personnelle, absente
        de l'annuaire ouvert à tous. Elle ne sert qu'aux anniversaires du
        calendrier, et rien n'oblige un salarié à la fournir — chacun peut
        aussi la saisir lui-même depuis son profil.
        """
        if request.method == "GET":
            comptes = User.objects.filter(is_active=True).order_by(
                "last_name", "first_name")
            return Response([
                {
                    "id": u.pk,
                    "nom_complet": u.nom_complet,
                    "filiale": u.filiale.nom if u.filiale else None,
                    "date_naissance": u.date_naissance,
                }
                for u in comptes
            ])

        entree = DatesNaissanceSerializer(data=request.data)
        entree.is_valid(raise_exception=True)
        demandes = entree.validated_data["dates"]

        identifiants = []
        for cle in demandes:
            if not str(cle).isdigit():
                return Response(
                    {"detail": f"Identifiant invalide : {cle}."}, status=400)
            identifiants.append(int(cle))

        comptes = {u.pk: u for u in User.objects.filter(pk__in=identifiants)}

        introuvables = [i for i in identifiants if i not in comptes]
        if introuvables:
            return Response(
                {"detail": f"Utilisateur(s) introuvable(s) : "
                           f"{', '.join(map(str, introuvables))}."},
                status=400)

        a_enregistrer = []
        for cle, valeur in demandes.items():
            compte = comptes[int(cle)]
            compte.date_naissance = valeur
            a_enregistrer.append(compte)

        User.objects.bulk_update(a_enregistrer, ["date_naissance"])

        enregistrer_action(
            request.user, "DATES_NAISSANCE_SAISIES",
            f"{len(a_enregistrer)} compte(s)")

        return Response({"mis_a_jour": len(a_enregistrer)})

    @action(detail=False, methods=["post"], permission_classes=[EstAdministrateur])
    def synchroniser_entra(self, request):
        """
        Importe / met à jour les comptes depuis Microsoft Entra ID (Graph).
        Configuration : AZURE_* dans l'environnement du serveur.
        """
        from .services_entra import (
            ErreurEntra, entra_configure, lister_utilisateurs_entra,
            synchroniser_utilisateur_entra,
        )

        if not entra_configure():
            return Response(
                {'detail': "Microsoft Entra ID n'est pas configuré sur ce serveur "
                           "(AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)."},
                status=400,
            )

        try:
            fiches = lister_utilisateurs_entra()
        except ErreurEntra as exc:
            return Response({'detail': str(exc)}, status=502)

        compteurs = {'cree': 0, 'mis_a_jour': 0, 'ignore': 0}
        for fiche in fiches:
            compteurs[synchroniser_utilisateur_entra(fiche)] += 1

        enregistrer_action(
            request.user, 'SYNCHRO_ENTRA',
            f"Entra ID : {compteurs['cree']} créés, {compteurs['mis_a_jour']} mis à jour, "
            f"{compteurs['ignore']} ignorés",
        )
        return Response({
            'crees':      compteurs['cree'],
            'mis_a_jour': compteurs['mis_a_jour'],
            'ignores':    compteurs['ignore'],
            'total':      len(fiches),
        })

    @action(detail=False, methods=["get"])
    def recherche(self, request):
        """
        Recherche d'utilisateurs pour la délégation (EF-14) :
        ex. ?q=paul -> renvoie les correspondances nom/prénom/email.
        """
        q = request.query_params.get("q", "").strip()
        qs = self.get_queryset().filter(is_active=True)
        if q:
            from django.db.models import Q
            qs = qs.filter(
                Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(email__icontains=q)
                | Q(username__icontains=q)
            )
        qs = qs[:20]
        return Response(UtilisateurSerializer(qs, many=True).data)


class MoiView(generics.RetrieveUpdateAPIView):
    """
    Profil de l'utilisateur connecté. PATCH/PUT : upload de sa propre
    photo et/ou signature électronique (multipart/form-data).
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return MoiEcritureSerializer
        return MoiSerializer

    def update(self, request, *args, **kwargs):
        reponse = super().update(request, *args, **kwargs)
        # Renvoie le profil complet (rôle, permissions...), pas seulement
        # les deux champs modifiables, pour que le frontend reste à jour.
        return Response(MoiSerializer(request.user).data)


class EtatEntraView(APIView):
    """
    État de l'intégration Microsoft Entra ID, pour la page Administration.

    Les identifiants se règlent dans l'environnement du serveur (.env), pas
    depuis l'application : un secret client n'a rien à faire en base.
    """

    permission_classes = [EstAdministrateur]

    def get(self, request):
        actif = bool(getattr(settings, 'ENTRA_ID_ACTIF', False))
        return Response({
            'actif': actif,
            'tenant_id': settings.AZURE_TENANT_ID,
            'client_id': settings.AZURE_CLIENT_ID,
            'url_retour': request.build_absolute_uri('/oidc/callback/'),
        })


class TesterEntraView(APIView):
    """Vérifie que l'application peut lire l'annuaire via Microsoft Graph."""

    permission_classes = [EstAdministrateur]

    def post(self, request):
        from .services_entra import ErreurEntra, entra_configure, tester_connexion_entra

        if not entra_configure():
            return Response(
                {'detail': "Microsoft Entra ID n'est pas configuré sur ce serveur."},
                status=400,
            )
        try:
            tester_connexion_entra()
        except ErreurEntra as exc:
            return Response({'detail': str(exc)}, status=502)

        return Response({'detail': "Connexion réussie : l'annuaire Microsoft est lisible."})


# =====================================================================
# Microsoft Entra ID (SSO)
# =====================================================================

class EtatSSOView(APIView):
    """
    Le SSO est-il configuré sur cette instance ?

    Interrogée par la page de connexion avant d'afficher « Se connecter
    avec Microsoft » : proposer un bouton qui mènerait à une erreur de
    configuration serait pire que de ne pas le proposer du tout.

    Ouverte sans authentification — c'est la page de connexion qui la
    consulte — et ne divulgue aucun identifiant de tenant.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            'actif': bool(getattr(settings, 'ENTRA_ID_ACTIF', False)),
            'url_connexion': reverse('oidc_authentication_init')
            if getattr(settings, 'ENTRA_ID_ACTIF', False) else '',
        })


class EchangeCodeSSOView(APIView):
    """
    Échange le code à usage unique du retour Entra contre une paire de JWT.

    C'est ce qui évite de faire transiter les jetons dans l'URL de
    redirection, où ils resteraient inscrits dans l'historique et les
    journaux du serveur.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        utilisateur = CodeConnexionSSO.consommer(request.data.get('code', ''))

        if utilisateur is None:
            return Response(
                {'detail': "Code de connexion invalide ou expiré. "
                           "Relancez la connexion Microsoft."},
                status=400,
            )

        if not (utilisateur.actif and utilisateur.is_active):
            return Response({'detail': "Ce compte est désactivé."}, status=403)

        refresh = RefreshToken.for_user(utilisateur)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })
