"""
Configurations de documents par défaut (colonnes + chaîne de visas), tirées
des fiches papier réellement utilisées par chaque entreprise du groupe.

Servent à la commande `seed_config_documents`, à l'initialisation de la
plateforme et à la création d'une filiale depuis Administration > Filiales :
sans configuration, les employés d'une filiale ne peuvent soumettre aucun
document administratif.
"""

from .models import ConfigurationDocument, TypeDocument

# Colonnes par défaut du tableau de lignes, par type de document.
COLONNES_DEFAUT = {
    TypeDocument.FICHE_BESOIN: [
        {"cle": "motif", "libelle": "Besoin et motifs"},
        {"cle": "beneficiaire", "libelle": "Bénéficiaire"},
        {"cle": "quantite", "libelle": "Quantité"},
    ],
    TypeDocument.DEMANDE_ACHAT: [
        {"cle": "designation", "libelle": "Désignation"},
        {"cle": "motif", "libelle": "Motif"},
        {"cle": "qte", "libelle": "Qté"},
        {"cle": "puht", "libelle": "PUHT"},
        {"cle": "montant", "libelle": "Montant"},
    ],
    # Fiche de transport : mise en page dédiée (suivi kilométrique), n'utilise
    # pas de colonnes configurables.
    TypeDocument.FICHE_TRANSPORT: [],
    TypeDocument.BON_SORTIE_CAISSE: [
        {"cle": "compte_debit", "libelle": "Compte débit"},
        {"cle": "compte_credit", "libelle": "Compte crédit"},
        {"cle": "montant_debit", "libelle": "Montant débit"},
        {"cle": "montant_credit", "libelle": "Montant crédit"},
        {"cle": "objet", "libelle": "Objet ou motif de sortie de caisse"},
    ],
    TypeDocument.BON_COMMANDE: [
        {"cle": "designation", "libelle": "Désignation"},
        {"cle": "motif", "libelle": "Motif"},
        {"cle": "qte", "libelle": "Qté"},
        {"cle": "puht", "libelle": "PUHT"},
        {"cle": "montant", "libelle": "Montant"},
    ],
    # Une note de service n'a pas de tableau de lignes : son contenu tient
    # dans l'objet et le corps, portes par champs_entete.
    TypeDocument.NOTE_INTERNE: [],
    TypeDocument.FACTURE: [
        {"cle": "designation", "libelle": "Désignation"},
        {"cle": "qte", "libelle": "Qté"},
        {"cle": "puht", "libelle": "PU HT"},
        {"cle": "montant", "libelle": "Montant"},
    ],
}

# Chaînes de visas par défaut, par type de document (utilisées quand
# l'entreprise n'a pas de fiche spécifique fournie).
VISAS_DEFAUT = {
    TypeDocument.FICHE_BESOIN: [
        {"cle": "demandeur", "libelle": "Visa du Demandeur"},
        {"cle": "chef_comptable", "libelle": "Visa du Chef Comptable", "role": "COMPTABLE"},
        {"cle": "directeur_general", "libelle": "Visa du Directeur Général", "role": "DIRECTEUR"},
    ],
    TypeDocument.DEMANDE_ACHAT: [
        {"cle": "demandeur", "libelle": "Visa du Demandeur"},
        {"cle": "chef_service", "libelle": "Visa du Chef de Service", "role": "CHEF_SERVICE"},
        {"cle": "directeur_general", "libelle": "Visa du Directeur Général", "role": "DIRECTEUR"},
    ],
    TypeDocument.FICHE_TRANSPORT: [
        {"cle": "demandeur", "libelle": "Signature"},
        {"cle": "secretaire", "libelle": "Signature de la secrétaire", "role": "SECRETAIRE"},
        {"cle": "comptable", "libelle": "Signature du comptable", "role": "COMPTABLE"},
    ],
    TypeDocument.BON_SORTIE_CAISSE: [
        {"cle": "demandeur", "libelle": "Demandeur"},
        {"cle": "chef_service_dep", "libelle": "Visa Chef Sce Dép.", "role": "CHEF_SERVICE"},
        {"cle": "resp_tresorerie", "libelle": "Visa Resp. Trésorerie", "role": "COMPTABLE"},
        {"cle": "finance_comptabilite", "libelle": "Visa Finance Comptabilité", "role": "COMPTABLE"},
    ],
    # Émis par la Secrétaire (visa 0, implicite), approuvé par la hiérarchie
    # avant envoi au fournisseur.
    TypeDocument.BON_COMMANDE: [
        {"cle": "demandeur", "libelle": "Établi par (Secrétariat)"},
        {"cle": "chef_service", "libelle": "Visa du Chef de Service", "role": "CHEF_SERVICE"},
        {"cle": "directeur_general", "libelle": "Approbation du Directeur Général", "role": "DIRECTEUR"},
    ],
    # La note n'est diffusée qu'une fois signée par la direction.
    TypeDocument.NOTE_INTERNE: [
        {"cle": "redacteur", "libelle": "Rédigée par"},
        {"cle": "directeur_general", "libelle": "Visa du Directeur Général", "role": "DIRECTEUR"},
    ],
    # Une facture est contrôlée avant d'être engagée : le comptable
    # rapproche, le DG approuve la dépense.
    TypeDocument.FACTURE: [
        {"cle": "saisie_par", "libelle": "Saisie par"},
        {"cle": "comptable", "libelle": "Vérification comptable", "role": "COMPTABLE"},
        {"cle": "directeur_general", "libelle": "Approbation du Directeur Général", "role": "DIRECTEUR"},
    ],
}

