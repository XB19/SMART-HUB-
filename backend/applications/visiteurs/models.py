from django.conf import settings
from django.core.validators import RegexValidator
from django.db import models

# Format attendu du numéro selon le type de pièce : une CNI est numérique,
# un passeport mélange lettres et chiffres (format ICAO) — la validation
# ne peut donc pas être un seul motif fixe, elle dépend du type choisi
# (voir VisiteSerializer.validate).
_VALIDATEURS_NUMERO_PAR_TYPE = {
    "CNI": RegexValidator(r"^\d+$", "Le numéro de CNI ne doit contenir que des chiffres."),
    "PASSEPORT": RegexValidator(
        r"^[A-Za-z0-9]+$", "Le numéro de passeport ne doit contenir que des lettres et des chiffres."
    ),
}

valider_numero_badge = RegexValidator(
    r"^[A-Z0-9-]+$", "Le numéro de badge ne doit contenir que des lettres, des chiffres et des tirets."
)

#: Statuts d'un visiteur encore dans les locaux, donc porteur de son badge.
STATUTS_BADGE_EN_COURS = ("EN_ATTENTE", "VALIDEE")

# L'accueil est commun à tout le groupe (une seule réception physique) :
# quelle que soit la filiale visitée, c'est toujours la secrétaire de
# cette filiale-ci (le siège) qui valide, jamais celle de la filiale
# visitée — plus l'administrateur, en secours/supervision.
CODE_FILIALE_ACCUEIL = "OSEOR"


class Visite(models.Model):
    """
    Passage d'un visiteur à l'accueil : l'agent de sécurité enregistre sa
    demande (en échange de sa pièce d'identité), la secrétaire la valide ou
    la refuse, puis l'agent marque le départ quand le visiteur revient
    récupérer sa pièce. Même circuit que les réservations de salles
    (EN_ATTENTE -> VALIDEE/REFUSEE), adapté à deux acteurs seulement.
    """

    class Statut(models.TextChoices):
        EN_ATTENTE = "EN_ATTENTE", "En attente de validation"
        VALIDEE = "VALIDEE", "Validée"
        REFUSEE = "REFUSEE", "Refusée"
        TERMINEE = "TERMINEE", "Terminée"

    class TypePiece(models.TextChoices):
        CNI = "CNI", "Carte nationale d'identité"
        PASSEPORT = "PASSEPORT", "Passeport"

    nom = models.CharField(
        verbose_name="Nom",
        max_length=100,
    )

    prenom = models.CharField(
        verbose_name="Prénom",
        max_length=100,
    )

    type_piece = models.CharField(
        verbose_name="Type de pièce",
        max_length=20,
        choices=TypePiece.choices,
        default=TypePiece.CNI,
    )

    numero_piece = models.CharField(
        # Pas de `validators=` fixe ici : le format dépend de `type_piece`,
        # vérifié dans VisiteSerializer.validate (voir _VALIDATEURS_NUMERO_PAR_TYPE).
        verbose_name="Numéro de pièce d'identité",
        max_length=30,
    )

    numero_badge = models.CharField(
        # Vide autorisé en base pour les visites antérieures au badge ; le
        # champ est rendu obligatoire dans le serializer.
        verbose_name="Numéro de badge",
        help_text="Badge remis au visiteur à l'arrivée, récupéré à son départ.",
        max_length=20,
        blank=True,
        default="",
        validators=[valider_numero_badge],
    )

    motif = models.CharField(
        verbose_name="Motif de la visite",
        max_length=255,
        default="",
    )

    filiale = models.ForeignKey(
        "filiales.Filiale",
        verbose_name="Filiale visitée",
        help_text="OSEOR étant un groupe, l'accueil peut recevoir des visiteurs pour n'importe laquelle de ses filiales.",
        on_delete=models.PROTECT,
        related_name="visites",
    )

    personne_visitee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Personne visitée",
        on_delete=models.PROTECT,
        related_name="visites_recues",
        # Nullable côté base par sécurité de migration uniquement (données
        # déjà en place) ; le champ est rendu obligatoire dans le serializer.
        null=True,
        blank=True,
    )

    enregistre_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Enregistré par",
        on_delete=models.PROTECT,
        related_name="visites_enregistrees",
    )

    traite_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="Traité par",
        on_delete=models.PROTECT,
        related_name="visites_traitees",
        null=True,
        blank=True,
    )

    statut = models.CharField(
        verbose_name="Statut",
        max_length=20,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE,
    )

    motif_refus = models.CharField(
        verbose_name="Motif du refus",
        max_length=255,
        blank=True,
        default="",
    )

    heure_arrivee = models.DateTimeField(
        verbose_name="Heure d'arrivée",
        auto_now_add=True,
    )

    heure_depart = models.DateTimeField(
        verbose_name="Heure de départ",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "Visite"
        verbose_name_plural = "Visites"
        ordering = ["-heure_arrivee"]
        constraints = [
            # Un badge physique ne peut être porté que par un visiteur à la
            # fois : il redevient libre au départ ou au refus.
            models.UniqueConstraint(
                fields=["numero_badge"],
                condition=models.Q(statut__in=STATUTS_BADGE_EN_COURS) & ~models.Q(numero_badge=""),
                name="badge_unique_parmi_visiteurs_presents",
            ),
        ]

    def __str__(self):
        return f"{self.prenom} {self.nom} — {self.heure_arrivee:%d/%m/%Y %H:%M}"
