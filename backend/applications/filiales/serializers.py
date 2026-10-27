import re

from rest_framework import serializers

from .models import Filiale, ParametreFiliale, Service


CODE_FILIALE = re.compile(r"^[A-Z0-9_-]+$")


class ParametreFilialeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreFiliale
        fields = (
            "delai_min_reservation",
            "duree_max_reservation",
            "nb_max_reservations_actives",
            "delai_annulation",
        )


class FilialeSerializer(serializers.ModelSerializer):
    parametres = ParametreFilialeSerializer(read_only=True)
    # Renseignés par l'annotation de FilialeViewSet (absents ailleurs).
    nb_utilisateurs = serializers.IntegerField(read_only=True, default=0)
    nb_services = serializers.IntegerField(read_only=True, default=0)
    nb_salles = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Filiale
        fields = (
            "id",
            "nom",
            "code",
            "description",
            "email",
            "telephone",
            "adresse",
            "active",
            "parametres",
            "nb_utilisateurs",
            "nb_services",
            "nb_salles",
        )

    def validate_nom(self, valeur):
        valeur = " ".join(valeur.split())
        if Filiale.objects.filter(nom__iexact=valeur).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Une filiale porte déjà ce nom.")
        return valeur

    def validate_code(self, valeur):
        """Code court en majuscules : lettres, chiffres, tiret ou souligné."""
        valeur = valeur.strip().upper()
        if not CODE_FILIALE.match(valeur):
            raise serializers.ValidationError(
                "Le code ne doit contenir que des lettres, des chiffres, des tirets ou des soulignés.")
        if Filiale.objects.filter(code__iexact=valeur).exclude(pk=getattr(self.instance, "pk", None)).exists():
            raise serializers.ValidationError("Une filiale utilise déjà ce code.")
        return valeur

    def validate(self, attrs):
        """
        La filiale de l'accueil (code OSEOR, le siège) porte le circuit des
        visiteurs : la renommer en code ou la désactiver le casserait.
        """
        from applications.visiteurs.models import CODE_FILIALE_ACCUEIL

        if self.instance and self.instance.code == CODE_FILIALE_ACCUEIL:
            if attrs.get("code", CODE_FILIALE_ACCUEIL) != CODE_FILIALE_ACCUEIL:
                raise serializers.ValidationError(
                    {"code": "Le code de la filiale d'accueil (OSEOR) ne peut pas être modifié."})
            if attrs.get("active") is False:
                raise serializers.ValidationError(
                    {"active": "La filiale d'accueil (OSEOR) ne peut pas être désactivée."})
        return attrs


class ServiceSerializer(serializers.ModelSerializer):
    filiale_nom = serializers.CharField(source="filiale.nom", read_only=True)
    chef_nom = serializers.CharField(source="chef.nom_complet", read_only=True, default=None)
    nb_membres = serializers.IntegerField(source="membres.count", read_only=True)

    class Meta:
        model = Service
        fields = (
            "id",
            "nom",
            "code",
            "filiale",
            "filiale_nom",
            "chef",
            "chef_nom",
            "description",
            "actif",
            "nb_membres",
        )
