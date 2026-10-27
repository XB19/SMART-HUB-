import hashlib
import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone
from django.contrib.auth.models import AbstractUser, UserManager


class UtilisateurManager(UserManager):
    """
    Gestionnaire des comptes : un super-utilisateur est administrateur.

    `createsuperuser` ne connaît que les droits Django (is_staff,
    is_superuser) ; or SMART HUB ne regarde que `role`. Sans ce réglage,
    le compte créé pour administrer la plateforme y entrait comme simple
    EMPLOYE.
    """

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", Utilisateur.Role.ADMINISTRATEUR)
        return super().create_superuser(username, email, password, **extra_fields)


class Utilisateur(AbstractUser):
    """
    Utilisateur principal de la plateforme OSEOR DIGITALISATION.

    Utilisé pour :
    - Authentification Web
    - Authentification Mobile Flutter
    - Workflows de validation
    - Signature électronique
    - Gestion documentaire
    - Gestion des salles
    - Gestion des déplacements
    """

    class Role(models.TextChoices):

        ADMINISTRATEUR = (
            "ADMINISTRATEUR",
            "Administrateur Groupe"
        )

        DIRECTEUR = (
            "DIRECTEUR",
            "Directeur"
        )

        SECRETAIRE = (
            "SECRETAIRE",
            "Secrétaire / Assistante de direction"
        )

        CHEF_SERVICE = (
            "CHEF_SERVICE",
            "Chef de service"
        )

        COMPTABLE = (
            "COMPTABLE",
            "Comptable"
        )

        RH = (
            "RH",
            "Ressources Humaines"
        )

        EMPLOYE = (
            "EMPLOYE",
            "Employé"
        )

        AGENT_SECURITE = (
            "AGENT_SECURITE",
            "Agent de sécurité"
        )

    role = models.CharField(
        verbose_name="Rôle",
        max_length=30,
        choices=Role.choices,
        default=Role.EMPLOYE
    )

    filiale = models.ForeignKey(
        "filiales.Filiale",
        verbose_name="Filiale",
        on_delete=models.PROTECT,
        related_name="utilisateurs",
        null=True,
        blank=True
    )

    service = models.ForeignKey(
        "filiales.Service",
        verbose_name="Service",
        on_delete=models.SET_NULL,
        related_name="membres",
        null=True,
        blank=True
    )

    responsable_hierarchique = models.ForeignKey(
        "self",
        verbose_name="Responsable hiérarchique",
        on_delete=models.SET_NULL,
        related_name="subordonnes",
        null=True,
        blank=True,
        help_text="Valide en premier les demandes de cet utilisateur (congés…)."
    )

    telephone = models.CharField(
        verbose_name="Téléphone",
        max_length=30,
        blank=True
    )

    date_naissance = models.DateField(
        verbose_name="Date de naissance",
        null=True,
        blank=True,
        help_text="Alimente les anniversaires du calendrier des événements."
    )

    date_embauche = models.DateField(
        verbose_name="Date d'embauche",
        null=True,
        blank=True,
        help_text="Point de départ de l'acquisition des congés (2,5 j/mois). "
                  "Sans elle, aucun congé n'est acquis."
    )


    photo_profil = models.ImageField(
        verbose_name="Photo de profil",
        upload_to="utilisateurs/photos/",
        null=True,
        blank=True
    )

    signature = models.ImageField(
        verbose_name="Signature électronique",
        upload_to="utilisateurs/signatures/",
        null=True,
        blank=True,
        help_text="Signature utilisée lors des validations."
    )

    actif = models.BooleanField(
        verbose_name="Compte actif",
        default=True
    )

    derniere_connexion_mobile = models.DateTimeField(
        verbose_name="Dernière connexion mobile",
        null=True,
        blank=True
    )

    date_creation = models.DateTimeField(
        verbose_name="Date de création",
        auto_now_add=True
    )

    date_modification = models.DateTimeField(
        verbose_name="Date de modification",
        auto_now=True
    )

    objects = UtilisateurManager()

    class Meta:
        verbose_name = "Utilisateur"
        verbose_name_plural = "Utilisateurs"
        ordering = [
            "last_name",
            "first_name"
        ]

    def __str__(self):
        return self.nom_complet

    @property
    def nom_complet(self):
        nom = self.get_full_name()

        if nom:
            return nom

        return self.username

    @property
    def est_administrateur(self):
        return self.role == self.Role.ADMINISTRATEUR

    @property
    def est_directeur(self):
        return self.role == self.Role.DIRECTEUR

    @property
    def est_secretaire(self):
        return self.role == self.Role.SECRETAIRE

    @property
    def est_chef_service(self):
        return self.role == self.Role.CHEF_SERVICE

    @property
    def est_comptable(self):
        return self.role == self.Role.COMPTABLE

    @property
    def est_rh(self):
        return self.role == self.Role.RH

    @property
    def est_employe(self):
        return self.role == self.Role.EMPLOYE

    # -----------------------------------------------------------------
    # Hiérarchie
    # -----------------------------------------------------------------

    # Garde-fou : borne la remontée de la hiérarchie même si un cycle a été
    # introduit hors validation (synchronisation Entra ID, fixtures, SQL
    # direct — aucun de ces chemins n'appelle `clean()`).
    PROFONDEUR_MAX_HIERARCHIE = 20

    def chaine_responsables(self):
        """
        Responsables successifs, du plus proche au plus lointain.
        S'arrête au premier cycle rencontré plutôt que de boucler.
        """
        chaine = []
        vus = {self.pk}
        courant = self.responsable_hierarchique

        while courant is not None and len(chaine) < self.PROFONDEUR_MAX_HIERARCHIE:
            if courant.pk in vus:
                break
            chaine.append(courant)
            vus.add(courant.pk)
            courant = courant.responsable_hierarchique

        return chaine

    def est_responsable_de(self, autre):
        """
        True si `self` est, directement ou non, un responsable de `autre`.
        Un utilisateur n'est jamais son propre responsable.
        """
        if autre is None or autre.pk == self.pk:
            return False
        return any(r.pk == self.pk for r in autre.chaine_responsables())

    @property
    def valideur_conge(self):
        """
        Qui valide en premier une demande de congé de cet utilisateur :
        son responsable direct, sinon le chef de son service (sauf s'il
        s'agit de lui-même), sinon personne — les RH prennent alors le relais.
        """
        if self.responsable_hierarchique_id:
            return self.responsable_hierarchique

        if self.service_id and self.service.chef_id:
            if self.service.chef_id != self.pk:
                return self.service.chef

        return None

    def clean(self):
        """Interdit qu'un utilisateur soit son propre responsable, direct ou non."""
        from django.core.exceptions import ValidationError

        super().clean()

        if not self.responsable_hierarchique_id:
            return

        if self.responsable_hierarchique_id == self.pk:
            raise ValidationError({
                "responsable_hierarchique": "Un utilisateur ne peut pas être son "
                                            "propre responsable.",
            })

        # Remonter depuis le responsable désigné : si l'on retombe sur
        # `self`, le rattachement crée un cycle.
        courant = self.responsable_hierarchique
        vus = set()
        profondeur = 0

        while courant is not None and profondeur < self.PROFONDEUR_MAX_HIERARCHIE:
            if courant.pk == self.pk:
                raise ValidationError({
                    "responsable_hierarchique": "Ce rattachement crée un cycle dans "
                                                "la hiérarchie.",
                })
            if courant.pk in vus:
                break
            vus.add(courant.pk)
            courant = courant.responsable_hierarchique
            profondeur += 1


