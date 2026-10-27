"""
Seed des configurations de documents (colonnes + chaîne de visas) par
filiale, à partir des fiches papier réellement utilisées par chaque
entreprise du groupe. Ré-exécutable : met à jour les configurations
existantes plutôt que de les dupliquer.

Usage : python manage.py seed_config_documents
"""

from django.core.management.base import BaseCommand

from applications.filiales.models import Filiale
from applications.documents.configurations_defaut import configurer_filiale


class Command(BaseCommand):
    help = "Crée/actualise les configurations de documents (colonnes + visas) par filiale."

    def handle(self, *args, **options):
        total = 0
        for filiale in Filiale.objects.all():
            total += configurer_filiale(filiale, ecraser=True)
            self.stdout.write(f"  {filiale.code} — configurations actualisées")

        self.stdout.write(self.style.SUCCESS(f"{total} configuration(s) traitée(s)."))
