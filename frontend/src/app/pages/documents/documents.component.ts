import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';
import {
  ConfigurationDocument, DocumentAdministratif, TypeDocumentAdministratif,
  StatutLivraison, LIBELLES_STATUT_LIVRAISON,
  StatutPaiement, LIBELLES_STATUT_PAIEMENT,
} from '../../core/models';

// Champs d'en-tête additionnels selon le type de document (structurels au
// type de document — pas de variation par filiale, contrairement aux
// colonnes de lignes et à la chaîne de visas qui viennent de la configuration).
const CHAMPS_ENTETE: Record<TypeDocumentAdministratif, { cle: string; libelle: string }[]> = {
  FICHE_BESOIN: [],
  DEMANDE_ACHAT: [
    { cle: 'fournisseur', libelle: 'Fournisseur' },
    { cle: 'reference', libelle: 'Référence' },
    { cle: 'departement', libelle: 'Département' },
  ],
  FICHE_TRANSPORT: [],
  BON_SORTIE_CAISSE: [
    { cle: 'service', libelle: 'Service' },
    { cle: 'beneficiaire', libelle: 'Bénéficiaire' },
    { cle: 'montant_lettre', libelle: 'Montant (en lettre)' },
  ],
  BON_COMMANDE: [
    { cle: 'fournisseur', libelle: 'Fournisseur' },
    { cle: 'reference', libelle: 'Référence' },
    { cle: 'delai_livraison', libelle: 'Délai de livraison souhaité' },
  ],
  // Une note de service n'a pas de tableau de lignes : son contenu tient
  // dans l'en-tête. `visibilite` détermine à qui elle est diffusée une fois
  // signée (GROUPE, FILIALE ou SERVICE).
  NOTE_INTERNE: [
    { cle: 'objet', libelle: 'Objet' },
    { cle: 'corps', libelle: 'Texte de la note' },
    { cle: 'visibilite', libelle: 'Diffusion (GROUPE, FILIALE ou SERVICE)' },
  ],
  FACTURE: [
    { cle: 'fournisseur', libelle: 'Fournisseur' },
    { cle: 'numero_fournisseur', libelle: 'N° de facture fournisseur' },
    { cle: 'date_echeance', libelle: 'Échéance (AAAA-MM-JJ)' },
    { cle: 'bon_commande', libelle: 'Bon de commande associé (n°)' },
  ],
};

const STATUTS_LIVRAISON: StatutLivraison[] = ['EN_ATTENTE', 'ENVOYE', 'LIVRE_PARTIEL', 'LIVRE', 'ANNULE'];
const STATUTS_PAIEMENT: StatutPaiement[] = ['A_PAYER', 'PARTIEL', 'PAYEE', 'LITIGE', 'ANNULEE'];