class CodeConnexionSSO(models.Model):
    """
    Code d'échange à usage unique, remis après une authentification Entra ID.

    Le callback SSO ne peut pas déposer les jetons dans le navigateur : il
    redirige, et une redirection ne transporte que son URL. Y écrire les
    JWT les inscrirait dans l'historique du navigateur, dans les journaux
    nginx et dans l'en-tête `Referer` des pages suivantes — un jeton de
    rafraîchissement vaut sept jours d'accès. On redirige donc avec ce
    code, que le frontend échange une seule fois, en POST, contre la paire
    de jetons.

    Seule l'empreinte est conservée : lire la table ne permet pas de
    rejouer un code, pas plus que lire `auth_user` ne donne un mot de
    passe.
    """

    #: Un code non échangé dans la minute est perdu : le frontend le
    #: présente dès l'arrivée sur /auth/callback, jamais plus tard.
    DUREE_VALIDITE = timedelta(minutes=1)

    empreinte = models.CharField(
        verbose_name="Empreinte du code",
        max_length=64,
        unique=True,
        db_index=True,
    )

    utilisateur = models.ForeignKey(
        "utilisateurs.Utilisateur",
        verbose_name="Utilisateur authentifié",
        on_delete=models.CASCADE,
        related_name="codes_sso",
    )

    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Code de connexion SSO"
        verbose_name_plural = "Codes de connexion SSO"
        ordering = ["-date_creation"]

    def __str__(self):
        return f"Code SSO de {self.utilisateur} ({self.date_creation:%d/%m/%Y %H:%M})"

    @staticmethod
    def _empreinte(code: str) -> str:
        return hashlib.sha256(code.encode()).hexdigest()

    @classmethod
    def emettre(cls, utilisateur) -> str:
        """Crée un code et renvoie sa valeur en clair — la seule fois où elle existe."""
        cls.objects.filter(
            date_creation__lt=timezone.now() - cls.DUREE_VALIDITE
        ).delete()

        code = secrets.token_urlsafe(48)
        cls.objects.create(empreinte=cls._empreinte(code), utilisateur=utilisateur)
        return code

    @classmethod
    def consommer(cls, code: str):
        """
        Rend l'utilisateur associé, ou None si le code est inconnu, périmé
        ou déjà utilisé.

        La suppression sert de verrou : sur deux requêtes concurrentes,
        une seule voit `supprimees == 1`, l'autre repart les mains vides.
        """
        if not code:
            return None

        ligne = cls.objects.filter(empreinte=cls._empreinte(code)).first()
        if ligne is None:
            return None

        supprimees, _ = cls.objects.filter(pk=ligne.pk).delete()
        if not supprimees:
            return None

        if ligne.date_creation < timezone.now() - cls.DUREE_VALIDITE:
            return None

        return ligne.utilisateur
