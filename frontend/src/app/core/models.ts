// Modèles partagés (alignés sur l'API DRF OSEOR).

export type Role = 'ADMINISTRATEUR' | 'DIRECTEUR' | 'SECRETAIRE'
  | 'CHEF_SERVICE' | 'COMPTABLE' | 'RH' | 'EMPLOYE' | 'AGENT_SECURITE';

export interface Utilisateur {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  nom_complet: string;
  email: string;
  telephone: string;
  role: Role;
  role_libelle: string;
  filiale: number | null;
  filiale_nom: string | null;
  actif: boolean;
  photo_profil?: string | null;
  signature?: string | null;
  source_auth?: 'SSO' | 'LOCAL';
  permissions?: {
    est_administrateur: boolean;
    est_secretaire: boolean;
    est_directeur: boolean;
    est_employe: boolean;
  };
}

export interface Filiale {
  id: number;
  nom: string;
  code: string;
  description?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  active: boolean;
}

export interface Salle {
  id: number;
  nom: string;
  filiale: number;
  filiale_nom?: string;
  description?: string;
  capacite: number;
  equipements: string[];
  photo?: string | null;
  active: boolean;
}

export interface Equipement {
  code: string;
  libelle: string;
}

export type StatutReservation =
  'BROUILLON' | 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE'
  | 'ANNULEE' | 'DEPLACEE' | 'TERMINEE';

export interface Participant {
  id?: number;
  nom: string;
  prenom?: string;
  nom_complet?: string;
  email?: string;
  telephone?: string;
  societe?: string;
  type_participant: 'INTERNE' | 'EXTERNE';
  utilisateur?: number | null;
}

export interface Reservation {
  id: number;
  demandeur?: number;
  demandeur_nom?: string;
  nom_reservant: string;
  telephone?: string;
  motif?: string;
  salle: number;
  salle_nom?: string;
  filiale_nom?: string;
  date_reunion: string;
  heure_debut: string;
  heure_fin: string;
  precisions?: string;
  statut: StatutReservation;
  statut_libelle?: string;
  motif_refus?: string;
  motif_annulation?: string;
  serie?: number | null;
  serie_frequence?: string | null;
  serie_date_debut?: string | null;
  serie_date_fin?: string | null;
  participants?: Participant[];
  date_creation?: string;
}

export interface DisponibiliteResultat {
  disponible: boolean;
  conflits: Reservation[];
}

export type StatutAudience =
  'SAISIE' | 'ENVOYEE_DG' | 'RENVOYEE_SECRETAIRE'
  | 'VALIDEE_DG' | 'CONFIRMEE' | 'ANNULEE' | 'TERMINEE';

export interface EchangeAudience {
  id: number;
  auteur: number;
  auteur_nom: string;
  commentaire: string;
  date_creation: string;
}

export interface Delegation {
  id: number;
  audience: number;
  delegue: number;
  delegue_nom: string;
  delegue_email: string;
  commentaire: string;
  statut: 'PROPOSEE' | 'PRISE_EN_COMPTE';
  statut_libelle: string;
  date_proposition: string;
  date_prise_en_compte: string | null;
}

export interface Audience {
  id: number;
  nom: string;
  prenom?: string;
  nom_complet?: string;
  profession?: string;
  contact?: string;
  objet_visite: string;
  secretaire?: number;
  secretaire_nom?: string;
  dg: number;
  dg_nom?: string;
  statut: StatutAudience;
  statut_libelle?: string;
  date_souhaitee?: string | null;
  heure_debut?: string | null;
  heure_fin?: string | null;
  salle?: number | null;
  salle_nom?: string | null;
  lieu?: string;
  reservation?: number | null;
  echanges?: EchangeAudience[];
  delegations?: Delegation[];
  date_creation?: string;
}

export interface NotificationItem {
  id: number;
  titre: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  lu: boolean;
  objet_type: string;
  objet_id: number | null;
  date_creation: string;
}

