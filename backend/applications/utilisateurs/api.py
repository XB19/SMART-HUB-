from django.contrib.auth import get_user_model
from rest_framework import viewsets, generics, permissions
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from config.permissions import EstAdministrateur
from applications.journalisation.services import enregistrer_action
from .models import ParametreLDAP
from .serializers import (
    DatesNaissanceSerializer,
    UtilisateurSerializer,
    UtilisateurEcritureSerializer,
    MoiSerializer,
    MoiEcritureSerializer,
    ParametreLDAPSerializer,
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
        # écrasait, si bien que la synchronisation Active Directory était
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
    def synchroniser_ad(self, request):
        """
        Synchronise les utilisateurs depuis l'Active Directory de l'entreprise via LDAP.
        Configuration via Administration > Active Directory (ou, à défaut, .env).
        """
        from django.conf import settings
        from .services_ad import lister_utilisateurs_ad, synchroniser_utilisateur_ad

        if not ParametreLDAP.charger().configure and not getattr(settings, 'LDAP_SERVER_URI', ''):
            return Response(
                {'detail': "Active Directory non configuré. Rendez-vous dans "
                           "Administration > Active Directory pour le configurer."},
                status=400,
            )

        try:
            ad_entries = lister_utilisateurs_ad()
        except Exception as exc:
            return Response(
                {'detail': (
                    f"Erreur de connexion à l'Active Directory : {exc}. "
                    "Peu importe où l'application est hébergée (poste local ou "
                    "serveur en ligne) : c'est ce serveur qui doit pouvoir joindre le "
                    "contrôleur de domaine sur le réseau (même réseau, ou VPN "
                    "site-à-site si l'hébergement est distant) — pas votre propre "
                    "ordinateur."
                )},
                status=502,
            )

        crees = mis_a_jour = ignores = 0
        for entry in ad_entries:
            resultat = synchroniser_utilisateur_ad(entry)
            if resultat == 'cree':
                crees += 1
            elif resultat == 'mis_a_jour':
                mis_a_jour += 1
            else:
                ignores += 1

        enregistrer_action(
            request.user, 'SYNCHRO_AD',
            f'AD entreprise : {crees} créés, {mis_a_jour} mis à jour, {ignores} ignorés',
        )
        return Response({
            'crees':      crees,
            'mis_a_jour': mis_a_jour,
            'ignores':    ignores,
            'total_ad':   len(ad_entries),
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


class ParametreLDAPView(generics.RetrieveUpdateAPIView):
    """
    Configuration Active Directory (LDAP) — lecture/écriture réservée à
    l'administrateur. Table à une seule ligne (singleton).
    """

    serializer_class = ParametreLDAPSerializer
    permission_classes = [EstAdministrateur]

    def get_object(self):
        return ParametreLDAP.charger()

    def perform_update(self, serializer):
        parametres = serializer.save()
        enregistrer_action(
            self.request.user, 'PARAMETRES_AD_MODIFIES',
            'Configuration Active Directory (LDAP)', objet=parametres,
        )


class TesterConnexionLDAPView(APIView):
    """
    Teste une connexion LDAP avec les valeurs saisies (ou déjà enregistrées
    si un champ est laissé vide), sans lancer de synchronisation.
    """

    permission_classes = [EstAdministrateur]

    def post(self, request):
        from .services_ad import tester_connexion_ad

        parametres = ParametreLDAP.charger()
        donnees = request.data
        server_uri = donnees.get('server_uri') or parametres.server_uri
        base_dn = donnees.get('base_dn') or parametres.base_dn
        bind_dn = donnees.get('bind_dn') or parametres.bind_dn
        bind_password = donnees.get('bind_password') or parametres.bind_password

        if not (server_uri and base_dn and bind_dn and bind_password):
            return Response(
                {'detail': 'Renseignez le serveur, la base DN, le compte de service '
                           'et son mot de passe avant de tester.'},
                status=400,
            )

        try:
            nb = tester_connexion_ad(server_uri, bind_dn, bind_password, base_dn)
        except Exception as exc:
            return Response({'detail': (
                f'Échec de connexion : {exc}. '
                "Peu importe où l'application est hébergée (poste local ou serveur en "
                "ligne) : c'est ce serveur qui doit pouvoir joindre le contrôleur de "
                "domaine indiqué ci-dessus sur le réseau (même réseau, ou VPN "
                "site-à-site si l'hébergement est distant) — pas votre propre ordinateur."
            )}, status=502)

        return Response({'detail': f'Connexion réussie ({nb} entrée(s) trouvée(s) sur ce filtre de test).'})
