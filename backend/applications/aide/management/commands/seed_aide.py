"""
Seed du contenu initial du chatbot d'aide (FAQ), pour que l'assistant
réponde dès le premier démarrage sans configuration manuelle. Ré-exécutable :
met à jour les entrées existantes (identifiées par module + question)
plutôt que de les dupliquer, même esprit que seed_config_documents.

Usage : python manage.py seed_aide
"""

from django.core.management.base import BaseCommand

from applications.aide.models import EntreeAide

Module = EntreeAide.Module

ENTREES = [
    # ---------- Réservations de salles ----------
    {
        "module": Module.RESERVATIONS,
        "question": "Comment réserver une salle ?",
        "mots_cles": "réserver, réservation, salle, booking, nouvelle réservation",
        "reponse": (
            "1. Dans le menu de gauche, cliquez sur « Nouvelle réservation ».\n"
            "2. Choisissez la salle, la date et l'heure de début/fin.\n"
            "3. Précisez le motif de la réservation.\n"
            "4. Validez : votre demande part en attente de validation par le "
            "secrétariat, vous recevrez une notification dès qu'elle sera traitée."
        ),
        "ordre": 1,
    },
    {
        "module": Module.RESERVATIONS,
        "question": "Comment faire une réservation récurrente (toutes les semaines) ?",
        "mots_cles": "réservation récurrente, répéter, chaque semaine, série, recurrence",
        "reponse": (
            "1. Menu « Réservation récurrente ».\n"
            "2. Renseignez la salle, l'horaire et la fréquence (ex. toutes les semaines).\n"
            "3. Indiquez la date de fin de la série.\n"
            "4. Validez : chaque occurrence est créée et suit son propre circuit de validation."
        ),
        "ordre": 2,
    },
    {
        "module": Module.RESERVATIONS,
        "question": "Comment voir mes réservations et leur statut ?",
        "mots_cles": "mes réservations, statut, suivi, en attente, validée, refusée",
        "reponse": (
            "Allez dans « Mes réservations » : vous y voyez toutes vos demandes "
            "avec leur statut (en attente, validée, refusée). Cliquez sur une ligne "
            "pour voir le détail ou l'annuler si elle n'a pas encore eu lieu."
        ),
        "ordre": 3,
    },
    {
        "module": Module.RESERVATIONS,
        "question": "Comment annuler ou déplacer une réservation ?",
        "mots_cles": "annuler réservation, déplacer, modifier réservation",
        "reponse": (
            "Ouvrez « Mes réservations », cliquez sur la réservation concernée, "
            "puis sur « Annuler » (avec un motif) ou « Déplacer » pour proposer "
            "un nouveau créneau. La personne qui valide sera notifiée du changement."
        ),
        "ordre": 4,
    },
    {
        "module": Module.RESERVATIONS,
        "question": "Comment valider ou refuser une réservation (secrétariat) ?",
        "mots_cles": "valider réservation, refuser, approbation salle",
        "reponse": (
            "Depuis le menu « Validation » (visible pour le secrétariat et les "
            "administrateurs) : ouvrez la demande, puis « Valider » ou « Refuser » "
            "en précisant un motif si vous refusez. Le demandeur est notifié aussitôt."
        ),
        "ordre": 5,
    },
    {
        "module": Module.RESERVATIONS,
        "question": "Comment consulter le calendrier des salles ?",
        "mots_cles": "calendrier, disponibilité salle, planning salles",
        "reponse": (
            "Le menu « Calendrier des salles » affiche l'occupation de toutes les "
            "salles par jour/semaine, pour repérer un créneau libre avant de réserver."
        ),
        "ordre": 6,
    },
    # ---------- Audiences ----------
    {
        "module": Module.AUDIENCES,
        "question": "Comment demander une audience ?",
        "mots_cles": "audience, demander audience, rendez-vous direction",
        "reponse": (
            "1. Ouvrez le menu « Audiences ».\n"
            "2. Cliquez sur « Nouvelle demande », précisez la personne à rencontrer, "
            "le motif et vos disponibilités.\n"
            "3. Vous serez notifié de la réponse (acceptée, refusée ou déléguée)."
        ),
        "ordre": 1,
    },
    {
        "module": Module.AUDIENCES,
        "question": "Comment fonctionne la délégation d'une audience ?",
        "mots_cles": "délégation, déléguer audience",
        "reponse": (
            "Le Directeur Général peut déléguer une audience à un autre "
            "responsable. Si une audience vous est déléguée, elle apparaît dans "
            "vos notifications : ouvrez-la et cliquez sur « Prendre en compte »."
        ),
        "ordre": 2,
    },
    # ---------- Documents administratifs ----------
    {
        "module": Module.DOCUMENTS,
        "question": "Comment créer une fiche de besoin ?",
        "mots_cles": "fiche de besoin, besoin, matériel",
        "reponse": (
            "1. Menu « Fiche de besoin ».\n"
            "2. Cliquez sur « Nouvelle fiche », décrivez le besoin, le bénéficiaire "
            "et la quantité pour chaque ligne.\n"
            "3. Envoyez : le document suit le circuit de visas de votre filiale "
            "(vous pouvez suivre sa progression sur sa page de détail)."
        ),
        "ordre": 1,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment créer une demande d'achat ?",
        "mots_cles": "demande d'achat, achat, demande achat",
        "reponse": (
            "1. Menu « Demandes d'achat ».\n"
            "2. Nouvelle demande : ajoutez chaque article (désignation, motif, "
            "quantité, prix unitaire) — le montant total se calcule automatiquement.\n"
            "3. Envoyez pour visa. Vous suivez l'avancement sur la fiche."
        ),
        "ordre": 2,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment créer un bon de commande ?",
        "mots_cles": "bon de commande, commande fournisseur",
        "reponse": (
            "Menu « Bons de commande » (visible pour secrétariat, chef de service, "
            "direction) : « Nouveau bon », renseignez les lignes d'articles, puis "
            "envoyez pour visa. Le chef de service intervient sur l'étape intermédiaire."
        ),
        "ordre": 3,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment remplir une fiche de transport / gérer un déplacement ?",
        "mots_cles": "fiche de transport, déplacement, kilométrage, km",
        "reponse": (
            "Menu « Gestion des déplacements » : créez une fiche en indiquant le "
            "kilométrage actuel du véhicule (le dernier relevé est proposé "
            "automatiquement) et le motif du déplacement, puis envoyez pour visa."
        ),
        "ordre": 4,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment faire un bon de sortie de caisse ?",
        "mots_cles": "bon de sortie de caisse, sortie de caisse, caisse",
        "reponse": (
            "Menu « Bon de sortie de caisse » (comptabilité, direction, "
            "administrateur) : renseignez les comptes débit/crédit, le montant et "
            "l'objet de la sortie, puis envoyez pour visa."
        ),
        "ordre": 5,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment rédiger une note interne ?",
        "mots_cles": "note interne, note de service",
        "reponse": (
            "Menu « Notes internes » : « Nouvelle note », rédigez l'objet et le "
            "corps du message, puis envoyez — elle suit aussi un circuit de visa "
            "avant diffusion."
        ),
        "ordre": 6,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment viser (approuver) un document qui m'est soumis ?",
        "mots_cles": "viser, approuver document, valider document, signature",
        "reponse": (
            "Ouvrez le document depuis votre liste ou la notification reçue, "
            "vérifiez son contenu puis cliquez sur « Viser » (valide, votre "
            "signature électronique est apposée) ou « Refuser » avec un commentaire."
        ),
        "ordre": 7,
    },
    {
        "module": Module.DOCUMENTS,
        "question": "Comment télécharger le PDF d'un document ?",
        "mots_cles": "télécharger pdf, imprimer document, export pdf",
        "reponse": (
            "Sur la page de détail du document, cliquez sur le bouton "
            "« Télécharger le PDF » — il inclut les visas déjà apposés."
        ),
        "ordre": 8,
    },
    # ---------- Congés ----------
    {
        "module": Module.CONGES,
        "question": "Comment poser une demande de congé ?",
        "mots_cles": "congé, poser congé, permission, absence",
        "reponse": (
            "1. Menu « Congés et permissions ».\n"
            "2. « Nouvelle demande » : choisissez le type (congé, permission "
            "article 45...), la date de début et de fin.\n"
            "3. Envoyez : votre responsable est notifié pour validation."
        ),
        "ordre": 1,
    },
    {
        "module": Module.CONGES,
        "question": "Comment voir le solde de mes congés ?",
        "mots_cles": "solde congé, jours restants, combien de congés",
        "reponse": (
            "Votre solde de congés cumulés est affiché en haut de la page "
            "« Congés et permissions », avant la liste de vos demandes."
        ),
        "ordre": 2,
    },
    # ---------- Contrats ----------
    {
        "module": Module.CONTRATS,
        "question": "Comment ajouter un contrat ?",
        "mots_cles": "contrat, nouveau contrat, ajouter contrat",
        "reponse": (
            "Menu « Contrats » (chef de service, direction, administrateur) : "
            "« Nouveau contrat », renseignez les informations et la date "
            "d'échéance, puis ajoutez si besoin une pièce jointe (le contrat scanné)."
        ),
        "ordre": 1,
    },
    {
        "module": Module.CONTRATS,
        "question": "Comment être alerté avant l'échéance d'un contrat ?",
        "mots_cles": "échéance contrat, alerte contrat, expiration",
        "reponse": (
            "Les contrats proches de leur échéance apparaissent automatiquement "
            "en alerte sur la page « Contrats » — aucune action à faire, la "
            "plateforme vous prévient."
        ),
        "ordre": 2,
    },
    # ---------- Prestations ----------
    {
        "module": Module.PRESTATIONS,
        "question": "Comment suivre une prestation de service ?",
        "mots_cles": "prestation, jalon, suivi prestation",
        "reponse": (
            "Menu « Prestations de services » : ouvrez la prestation pour voir "
            "ses jalons (étapes) et leur avancement, ou créez une nouvelle "
            "prestation avec « Nouvelle prestation »."
        ),
        "ordre": 1,
    },
    # ---------- Stocks ----------
    {
        "module": Module.STOCKS,
        "question": "Comment enregistrer une entrée ou une sortie de stock ?",
        "mots_cles": "stock, entrée stock, sortie stock, article, mouvement",
        "reponse": (
            "Menu « Gestion de stocks » : ouvrez l'article concerné, cliquez sur "
            "« Nouveau mouvement », choisissez Entrée ou Sortie, la quantité et "
            "le motif, puis validez — la quantité disponible se met à jour aussitôt."
        ),
        "ordre": 1,
    },
    {
        "module": Module.STOCKS,
        "question": "Comment savoir quels articles sont en alerte de stock ?",
        "mots_cles": "alerte stock, rupture, stock faible",
        "reponse": (
            "Les articles dont la quantité est sous le seuil d'alerte sont mis en "
            "évidence en haut de la page « Gestion de stocks »."
        ),
        "ordre": 2,
    },
    # ---------- Utilisateurs / administration ----------
    {
        "module": Module.UTILISATEURS,
        "question": "Comment ajouter un utilisateur ?",
        "mots_cles": "ajouter utilisateur, créer compte, nouveau compte",
        "reponse": (
            "Menu « Utilisateurs » (administrateur uniquement) : « Nouvel "
            "utilisateur », renseignez son identité, sa filiale, son service et "
            "son rôle, puis validez."
        ),
        "ordre": 1,
    },
    {
        "module": Module.UTILISATEURS,
        "question": "Comment modifier ma photo de profil ou ma signature ?",
        "mots_cles": "photo de profil, signature électronique, mon profil",
        "reponse": (
            "Cliquez sur votre nom en haut à droite pour ouvrir « Mon profil » : "
            "vous pouvez y changer votre photo et déposer votre signature "
            "électronique, utilisée pour viser les documents."
        ),
        "ordre": 2,
    },
    {
        "module": Module.UTILISATEURS,
        "question": "Comment synchroniser les comptes avec Microsoft Entra ID ?",
        "mots_cles": "entra id, microsoft, azure, annuaire, synchroniser",
        "reponse": (
            "Sur la page « Utilisateurs » (administrateur), le bouton "
            "« Synchroniser depuis Entra ID » importe les comptes de l'annuaire "
            "Microsoft de l'entreprise. Son état et un test de connexion se "
            "trouvent dans « Administration → Microsoft Entra ID »."
        ),
        "ordre": 3,
    },
    # ---------- Général ----------
    {
        "module": Module.GENERAL,
        "question": "Comment fonctionne le tableau de bord ?",
        "mots_cles": "tableau de bord, accueil, dashboard",
        "reponse": (
            "Le « Tableau de bord » (première page après connexion) résume ce qui "
            "vous concerne : vos prochaines réservations, les demandes en attente "
            "de votre visa et les alertes (stocks, contrats à échéance)."
        ),
        "ordre": 1,
    },
    {
        "module": Module.GENERAL,
        "question": "À quoi servent les notifications (la cloche) ?",
        "mots_cles": "notification, cloche, alerte",
        "reponse": (
            "La cloche en haut à droite affiche vos notifications (validation "
            "reçue, document à viser, réservation refusée...). Cliquez dessus "
            "pour les consulter, puis sur une notification pour ouvrir l'élément concerné."
        ),
        "ordre": 2,
    },
    {
        "module": Module.GENERAL,
        "question": "J'ai oublié mon mot de passe, que faire ?",
        "mots_cles": "mot de passe oublié, connexion impossible, mdp",
        "reponse": (
            "Contactez un administrateur de votre filiale : lui seul peut "
            "réinitialiser un mot de passe depuis la page « Utilisateurs »."
        ),
        "ordre": 3,
    },
]