/** État de l'intégration Microsoft Entra ID (réglée dans le .env du serveur). */
export interface EtatEntra {
  actif: boolean;
  tenant_id: string;
  client_id: string;
  url_retour: string;
}

export type TypeDocumentAdministratif =
  'FICHE_BESOIN' | 'DEMANDE_ACHAT' | 'FICHE_TRANSPORT' | 'BON_SORTIE_CAISSE'
  | 'BON_COMMANDE' | 'NOTE_INTERNE' | 'FACTURE';

export type StatutLivraison = 'EN_ATTENTE' | 'ENVOYE' | 'LIVRE_PARTIEL' | 'LIVRE' | 'ANNULE';

export const LIBELLES_STATUT_LIVRAISON: Record<StatutLivraison, string> = {
  EN_ATTENTE: "En attente d'envoi",
  ENVOYE: 'Envoyé au fournisseur',
  LIVRE_PARTIEL: 'Livré partiellement',
  LIVRE: 'Livré',
  ANNULE: 'Annulé',
};

/**
 * Règlement d'une facture — distinct du statut de visa.
 *
 * Une facture peut être entièrement visée et rester impayée : confondre
 * les deux ferait disparaître les impayés du suivi.
 */
export type StatutPaiement = 'A_PAYER' | 'PARTIEL' | 'PAYEE' | 'LITIGE' | 'ANNULEE';

export const LIBELLES_STATUT_PAIEMENT: Record<StatutPaiement, string> = {
  A_PAYER: 'À payer',
  PARTIEL: 'Payée partiellement',
  PAYEE: 'Payée',
  LITIGE: 'En litige',
  ANNULEE: 'Annulée',
};

export interface ColonneDocument {
  cle: string;
  libelle: string;
}

export interface EtapeVisa {
  cle: string;
  libelle: string;
  role?: string;
}

export interface ConfigurationDocument {
  filiale: number;
  type_document: TypeDocumentAdministratif;
  type_document_libelle: string;
  colonnes: ColonneDocument[];
  visas: EtapeVisa[];
  configure: boolean;
}

export interface HistoriqueVisa {
  etape: number;
  cle: string;
  libelle: string;
  utilisateur_id: number;
  utilisateur_nom: string;
  decision: 'VALIDE' | 'REFUSE';
  commentaire: string;
  date: string;
  a_une_signature: boolean;
}

export interface DocumentAdministratif {
  id: number;
  numero: string;
  type_document: TypeDocumentAdministratif;
  type_document_libelle: string;
  filiale: number;
  filiale_nom: string;
  demandeur: number;
  demandeur_nom: string;
  champs_entete: Record<string, any>;
  lignes: Record<string, any>[];
  montant_total: string;
  piece_jointe?: string | null;
  document_source: number | null;
  document_source_numero: string | null;
  documents_derives_numeros: string[];
  statut: 'EN_COURS' | 'VALIDE' | 'REFUSE';
  statut_libelle: string;
  etape_visa_courante: number;
  historique_visas: HistoriqueVisa[];
  motif_rejet: string;
  visa_courant: EtapeVisa | null;
  peut_viser: boolean;
  /** Factures uniquement : règlement, indépendant du circuit de visas. */
  statut_paiement?: StatutPaiement | '';
  echeance_depassee?: boolean;
  date_creation: string;
  date_modification: string;
}

export type CategorieArticle = 'MATERIEL' | 'INFORMATIQUE' | 'FOURNITURES';

export interface Article {
  id: number;
  nom: string;
  categorie: CategorieArticle;
  categorie_libelle: string;
  unite: string;
  quantite_stock: number;
  seuil_alerte: number;
  description: string;
  actif: boolean;
  filiale: number;
  filiale_nom: string;
  en_alerte: boolean;
  date_creation: string;
  date_modification: string;
}

