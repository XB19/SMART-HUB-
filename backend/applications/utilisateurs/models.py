import base64
import hashlib

from django.conf import settings
from django.db import models
from django.contrib.auth.models import AbstractUser
from cryptography.fernet import Fernet, InvalidToken


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
    # introduit hors validation (import LDAP, chargement de fixtures, SQL
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


def _cle_chiffrement() -> bytes:
    """
    Dérive une clé Fernet stable depuis SECRET_KEY, pour éviter d'avoir à
    gérer une clé de chiffrement séparée. Si SECRET_KEY change (rotation),
    les mots de passe déjà enregistrés ne seront plus déchiffrables et
    devront être ressaisis.
    """
    empreinte = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(empreinte)


class ParametreLDAP(models.Model):
    """
    Configuration de connexion à l'Active Directory de l'entreprise (LDAP), saisie par
    l'administrateur depuis l'application (remplace les variables .env
    LDAP_* utilisées auparavant). Table à une seule ligne (singleton).
    """

    server_uri = models.CharField(
        verbose_name="Adresse du serveur LDAP",
        max_length=255,
        blank=True,
        help_text="Ex. ldap://192.168.1.10 (ou ldaps:// pour le chiffrement TLS).",
    )

    domaine = models.CharField(
        verbose_name="Domaine NetBIOS",
        max_length=100,
        blank=True,
        help_text="Nom NetBIOS du domaine Windows, ex. OSEOR.",
    )

    base_dn = models.CharField(
        verbose_name="Base DN",
        max_length=255,
        blank=True,
        help_text="Ex. DC=oseor,DC=local",
    )

    bind_dn = models.CharField(
        verbose_name="DN du compte de service",
        max_length=255,
        blank=True,
        help_text="Ex. CN=svcOseor,OU=Services,DC=oseor,DC=local",
    )

    bind_password_chiffre = models.TextField(
        verbose_name="Mot de passe du compte de service (chiffré)",
        blank=True,
    )

    date_modification = models.DateTimeField(
        verbose_name="Dernière modification",
        auto_now=True,
    )

    class Meta:
        verbose_name = "Paramètre LDAP"
        verbose_name_plural = "Paramètres LDAP"

    def __str__(self):
        return "Configuration Active Directory (LDAP)"

    def save(self, *args, **kwargs):
        # Ligne unique : toujours pk=1.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def charger(cls) -> "ParametreLDAP":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def configure(self) -> bool:
        return bool(self.server_uri and self.domaine and self.base_dn and self.bind_dn)

    @property
    def bind_password(self) -> str:
        if not self.bind_password_chiffre:
            return ""
        try:
            return Fernet(_cle_chiffrement()).decrypt(self.bind_password_chiffre.encode()).decode()
        except InvalidToken:
            return ""

    @bind_password.setter
    def bind_password(self, valeur: str):
        if valeur:
            self.bind_password_chiffre = Fernet(_cle_chiffrement()).encrypt(valeur.encode()).decode()