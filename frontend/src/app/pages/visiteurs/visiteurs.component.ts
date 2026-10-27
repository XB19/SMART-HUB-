import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';
import { Visite, Filiale, Utilisateur, TypePiece } from '../../core/models';

@Component({
  selector: 'app-visiteurs',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Visiteurs</h1>
      <p class="sous-titre">Registre d'accueil — enregistrement, validation par le secrétariat et suivi des départs</p>
    </div>
    <button class="btn cta" (click)="telechargerRegistre()" [disabled]="exportEnCours()">
      @if (exportEnCours()) { <span class="spinner petit"></span> Export… }
      @else { <app-icon name="doc"/> Télécharger le registre }
    </button>
  </div>

  @if (peutEnregistrer()) {
    <div class="carte anim-entree">
      <h3>Enregistrer une arrivée</h3>
      <p class="aide">La pièce d'identité du visiteur est conservée à l'accueil en échange d'un badge, jusqu'à son départ. La demande part au secrétariat pour validation.</p>
      <form (ngSubmit)="enregistrerArrivee()">
        <div class="ligne">
          <div class="champ">
            <label>Nom</label>
            <input type="text" [(ngModel)]="form.nom" name="nom" required autocomplete="off" />
          </div>
          <div class="champ">
            <label>Prénom</label>
            <input type="text" [(ngModel)]="form.prenom" name="prenom" required autocomplete="off" />
          </div>
        </div>
        <div class="ligne">
          <div class="champ">
            <label>Type de pièce</label>
            <select [ngModel]="form.type_piece" (ngModelChange)="changerTypePiece($event)" name="type_piece" required>
              <option value="CNI">Carte nationale d'identité</option>
              <option value="PASSEPORT">Passeport</option>
            </select>
          </div>
          <div class="champ">
            <label>Numéro {{ form.type_piece === 'PASSEPORT' ? 'de passeport' : 'de CNI' }}</label>
            <input type="text" [attr.inputmode]="form.type_piece === 'CNI' ? 'numeric' : null"
                   [ngModel]="form.numero_piece" (ngModelChange)="fixerNumeroPiece($event)"
                   name="numero_piece"
                   [placeholder]="form.type_piece === 'PASSEPORT' ? 'Lettres et chiffres' : 'Chiffres uniquement'"
                   required autocomplete="off" />
          </div>
        </div>
        <div class="ligne">
          <div class="champ">
            <label>Filiale visitée</label>
            <select [ngModel]="form.filiale" (ngModelChange)="choisirFiliale($event)" name="filiale" required>
              <option [ngValue]="null">— Choisir —</option>
              @for (f of filiales(); track f.id) {
                @if (f.active) { <option [ngValue]="f.id">{{ f.nom }}</option> }
              }
            </select>
          </div>
          <div class="champ">
            <label>Personne visitée</label>
            <select [(ngModel)]="form.personne_visitee" name="personne_visitee" required [disabled]="!form.filiale">
              <option [ngValue]="null">{{ form.filiale ? '— Choisir —' : "D'abord choisir une filiale" }}</option>
              @for (p of personnes(); track p.id) { <option [ngValue]="p.id">{{ p.nom_complet }}</option> }
            </select>
          </div>
        </div>
        <div class="ligne">
          <div class="champ">
            <label>Motif de la visite</label>
            <input type="text" [(ngModel)]="form.motif" name="motif" placeholder="Ex. rendez-vous, livraison, entretien…" required autocomplete="off" />
          </div>
          <div class="champ">
            <label>Numéro de badge</label>
            <input type="text" [ngModel]="form.numero_badge" (ngModelChange)="fixerNumeroBadge($event)"
                   name="numero_badge" maxlength="20" placeholder="Ex. B-12" required autocomplete="off" />
          </div>
        </div>
        <button type="submit" class="btn cta" [disabled]="enregistrementEnCours() || !formValide()">
          @if (enregistrementEnCours()) { <span class="spinner petit"></span> Enregistrement… }
          @else { <app-icon name="plus"/> Enregistrer l'arrivée }
        </button>
      </form>
    </div>
  }

  <div class="carte anim-entree espace">
    <h3>Demandes en attente de validation ({{ enAttente().length }})</h3>
    @if (chargement()) {
      <p class="vide">Chargement…</p>
    } @else if (enAttente().length === 0) {
      <p class="vide">Aucune demande en attente.</p>
    } @else {
      <table class="tbl">
        <thead>
          <tr><th>Visiteur</th><th>Badge</th><th>Filiale</th><th>Personne visitée</th><th>Motif</th><th>Pièce d'identité</th><th>Enregistré par</th><th>Heure</th>
            @if (peutTraiter()) { <th></th> }</tr>
        </thead>
        <tbody class="stagger">
          @for (v of enAttente(); track v.id) {
            <tr [id]="'visite-' + v.id" [class.surlignee]="ligneSurlignee() === v.id">
              <td>{{ v.prenom }} {{ v.nom }}</td>
              <td>@if (v.numero_badge) { <span class="badge-num">{{ v.numero_badge }}</span> } @else { — }</td>
              <td>{{ v.filiale_nom }}</td>
              <td>{{ v.personne_visitee_nom }}</td>
              <td>{{ v.motif }}</td>
              <td>{{ v.type_piece_libelle }} — {{ v.numero_piece }}</td>
              <td>{{ v.enregistre_par_nom }}</td>
              <td>{{ v.heure_arrivee | date:'HH:mm' }}</td>
              @if (peutTraiter()) {
                <td>
                  <div class="actions">
                    <button class="btn vert petit" (click)="valider(v)" [disabled]="actionEnCours() === v.id">
                      <app-icon name="check" [size]="14"/> Valider
                    </button>
                    <button class="btn rouge petit" (click)="refuser(v)" [disabled]="actionEnCours() === v.id">
                      <app-icon name="close" [size]="14"/> Refuser
                    </button>
                  </div>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  </div>

  <div class="carte anim-entree espace">
    <h3>Présents ({{ presents().length }})</h3>
    @if (!chargement() && presents().length === 0) {
      <p class="vide">Aucun visiteur sur place actuellement.</p>
    } @else if (!chargement()) {
      <table class="tbl">
        <thead>
          <tr><th>Visiteur</th><th>Badge</th><th>Filiale</th><th>Personne visitée</th><th>Motif</th><th>Pièce d'identité</th><th>Validé par</th><th>Heure d'arrivée</th>
            @if (peutMarquerDepart()) { <th></th> }</tr>
        </thead>
        <tbody class="stagger">
          @for (v of presents(); track v.id) {
            <tr [id]="'visite-' + v.id" [class.surlignee]="ligneSurlignee() === v.id">
              <td>{{ v.prenom }} {{ v.nom }}</td>
              <td>@if (v.numero_badge) { <span class="badge-num">{{ v.numero_badge }}</span> } @else { — }</td>
              <td>{{ v.filiale_nom }}</td>
              <td>{{ v.personne_visitee_nom }}</td>
              <td>{{ v.motif }}</td>
              <td>{{ v.type_piece_libelle }} — {{ v.numero_piece }}</td>
              <td>{{ v.traite_par_nom }}</td>
              <td>{{ v.heure_arrivee | date:'HH:mm' }}</td>
              @if (peutMarquerDepart()) {
                <td>
                  <button class="btn secondaire petit" (click)="depart(v)" [disabled]="actionEnCours() === v.id">
                    @if (actionEnCours() === v.id) { <span class="spinner petit"></span> }
                    @else { <app-icon name="logout" [size]="15"/> Marquer le départ }
                  </button>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    }
  </div>

  <div class="carte anim-entree espace">
    <h3>Historique récent</h3>
    @if (!chargement() && historique().length === 0) {
      <p class="vide">Aucune visite terminée ou refusée pour le moment.</p>
    } @else if (!chargement()) {
      <table class="tbl">
        <thead>
          <tr><th>Visiteur</th><th>Badge</th><th>Filiale</th><th>Personne visitée</th><th>Motif</th><th>Arrivée</th><th>Départ</th><th>Statut</th></tr>
        </thead>
        <tbody class="stagger">
          @for (v of historique(); track v.id) {
            <tr [id]="'visite-' + v.id" [class.surlignee]="ligneSurlignee() === v.id">
              <td>{{ v.prenom }} {{ v.nom }}</td>
              <td>@if (v.numero_badge) { <span class="badge-num">{{ v.numero_badge }}</span> } @else { — }</td>
              <td>{{ v.filiale_nom }}</td>
              <td>{{ v.personne_visitee_nom }}</td>
              <td>{{ v.motif }}</td>
              <td>{{ v.heure_arrivee | date:'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ v.heure_depart ? (v.heure_depart | date:'dd/MM/yyyy HH:mm') : '—' }}</td>
              <td>
                @if (v.statut === 'REFUSEE') {
                  <span class="badge refusee">Refusé</span>
                  @if (v.motif_refus) { <div class="motif-refus">{{ v.motif_refus }}</div> }
                } @else {
                  <span class="badge validee">Parti</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .aide { color: var(--txt-3); font-size: .82rem; margin: -.4rem 0 1rem; }
    .espace { margin-top: 1.2rem; }
    .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
    .motif-refus { font-size: .76rem; color: var(--txt-3); margin-top: .2rem; }
    .badge-num { display: inline-block; padding: .1rem .45rem; border-radius: 6px;
      background: var(--bg); color: var(--navy); border: 1px solid var(--bord); font-weight: 700; font-size: .78rem;
      font-variant-numeric: tabular-nums; white-space: nowrap; }
    tr.surlignee { background: #fff7e6 !important; box-shadow: inset 3px 0 0 var(--accent); animation: pulseSurlignee 1.6s ease-out 1; }
    @keyframes pulseSurlignee { 0% { background: #ffedc2 !important; } 100% { background: #fff7e6 !important; } }
  `],
})
export class VisiteursComponent implements OnInit {
  visites = signal<Visite[]>([]);
  chargement = signal(false);
  enregistrementEnCours = signal(false);
  actionEnCours = signal<number | null>(null);
  ligneSurlignee = signal<number | null>(null);
  exportEnCours = signal(false);
  filiales = signal<Filiale[]>([]);
  personnes = signal<Utilisateur[]>([]);
  chargementPersonnes = signal(false);

  form: {
    nom: string; prenom: string; type_piece: TypePiece; numero_piece: string; numero_badge: string;
    motif: string; filiale: number | null; personne_visitee: number | null;
  } = this.formulaireVide();

  private formulaireVide() {
    return {
      nom: '', prenom: '', type_piece: 'CNI' as TypePiece, numero_piece: '', numero_badge: '',
      motif: '', filiale: null, personne_visitee: null,
    };
  }

  constructor(
    private api: ApiService, public auth: AuthService, private route: ActivatedRoute,
    private dialogue: DialogueService, private toasts: ToastService,
  ) {}

  ngOnInit(): void {
    this.charger();
    if (this.peutEnregistrer()) {
      this.api.filiales().subscribe((p) => this.filiales.set(p.results));
    }
  }

  /** OSEOR est un groupe : la filiale visitée détermine qui peut être visité, choisie avant la personne. */
  choisirFiliale(filialeId: number | null): void {
    this.form.filiale = filialeId;
    this.form.personne_visitee = null;
    this.personnes.set([]);
    if (!filialeId) return;
    this.chargementPersonnes.set(true);
    this.api.utilisateurs({ filiale: filialeId, page_size: 200 }).subscribe({
      next: (p) => { this.chargementPersonnes.set(false); this.personnes.set(p.results); },
      error: () => { this.chargementPersonnes.set(false); },
    });
  }

  /** Ouverture directe depuis une notification (?id=...) : surligne et scroll vers la ligne concernée. */
  private ouvrirDepuisNotif(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('id'));
    if (!id || !this.visites().some((v) => v.id === id)) return;
    this.ligneSurlignee.set(id);
    setTimeout(() => document.getElementById('visite-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  peutTraiter(): boolean {
    return this.auth.aRole('SECRETAIRE', 'ADMINISTRATEUR', 'DIRECTEUR');
  }

  /** Rendre la pièce d'identité et clore la visite : le rôle de l'agent, jamais celui de la secrétaire. */
  peutMarquerDepart(): boolean {
    return this.auth.aRole('AGENT_SECURITE', 'ADMINISTRATEUR', 'DIRECTEUR');
  }

  /** La secrétaire ne fait que valider/refuser : le formulaire d'arrivée ne la concerne pas. */
  peutEnregistrer(): boolean {
    return !this.auth.aRole('SECRETAIRE');
  }

  formValide(): boolean {
    return !!(
      this.form.nom.trim() && this.form.prenom.trim() && this.form.numero_piece.trim()
      && this.form.numero_badge.trim() && this.form.motif.trim()
      && this.form.filiale && this.form.personne_visitee
    );
  }

  /** Change de type de pièce : réapplique le filtre au numéro déjà saisi, au cas où il ne conviendrait plus. */
  changerTypePiece(type: TypePiece): void {
    this.form.type_piece = type;
    this.fixerNumeroPiece(this.form.numero_piece);
  }

  /**
   * Filtre la saisie selon le type de pièce : une CNI est numérique, un
   * passeport mélange lettres et chiffres (format ICAO) — mis en
   * majuscules par convention.
   */
  fixerNumeroPiece(valeur: string): void {
    this.form.numero_piece = this.form.type_piece === 'PASSEPORT'
      ? valeur.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      : valeur.replace(/\D/g, '');
  }

  /** Badge : lettres, chiffres et tirets, en majuscules (ex. B-12). */
  fixerNumeroBadge(valeur: string): void {
    this.form.numero_badge = valeur.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  }

  enAttente() {
    return this.visites().filter((v) => v.statut === 'EN_ATTENTE');
  }

  presents() {
    return this.visites().filter((v) => v.statut === 'VALIDEE');
  }

  historique() {
    return this.visites().filter((v) => v.statut === 'REFUSEE' || v.statut === 'TERMINEE');
  }

  private erreurToast(titre: string, e: any): void {
    // Erreurs de validation DRF : { champ: [messages] } — on les affiche telles quelles.
    const champs = e?.error && typeof e.error === 'object' && !e.error.detail
      ? Object.values(e.error).flat().join(' ') : '';
    this.toasts.afficher({ titre, message: e?.error?.detail || champs || 'Erreur inconnue.', type: 'ERROR' });
  }

  charger(): void {
    this.chargement.set(true);
    this.api.visites({ page_size: 100 }).subscribe({
      next: (p) => { this.chargement.set(false); this.visites.set(p.results); this.ouvrirDepuisNotif(); },
      error: (e) => { this.chargement.set(false); this.erreurToast('Chargement impossible', e); },
    });
  }

  enregistrerArrivee(): void {
    if (!this.formValide()) return;
    this.enregistrementEnCours.set(true);
    this.api.creerVisite({
      nom: this.form.nom.trim(),
      prenom: this.form.prenom.trim(),
      type_piece: this.form.type_piece,
      numero_piece: this.form.numero_piece.trim(),
      numero_badge: this.form.numero_badge.trim(),
      motif: this.form.motif.trim(),
      filiale: this.form.filiale!,
      personne_visitee: this.form.personne_visitee!,
    }).subscribe({
      next: (v) => {
        this.enregistrementEnCours.set(false);
        this.visites.update((liste) => [v, ...liste]);
        this.form = this.formulaireVide();
        this.personnes.set([]);
        this.toasts.succes('Demande envoyée au secrétariat pour validation.');
      },
      error: (e) => {
        this.enregistrementEnCours.set(false);
        this.erreurToast("Impossible d'enregistrer cette arrivée", e);
      },
    });
  }

  valider(v: Visite): void {
    this.actionEnCours.set(v.id);
    this.api.validerVisite(v.id).subscribe({
      next: (maj) => {
        this.actionEnCours.set(null);
        this.visites.update((liste) => liste.map((x) => (x.id === maj.id ? maj : x)));
      },
      error: (e) => { this.actionEnCours.set(null); this.erreurToast('Validation impossible', e); },
    });
  }

  async refuser(v: Visite): Promise<void> {
    const motif = await this.dialogue.demanderMotif({
      titre: 'Refuser la visite',
      message: `${v.prenom} ${v.nom} — ${v.motif}`,
      placeholder: 'Motif du refus',
      libelleConfirmer: 'Refuser',
      dangereux: true,
      obligatoire: true,
    });
    if (motif === null) return;
    this.actionEnCours.set(v.id);
    this.api.refuserVisite(v.id, motif).subscribe({
      next: (maj) => {
        this.actionEnCours.set(null);
        this.visites.update((liste) => liste.map((x) => (x.id === maj.id ? maj : x)));
      },
      error: (e) => { this.actionEnCours.set(null); this.erreurToast('Refus impossible', e); },
    });
  }

  telechargerRegistre(): void {
    this.exportEnCours.set(true);
    this.api.telechargerRegistreVisiteurs().subscribe({
      next: (blob) => {
        this.exportEnCours.set(false);
        const url = window.URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = `registre_visiteurs_${new Date().toISOString().slice(0, 10)}.pdf`;
        lien.click();
        window.URL.revokeObjectURL(url);
      },
      error: (e) => {
        this.exportEnCours.set(false);
        this.erreurToast('Export impossible', e);
      },
    });
  }

  depart(v: Visite): void {
    this.actionEnCours.set(v.id);
    this.api.marquerDepartVisite(v.id).subscribe({
      next: (maj) => {
        this.actionEnCours.set(null);
        this.visites.update((liste) => liste.map((x) => (x.id === maj.id ? maj : x)));
        this.toasts.succes(maj.numero_badge
          ? `Départ enregistré — récupérez le badge ${maj.numero_badge}.`
          : 'Départ enregistré.');
      },
      error: (e) => { this.actionEnCours.set(null); this.erreurToast("Impossible d'enregistrer ce départ", e); },
    });
  }
}