export interface MouvementStock {
  id: number;
  article: number;
  article_nom: string;
  type_mouvement: 'ENTREE' | 'SORTIE';
  type_mouvement_libelle: string;
  quantite: number;
  motif: string;
  utilisateur: number;
  utilisateur_nom: string;
  date_creation: string;
}

export type TypeContrat = 'FOURNISSEUR' | 'CLIENT' | 'PRESTATAIRE' | 'BAIL' | 'AUTRE';
export type StatutContrat = 'ACTIF' | 'EXPIRE' | 'RESILIE';

export const LIBELLES_TYPE_CONTRAT: Record<TypeContrat, string> = {
  FOURNISSEUR: 'Contrat fournisseur',
  CLIENT: 'Contrat client',
  PRESTATAIRE: 'Prestation de services',
  BAIL: 'Bail / location',
  AUTRE: 'Autre',
};

export interface PieceJointeContrat {
  id: number;
  fichier: string;
  nom_original: string;
  ajoute_par: number;
  ajoute_par_nom: string;
  date_ajout: string;
}

export interface Contrat {
  id: number;
  numero: string;
  filiale: number;
  filiale_nom: string;
  intitule: string;
  partie_contractante: string;
  type_contrat: TypeContrat;
  type_contrat_libelle: string;
  reference: string;
  date_debut: string;
  date_echeance: string | null;
  jours_avant_echeance: number | null;
  montant: string | null;
  description: string;
  statut: StatutContrat;
  statut_libelle: string;
  motif_resiliation: string;
  date_resiliation: string | null;
  cree_par: number;
  cree_par_nom: string;
  pieces_jointes: PieceJointeContrat[];
  date_creation: string;
  date_modification: string;
}

export interface RapportDocumentsParType {
  type_document: TypeDocumentAdministratif;
  type_document_libelle: string;
  total: number;
  en_cours: number;
  valides: number;
  refuses: number;
  montant_valide: string;
}

export interface RapportContrats {
  actifs: number;
  expires: number;
  resilies: number;
  montant_engage: string;
  echeances_proches_30j: number;
}

export interface RapportStocks {
  mouvements_total: number;
  quantite_entrees: number;
  quantite_sorties: number;
  articles_en_alerte: number;
}

export interface RapportRepartitionFiliale {
  filiale: string;
  filiale_id: number;
  montant_valide: string;
}

export interface RapportAdministratif {
  periode: { date_debut: string; date_fin: string };
  filiale: string;
  filiale_id: number | null;
  documents: { par_type: RapportDocumentsParType[]; total_documents: number; montant_total_valide: string };
  contrats: RapportContrats;
  stocks: RapportStocks;
  repartition_par_filiale?: RapportRepartitionFiliale[];
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ---------- Aide (chatbot FAQ) ----------
export interface EntreeAide {
  id: number;
  module: string;
  module_libelle: string;
  question: string;
  mots_cles: string;
  reponse: string;
  ordre: number;
  actif: boolean;
}

export interface ModuleAide {
  module: string;
  libelle: string;
  count: number;
}

export interface ReponseAideChat {
  trouve: boolean;
  resultats: EntreeAide[];
}

// ---------- Visiteurs (accueil) ----------
export type StatutVisite = 'EN_ATTENTE' | 'VALIDEE' | 'REFUSEE' | 'TERMINEE';
export type TypePiece = 'CNI' | 'PASSEPORT';

export interface Visite {
  id: number;
  nom: string;
  prenom: string;
  type_piece: TypePiece;
  type_piece_libelle: string;
  numero_piece: string;
  motif: string;
  filiale: number;
  filiale_nom: string;
  personne_visitee: number;
  personne_visitee_nom: string;
  enregistre_par: number;
  enregistre_par_nom: string;
  traite_par: number | null;
  traite_par_nom: string | null;
  statut: StatutVisite;
  statut_libelle: string;
  motif_refus: string;
  heure_arrivee: string;
  heure_depart: string | null;
}
