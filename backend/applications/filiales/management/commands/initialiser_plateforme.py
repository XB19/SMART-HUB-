"""
Initialisation de la plateforme : ce dont SMART HUB a besoin pour
fonctionner sur une base neuve. Lancée à chaque démarrage du conteneur
`api` (voir entrypoint.sh), juste après les migrations.

Ré-exécutable sans risque : elle ne crée que ce qui manque et ne réécrit
jamais ce qu'un administrateur a ajusté (configurations de documents,
horaires des tâches, réponses de l'aide, jours fériés saisis à la main).

Usage : python manage.py initialiser_plateforme
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand

from applications.documents.configurations_defaut import configurer_filiale
from applications.filiales.models import Filiale
from applications.visiteurs.models import CODE_FILIALE_ACCUEIL


class Command(BaseCommand):
    help = "Crée ce qui manque pour faire fonctionner la plateforme (idempotent)."

    def handle(self, *args, **options):
        self._filiale_accueil()

        configurees = sum(configurer_filiale(f) for f in Filiale.objects.all())
        self.stdout.write(f"Documents : {configurees} configuration(s) ajoutée(s).")

        call_command("seed_taches_planifiees", stdout=self.stdout)
        call_command("seed_jours_feries", stdout=self.stdout)
        call_command("seed_aide", sans_ecraser=True, stdout=self.stdout)

        self.stdout.write(self.style.SUCCESS("Plateforme initialisée."))

    def _filiale_accueil(self):
        """
        L'accueil des visiteurs est rattaché à la filiale de code OSEOR (le
        siège) : sans elle, aucune secrétaire ne recevrait les demandes de
        visite. Ses coordonnées se complètent ensuite dans Administration >
        Filiales.
        """
        if Filiale.objects.filter(code=CODE_FILIALE_ACCUEIL).exists():
            return
        nom = "OSEOR SA"
        if Filiale.objects.filter(nom__iexact=nom).exists():
            nom = "OSEOR SA (siège)"
        Filiale.objects.create(
            nom=nom, code=CODE_FILIALE_ACCUEIL,
            description="Siège du groupe — accueil des visiteurs.",
        )
        self.stdout.write(f"Filiale d'accueil créée : {nom} ({CODE_FILIALE_ACCUEIL}).")
