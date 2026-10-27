import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';
import { Contrat, LIBELLES_TYPE_CONTRAT, TypeContrat } from '../../core/models';
import { NavigationService } from '../../core/navigation.service';

const TYPES_CONTRAT: TypeContrat[] = ['FOURNISSEUR', 'CLIENT', 'PRESTATAIRE', 'BAIL', 'AUTRE'];

@Component({
  selector: 'app-contrats',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Contrats</h1>
      <p class="sous-titre">{{ contrats().length }} contrat(s) enregistré(s)</p>
    </div>
    <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouveau contrat</button>
  </div>

  @if (contratsAlertes().length) {
    <div class="alerte err anim-entree">
      <app-icon name="close" [size]="16"/>
      {{ contratsAlertes().length }} contrat(s) à échéance proche ou dépassée :
      {{ libellesAlertes() }}
    </div>
  }

  @if (erreur()) {
    <div class="alerte err anim-entree"><app-icon name="close" [size]="16"/> {{ erreur() }}</div>
  }

  <!-- Formulaire nouveau contrat / édition -->
  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>{{ form.id ? 'Modifier le contrat' : 'Nouveau contrat' }}</h3>
      <div class="ligne">
        <div class="champ"><label>Intitulé</label><input [(ngModel)]="form.intitule" /></div>
        <div class="champ"><label>Partie contractante</label>
          <input [(ngModel)]="form.partie_contractante" placeholder="Fournisseur, client, prestataire…" />
        </div>
      </div>
      <div class="ligne">
        <div class="champ"><label>Type de contrat</label>
          <select [(ngModel)]="form.type_contrat">
            @for (t of typesContrat; track t) { <option [value]="t">{{ libellesType[t] }}</option> }
          </select>
        </div>
        <div class="champ"><label>Référence (facultatif)</label><input [(ngModel)]="form.reference" /></div>
        <div class="champ"><label>Montant (facultatif)</label><input type="number" [(ngModel)]="form.montant" /></div>
      </div>
      <div class="ligne">
        <div class="champ"><label>Date de début</label><input type="date" [(ngModel)]="form.date_debut" /></div>
        <div class="champ">
          <label>Date d'échéance (facultatif)</label>
          <input type="date" [(ngModel)]="form.date_echeance" />
        </div>
      </div>
      <div class="champ"><label>Description (facultatif)</label><textarea [(ngModel)]="form.description" rows="2"></textarea></div>
      @if (erreurForm()) { <div class="alerte err">{{ erreurForm() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrer()" [disabled]="envoiEnCours()">
          @if (envoiEnCours()) { <span class="spinner petit"></span> Envoi… } @else { Enregistrer }
        </button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <!-- Détail d'un contrat -->
  @if (selection(); as c) {
    <div class="carte detail anim-entree">
      <div class="detail-entete">
        <div>
          <h3>{{ c.numero }} — {{ c.intitule }}</h3>
          <p class="sous-titre">{{ c.partie_contractante }} — {{ c.type_contrat_libelle }}</p>
        </div>
        <span class="badge" [class.validee]="c.statut === 'ACTIF'" [class.rouge]="c.statut === 'EXPIRE'" [class.info]="c.statut === 'RESILIE'">
          {{ c.statut_libelle }}
        </span>
        <button class="btn secondaire petit" (click)="modifier(c)"><app-icon name="edit" [size]="12"/></button>
        <button class="fermer" (click)="selection.set(null)"><app-icon name="close" [size]="14"/></button>
      </div>

      <div class="champs-lecture">
        @if (c.reference) { <div><span class="lib">Référence</span> {{ c.reference }}</div> }
        <div><span class="lib">Début</span> {{ c.date_debut | date:'dd/MM/yyyy' }}</div>
        <div>
          <span class="lib">Échéance</span>
          @if (c.date_echeance) {
            {{ c.date_echeance | date:'dd/MM/yyyy' }}
            @if (c.statut === 'ACTIF' && c.jours_avant_echeance !== null) {
              <small class="jours" [class.proche]="c.jours_avant_echeance <= 30 && c.jours_avant_echeance >= 0" [class.depasse]="c.jours_avant_echeance < 0">
                ({{ c.jours_avant_echeance >= 0 ? 'dans ' + c.jours_avant_echeance + ' jour(s)' : 'dépassée' }})
              </small>
            }
          } @else { Durée indéterminée }
        </div>
        @if (c.montant) { <div><span class="lib">Montant</span> {{ c.montant }}</div> }
        <div><span class="lib">Enregistré par</span> {{ c.cree_par_nom }}</div>
      </div>

      @if (c.description) { <p class="description">{{ c.description }}</p> }

      @if (c.statut === 'RESILIE') {
        <div class="alerte info">
          Résilié le {{ c.date_resiliation | date:'dd/MM/yyyy' }}
          @if (c.motif_resiliation) { — {{ c.motif_resiliation }} }
        </div>
      }

      <h4>Pièces jointes</h4>
      <div class="pieces-jointes">
        @for (p of c.pieces_jointes; track p.id) {
          <div class="piece">
            <a [href]="p.fichier" target="_blank" rel="noopener"><app-icon name="doc" [size]="14"/> {{ p.nom_original || 'Fichier' }}</a>
            <small>{{ p.ajoute_par_nom }} — {{ p.date_ajout | date:'dd/MM/yyyy' }}</small>
            <button class="btn secondaire petit" (click)="supprimerPieceJointe(c, p.id)" [disabled]="pieceJointeEnCours()">
              <app-icon name="close" [size]="12"/>
            </button>
          </div>
        } @empty {
          <p class="vide">Aucune pièce jointe pour le moment.</p>
        }
      </div>
      <div class="ajout-piece">
        <input type="file" (change)="onFichierChoisi($event)" #inputFichier />
        <button class="btn secondaire petit" (click)="ajouterPieceJointe(c, inputFichier)" [disabled]="!fichierChoisi() || pieceJointeEnCours()">
          @if (pieceJointeEnCours()) { <span class="spinner petit"></span> Envoi… } @else { <app-icon name="plus" [size]="12"/> Ajouter }
        </button>
      </div>

      @if (c.statut === 'ACTIF') {
        <div class="viser-bloc">
          <h4>Résiliation</h4>
          <label>Motif (facultatif)</label>
          <textarea [(ngModel)]="motifResiliation" rows="2"></textarea>
          <div class="boutons">
            <button class="btn secondaire" (click)="resilier(c)" [disabled]="resiliationEnCours()">
              @if (resiliationEnCours()) { <span class="spinner petit"></span> Résiliation… } @else { Résilier ce contrat }
            </button>
          </div>
        </div>
      }
    </div>
  }

  <!-- Filtres -->
  <div class="carte anim-entree">
    <div class="tbl-filtre">
      <select [(ngModel)]="filtreStatut" (ngModelChange)="filtrer()">
        <option value="">Tous les statuts</option>
        <option value="ACTIF">Actif</option>
        <option value="EXPIRE">Expiré</option>
        <option value="RESILIE">Résilié</option>
      </select>
      <select [(ngModel)]="filtreType" (ngModelChange)="filtrer()">
        <option value="">Tous les types</option>
        @for (t of typesContrat; track t) { <option [value]="t">{{ libellesType[t] }}</option> }
      </select>
    </div>

    <table class="tbl">
      <thead>
        <tr><th>Numéro</th><th>Intitulé</th><th>Partie contractante</th><th>Type</th><th>Échéance</th><th>Statut</th><th></th></tr>
      </thead>
      <tbody>
        @for (c of contratsFiltres(); track c.id) {
          <tr>
            <td class="mono">{{ c.numero }}</td>
            <td>{{ c.intitule }}</td>
            <td>{{ c.partie_contractante }}</td>
            <td>{{ c.type_contrat_libelle }}</td>
            <td>
              @if (c.date_echeance) { {{ c.date_echeance | date:'dd/MM/yyyy' }} } @else { — }
            </td>
            <td>
              <span class="badge" [class.validee]="c.statut === 'ACTIF'" [class.rouge]="c.statut === 'EXPIRE'" [class.info]="c.statut === 'RESILIE'">
                {{ c.statut_libelle }}
              </span>
            </td>
            <td><button class="btn secondaire petit" (click)="ouvrir(c)">Voir</button></td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="vide-td">Aucun contrat pour le moment.</td></tr>
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
    .champ { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: .3rem; }
    .champ label { font-size: .78rem; font-weight: 600; color: var(--txt-2); }
    .champ input, .champ select, textarea { border: 1px solid var(--bord); border-radius: 8px;
      padding: .5rem .7rem; font-size: .85rem; font-family: inherit; }
    textarea { width: 100%; resize: vertical; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }

    .detail-entete { display: flex; align-items: flex-start; gap: .8rem; margin-bottom: 1rem; }
    .detail-entete h3 { margin: 0; }
    .fermer { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--txt-3); }
    .champs-lecture { display: flex; flex-wrap: wrap; gap: 1.2rem; margin-bottom: 1rem; font-size: .85rem; }
    .champs-lecture .lib { color: var(--txt-2); margin-right: .3rem; }
    .jours { display: inline-block; margin-left: .3rem; color: var(--txt-2); }
    .jours.proche { color: #b45309; font-weight: 600; }
    .jours.depasse { color: #dc2626; font-weight: 600; }
    .description { font-size: .85rem; color: var(--txt-2); margin: 0 0 1rem; }

    .pieces-jointes { display: flex; flex-direction: column; gap: .5rem; margin-bottom: .8rem; }
    .piece { display: flex; align-items: center; gap: .6rem; padding: .5rem .7rem; border: 1px solid var(--bord); border-radius: 8px; font-size: .83rem; }
    .piece a { display: flex; align-items: center; gap: .3rem; color: inherit; text-decoration: none; }
    .piece a:hover { text-decoration: underline; }
    .piece small { color: var(--txt-2); margin-left: auto; }
    .vide { font-size: .82rem; color: var(--txt-2); }
    .ajout-piece { display: flex; align-items: center; gap: .6rem; margin-bottom: 1rem; }
    .ajout-piece input[type="file"] { font-size: .8rem; }

    .viser-bloc { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--bord); }
    .viser-bloc label { font-size: .78rem; font-weight: 600; color: var(--txt-2); display: block; margin: .5rem 0 .3rem; }

    .tbl-filtre { display: flex; gap: .6rem; margin-bottom: .8rem; }
    .tbl-filtre select { border: 1px solid var(--bord); border-radius: 8px; padding: .4rem .7rem; font-size: .85rem; background: #fff; }
    .mono { font-family: monospace; font-size: .82rem; }
    .vide-td { text-align: center; color: var(--txt-2); padding: 2rem; }
  `],
})
export class ContratsComponent implements OnInit {
  contrats = signal<Contrat[]>([]);
  contratsFiltres = signal<Contrat[]>([]);
  contratsAlertes = signal<Contrat[]>([]);
  formVisible = signal(false);
  selection = signal<Contrat | null>(null);
  erreur = signal('');
  erreurForm = signal('');
  envoiEnCours = signal(false);
  pieceJointeEnCours = signal(false);
  resiliationEnCours = signal(false);
  fichierChoisi = signal<File | null>(null);
  motifResiliation = '';

  filtreStatut = '';
  filtreType = '';

  typesContrat = TYPES_CONTRAT;
  libellesType = LIBELLES_TYPE_CONTRAT;

  form: any = {};

  constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService) {
    inject(NavigationService).vuesLocales(this.selection, this.formVisible);
  }

  ngOnInit(): void {
    this.charger();
    this.api.contratsAlertesEcheance().subscribe((c) => this.contratsAlertes.set(c));

    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.contrat(+id).subscribe((c) => this.ouvrir(c));
    }
  }

  charger(): void {
    this.api.contrats().subscribe((p) => { this.contrats.set(p.results); this.filtrer(); });
  }

  filtrer(): void {
    let liste = this.contrats();
    if (this.filtreStatut) liste = liste.filter((c) => c.statut === this.filtreStatut);
    if (this.filtreType) liste = liste.filter((c) => c.type_contrat === this.filtreType);
    this.contratsFiltres.set(liste);
  }

  libellesAlertes(): string {
    return this.contratsAlertes().map((c) => c.intitule).join(', ');
  }

  nouveau(): void {
    this.form = {
      id: null, intitule: '', partie_contractante: '', type_contrat: 'FOURNISSEUR',
      reference: '', date_debut: '', date_echeance: '', montant: null, description: '',
    };
    this.erreurForm.set('');
    this.formVisible.set(true);
  }

  modifier(c: Contrat): void {
    this.form = {
      id: c.id, intitule: c.intitule, partie_contractante: c.partie_contractante,
      type_contrat: c.type_contrat, reference: c.reference, date_debut: c.date_debut,
      date_echeance: c.date_echeance || '', montant: c.montant, description: c.description,
    };
    this.erreurForm.set('');
    this.formVisible.set(true);
  }

  enregistrer(): void {
    this.erreurForm.set('');
    this.envoiEnCours.set(true);
    const donnees = { ...this.form, date_echeance: this.form.date_echeance || null };
    delete donnees.id;
    const obs = this.form.id ? this.api.majContrat(this.form.id, donnees) : this.api.creerContrat(donnees);
    obs.subscribe({
      next: () => {
        this.envoiEnCours.set(false);
        this.formVisible.set(false);
        this.charger();
      },
      error: (e) => {
        this.envoiEnCours.set(false);
        this.erreurForm.set(Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' '));
      },
    });
  }

  ouvrir(c: Contrat): void {
    this.selection.set(c);
    this.motifResiliation = '';
    this.fichierChoisi.set(null);
  }

  onFichierChoisi(evenement: Event): void {
    const fichier = (evenement.target as HTMLInputElement).files?.[0] || null;
    this.fichierChoisi.set(fichier);
  }

  ajouterPieceJointe(c: Contrat, inputFichier: HTMLInputElement): void {
    const fichier = this.fichierChoisi();
    if (!fichier) return;
    this.pieceJointeEnCours.set(true);
    this.api.ajouterPieceJointeContrat(c.id, fichier).subscribe({
      next: (maj) => {
        this.pieceJointeEnCours.set(false);
        this.selection.set(maj);
        this.fichierChoisi.set(null);
        inputFichier.value = '';
        this.charger();
      },
      error: () => {
        this.pieceJointeEnCours.set(false);
        this.erreur.set("Impossible d'ajouter la pièce jointe.");
      },
    });
  }

  supprimerPieceJointe(c: Contrat, pieceJointeId: number): void {
    this.pieceJointeEnCours.set(true);
    this.api.supprimerPieceJointeContrat(c.id, pieceJointeId).subscribe({
      next: (maj) => {
        this.pieceJointeEnCours.set(false);
        this.selection.set(maj);
        this.charger();
      },
      error: () => {
        this.pieceJointeEnCours.set(false);
        this.erreur.set('Impossible de supprimer la pièce jointe.');
      },
    });
  }

  resilier(c: Contrat): void {
    this.resiliationEnCours.set(true);
    this.api.resilierContrat(c.id, this.motifResiliation).subscribe({
      next: (maj) => {
        this.resiliationEnCours.set(false);
        this.selection.set(maj);
        this.motifResiliation = '';
        this.charger();
      },
      error: (e) => {
        this.resiliationEnCours.set(false);
        this.erreur.set(e?.error?.detail || 'Erreur lors de la résiliation.');
      },
    });
  }
}
