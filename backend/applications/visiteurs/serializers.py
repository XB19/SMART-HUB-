from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    CODE_FILIALE_ACCUEIL, STATUTS_BADGE_EN_COURS, Visite,
    _VALIDATEURS_NUMERO_PAR_TYPE, valider_numero_badge,
)


class VisiteSerializer(serializers.ModelSerializer):
    # Forcés `required` malgré le `default=""` / `null=True` en base
    # (nécessaire côté modèle uniquement pour ne pas bloquer une future
    # migration). Ces attributs ne sont pas hérités automatiquement dès
    # qu'un champ est redéclaré explicitement : on les reprend donc ici.
    # `numero_piece` n'a pas de validateur fixe : son format dépend de
    # `type_piece`, vérifié dans `validate()` ci-dessous (une CNI est
    # numérique, un passeport mélange lettres et chiffres).
    numero_piece = serializers.CharField(max_length=30)
    numero_badge = serializers.CharField(max_length=20)
    motif = serializers.CharField(max_length=255)
    type_piece_libelle = serializers.CharField(source="get_type_piece_display", read_only=True)
    # OSEOR est un groupe : la filiale visitée n'est pas forcément celle de
    # l'agent qui saisit (accueil commun à plusieurs filiales) — c'est lui
    # qui la précise, pour chaque visiteur.
    filiale = serializers.PrimaryKeyRelatedField(queryset=Visite._meta.get_field("filiale").related_model.objects.all())
    personne_visitee = serializers.PrimaryKeyRelatedField(
        queryset=Visite._meta.get_field("personne_visitee").related_model.objects.all()
    )

    filiale_nom = serializers.CharField(source="filiale.nom", read_only=True)
    personne_visitee_nom = serializers.CharField(source="personne_visitee.nom_complet", read_only=True)
    enregistre_par_nom = serializers.CharField(source="enregistre_par.nom_complet", read_only=True)
    traite_par_nom = serializers.CharField(source="traite_par.nom_complet", read_only=True, default=None)
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)

    class Meta:
        model = Visite
        fields = (
            "id",
            "nom",
            "prenom",
            "type_piece",
            "type_piece_libelle",
            "numero_piece",
            "numero_badge",
            "motif",
            "filiale",
            "filiale_nom",
            "personne_visitee",
            "personne_visitee_nom",
            "enregistre_par",
            "enregistre_par_nom",
            "traite_par",
            "traite_par_nom",
            "statut",
            "statut_libelle",
            "motif_refus",
            "heure_arrivee",
            "heure_depart",
        )
        read_only_fields = (
            "enregistre_par", "traite_par",
            "statut", "motif_refus", "heure_arrivee", "heure_depart",
        )

    def validate(self, attrs):
        personne = attrs.get("personne_visitee")
        filiale = attrs.get("filiale")
        if personne and filiale and personne.filiale_id != filiale.id:
            raise serializers.ValidationError(
                {"personne_visitee": "Cette personne n'appartient pas à la filiale sélectionnée."}
            )

        type_piece = attrs.get("type_piece") or Visite.TypePiece.CNI
        numero_piece = attrs.get("numero_piece")
        validateur = _VALIDATEURS_NUMERO_PAR_TYPE.get(type_piece)
        if numero_piece and validateur:
            try:
                validateur(numero_piece)
            except DjangoValidationError as erreur:
                raise serializers.ValidationError({"numero_piece": erreur.messages})

        return attrs

    def validate_filiale(self, filiale):
        if not filiale.active:
            raise serializers.ValidationError("Cette filiale est désactivée.")
        return filiale

    def validate_numero_badge(self, valeur):
        """Majuscules, format, et badge libre : aucun visiteur présent ne le porte."""
        valeur = valeur.strip().upper()
        try:
            valider_numero_badge(valeur)
        except DjangoValidationError as erreur:
            raise serializers.ValidationError(erreur.messages)

        porteur = Visite.objects.filter(
            numero_badge=valeur, statut__in=STATUTS_BADGE_EN_COURS,
        ).exclude(pk=getattr(self.instance, "pk", None)).first()
        if porteur:
            raise serializers.ValidationError(
                f"Le badge {valeur} est déjà attribué à {porteur.prenom} {porteur.nom}, "
                "toujours présent(e). Choisissez un autre badge."
            )
        return valeur

    def create(self, validated_data):
        request = self.context.get("request")
        utilisateur = request.user if request else None
        validated_data["enregistre_par"] = utilisateur

        visite = Visite.objects.create(**validated_data)
        self._notifier_accueil(visite)
        self._notifier_personne_visitee(visite)
        return visite

    def _notifier_accueil(self, visite):
        """
        Signale la nouvelle demande à qui doit la traiter : la secrétaire de
        l'accueil (toujours celle de la filiale OSEOR — le siège, pas celle
        de la filiale visitée, l'accueil étant commun à tout le groupe) et
        l'administrateur, en secours/supervision. Même schéma que RG-02
        côté réservations.
        """
        from django.contrib.auth import get_user_model
        from applications.notifications.services import envoyer_notification

        User = get_user_model()
        message = f"{visite.prenom} {visite.nom} pour {visite.personne_visitee.nom_complet} — {visite.motif}"
        destinataires = User.objects.filter(
            role=User.Role.SECRETAIRE, filiale__code=CODE_FILIALE_ACCUEIL,
        ) | User.objects.filter(role=User.Role.ADMINISTRATEUR)
        for destinataire in destinataires.distinct():
            envoyer_notification(destinataire, "Visiteur à l'accueil", message, "INFO", objet=visite)

    def _notifier_personne_visitee(self, visite):
        """La personne visitée est prévenue tout de suite, avant même la validation du secrétariat."""
        from applications.notifications.services import envoyer_notification

        envoyer_notification(
            visite.personne_visitee,
            "Un visiteur vous demande",
            f"{visite.prenom} {visite.nom} — {visite.motif}. En attente de validation par le secrétariat.",
            "INFO",
            objet=visite,
        )