#: Questions retirées : supprimées des bases déjà peuplées.
QUESTIONS_OBSOLETES = [
    "Comment synchroniser les comptes avec Active Directory ?",
]


class Command(BaseCommand):
    help = "Peuple le contenu initial du chatbot d'aide (FAQ)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--sans-ecraser", action="store_true",
            help="N'ajoute que les entrées manquantes : les réponses retouchées "
                 "depuis l'admin restent telles quelles.",
        )

    def handle(self, *args, **options):
        crees = 0
        maj = 0
        EntreeAide.objects.filter(question__in=QUESTIONS_OBSOLETES).delete()
        enregistrer = (EntreeAide.objects.get_or_create if options["sans_ecraser"]
                       else EntreeAide.objects.update_or_create)
        for entree in ENTREES:
            _, cree = enregistrer(
                module=entree["module"],
                question=entree["question"],
                defaults={
                    "mots_cles": entree["mots_cles"],
                    "reponse": entree["reponse"],
                    "ordre": entree["ordre"],
                    "actif": True,
                },
            )
            crees += cree
            maj += not cree

        suite = "déjà présente(s)" if options["sans_ecraser"] else "mise(s) à jour"
        self.stdout.write(self.style.SUCCESS(
            f"Aide : {crees} entrée(s) créée(s), {maj} {suite}."
        ))
