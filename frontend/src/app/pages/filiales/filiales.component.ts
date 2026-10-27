import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { Filiale } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';

/** Filiale de l'accueil (le siège) : porte le circuit des visiteurs, ni recodable ni désactivable. */
const CODE_FILIALE_ACCUEIL = 'OSEOR';

interface FormFiliale {
  id: number | null;
  nom: string;
  code: string;
  description: string;
  email: string;
  telephone: string;
  adresse: string;
}

@Component({
  selector: 'app-filiales',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Filiales</h1>
      <p class="sous-titre">{{ actives() }} filiale(s) active(s) sur {{ filiales().length }} — sociétés du groupe OSEOR</p>
    </div>
    <button class="btn cta" (click)="nouvelle()"><app-icon name="plus"/> Nouvelle filiale</button>
  </div>

  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>{{ form.id ? 'Modifier la filiale' : 'Créer une filiale' }}</h3>

      <div class="ligne">
        <div class="champ">
          <label>Nom</label>
          <input [(ngModel)]="form.nom" placeholder="Ex. KAPI Consult" maxlength="150" autocomplete="off" />
        </div>
        <div class="champ">
          <label>Code</label>
          <input [ngModel]="form.code" (ngModelChange)="fixerCode($event)" maxlength="20"
                 placeholder="Ex. KAPI" autocomplete="off" [disabled]="estAccueil(form)" />
          <small class="aide">
            @if (estAccueil(form)) { Code de la filiale d'accueil : non modifiable. }
            @else { Court et unique : lettres, chiffres, tiret ou souligné. }
          </small>
        </div>
      </div>
      <div class="ligne">
        <div class="champ">
          <label>E-mail</label>
          <input type="email" [(ngModel)]="form.email" placeholder="contact@filiale.com" autocomplete="off" />
        </div>
        <div class="champ">
          <label>Téléphone</label>
          <input [(ngModel)]="form.telephone" placeholder="+228 …" maxlength="30" autocomplete="off" />
        </div>
      </div>
      <div class="champ">
        <label>Adresse</label>
        <textarea [(ngModel)]="form.adresse" rows="2" placeholder="Siège, quartier, ville…"></textarea>
      </div>
      <div class="champ">
        <label>Description</label>
        <textarea [(ngModel)]="form.description" rows="2" placeholder="Activité de la filiale (facultatif)"></textarea>
      </div>

      @if (erreur()) { <div class="alerte err">{{ erreur() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrer()" [disabled]="envoi() || !formValide()">
          @if (envoi()) { <span class="spinner petit"></span> Enregistrement… }
          @else { Enregistrer }
        </button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <div class="carte anim-entree">
    <input class="champ-recherche" placeholder="Rechercher une filiale…" [(ngModel)]="recherche" />

    @if (chargement()) {
      <p class="vide-td">Chargement…</p>
    } @else {
      <table class="tbl">
        <thead>
          <tr><th>Filiale</th><th>Code</th><th>Contact</th><th>Effectif</th><th>Statut</th><th></th></tr>
        </thead>
        <tbody>
          @for (f of filialesFiltrees(); track f.id) {
            <tr [class.inactif]="!f.active">
              <td>
                <strong>{{ f.nom }}</strong>
                @if (estAccueil(f)) { <span class="badge info">Accueil</span> }
                @if (f.description) { <small class="sous">{{ f.description }}</small> }
              </td>
              <td class="mono">{{ f.code }}</td>
              <td>
                @if (f.email || f.telephone) {
                  @if (f.email) { <small class="sous">{{ f.email }}</small> }
                  @if (f.telephone) { <small class="sous">{{ f.telephone }}</small> }
                } @else {
                  <span class="manque">À compléter</span>
                }
              </td>
              <td>
                <small class="sous">{{ f.nb_utilisateurs ?? 0 }} utilisateur(s)</small>
                <small class="sous">{{ f.nb_services ?? 0 }} service(s) · {{ f.nb_salles ?? 0 }} salle(s)</small>
              </td>
              <td>
                @if (f.active) { <span class="badge validee">Active</span> }
                @else { <span class="badge rouge">Inactive</span> }
              </td>
              <td>
                <div class="actions">
                  <button class="btn secondaire petit" (click)="editer(f)">
                    <app-icon name="edit" [size]="13"/> Modifier
                  </button>
                  @if (!estAccueil(f)) {
                    <button class="btn petit" [class.rouge]="f.active" [class.vert]="!f.active"
                            (click)="basculerActive(f)" [disabled]="bascule() === f.id">
                      {{ f.active ? 'Désactiver' : 'Réactiver' }}
                    </button>
                  }
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="vide-td">Aucune filiale trouvée.</td></tr>
          }
        </tbody>
      </table>
    }
  </div>

  <div class="note carte anim-entree">
    <app-icon name="info" [size]="18"/>
    <p>
      Une filiale n'est jamais supprimée : utilisateurs, salles, documents et visites y restent
      rattachés. Désactivée, elle n'est plus proposée dans les listes mais reste dans
      l'historique, et peut être réactivée à tout moment.
    </p>
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .form { margin-bottom: 1rem; }
    .aide { color: var(--txt-3); font-size: .75rem; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }
    .champ-recherche { width: 100%; margin-bottom: .8rem; }
    .actions { display: flex; gap: .4rem; flex-wrap: wrap; justify-content: flex-end; }
    .sous { display: block; color: var(--txt-2); font-size: .75rem; }
    .mono { font-family: monospace; font-size: .82rem; }
    .manque { color: #b45309; font-size: .75rem; font-weight: 600; }
    .badge.info { margin-left: .4rem; font-size: .68rem; }
    .badge.rouge { background: var(--rouge-bg); color: var(--rouge); border: 1px solid #fecaca; }
    tr.inactif { opacity: .55; }
    .vide-td { text-align: center; color: var(--txt-2); padding: 2rem; }
    .note { display: flex; align-items: flex-start; gap: .8rem; margin-top: 1rem;
      padding: 1rem 1.2rem; border-left: 4px solid var(--bleu); font-size: .82rem; }
    .note app-icon { color: var(--bleu); margin-top: 2px; flex-shrink: 0; }
    .note p { margin: 0; color: var(--txt-2); line-height: 1.6; }
  `],
})
export class FilialesComponent implements OnInit {
  filiales = signal<Filiale[]>([]);
  chargement = signal(true);
  formVisible = signal(false);
  envoi = signal(false);
  bascule = signal<number | null>(null);
  erreur = signal('');
  recherche = '';
  form: FormFiliale = this.formulaireVide();

  actives = computed(() => this.filiales().filter((f) => f.active).length);

  constructor(private api: ApiService, private dialogue: DialogueService, private toasts: ToastService) {
    inject(NavigationService).vuesLocales(this.formVisible);
  }

  ngOnInit(): void {
    this.charger();
  }

  private formulaireVide(): FormFiliale {
    return { id: null, nom: '', code: '', description: '', email: '', telephone: '', adresse: '' };
  }

  private messageErreur(e: any): string {
    return Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' ');
  }

  charger(): void {
    this.chargement.set(true);
    this.api.toutesLesFiliales().subscribe({
      next: (p) => { this.filiales.set(p.results); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  filialesFiltrees(): Filiale[] {
    const q = this.recherche.trim().toLowerCase();
    if (!q) return this.filiales();
    return this.filiales().filter((f) => f.nom.toLowerCase().includes(q) || f.code.toLowerCase().includes(q));
  }

  /** Filiale d'accueil déjà enregistrée — d'après son code en base, pas la saisie en cours. */
  estAccueil(f: { id: number | null }): boolean {
    return !!f.id && this.filiales().find((x) => x.id === f.id)?.code === CODE_FILIALE_ACCUEIL;
  }

  /** Code : majuscules, lettres, chiffres, tiret ou souligné (ex. KAPI, BON-ICI). */
  fixerCode(valeur: string): void {
    this.form.code = valeur.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  }

  formValide(): boolean {
    return !!(this.form.nom.trim() && this.form.code.trim());
  }

  nouvelle(): void {
    this.form = this.formulaireVide();
    this.erreur.set('');
    this.formVisible.set(true);
  }

  editer(f: Filiale): void {
    this.form = {
      id: f.id, nom: f.nom, code: f.code, description: f.description ?? '',
      email: f.email ?? '', telephone: f.telephone ?? '', adresse: f.adresse ?? '',
    };
    this.erreur.set('');
    this.formVisible.set(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  enregistrer(): void {
    if (!this.formValide()) return;
    this.erreur.set('');
    this.envoi.set(true);
    const { id, ...champs } = this.form;
    const donnees = {
      ...champs, nom: champs.nom.trim(), email: champs.email.trim(), telephone: champs.telephone.trim(),
    };
    const obs = id ? this.api.majFiliale(id, donnees) : this.api.creerFiliale(donnees);
    obs.subscribe({
      next: (f) => {
        this.envoi.set(false);
        this.formVisible.set(false);
        this.toasts.succes(id ? `Filiale « ${f.nom} » mise à jour.` : `Filiale « ${f.nom} » créée.`);
        this.charger();
      },
      error: (e) => {
        this.envoi.set(false);
        this.erreur.set(this.messageErreur(e));
      },
    });
  }

  async basculerActive(f: Filiale): Promise<void> {
    if (f.active) {
      const ok = await this.dialogue.demanderConfirmation({
        titre: 'Désactiver la filiale',
        message: `« ${f.nom} » ne sera plus proposée dans les listes. Ses données restent conservées, et elle pourra être réactivée.`,
        libelleConfirmer: 'Désactiver',
        dangereux: true,
      });
      if (!ok) return;
    }
    this.bascule.set(f.id);
    this.api.majFiliale(f.id, { active: !f.active }).subscribe({
      next: (maj) => {
        this.bascule.set(null);
        this.filiales.update((liste) => liste.map((x) => (x.id === maj.id ? { ...x, active: maj.active } : x)));
        this.toasts.succes(maj.active ? `« ${maj.nom} » réactivée.` : `« ${maj.nom} » désactivée.`);
      },
      error: (e) => {
        this.bascule.set(null);
        this.toasts.afficher({ titre: 'Modification impossible', message: this.messageErreur(e), type: 'ERROR' });
      },
    });
  }
}