@Component({
  selector: 'app-documents',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>{{ titre }}</h1>
      <p class="sous-titre">{{ documents().length }} document(s)</p>
    </div>
    @if (config()?.configure) {
      <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouveau</button>
    }
  </div>

  @if (config() && !config()!.configure) {
    <div class="alerte err anim-entree">
      <app-icon name="close" [size]="16"/>
      Ce document n'est pas encore configuré pour votre filiale. Contactez un administrateur
      (colonnes et circuit de visa à définir depuis l'admin Django).
    </div>
  }

  @if (erreur()) {
    <div class="alerte err anim-entree"><app-icon name="close" [size]="16"/> {{ erreur() }}</div>
  }

  <!-- Formulaire de création -->
  @if (formVisible() && config(); as c) {
    <div class="carte form anim-entree">
      <h3>Nouveau — {{ titre }}</h3>

      @if (champsEntete().length) {
        <div class="ligne">
          @for (champ of champsEntete(); track champ.cle) {
            <div class="champ">
              <label>{{ champ.libelle }}</label>
              <input [(ngModel)]="form.champs_entete[champ.cle]" />
            </div>
          }
        </div>
      }

      @if (type === 'BON_COMMANDE') {
        <div class="ligne">
          <div class="champ">
            <label>Demande d'achat liée (facultatif)</label>
            <select [(ngModel)]="form.document_source">
              <option [ngValue]="null">— Aucune —</option>
              @for (da of demandesAchatValidees(); track da.id) {
                <option [ngValue]="da.id">{{ da.numero }}</option>
              }
            </select>
          </div>
        </div>
      }

      <table class="tbl-lignes">
        <thead>
          <tr>
            @for (col of c.colonnes; track col.cle) { <th>{{ col.libelle }}</th> }
            <th></th>
          </tr>
        </thead>
        <tbody>
          @for (ligne of form.lignes; track $index) {
            <tr>
              @for (col of c.colonnes; track col.cle) {
                <td><input [(ngModel)]="ligne[col.cle]" (ngModelChange)="recalculerTotal()" /></td>
              }
              <td><button class="btn secondaire petit" (click)="supprimerLigne($index)"><app-icon name="close" [size]="12"/></button></td>
            </tr>
          }
        </tbody>
      </table>
      <button class="btn secondaire petit ajouter-ligne" (click)="ajouterLigne(c)"><app-icon name="plus" [size]="13"/> Ajouter une ligne</button>

      @if (aColonneMontant(c)) {
        <div class="total-ligne">Total : <strong>{{ form.montant_total }}</strong></div>
      }

      <div class="boutons">
        <button class="btn vert" (click)="soumettre()" [disabled]="envoiEnCours()">
          @if (envoiEnCours()) { <span class="spinner petit"></span> Envoi… } @else { Soumettre }
        </button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <!-- Détail d'un document -->
  @if (selection(); as d) {
    <div class="carte detail anim-entree">
      <div class="detail-entete">
        <div>
          <h3>{{ d.numero }}</h3>
          <p class="sous-titre">{{ d.demandeur_nom }} — {{ d.date_creation | date:'dd/MM/yyyy HH:mm' }}</p>
        </div>
        <span class="badge" [class.validee]="d.statut === 'VALIDE'" [class.rouge]="d.statut === 'REFUSE'" [class.info]="d.statut === 'EN_COURS'">
          {{ d.statut_libelle }}
        </span>
        <button class="btn secondaire petit" (click)="telechargerPdf(d)" [disabled]="pdfEnCours()">
          <app-icon name="doc" [size]="13"/> PDF
        </button>
        <button class="fermer" (click)="selection.set(null)"><app-icon name="close" [size]="14"/></button>
      </div>

      @if (d.document_source_numero) {
        <p class="lien-doc">Émis à partir de la Demande d'achat <strong>{{ d.document_source_numero }}</strong></p>
      }
      @if (d.documents_derives_numeros.length) {
        <p class="lien-doc">Bon(s) de commande émis : <strong>{{ d.documents_derives_numeros.join(', ') }}</strong></p>
      }

      @if (champsEnteteAffiches(d).length) {
        <div class="champs-lecture">
          @for (cle of champsEnteteAffiches(d); track cle) {
            <div><span class="lib">{{ libelleChamp(cle) }}</span> {{ d.champs_entete[cle] }}</div>
          }
        </div>
      }

      @if (configDetail(); as cd) {
        <table class="tbl-lignes lecture">
          <thead><tr>@for (col of cd.colonnes; track col.cle) { <th>{{ col.libelle }}</th> }</tr></thead>
          <tbody>
            @for (ligne of d.lignes; track $index) {
              <tr>@for (col of cd.colonnes; track col.cle) { <td>{{ ligne[col.cle] }}</td> }</tr>
            }
          </tbody>
        </table>
      }
      @if (d.montant_total && d.montant_total !== '0.00') {
        <div class="total-ligne">Total : <strong>{{ d.montant_total }}</strong></div>
      }

      @if (d.motif_rejet) {
        <div class="alerte err">Motif de refus : {{ d.motif_rejet }}</div>
      }

      <h4>Chaîne de visas</h4>
      <div class="visas">
        @for (v of historiqueAffiche(d); track $index) {
          <div class="visa" [class.fait]="v.fait" [class.refuse]="v.refuse" [class.attente]="v.attente">
            <app-icon [name]="v.refuse ? 'close' : (v.fait ? 'checkCircle' : 'clock')" [size]="16"/>
            <div>
              <strong>{{ v.libelle }}</strong>
              @if (v.fait) {
                <small>{{ v.utilisateur_nom }} — {{ v.date | date:'dd/MM/yyyy HH:mm' }}{{ v.a_une_signature ? ' (signature enregistrée)' : '' }}</small>
                @if (v.commentaire) { <small class="commentaire">« {{ v.commentaire }} »</small> }
              } @else {
                <small>En attente</small>
              }
            </div>
          </div>
        }
      </div>

      @if (d.peut_viser) {
        <div class="viser-bloc">
          <label>Commentaire (optionnel)</label>
          <textarea [(ngModel)]="commentaireVisa" rows="2"></textarea>
          <div class="boutons">
            <button class="btn vert" (click)="viser(d, 'VALIDE')" [disabled]="visaEnCours()">Valider</button>
            <button class="btn secondaire" (click)="viser(d, 'REFUSE')" [disabled]="visaEnCours()">Refuser</button>
          </div>
        </div>
      }

      @if (type === 'FACTURE' && d.statut === 'VALIDE') {
        <div class="viser-bloc">
          <h4>Règlement</h4>
          <p class="sous-titre">
            Statut actuel : <strong>{{ libelleStatutPaiement(d) }}</strong>
            @if (d.echeance_depassee) { — <span class="mono">échéance dépassée</span> }
          </p>
          @if (peutSuivrePaiement()) {
            <div class="boutons">
              @for (s of statutsPaiement; track s) {
                <button
                  class="btn secondaire petit"
                  [disabled]="statutPaiementEnCours() || d.statut_paiement === s"
                  (click)="majStatutPaiement(d, s)">
                  {{ LIBELLES_STATUT_PAIEMENT[s] }}
                </button>
              }
            </div>
          } @else {
            <p class="sous-titre">
              Seuls le comptable de la filiale et la direction constatent un règlement.
            </p>
          }
        </div>
      }

      @if (type === 'BON_COMMANDE' && d.statut === 'VALIDE' && peutSuivreLivraison(d)) {
        <div class="viser-bloc">
          <h4>Suivi de livraison</h4>
          <p class="sous-titre">Statut actuel : <strong>{{ libelleStatutLivraison(d) }}</strong></p>
          <div class="boutons">
            @for (s of statutsLivraison; track s) {
              <button
                class="btn secondaire petit"
                [disabled]="statutLivraisonEnCours() || d.champs_entete['statut_livraison'] === s"
                (click)="majStatutLivraison(d, s)">
                {{ LIBELLES_STATUT_LIVRAISON[s] }}
              </button>
            }
          </div>
        </div>
      }
    </div>
  }

  <!-- Liste -->
  <div class="carte anim-entree">
    <table class="tbl">
      <thead>
        <tr><th>Numéro</th><th>Demandeur</th><th>Date</th><th>Statut</th><th>Étape en cours</th><th></th></tr>
      </thead>
      <tbody>
        @for (d of documents(); track d.id) {
          <tr>
            <td class="mono">{{ d.numero }}</td>
            <td>{{ d.demandeur_nom }}</td>
            <td>{{ d.date_creation | date:'dd/MM/yyyy' }}</td>
            <td>
              <span class="badge" [class.validee]="d.statut === 'VALIDE'" [class.rouge]="d.statut === 'REFUSE'" [class.info]="d.statut === 'EN_COURS'">
                {{ d.statut_libelle }}
              </span>
            </td>
            <td>{{ d.visa_courant?.libelle || '—' }}</td>
            <td><button class="btn secondaire petit" (click)="ouvrir(d)">Voir</button></td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="vide-td">Aucun document pour le moment.</td></tr>
        }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .form, .detail { margin-bottom: 1rem; }
    .ligne { display: flex; gap: 1rem; margin-bottom: .9rem; }
    .champ { flex: 1; display: flex; flex-direction: column; gap: .3rem; }
    .champ label { font-size: .78rem; font-weight: 600; color: var(--txt-2); }
    .champ input, .champ select, textarea { border: 1px solid var(--bord); border-radius: 8px; padding: .5rem .7rem; font-size: .85rem; font-family: inherit; }
    textarea { width: 100%; resize: vertical; }

    .tbl-lignes { width: 100%; border-collapse: collapse; margin: .8rem 0; }
    .tbl-lignes th { text-align: left; font-size: .76rem; color: var(--txt-2); padding: .4rem .5rem; border-bottom: 1px solid var(--bord); }
    .tbl-lignes td { padding: .3rem .5rem; border-bottom: 1px solid #f1f5f9; }
    .tbl-lignes input { width: 100%; border: 1px solid var(--bord); border-radius: 6px; padding: .35rem .5rem; font-size: .83rem; }
    .tbl-lignes.lecture td { font-size: .85rem; }
    .ajouter-ligne { margin-bottom: .6rem; }
    .total-ligne { text-align: right; font-size: .9rem; margin: .5rem 0; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }

    .detail-entete { display: flex; align-items: flex-start; gap: .8rem; margin-bottom: 1rem; }
    .detail-entete h3 { margin: 0; }
    .fermer { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--txt-3); }
    .champs-lecture { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-bottom: 1rem; font-size: .85rem; }
    .champs-lecture .lib { color: var(--txt-2); margin-right: .3rem; }
    .lien-doc { font-size: .85rem; color: var(--txt-2); margin: 0 0 .6rem; }

    .visas { display: flex; flex-direction: column; gap: .6rem; margin: .8rem 0; }
    .visa { display: flex; align-items: flex-start; gap: .6rem; padding: .6rem .8rem; border-radius: 9px; border: 1px solid var(--bord); }
    .visa.fait { border-color: #bbf7d0; background: #f0fdf4; color: #15803d; }
    .visa.refuse { border-color: #fecaca; background: #fef2f2; color: #dc2626; }
    .visa.attente { color: var(--txt-2); }
    .visa strong { display: block; font-size: .85rem; }
    .visa small { display: block; font-size: .75rem; opacity: .85; }
    .visa small.commentaire { font-style: italic; }

    .viser-bloc { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--bord); }
    .viser-bloc label { font-size: .78rem; font-weight: 600; color: var(--txt-2); display: block; margin-bottom: .3rem; }

    .mono { font-family: monospace; font-size: .82rem; }
    .vide-td { text-align: center; color: var(--txt-2); padding: 2rem; }
  `],
})
export class DocumentsComponent implements OnInit {
  type!: TypeDocumentAdministratif;
  titre = 'Document';

  documents = signal<DocumentAdministratif[]>([]);
  config = signal<ConfigurationDocument | null>(null);
  formVisible = signal(false);
  selection = signal<DocumentAdministratif | null>(null);
  erreur = signal('');
  envoiEnCours = signal(false);
  visaEnCours = signal(false);
  pdfEnCours = signal(false);
  commentaireVisa = '';

  demandesAchatValidees = signal<DocumentAdministratif[]>([]);
  statutLivraisonEnCours = signal(false);
  statutsLivraison = STATUTS_LIVRAISON;
  LIBELLES_STATUT_LIVRAISON = LIBELLES_STATUT_LIVRAISON;
  statutPaiementEnCours = signal(false);
  statutsPaiement = STATUTS_PAIEMENT;
  LIBELLES_STATUT_PAIEMENT = LIBELLES_STATUT_PAIEMENT;

  form: any = { champs_entete: {}, lignes: [], montant_total: '0.00', document_source: null };

  constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService) {
    inject(NavigationService).vuesLocales(this.selection, this.formVisible);
  }

  get champsEntete() {
    return () => CHAMPS_ENTETE[this.type] || [];
  }

  ngOnInit(): void {
    this.type = this.route.snapshot.data['type'];
    this.titre = this.route.snapshot.data['titre'] || 'Document';
    this.api.configurationDocument(this.type).subscribe((c) => this.config.set(c));
    this.charger();

    if (this.type === 'BON_COMMANDE') {
      this.api.documents({ type_document: 'DEMANDE_ACHAT', statut: 'VALIDE' })
        .subscribe((p) => this.demandesAchatValidees.set(p.results));
    }

    // Ouverture directe depuis une notification (?id=...).
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.document(+id).subscribe((d) => this.ouvrir(d));
    }
  }

  charger(): void {
    this.api.documents({ type_document: this.type }).subscribe((p) => this.documents.set(p.results));
  }

  configDetail() {
    return this.config();
  }

  aColonneMontant(c: ConfigurationDocument): boolean {
    return c.colonnes.some((col) => col.cle === 'montant');
  }

  nouveau(): void {
    const c = this.config();
    this.form = {
      champs_entete: {},
      lignes: c ? [this.ligneVide(c)] : [],
      montant_total: '0.00',
      document_source: null,
    };
    this.erreur.set('');
    this.formVisible.set(true);
  }

  ligneVide(c: ConfigurationDocument): Record<string, any> {
    const ligne: Record<string, any> = {};
    c.colonnes.forEach((col) => (ligne[col.cle] = ''));
    return ligne;
  }

  ajouterLigne(c: ConfigurationDocument): void {
    this.form.lignes.push(this.ligneVide(c));
  }

  supprimerLigne(i: number): void {
    this.form.lignes.splice(i, 1);
    this.recalculerTotal();
  }

  recalculerTotal(): void {
    const c = this.config();
    if (!c || !this.aColonneMontant(c)) return;
    const total = this.form.lignes.reduce(
      (acc: number, ligne: any) => acc + (Number(ligne['montant']) || 0), 0);
    this.form.montant_total = total.toFixed(2);
  }

  soumettre(): void {
    this.erreur.set('');
    this.envoiEnCours.set(true);
    this.api.creerDocument({
      type_document: this.type,
      champs_entete: this.form.champs_entete,
      lignes: this.form.lignes,
      // montant_total n'est pas envoyé : toujours recalculé côté serveur
      // à partir des lignes, pour éviter qu'un montant soit falsifié.
      ...(this.form.document_source ? { document_source: this.form.document_source } : {}),
    }).subscribe({
      next: () => { this.envoiEnCours.set(false); this.formVisible.set(false); this.charger(); },
      error: (e) => {
        this.envoiEnCours.set(false);
        this.erreur.set(Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' '));
      },
    });
  }

  ouvrir(d: DocumentAdministratif): void {
    this.selection.set(d);
    this.commentaireVisa = '';
  }

  viser(d: DocumentAdministratif, decision: 'VALIDE' | 'REFUSE'): void {
    this.visaEnCours.set(true);
    this.api.viserDocument(d.id, decision, this.commentaireVisa).subscribe({
      next: (maj) => {
        this.visaEnCours.set(false);
        this.selection.set(maj);
        this.commentaireVisa = '';
        this.charger();
      },
      error: (e) => {
        this.visaEnCours.set(false);
        this.erreur.set(e?.error?.detail || 'Erreur lors du visa.');
      },
    });
  }

  telechargerPdf(d: DocumentAdministratif): void {
    this.pdfEnCours.set(true);
    this.api.telechargerDocumentPdf(d.id).subscribe({
      next: (blob) => {
        this.pdfEnCours.set(false);
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `${d.numero}.pdf`;
        lien.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => {
        this.pdfEnCours.set(false);
        this.erreur.set('Impossible de générer le PDF.');
      },
    });
  }

  historiqueAffiche(d: DocumentAdministratif) {
    const c = this.config();
    if (!c) return [];
    return c.visas.map((etape, i) => {
      const entree = d.historique_visas.find((h) => h.etape === i);
      return {
        libelle: etape.libelle,
        fait: !!entree && entree.decision === 'VALIDE',
        refuse: !!entree && entree.decision === 'REFUSE',
        attente: !entree,
        utilisateur_nom: entree?.utilisateur_nom,
        date: entree?.date,
        commentaire: entree?.commentaire,
        a_une_signature: entree?.a_une_signature,
      };
    });
  }

  objectKeys(o: Record<string, any>): string[] {
    return Object.keys(o || {});
  }

  // "statut_livraison" a son propre panneau dédié (Suivi de livraison) —
  // ne pas le répéter tel quel (code brut, ex. "LIVRE") parmi les champs
  // d'en-tête génériques.
  champsEnteteAffiches(d: DocumentAdministratif): string[] {
    return this.objectKeys(d.champs_entete).filter((cle) => cle !== 'statut_livraison');
  }

  libelleChamp(cle: string): string {
    const trouve = (CHAMPS_ENTETE[this.type] || []).find((c) => c.cle === cle);
    if (trouve) return trouve.libelle;
    const mot = cle.replace(/_/g, ' ');
    return mot.charAt(0).toUpperCase() + mot.slice(1);
  }

  /** Le règlement se constate par la trésorerie, pas par le demandeur. */
  peutSuivrePaiement(): boolean {
    return this.auth.aRole('COMPTABLE', 'DIRECTEUR', 'ADMINISTRATEUR');
  }

  libelleStatutPaiement(d: DocumentAdministratif): string {
    const s = (d.statut_paiement || 'A_PAYER') as StatutPaiement;
    return LIBELLES_STATUT_PAIEMENT[s] ?? s;
  }

  majStatutPaiement(d: DocumentAdministratif, statut: StatutPaiement): void {
    this.statutPaiementEnCours.set(true);
    this.api.majStatutPaiement(d.id, statut).subscribe({
      next: (maj) => {
        this.statutPaiementEnCours.set(false);
        this.selection.set(maj);
        this.charger();
      },
      error: (e) => {
        this.statutPaiementEnCours.set(false);
        this.erreur.set(
          e?.error?.detail || 'Erreur lors de la mise à jour du règlement.');
      },
    });
  }

  peutSuivreLivraison(d: DocumentAdministratif): boolean {
    if (this.auth.aRole('ADMINISTRATEUR', 'DIRECTEUR')) return true;
    return this.auth.aRole('SECRETAIRE') && this.auth.utilisateur()?.filiale === d.filiale;
  }

  libelleStatutLivraison(d: DocumentAdministratif): string {
    const statut = d.champs_entete?.['statut_livraison'] as StatutLivraison | undefined;
    return statut ? LIBELLES_STATUT_LIVRAISON[statut] : LIBELLES_STATUT_LIVRAISON['EN_ATTENTE'];
  }

  majStatutLivraison(d: DocumentAdministratif, statut: StatutLivraison): void {
    this.statutLivraisonEnCours.set(true);
    this.api.majStatutLivraison(d.id, statut).subscribe({
      next: (maj) => {
        this.statutLivraisonEnCours.set(false);
        this.selection.set(maj);
        this.charger();
      },
      error: (e) => {
        this.statutLivraisonEnCours.set(false);
        this.erreur.set(e?.error?.detail || 'Erreur lors de la mise à jour du suivi de livraison.');
      },
    });
  }
}