# Surcharges par filiale (code) — reflètent exactement les fiches papier
# fournies pour cette entreprise, quand elles diffèrent du modèle par défaut.
SURCHARGES = {
    ("OSEOR", TypeDocument.FICHE_BESOIN): {
        "colonnes": COLONNES_DEFAUT[TypeDocument.FICHE_BESOIN],
        "visas": VISAS_DEFAUT[TypeDocument.FICHE_BESOIN],
    },
    ("KAPI", TypeDocument.FICHE_BESOIN): {
        "colonnes": COLONNES_DEFAUT[TypeDocument.FICHE_BESOIN],
        "visas": [
            {"cle": "demandeur", "libelle": "Visa du Demandeur"},
            {"cle": "comptable", "libelle": "Visa du Comptable", "role": "COMPTABLE"},
            {"cle": "directeur_general", "libelle": "Visa du Directeur Général", "role": "DIRECTEUR"},
        ],
    },
    ("ZIH", TypeDocument.FICHE_BESOIN): {
        "colonnes": [
            {"cle": "motif", "libelle": "Besoin et motifs"},
            {"cle": "beneficiaire", "libelle": "Bénéficiaire"},
            {"cle": "montant", "libelle": "Montant"},
        ],
        "visas": [
            {"cle": "demandeur", "libelle": "Visa du Demandeur"},
            {"cle": "chef_comptable", "libelle": "Visa du Chef Comptable", "role": "COMPTABLE"},
            {"cle": "secretaire_general", "libelle": "Visa du Secrétaire Général", "role": "DIRECTEUR"},
        ],
    },
    ("DIWA", TypeDocument.DEMANDE_ACHAT): {
        "colonnes": COLONNES_DEFAUT[TypeDocument.DEMANDE_ACHAT],
        "visas": [
            {"cle": "demandeur", "libelle": "Établi par (Demandeur)"},
            {"cle": "chef_departement", "libelle": "Visa Chef département", "role": "CHEF_SERVICE"},
            {"cle": "achats_moyens_generaux", "libelle": "Visa du Service Achats et Moyens Généraux", "role": "SECRETAIRE"},
            {"cle": "controle_budget", "libelle": "Visa Contrôle & Budget", "role": "COMPTABLE"},
            {"cle": "dfc", "libelle": "Visa du D.F.C", "role": "COMPTABLE"},
            {"cle": "directeur_general", "libelle": "Approbation du Directeur Général", "role": "DIRECTEUR"},
        ],
    },
    ("DIWA", TypeDocument.BON_SORTIE_CAISSE): {
        "colonnes": COLONNES_DEFAUT[TypeDocument.BON_SORTIE_CAISSE],
        "visas": VISAS_DEFAUT[TypeDocument.BON_SORTIE_CAISSE],
    },
    ("KAPI", TypeDocument.FICHE_TRANSPORT): {
        "visas": VISAS_DEFAUT[TypeDocument.FICHE_TRANSPORT],
    },
    ("AROBASE", TypeDocument.FICHE_TRANSPORT): {
        "visas": [
            {"cle": "demandeur", "libelle": "Signature"},
            {"cle": "caissiere", "libelle": "Signature de la Caissière", "role": "COMPTABLE"},
            {"cle": "comptable", "libelle": "Signature du comptable", "role": "COMPTABLE"},
        ],
    },
}


def configuration_par_defaut(filiale, type_document) -> dict:
    """Colonnes et visas prévus pour cette filiale et ce type de document."""
    surcharge = SURCHARGES.get((filiale.code, type_document)) or {}
    return {
        "colonnes": surcharge.get("colonnes", COLONNES_DEFAUT[type_document]),
        "visas": surcharge.get("visas", VISAS_DEFAUT[type_document]),
    }


def configurer_filiale(filiale, ecraser=False) -> int:
    """
    Pose la configuration par défaut de chaque type de document.

    Sans `ecraser`, ne crée que les configurations manquantes : ce qu'un
    administrateur a ajusté depuis l'admin Django reste intact. Renvoie le
    nombre de configurations créées ou réécrites.
    """
    traitees = 0
    for type_document in TypeDocument.values:
        valeurs = configuration_par_defaut(filiale, type_document)
        if ecraser:
            ConfigurationDocument.objects.update_or_create(
                filiale=filiale, type_document=type_document, defaults=valeurs)
            traitees += 1
        else:
            _, cree = ConfigurationDocument.objects.get_or_create(
                filiale=filiale, type_document=type_document, defaults=valeurs)
            traitees += cree
    return traitees
