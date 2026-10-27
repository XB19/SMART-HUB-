import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ConfigurationDocument, DocumentAdministratif } from '../../core/models';
import { NavigationService } from '../../core/navigation.service';

interface LigneTransport {
  date: string;
  km_debut: number | null;
  km_fin: number | null;
  frais_parking: number | null;
  lieu: string;
  motif: string;
}

const TAUX_PAR_DEFAUT = 66;

@Component({
  selector: 'app-fiche-transport',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Gestion des déplacements</h1>
      <p class="sous-titre">{{ documents().length }} fiche(s) — suivi kilométrique véhicule</p>
    </div>
    @if (config()?.configure) {
      <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouveau</button>
    }
  </div>

  @if (config() && !config()!.configure) {
    <div class="alerte err anim-entree">
      <app-icon name="close" [size]="16"/>
      Ce document n'est pas encore configuré pour votre filiale. Contactez un administrateur.
    </div>
  }
  @if (erreur()) {
    <div class="alerte err anim-entree"><app-icon name="close" [size]="16"/> {{ erreur() }}</div>
  }

  <!-- Formulaire de création -->
  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>Nouvelle fiche de transport</h3>

      <div class="ligne">
        <div class="champ"><label>Période — début</label><input type="date" [(ngModel)]="form.periode_debut" /></div>
        <div class="champ"><label>Période — fin</label><input type="date" [(ngModel)]="form.periode_fin" /></div>
      </div>
      <div class="ligne">
        <div class="champ">
          <label>Km précédent {{ kmPrerempli() ? '(pré-rempli automatiquement)' : '' }}</label>
          <input type="number" [(ngModel)]="form.km_precedent" />
        </div>
        <div class="champ"><label>Km actuel</label><input type="number" [(ngModel)]="form.km_actuel" /></div>
        <div class="champ"><label>Taux au km (FCFA)</label><input type="number" [(ngModel)]="form.taux_auto" /></div>
        <div class="champ"><label>Km domicile — bureau</label><input type="number" [(ngModel)]="form.km_domicile_bureau" /></div>
      </div>

      <table class="tbl-lignes">
        <thead>
          <tr>
            <th>Date</th><th>Km début</th><th>Km fin</th><th>Différence</th>
            <th>Frais parking</th><th>Lieu</th><th>Motif</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (l of lignes; track $index) {
            <tr>
              <td><input type="date" [(ngModel)]="l.date" /></td>
              <td><input type="number" [(ngModel)]="l.km_debut" /></td>
              <td><input type="number" [(ngModel)]="l.km_fin" /></td>
              <td class="lecture">{{ differenceLigne(l) }}</td>
              <td><input type="number" [(ngModel)]="l.frais_parking" /></td>
              <td><input [(ngModel)]="l.lieu" /></td>
              <td><input [(ngModel)]="l.motif" /></td>
              <td><button class="btn secondaire petit" (click)="supprimerLigne($index)"><app-icon name="close" [size]="12"/></button></td>
            </tr>
          }
        </tbody>
      </table>
      <button class="btn secondaire petit ajouter-ligne" (click)="ajouterLigne()"><app-icon name="plus" [size]="13"/> Ajouter une ligne</button>

      <div class="resume">
        <div><span>Total km facturés</span><strong>{{ totalKm() }} km</strong></div>
        <div><span>Total frais de parking</span><strong>{{ totalParking() }}</strong></div>
        <div><span>Montant estimé</span><strong>{{ montantEstime() }}</strong></div>
        <div><span>Km différence globale</span><strong>{{ kmDifferenceGlobale() }} km</strong></div>
        <div [class.attention]="kmPersonnel() < 0"><span>Km personnel</span><strong>{{ kmPersonnel() }} km</strong></div>
      </div>
      @if (kmPersonnel() < 0) {
        <div class="alerte err">
          Le km personnel calculé est négatif — vérifiez le km actuel/précédent et les lignes du tableau.
        </div>
      }

      <div class="champ piece-jointe">
        <label>Pièce jointe (facultatif — facture, reçu de parking…)</label>
        <input type="file" accept="image/*,application/pdf" (change)="choisirFichier($event)" />
      </div>

      <div class="boutons">
        <button class="btn vert" (click)="soumettre()" [disabled]="envoiEnCours()">
          @if (envoiEnCours()) { <span class="spinner petit"></span> Envoi… } @else { Soumettre }
        </button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <!-- Détail d'une fiche -->
  @if (selection(); as d) {
    <div class="carte detail anim-entree">
      <div class="detail-entete">
        <div>
          <h3>{{ d.numero }}</h3>
          <p class="sous-titre">
            {{ d.demandeur_nom }} — {{ d.champs_entete['periode_debut'] }} au {{ d.champs_entete['periode_fin'] }}
          </p>
        </div>
        <span class="badge" [class.validee]="d.statut === 'VALIDE'" [class.rouge]="d.statut === 'REFUSE'" [class.info]="d.statut === 'EN_COURS'">
          {{ d.statut_libelle }}
        </span>
        <button class="btn secondaire petit" (click)="telechargerPdf(d)" [disabled]="pdfEnCours()">
          <app-icon name="doc" [size]="13"/> PDF
        </button>
        <button class="fermer" (click)="selection.set(null)"><app-icon name="close" [size]="14"/></button>
      </div>

      <div class="champs-lecture">
        <div><span class="lib">Km précédent</span> {{ d.champs_entete['km_precedent'] }}</div>
        <div><span class="lib">Km actuel</span> {{ d.champs_entete['km_actuel'] }}</div>
        <div><span class="lib">Taux au km</span> {{ d.champs_entete['taux_auto'] }}</div>
        <div><span class="lib">Km domicile-bureau</span> {{ d.champs_entete['km_domicile_bureau'] }}</div>
      </div>

      <table class="tbl-lignes lecture">
        <thead>
          <tr><th>Date</th><th>Km début</th><th>Km fin</th><th>Différence</th><th>Frais parking</th><th>Lieu</th><th>Motif</th></tr>
        </thead>
        <tbody>
          @for (l of d.lignes; track $index) {
            <tr>
              <td>{{ l['date'] }}</td><td>{{ l['km_debut'] }}</td><td>{{ l['km_fin'] }}</td>
              <td>{{ (l['km_fin'] || 0) - (l['km_debut'] || 0) }}</td>
              <td>{{ l['frais_parking'] }}</td><td>{{ l['lieu'] }}</td><td>{{ l['motif'] }}</td>
            </tr>
          }
        </tbody>
      </table>
      <div class="total-ligne">Montant total : <strong>{{ d.montant_total }}</strong></div>

      @if (d.piece_jointe) {
        <a class="btn secondaire petit" [href]="d.piece_jointe" target="_blank" rel="noopener">
          <app-icon name="doc" [size]="13"/> Voir la pièce jointe
        </a>
      }

      @if (d.motif_rejet) { <div class="alerte err">Motif de refus : {{ d.motif_rejet }}</div> }

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
    </div>
  }

  <!-- Liste -->
  <div class="carte anim-entree">
    <table class="tbl">
      <thead>
        <tr><th>Numéro</th><th>Demandeur</th><th>Période</th><th>Statut</th><th>Étape en cours</th><th></th></tr>
      </thead>
      <tbody>
        @for (d of documents(); track d.id) {
          <tr>
            <td class="mono">{{ d.numero }}</td>
            <td>{{ d.demandeur_nom }}</td>
            <td>{{ d.champs_entete['periode_debut'] }} — {{ d.champs_entete['periode_fin'] }}</td>
            <td>
              <span class="badge" [class.validee]="d.statut === 'VALIDE'" [class.rouge]="d.statut === 'REFUSE'" [class.info]="d.statut === 'EN_COURS'">
                {{ d.statut_libelle }}
              </span>
            </td>
            <td>{{ d.visa_courant?.libelle || '—' }}</td>
            <td><button class="btn secondaire petit" (click)="ouvrir(d)">Voir</button></td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="vide-td">Aucune fiche pour le moment.</td></tr>
        }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .form, .detail { margin-bottom: 1rem; }
    .ligne { display: flex; gap: 1rem; margin-bottom: .9rem; flex-wrap: wrap; }
    .champ { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: .3rem; }
    .champ label { font-size: .78rem; font-weight: 600; color: var(--txt-2); }
    .champ input, textarea { border: 1px solid var(--bord); border-radius: 8px; padding: .5rem .7rem; font-size: .85rem; font-family: inherit; }
    textarea { width: 100%; resize: vertical; }
    .piece-jointe { margin: .8rem 0; }

    .tbl-lignes { width: 100%; border-collapse: collapse; margin: .8rem 0; }
    .tbl-lignes th { text-align: left; font-size: .74rem; color: var(--txt-2); padding: .4rem .5rem; border-bottom: 1px solid var(--bord); white-space: nowrap; }
    .tbl-lignes td { padding: .3rem .5rem; border-bottom: 1px solid #f1f5f9; }
    .tbl-lignes input { width: 100%; border: 1px solid var(--bord); border-radius: 6px; padding: .35rem .5rem; font-size: .82rem; }
    .tbl-lignes td.lecture { font-weight: 600; color: var(--navy); text-align: center; }
    .tbl-lignes.lecture td { font-size: .85rem; }
    .ajouter-ligne { margin-bottom: .8rem; }

    .resume { display: flex; flex-wrap: wrap; gap: 1.2rem; background: #f8fafc; border-radius: 10px;
      padding: .8rem 1rem; margin: .8rem 0; }
    .resume > div { display: flex; flex-direction: column; gap: .15rem; font-size: .78rem; color: var(--txt-2); }
    .resume strong { font-size: .95rem; color: var(--navy); }
    .resume > div.attention strong { color: var(--rouge); }

    .total-ligne { text-align: right; font-size: .9rem; margin: .5rem 0; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }

    .detail-entete { display: flex; align-items: flex-start; gap: .8rem; margin-bottom: 1rem; }
    .detail-entete h3 { margin: 0; }
    .fermer { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--txt-3); }
    .champs-lecture { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-bottom: 1rem; font-size: .85rem; }
    .champs-lecture .lib { color: var(--txt-2); margin-right: .3rem; }

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
export class FicheTransportComponent implements OnInit {
  documents = signal<DocumentAdministratif[]>([]);
  config = signal<ConfigurationDocument | null>(null);
  formVisible = signal(false);
  selection = signal<DocumentAdministratif | null>(null);
  erreur = signal('');
  envoiEnCours = signal(false);
  visaEnCours = signal(false);
  pdfEnCours = signal(false);
  commentaireVisa = '';
  kmPrerempli = signal(false);

  form = {
    periode_debut: '', periode_fin: '',
    km_precedent: null as number | null, km_actuel: null as number | null,
    taux_auto: TAUX_PAR_DEFAUT, km_domicile_bureau: null as number | null,
  };
  lignes: LigneTransport[] = [];
  fichier: File | null = null;

  constructor(private route: ActivatedRoute, private api: ApiService) {
    inject(NavigationService).vuesLocales(this.selection, this.formVisible);
  }

  ngOnInit(): void {
    this.api.configurationDocument('FICHE_TRANSPORT').subscribe((c) => this.config.set(c));
    this.charger();

    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.document(+id).subscribe((d) => this.ouvrir(d));
    }
  }

  charger(): void {
    this.api.documents({ type_document: 'FICHE_TRANSPORT' }).subscribe((p) => this.documents.set(p.results));
  }

  ligneVide(): LigneTransport {
    return { date: '', km_debut: null, km_fin: null, frais_parking: null, lieu: '', motif: '' };
  }

  nouveau(): void {
    this.form = {
      periode_debut: '', periode_fin: '',
      km_precedent: null, km_actuel: null,
      taux_auto: TAUX_PAR_DEFAUT, km_domicile_bureau: null,
    };
    this.lignes = [this.ligneVide()];
    this.fichier = null;
    this.kmPrerempli.set(false);
    this.erreur.set('');
    this.formVisible.set(true);
    this.api.dernierKm().subscribe((r) => {
      if (r.km_actuel !== null) {
        this.form.km_precedent = r.km_actuel;
        this.kmPrerempli.set(true);
      }
    });
  }

  ajouterLigne(): void { this.lignes.push(this.ligneVide()); }
  supprimerLigne(i: number): void { this.lignes.splice(i, 1); }

  differenceLigne(l: LigneTransport): number {
    const diff = (Number(l.km_fin) || 0) - (Number(l.km_debut) || 0);
    return diff > 0 ? diff : 0;
  }

  totalKm(): number { return this.lignes.reduce((acc, l) => acc + this.differenceLigne(l), 0); }
  totalParking(): number { return this.lignes.reduce((acc, l) => acc + (Number(l.frais_parking) || 0), 0); }
  montantEstime(): number { return this.totalKm() * (Number(this.form.taux_auto) || 0) + this.totalParking(); }
  kmDifferenceGlobale(): number { return (Number(this.form.km_actuel) || 0) - (Number(this.form.km_precedent) || 0); }
  kmPersonnel(): number { return this.kmDifferenceGlobale() - this.totalKm(); }

  choisirFichier(event: Event): void {
    this.fichier = (event.target as HTMLInputElement).files?.[0] ?? null;
  }

  soumettre(): void {
    this.erreur.set('');
    this.envoiEnCours.set(true);
    const champsEntete = {
      periode_debut: this.form.periode_debut,
      periode_fin: this.form.periode_fin,
      km_precedent: this.form.km_precedent,
      km_actuel: this.form.km_actuel,
      taux_auto: this.form.taux_auto,
      km_domicile_bureau: this.form.km_domicile_bureau,
    };

    let corps: any;
    if (this.fichier) {
      const donnees = new FormData();
      donnees.append('type_document', 'FICHE_TRANSPORT');
      donnees.append('champs_entete', JSON.stringify(champsEntete));
      donnees.append('lignes', JSON.stringify(this.lignes));
      donnees.append('piece_jointe', this.fichier);
      corps = donnees;
    } else {
      corps = { type_document: 'FICHE_TRANSPORT', champs_entete: champsEntete, lignes: this.lignes };
    }

    this.api.creerDocument(corps).subscribe({
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
}
