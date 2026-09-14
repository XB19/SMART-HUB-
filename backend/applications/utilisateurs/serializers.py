from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import ParametreLDAP

User = get_user_model()


class UtilisateurSerializer(serializers.ModelSerializer):
    """
    Lecture d'un utilisateur (annuaire).

    Lisible par TOUT utilisateur authentifié : n'y exposer que ce qui a sa
    place dans un trombinoscope. `date_naissance` et `date_embauche` en
    sont volontairement absentes — elles révéleraient l'âge et
    l'ancienneté de chaque collègue du groupe. Elles restent visibles sur
    son propre profil (`MoiSerializer`) et modifiables par
    l'administrateur.
    """

    nom_complet = serializers.CharField(read_only=True)
    role_libelle = serializers.CharField(source="get_role_display", read_only=True)
    filiale_nom = serializers.CharField(source="filiale.nom", read_only=True, default=None)
    service_nom = serializers.CharField(source="service.nom", read_only=True, default=None)
    responsable_nom = serializers.CharField(
        source="responsable_hierarchique.nom_complet", read_only=True, default=None,
    )
    source_auth = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "nom_complet",
            "email",
            "telephone",
            "role",
            "role_libelle",
            "filiale",
            "filiale_nom",
            "service",
            "service_nom",
            "responsable_hierarchique",
            "responsable_nom",
            "actif",
            "is_active",
            "source_auth",
            "photo_profil",
            "signature",
        )
        read_only_fields = ("id", "is_active", "source_auth", "photo_profil", "signature")

    def get_source_auth(self, obj) -> str:
        """
        'SSO' si le compte n'a pas de mot de passe local — il se connecte
        par l'annuaire Microsoft, Entra ID ou Active Directory sur site.
        'LOCAL' sinon.
        """
        return 'SSO' if not obj.has_usable_password() else 'LOCAL'


class UtilisateurEcritureSerializer(serializers.ModelSerializer):
    """
    Création / modification d'un utilisateur par l'administrateur.

    RG-05 : un compte secrétaire n'est actif que si une filiale lui est
    attribuée. On reflète cette règle sur le champ Django `is_active`.
    """

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "telephone",
            "date_naissance",
            "date_embauche",
            "role",
            "filiale",
            "service",
            "responsable_hierarchique",
            "actif",
            "password",
        )

    def _appliquer_regle_secretaire(self, instance):
        # RG-05 : secrétaire sans filiale => compte inactif
        if instance.role == User.Role.SECRETAIRE and instance.filiale is None:
            instance.is_active = False
            instance.actif = False
        else:
            instance.is_active = instance.actif
        return instance

    def create(self, validated_data):
        password = validated_data.pop("password", "") or None
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        self._appliquer_regle_secretaire(user)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", "")
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        self._appliquer_regle_secretaire(instance)
        instance.save()
        return instance


class MoiSerializer(UtilisateurSerializer):
    """Profil de l'utilisateur connecté (endpoint /api/auth/me)."""

    permissions = serializers.SerializerMethodField()

    class Meta(UtilisateurSerializer.Meta):
        fields = UtilisateurSerializer.Meta.fields + (
            "date_naissance", "date_embauche", "permissions",
        )

    def get_permissions(self, obj):
        return {
            "est_administrateur": obj.role == User.Role.ADMINISTRATEUR,
            "est_secretaire": obj.role == User.Role.SECRETAIRE,
            "est_directeur": obj.role == User.Role.DIRECTEUR,
            "est_employe": obj.role == User.Role.EMPLOYE,
        }


class MoiEcritureSerializer(serializers.ModelSerializer):
    """
    Mise à jour de son propre profil : photo et signature électronique
    (utilisée pour tracer les visas — cf. applications.documents). Chacun
    gère sa propre signature ; ni l'admin ni personne d'autre ne l'upload
    à sa place.
    """

    class Meta:
        model = User
        # `date_naissance` est facultative et se saisit soi-même : elle
        # n'alimente que les anniversaires du calendrier, et personne n'est
        # tenu de la donner. L'administrateur peut la renseigner à la place
        # de qui le souhaite (cf. `dates_naissance` côté API).
        fields = ("photo_profil", "signature", "date_naissance")


class DatesNaissanceSerializer(serializers.Serializer):
    """
    Saisie groupée des dates de naissance.

    Les anniversaires du calendrier se déduisent de `date_naissance` ; sans
    elle rien ne s'affiche. Chacun peut renseigner la sienne depuis son
    profil, mais personne ne le fait spontanément : l'administrateur a donc
    besoin de les saisir d'un bloc au démarrage.
    """

    dates = serializers.DictField(
        child=serializers.DateField(allow_null=True),
        help_text="Identifiant d'utilisateur -> date de naissance "
                  "(null pour effacer).",
    )


class ParametreLDAPSerializer(serializers.ModelSerializer):
    """
    Configuration Active Directory (LDAP), éditable par l'administrateur.
    Le mot de passe est en écriture seule : jamais renvoyé en clair, seul un
    indicateur `mot_de_passe_defini` signale s'il est enregistré.
    """

    bind_password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    mot_de_passe_defini = serializers.SerializerMethodField()
    configure = serializers.BooleanField(read_only=True)

    class Meta:
        model = ParametreLDAP
        fields = (
            "server_uri",
            "domaine",
            "base_dn",
            "bind_dn",
            "bind_password",
            "mot_de_passe_defini",
            "configure",
            "date_modification",
        )
        read_only_fields = ("date_modification",)

    def get_mot_de_passe_defini(self, obj) -> bool:
        return bool(obj.bind_password_chiffre)

    def update(self, instance, validated_data):
        password = validated_data.pop("bind_password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.bind_password = password
        instance.save()
        return instance
