import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Salle, Equipement, Filiale, Reservation, DisponibiliteResultat,
  Audience, Delegation, Utilisateur, NotificationItem, Paginated, EtatEntra,
  ConfigurationDocument, DocumentAdministratif, TypeDocumentAdministratif, StatutLivraison,
  StatutPaiement,
  Article, MouvementStock, Contrat, RapportAdministratif,
  EntreeAide, ModuleAide, ReponseAideChat, Visite,
} from './models';

/** Service d'accès à l'API REST OSEOR. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly api = environment.apiUrl;

  // Cache mémoire des données de référence (peu changeantes, souvent relues).
  // Les données « vivantes » (réservations, notifications, audiences) ne sont
  // jamais mises en cache pour rester fraîches.
  private cache = new Map<string, Observable<any>>();

  constructor(private http: HttpClient) {}

  private params(obj: Record<string, any>): HttpParams {
    let p = new HttpParams();
    Object.entries(obj).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    });
    return p;
  }

  /** Met en cache (partagé) le résultat d'un appel de référence. */
  private cacheRef<T>(cle: string, source: () => Observable<T>): Observable<T> {
    if (!this.cache.has(cle)) {
      this.cache.set(cle, source().pipe(shareReplay(1)));
    }
    return this.cache.get(cle) as Observable<T>;
  }

  /** Invalide une (ou toutes les) entrée(s) de cache, ex. après création d'une salle. */
  invaliderCache(cle?: string): void {
    if (cle) this.cache.delete(cle);
    else this.cache.clear();
  }

  // ---------- Filiales (référence, mise en cache) ----------
  filiales(): Observable<Paginated<Filiale>> {
    return this.cacheRef('filiales', () =>
      this.http.get<Paginated<Filiale>>(`${this.api}/filiales/`));
  }

  // ---------- Salles ----------
  salles(filtres: Record<string, any> = {}): Observable<Paginated<Salle>> {
    // Seul l'appel de référence (sans filtre) est mis en cache ; les listes
    // filtrées restent fraîches.
    const cle = 'salles:' + JSON.stringify(filtres);
    if (Object.keys(filtres).length === 0) {
      return this.cacheRef(cle, () =>
        this.http.get<Paginated<Salle>>(`${this.api}/salles/`));
    }
    return this.http.get<Paginated<Salle>>(`${this.api}/salles/`, { params: this.params(filtres) });
  }
  salle(id: number): Observable<Salle> {
    return this.http.get<Salle>(`${this.api}/salles/${id}/`);
  }
  creerSalle(s: Partial<Salle> | FormData): Observable<Salle> {
    return this.muterEtInvalider(this.http.post<Salle>(`${this.api}/salles/`, s));
  }
  majSalle(id: number, s: Partial<Salle> | FormData): Observable<Salle> {
    return this.muterEtInvalider(this.http.put<Salle>(`${this.api}/salles/${id}/`, s));
  }
  supprimerSalle(id: number): Observable<void> {
    return this.muterEtInvalider(this.http.delete<void>(`${this.api}/salles/${id}/`));
  }
  equipements(): Observable<Equipement[]> {
    // Liste 100% statique : cache permanent.
    return this.cacheRef('equipements', () =>
      this.http.get<Equipement[]>(`${this.api}/salles/equipements/`));
  }

  /** Exécute une mutation puis invalide le cache des salles (et filiales). */
  private muterEtInvalider<T>(obs: Observable<T>): Observable<T> {
    return new Observable<T>((sub) => obs.subscribe({
      next: (v) => {
        // purge les entrées 'salles*' du cache pour forcer un rechargement frais
        Array.from(this.cache.keys())
          .filter((k) => k.startsWith('salles'))
          .forEach((k) => this.cache.delete(k));
        sub.next(v);
      },
      error: (e) => sub.error(e),
      complete: () => sub.complete(),
    }));
  }

  // ---------- Réservations ----------
  reservations(filtres: Record<string, any> = {}): Observable<Paginated<Reservation>> {
    return this.http.get<Paginated<Reservation>>(`${this.api}/reservations/`, { params: this.params(filtres) });
  }
  creerReservation(r: Partial<Reservation>): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.api}/reservations/`, r);
  }
  reservation(id: number): Observable<Reservation> {
    return this.http.get<Reservation>(`${this.api}/reservations/${id}/`);
  }
  majReservation(id: number, r: Partial<Reservation>): Observable<Reservation> {
    return this.http.put<Reservation>(`${this.api}/reservations/${id}/`, r);
  }
  verifierDisponibilite(q: Record<string, any>): Observable<DisponibiliteResultat> {
    return this.http.get<DisponibiliteResultat>(
      `${this.api}/reservations/verifier_disponibilite/`, { params: this.params(q) });
  }
  validerReservation(id: number): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.api}/reservations/${id}/valider/`, {});
  }
  refuserReservation(id: number, motif: string): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.api}/reservations/${id}/refuser/`, { motif });
  }
  annulerReservation(id: number, motif: string): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.api}/reservations/${id}/annuler/`, { motif });
  }
  deplacerReservation(id: number, motif: string): Observable<Reservation> {
    return this.http.post<Reservation>(`${this.api}/reservations/${id}/deplacer/`, { motif });
  }
  creerSerie(s: any): Observable<any> {
    return this.http.post<any>(`${this.api}/series-recurrence/`, s);
  }

  // ---------- Audiences ----------
  audiences(filtres: Record<string, any> = {}): Observable<Paginated<Audience>> {
    return this.http.get<Paginated<Audience>>(`${this.api}/audiences/`, { params: this.params(filtres) });
  }
  audience(id: number): Observable<Audience> {
    return this.http.get<Audience>(`${this.api}/audiences/${id}/`);
  }
  creerAudience(a: Partial<Audience>): Observable<Audience> {
    return this.http.post<Audience>(`${this.api}/audiences/`, a);
  }
  majAudience(id: number, a: Partial<Audience>): Observable<Audience> {
    return this.http.put<Audience>(`${this.api}/audiences/${id}/`, a);
  }
  audienceAction(id: number, action: string, body: any = {}): Observable<any> {
    return this.http.post<any>(`${this.api}/audiences/${id}/${action}/`, body);
  }
  delegations(filtres: Record<string, any> = {}): Observable<Paginated<Delegation>> {
    return this.http.get<Paginated<Delegation>>(`${this.api}/delegations/`, { params: this.params(filtres) });
  }
  prendreEnCompteDelegation(id: number): Observable<Delegation> {
    return this.http.post<Delegation>(`${this.api}/delegations/${id}/prendre_en_compte/`, {});
  }

  // ---------- Utilisateurs ----------
  utilisateurs(filtres: Record<string, any> = {}): Observable<Paginated<Utilisateur>> {
    return this.http.get<Paginated<Utilisateur>>(`${this.api}/utilisateurs/`, { params: this.params(filtres) });
  }
  rechercheUtilisateurs(q: string): Observable<Utilisateur[]> {
    return this.http.get<Utilisateur[]>(`${this.api}/utilisateurs/recherche/`, { params: this.params({ q }) });
  }
  creerUtilisateur(u: any): Observable<Utilisateur> {
    return this.http.post<Utilisateur>(`${this.api}/utilisateurs/`, u);
  }
  majUtilisateur(id: number, u: any): Observable<Utilisateur> {
    return this.http.put<Utilisateur>(`${this.api}/utilisateurs/${id}/`, u);
  }
  synchroniserEntra(): Observable<{ crees: number; mis_a_jour: number; ignores: number; total: number }> {
    return this.http.post<any>(`${this.api}/utilisateurs/synchroniser_entra/`, {});
  }

  // ---------- Notifications ----------
  notifications(): Observable<Paginated<NotificationItem>> {
    return this.http.get<Paginated<NotificationItem>>(`${this.api}/notifications/`);
  }
  notificationsNonLues(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.api}/notifications/non_lues/`);
  }
  marquerNotifLue(id: number): Observable<NotificationItem> {
    return this.http.post<NotificationItem>(`${this.api}/notifications/${id}/marquer_lue/`, {});
  }
  toutMarquerLu(): Observable<any> {
    return this.http.post<any>(`${this.api}/notifications/tout_marquer_lu/`, {});
  }

  // ---------- Tableau de bord ----------
  stats(): Observable<any> {
    return this.http.get<any>(`${this.api}/tableau-bord/stats/`);
  }

  // ---------- Journal d'audit (admin) ----------
  journal(filtres: Record<string, any> = {}): Observable<any> {
    return this.http.get<any>(`${this.api}/journal/`, { params: this.params({ ordering: '-date_creation', ...filtres }) });
  }

  // ---------- Administration : Microsoft Entra ID ----------
  etatEntra(): Observable<EtatEntra> {
    return this.http.get<EtatEntra>(`${this.api}/parametres/entra/`);
  }
  testerEntra(): Observable<{ detail: string }> {
    return this.http.post<{ detail: string }>(`${this.api}/parametres/entra/tester/`, {});
  }

  // ---------- Mon profil (photo, signature électronique) ----------
  majMonProfil(donnees: FormData): Observable<Utilisateur> {
    return this.http.patch<Utilisateur>(`${this.api}/auth/me/`, donnees);
  }

  // ---------- Documents administratifs (Moyens Généraux) ----------
  configurationDocument(type_document: TypeDocumentAdministratif): Observable<ConfigurationDocument> {
    return this.http.get<ConfigurationDocument>(
      `${this.api}/documents/configuration/`, { params: this.params({ type_document }) });
  }
  documents(filtres: Record<string, any> = {}): Observable<Paginated<DocumentAdministratif>> {
    return this.http.get<Paginated<DocumentAdministratif>>(
      `${this.api}/documents/`, { params: this.params({ ordering: '-date_creation', page_size: 100, ...filtres }) });
  }
  document(id: number): Observable<DocumentAdministratif> {
    return this.http.get<DocumentAdministratif>(`${this.api}/documents/${id}/`);
  }
  creerDocument(d: any | FormData): Observable<DocumentAdministratif> {
    return this.http.post<DocumentAdministratif>(`${this.api}/documents/`, d);
  }
  dernierKm(): Observable<{ km_actuel: number | null }> {
    return this.http.get<{ km_actuel: number | null }>(`${this.api}/documents/dernier_km/`);
  }
  viserDocument(id: number, decision: 'VALIDE' | 'REFUSE', commentaire = ''): Observable<DocumentAdministratif> {
    return this.http.post<DocumentAdministratif>(`${this.api}/documents/${id}/viser/`, { decision, commentaire });
  }
  telechargerDocumentPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.api}/documents/${id}/pdf/`, { responseType: 'blob' });
  }
  /** Constate un règlement de facture — distinct du circuit de visas. */
  majStatutPaiement(id: number, statut_paiement: StatutPaiement): Observable<DocumentAdministratif> {
    return this.muterEtInvalider(this.http.post<DocumentAdministratif>(
      `${this.api}/documents/${id}/statut_paiement/`, { statut_paiement }));
  }

  majStatutLivraison(id: number, statut_livraison: StatutLivraison): Observable<DocumentAdministratif> {
    return this.http.post<DocumentAdministratif>(
      `${this.api}/documents/${id}/statut_livraison/`, { statut_livraison });
  }

  // ---------- Gestion de stocks ----------
  articles(filtres: Record<string, any> = {}): Observable<Paginated<Article>> {
    return this.http.get<Paginated<Article>>(
      `${this.api}/articles/`, { params: this.params({ ordering: 'nom', page_size: 200, ...filtres }) });
  }
  article(id: number): Observable<Article> {
    return this.http.get<Article>(`${this.api}/articles/${id}/`);
  }
  articlesEnAlerte(): Observable<Article[]> {
    return this.http.get<Article[]>(`${this.api}/articles/alertes/`);
  }
  creerArticle(a: Partial<Article>): Observable<Article> {
    return this.http.post<Article>(`${this.api}/articles/`, a);
  }
  majArticle(id: number, a: Partial<Article>): Observable<Article> {
    return this.http.patch<Article>(`${this.api}/articles/${id}/`, a);
  }
  mouvementsStock(filtres: Record<string, any> = {}): Observable<Paginated<MouvementStock>> {
    return this.http.get<Paginated<MouvementStock>>(
      `${this.api}/mouvements-stock/`, { params: this.params({ ordering: '-date_creation', page_size: 100, ...filtres }) });
  }
  creerMouvementStock(m: { article: number; type_mouvement: 'ENTREE' | 'SORTIE'; quantite: number; motif?: string }): Observable<MouvementStock> {
    return this.http.post<MouvementStock>(`${this.api}/mouvements-stock/`, m);
  }

  // ---------- Contrats ----------
  contrats(filtres: Record<string, any> = {}): Observable<Paginated<Contrat>> {
    return this.http.get<Paginated<Contrat>>(
      `${this.api}/contrats/`, { params: this.params({ ordering: '-date_creation', page_size: 100, ...filtres }) });
  }
  contrat(id: number): Observable<Contrat> {
    return this.http.get<Contrat>(`${this.api}/contrats/${id}/`);
  }
  contratsAlertesEcheance(): Observable<Contrat[]> {
    return this.http.get<Contrat[]>(`${this.api}/contrats/alertes_echeance/`);
  }
  creerContrat(c: Partial<Contrat>): Observable<Contrat> {
    return this.http.post<Contrat>(`${this.api}/contrats/`, c);
  }
  majContrat(id: number, c: Partial<Contrat>): Observable<Contrat> {
    return this.http.patch<Contrat>(`${this.api}/contrats/${id}/`, c);
  }
  resilierContrat(id: number, motif = ''): Observable<Contrat> {
    return this.http.post<Contrat>(`${this.api}/contrats/${id}/resilier/`, { motif });
  }
  ajouterPieceJointeContrat(id: number, fichier: File): Observable<Contrat> {
    const donnees = new FormData();
    donnees.append('fichier', fichier);
    return this.http.post<Contrat>(`${this.api}/contrats/${id}/ajouter_piece_jointe/`, donnees);
  }
  supprimerPieceJointeContrat(id: number, pieceJointeId: number): Observable<Contrat> {
    return this.http.post<Contrat>(
      `${this.api}/contrats/${id}/supprimer_piece_jointe/`, { piece_jointe: pieceJointeId });
  }

  // ---------- Rapports administratifs ----------
  rapportAdministratif(filtres: { date_debut?: string; date_fin?: string; filiale?: number } = {}): Observable<RapportAdministratif> {
    return this.http.get<RapportAdministratif>(
      `${this.api}/rapports/administratif/`, { params: this.params(filtres) });
  }
  exporterRapportAdministratif(filtres: { date_debut?: string; date_fin?: string; filiale?: number } = {}): Observable<Blob> {
    return this.http.get(
      `${this.api}/rapports/administratif/export/`, { params: this.params(filtres), responseType: 'blob' });
  }

  // ---------- Aide (chatbot FAQ) ----------
  entreesAide(filtres: Record<string, any> = {}): Observable<Paginated<EntreeAide>> {
    return this.http.get<Paginated<EntreeAide>>(`${this.api}/aide/`, { params: this.params(filtres) });
  }
  modulesAide(): Observable<ModuleAide[]> {
    return this.cacheRef('aide:modules', () =>
      this.http.get<ModuleAide[]>(`${this.api}/aide/modules/`));
  }
  poserQuestionAide(question: string): Observable<ReponseAideChat> {
    return this.http.post<ReponseAideChat>(`${this.api}/aide/poser_question/`, { question });
  }

  // ---------- Visiteurs (accueil) ----------
  visites(filtres: Record<string, any> = {}): Observable<Paginated<Visite>> {
    return this.http.get<Paginated<Visite>>(`${this.api}/visites/`, { params: this.params(filtres) });
  }
  creerVisite(v: {
    nom: string; prenom: string; type_piece: string; numero_piece: string; motif: string;
    filiale: number; personne_visitee: number;
  }): Observable<Visite> {
    return this.http.post<Visite>(`${this.api}/visites/`, v);
  }
  validerVisite(id: number): Observable<Visite> {
    return this.http.post<Visite>(`${this.api}/visites/${id}/valider/`, {});
  }
  refuserVisite(id: number, motif: string): Observable<Visite> {
    return this.http.post<Visite>(`${this.api}/visites/${id}/refuser/`, { motif });
  }
  marquerDepartVisite(id: number): Observable<Visite> {
    return this.http.post<Visite>(`${this.api}/visites/${id}/marquer_depart/`, {});
  }
  telechargerRegistreVisiteurs(): Observable<Blob> {
    return this.http.get(`${this.api}/visites/registre/`, { responseType: 'blob' });
  }
}
