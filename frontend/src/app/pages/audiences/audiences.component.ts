import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { Audience, Salle, Utilisateur } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';

@Component({
  selector: 'app-audiences',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <h1>Audiences</h1>
    @if (auth.aRole('SECRETAIRE','ADMINISTRATEUR')) {
      <button class="btn cta" (click)="nouvelle()"><app-icon name="plus"/> Nouvelle fiche</button>
    }
  </div>

  <div class="layout anim-entree">
    <!-- Liste -->
    <div class="liste carte">
      @for (a of audiences(); track a.id) {
        <div class="item" [class.actif]="selection()?.id === a.id" (click)="ouvrir(a)">
          <strong>{{ a.nom_complet || a.nom }}</strong>
          <span class="badge info">{{ a.statut_libelle }}</span>
          <small>{{ a.objet_visite }}</small>
        </div>
      } @empty { <div class="vide">Aucune audience.</div> }
    </div>

    <!-- Détail / formulaire -->
    <div class="detail">
      @if (mode() === 'creation') {
        <div class="creation anim-entree">
          <!-- Reproduction fidèle de la fiche papier Kapi Consult -->
          <div class="fiche-papier">
            <div class="fiche-entete">FICHE D'AUDIENCE</div>

            <div class="fiche-champ">
              <span class="etiq">Nom :</span>
              <input class="ligne-pointillee" [(ngModel)]="form.nom" />
            </div>
            <div class="fiche-champ">
              <span class="etiq">Prénom</span>
              <input class="ligne-pointillee" [(ngModel)]="form.prenom" />
            </div>
            <div class="fiche-champ">
              <span class="etiq">Profession</span>
              <input class="ligne-pointillee" [(ngModel)]="form.profession" />
            </div>
            <div class="fiche-champ">
              <span class="etiq">Contact</span>
              <input class="ligne-pointillee" [(ngModel)]="form.contact" />
            </div>

            <div class="fiche-objet">OBJET DE LA VISITE</div>
            <textarea class="zone-lignee" rows="8" [(ngModel)]="form.objet_visite"></textarea>
          </div>

          <!-- Champs de planification (hors fiche papier) -->
          <div class="carte planif">
            <h3>Planification (interne)</h3>
            <div class="ligne">
              <div class="champ"><label>DG destinataire</label>
                <select [(ngModel)]="form.dg">
                  <option [ngValue]="null">— choisir —</option>
                  @for (d of directeurs(); track d.id) { <option [ngValue]="d.id">{{ d.nom_complet }}</option> }
                </select>
              </div>
              <div class="champ"><label>Date souhaitée</label><input type="date" [(ngModel)]="form.date_souhaitee" /></div>
            </div>
            <div class="ligne">
              <div class="champ"><label>Début</label><input type="time" [(ngModel)]="form.heure_debut" /></div>
              <div class="champ"><label>Fin</label><input type="time" [(ngModel)]="form.heure_fin" /></div>
              <div class="champ"><label>Lieu de l'audience</label>
                <select [(ngModel)]="form.typeLieu" (ngModelChange)="onChangeLieu()">
                  <option value="BUREAU_DG">Bureau du DG</option>
                  <option value="BUREAU_DELEGUE">Bureau du délégué</option>
                  <option value="SALLE">Salle de réunion</option>
                  <option value="AUTRE">Autre (à préciser)</option>
                </select>
              </div>
            </div>
            @if (form.typeLieu === 'SALLE') {
              <div class="champ"><label>Salle</label>
                <select [(ngModel)]="form.salle">
                  <option [ngValue]="null">— choisir —</option>
                  @for (s of salles(); track s.id) { <option [ngValue]="s.id">{{ s.nom }} — {{ s.filiale_nom }}</option> }
                </select>
              </div>
            } @else if (form.typeLieu === 'AUTRE') {
              <div class="champ"><label>Préciser le lieu</label>
                <input [(ngModel)]="form.lieu" placeholder="ex. Salle d'attente direction" /></div>
            }
            @if (erreur()) { <div class="alerte err"><app-icon name="close" [size]="16"/>{{ erreur() }}</div> }
            <div class="boutons">
              <button class="btn vert" (click)="enregistrerFiche()"><app-icon name="check" [size]="16"/>
                {{ editId ? 'Enregistrer les modifications' : 'Enregistrer' }}</button>
              <button class="btn secondaire" (click)="mode.set('vide')">Annuler</button>
            </div>
          </div>
        </div>
      } @else if (selection(); as a) {
        <div class="carte">
          <div class="d-tete">
            <h2>{{ a.nom_complet || a.nom }}</h2>
            <span class="badge info">{{ a.statut_libelle }}</span>
          </div>
          <p><strong>Profession :</strong> {{ a.profession || '—' }}<br>
             <strong>Contact :</strong> {{ a.contact || '—' }}<br>
             <strong>DG :</strong> {{ a.dg_nom }}<br>
             <strong>Créneau :</strong> {{ a.date_souhaitee || '—' }}
             {{ a.heure_debut ? (a.heure_debut.slice(0,5) + '–' + (a.heure_fin || '').slice(0,5)) : '' }}<br>
             <strong>Lieu :</strong> {{ a.salle_nom || a.lieu || '—' }}</p>
          <p><strong>Objet :</strong><br>{{ a.objet_visite }}</p>

          <!-- Actions selon rôle / statut -->
          <div class="boutons">
            @if (auth.aRole('SECRETAIRE','ADMINISTRATEUR')) {
              @if (a.statut === 'SAISIE' || a.statut === 'RENVOYEE_SECRETAIRE') {
                <button class="btn" (click)="action(a,'envoyer_dg')"><app-icon name="send" [size]="16"/> Envoyer au DG</button>
                <button class="btn secondaire" (click)="modifier(a)"><app-icon name="edit" [size]="16"/> Modifier</button>
              }
              @if (a.statut === 'VALIDEE_DG') {
                <button class="btn vert" (click)="action(a,'confirmer')"><app-icon name="checkCircle" [size]="16"/> Confirmer le RDV</button>
              }
              @if (a.statut !== 'ANNULEE' && a.statut !== 'TERMINEE') {
                <button class="btn rouge" (click)="annuler(a)"><app-icon name="close" [size]="16"/> Annuler l'audience</button>
              }
            }
            @if (auth.aRole('DIRECTEUR') && a.statut === 'ENVOYEE_DG') {
              <button class="btn vert" (click)="action(a,'valider_dg')"><app-icon name="check" [size]="16"/> Valider</button>
              <button class="btn orange" (click)="renvoyer(a)"><app-icon name="reply" [size]="16"/> Renvoyer (complément)</button>
              <button class="btn secondaire" (click)="ouvrirDelegation()"><app-icon name="users" [size]="16"/> Déléguer</button>
            }
          </div>

          <!-- Délégation (DG) -->
          @if (delegationVisible()) {
            <div class="bloc-delegation">
              <h3>Déléguer l'audience</h3>
              <input placeholder="Filtrer la liste (nom, email)…" [(ngModel)]="recherche"
                     (ngModelChange)="rechercheSig.set($event)" />
              <div class="liste-employes">
                @for (u of employesFiltres(); track u.id) {
                  <label class="case">
                    <input type="checkbox" [checked]="estChoisi(u.id)" (change)="basculer(u.id)" />
                    {{ u.nom_complet }} <small>— {{ u.email }} ({{ u.filiale_nom || '—' }})</small>
                  </label>
                } @empty { <small class="vide">Aucun employé trouvé.</small> }
              </div>
              <textarea rows="2" placeholder="Commentaire (ex. Paul recevra le client)"
                        [(ngModel)]="commentaireDeleg"></textarea>
              <button class="btn" (click)="deleguer(a)">Confirmer la délégation</button>
            </div>
          }

          <!-- Délégués -->
          @if (a.delegations?.length) {
            <h3>Délégués</h3>
            <ul class="delegues">
              @for (d of a.delegations; track d.id) {
                <li>{{ d.delegue_nom }} — <span class="badge info">{{ d.statut_libelle }}</span>
                  @if (estMonDelegation(d) && d.statut === 'PROPOSEE') {
                    <button class="btn vert petit" (click)="prendreEnCompte(d.id)">Prendre connaissance</button>
                  }
                </li>
              }
            </ul>
          }

          <!-- Navette / échanges -->
          <h3>Échanges</h3>
          @for (e of a.echanges || []; track e.id) {
            <div class="echange"><strong>{{ e.auteur_nom }}</strong> : {{ e.commentaire }}</div>
          } @empty { <small class="vide">Aucun échange.</small> }
        </div>
      } @else {
        <div class="carte vide">Sélectionnez une audience ou créez une fiche.</div>
      }
    </div>
  </div>
  `,
  styles: [`
    .entete { display:flex; justify-content:space-between; align-items:center; }
    .layout { display: grid; grid-template-columns: 300px 1fr; gap: 1rem; }
    @media (max-width: 850px) { .layout { grid-template-columns: 1fr; } }
    .liste { padding: 0; max-height: 70vh; overflow-y: auto; }
    .item { padding: .8rem 1rem; border-bottom: 1px solid var(--gris-bord); cursor: pointer;
      display: flex; flex-direction: column; gap: .2rem; }
    .item.actif { background: #eff6ff; }
    .item small { color: var(--gris-texte); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .creation { display: flex; flex-direction: column; gap: 1rem; }
    /* --- Reproduction de la fiche papier --- */
    .fiche-papier {
      background: #fff; border: 2px solid #1a1a1a; border-radius: 2px;
      padding: 1.8rem 2rem 2.2rem; font-family: 'Open Sans', sans-serif; color: #1a1a1a;
      box-shadow: var(--ombre-md);
    }
    .fiche-entete { text-align: center; font-weight: 700; letter-spacing: .06em;
      font-size: 1rem; margin-bottom: 1.6rem; }
    .fiche-champ { display: flex; align-items: flex-end; gap: .5rem; margin-bottom: 1rem; }
    .fiche-champ .etiq { font-size: .92rem; white-space: nowrap; padding-bottom: 2px; }
    .ligne-pointillee {
      flex: 1; border: none; border-bottom: 2px dotted #1a1a1a; border-radius: 0;
      background: transparent; padding: 0 2px 3px; font-size: .92rem; font-family: inherit;
    }
    .ligne-pointillee:focus { outline: none; border-bottom-color: var(--bleu); box-shadow: none; }
    .fiche-objet { text-align: center; font-weight: 700; text-decoration: underline;
      letter-spacing: .04em; font-size: .92rem; margin: 1.8rem 0 1rem; }
    .zone-lignee {
      width: 100%; border: none; border-radius: 0; background: transparent;
      padding: 0; font-size: .92rem; font-family: inherit; line-height: 28px; resize: vertical;
      background-image: repeating-linear-gradient(transparent, transparent 27px, #1a1a1a 27px, #1a1a1a 29px);
    }
    .zone-lignee:focus { outline: none; box-shadow: none; }
    .planif { border-top: 4px solid var(--accent); }
    .d-tete { display: flex; justify-content: space-between; align-items: center; }
    .boutons { display: flex; gap: .5rem; flex-wrap: wrap; margin: .8rem 0; }
    .bloc-delegation { background: #f8fafc; border: 1px solid var(--gris-bord);
      border-radius: 8px; padding: 1rem; margin: .6rem 0; }
    .bloc-delegation input, .bloc-delegation textarea { width: 100%; margin-bottom: .4rem; }
    .liste-employes { max-height: 220px; overflow-y: auto; border: 1px solid var(--gris-bord);
      border-radius: 8px; padding: .4rem .6rem; margin-bottom: .5rem; background: #fff;
      display: flex; flex-direction: column; gap: .3rem; }
    .liste-employes small { color: var(--gris-texte); }
    .case { display: flex; gap: .4rem; align-items: center; font-weight: 500; }
    .case input { width: auto; }
    .echange { background: #f8fafc; border-radius: 6px; padding: .5rem .7rem; margin-bottom: .4rem; font-size: .85rem; }
    .delegues { padding-left: 1rem; }
  `],
})
export class AudiencesComponent implements OnInit {
  audiences = signal<Audience[]>([]);
  selection = signal<Audience | null>(null);
  mode = signal<'vide' | 'creation'>('vide');
  directeurs = signal<Utilisateur[]>([]);
  salles = signal<Salle[]>([]);
  erreur = signal('');

  delegationVisible = signal(false);
  recherche = '';
  rechercheSig = signal('');
  employes = signal<Utilisateur[]>([]);
  employesFiltres = computed(() => {
    const q = this.rechercheSig().toLowerCase().trim();
    const liste = this.employes();
    if (!q) return liste;
    return liste.filter((u) =>
      (u.nom_complet || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q));
  });
  delChoisis: number[] = [];
  commentaireDeleg = '';

  form: any = {};
  editId: number | null = null;

  constructor(
    private route: ActivatedRoute, private api: ApiService, public auth: AuthService,
    private dialogue: DialogueService, private toasts: ToastService,
  ) {
    inject(NavigationService).vuesLocales(
      this.selection,
      { ouverte: () => this.mode() === 'creation', fermer: () => this.mode.set('vide') },
    );
  }

  private erreurToast(titre: string, e: any): void {
    this.toasts.afficher({ titre, message: e?.error?.detail || 'Erreur inconnue.', type: 'ERROR' });
  }

  ngOnInit(): void {
    this.charger();
    this.api.utilisateurs({ role: 'DIRECTEUR' }).subscribe((p) => this.directeurs.set(p.results));
    this.api.salles().subscribe((p) => this.salles.set(p.results));

    // Ouverture directe depuis une notification (?id=...).
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.audience(+id).subscribe((a) => this.selection.set(a));
    }
  }

  charger(): void {
    this.api.audiences({ ordering: '-date_creation' }).subscribe((p) => this.audiences.set(p.results));
  }

  ouvrir(a: Audience): void {
    this.delegationVisible.set(false);
    this.mode.set('vide');
    this.api.audience(a.id).subscribe((full) => this.selection.set(full));
  }

  nouvelle(): void {
    this.editId = null;
    this.form = { nom: '', prenom: '', profession: '', contact: '', objet_visite: '',
      dg: null, date_souhaitee: '', heure_debut: '', heure_fin: '',
      typeLieu: 'BUREAU_DG', salle: null, lieu: '' };
    this.erreur.set('');
    this.selection.set(null);
    this.mode.set('creation');
  }

  /** Ouvre la fiche en édition (secrétaire, après renvoi du DG par exemple). */
  modifier(a: Audience): void {
    this.editId = a.id;
    let typeLieu = 'BUREAU_DG';
    if (a.salle) typeLieu = 'SALLE';
    else if (a.lieu === 'Bureau du délégué') typeLieu = 'BUREAU_DELEGUE';
    else if (a.lieu && a.lieu !== 'Bureau du DG') typeLieu = 'AUTRE';
    this.form = {
      nom: a.nom, prenom: a.prenom || '', profession: a.profession || '',
      contact: a.contact || '', objet_visite: a.objet_visite,
      dg: a.dg, date_souhaitee: a.date_souhaitee || '',
      heure_debut: (a.heure_debut || '').slice(0, 5),
      heure_fin: (a.heure_fin || '').slice(0, 5),
      typeLieu, salle: a.salle ?? null, lieu: typeLieu === 'AUTRE' ? a.lieu : '',
    };
    this.erreur.set('');
    this.mode.set('creation');
  }

  async annuler(a: Audience): Promise<void> {
    const motif = await this.dialogue.demanderMotif({
      titre: "Annuler l'audience",
      message: a.nom_complet || a.nom,
      placeholder: "Motif de l'annulation (optionnel)",
      libelleConfirmer: 'Annuler',
      dangereux: true,
    });
    if (motif === null) return;
    this.api.audienceAction(a.id, 'annuler', { motif }).subscribe({
      next: () => { this.charger(); this.ouvrir(a); },
      error: (e) => this.erreurToast("Annulation impossible", e),
    });
  }

  /** Réinitialise salle/lieu quand le type de lieu change. */
  onChangeLieu(): void {
    if (this.form.typeLieu !== 'SALLE') this.form.salle = null;
    if (this.form.typeLieu !== 'AUTRE') this.form.lieu = '';
  }

  enregistrerFiche(): void {
    this.erreur.set('');
    // Construit le lieu selon le type choisi (salle OU lieu libre).
    const lieuxLabel: Record<string, string> = {
      BUREAU_DG: 'Bureau du DG',
      BUREAU_DELEGUE: 'Bureau du délégué',
    };
    const payload: any = { ...this.form };
    if (this.form.typeLieu === 'SALLE') {
      payload.lieu = '';
    } else if (this.form.typeLieu === 'AUTRE') {
      payload.salle = null;
    } else {
      payload.salle = null;
      payload.lieu = lieuxLabel[this.form.typeLieu] || '';
    }
    delete payload.typeLieu;
    if (!payload.heure_debut) payload.heure_debut = null;
    if (!payload.heure_fin) payload.heure_fin = null;
    if (!payload.date_souhaitee) payload.date_souhaitee = null;

    const obs = this.editId
      ? this.api.majAudience(this.editId, payload)
      : this.api.creerAudience(payload);
    obs.subscribe({
      next: (a) => { this.editId = null; this.mode.set('vide'); this.charger(); this.ouvrir(a); },
      error: (e) => this.erreur.set(e?.error?.detail || Object.values(e?.error || {}).flat().join(' ') || 'Erreur.'),
    });
  }

  action(a: Audience, action: string): void {
    this.api.audienceAction(a.id, action).subscribe({
      next: () => { this.charger(); this.ouvrir(a); },
      error: (e) => this.erreurToast('Action impossible', e),
    });
  }

  async renvoyer(a: Audience): Promise<void> {
    const commentaire = await this.dialogue.demanderMotif({
      titre: 'Renvoyer pour complément',
      message: a.nom_complet || a.nom,
      placeholder: 'Précisions demandées',
      libelleConfirmer: 'Renvoyer',
      obligatoire: true,
    });
    if (commentaire === null) return;
    this.api.audienceAction(a.id, 'renvoyer_secretaire', { commentaire }).subscribe({
      next: () => { this.charger(); this.ouvrir(a); },
      error: (e) => this.erreurToast('Renvoi impossible', e),
    });
  }

  ouvrirDelegation(): void {
    this.delegationVisible.set(true);
    this.delChoisis = []; this.commentaireDeleg = '';
    this.recherche = ''; this.rechercheSig.set('');
    // Charge la liste complète des employés de l'entreprise (hors DG connecté).
    if (!this.employes().length) {
      this.api.utilisateurs({ page_size: 500, ordering: 'last_name' }).subscribe((p) => {
        const moi = this.auth.utilisateur()?.id;
        this.employes.set(p.results.filter((u) => u.id !== moi && u.actif !== false));
      });
    }
  }
  estChoisi(id: number): boolean { return this.delChoisis.includes(id); }
  basculer(id: number): void {
    this.delChoisis = this.estChoisi(id)
      ? this.delChoisis.filter((x) => x !== id) : [...this.delChoisis, id];
  }
  deleguer(a: Audience): void {
    if (!this.delChoisis.length) {
      this.toasts.afficher({ titre: 'Délégation', message: 'Choisir au moins un délégué.', type: 'WARNING' });
      return;
    }
    this.api.audienceAction(a.id, 'deleguer',
      { delegues: this.delChoisis, commentaire: this.commentaireDeleg }).subscribe({
      next: () => { this.delegationVisible.set(false); this.ouvrir(a); },
      error: (e) => this.erreurToast('Délégation impossible', e),
    });
  }

  estMonDelegation(d: any): boolean { return d.delegue === this.auth.utilisateur()?.id; }
  prendreEnCompte(id: number): void {
    this.api.prendreEnCompteDelegation(id).subscribe({
      next: () => { const a = this.selection(); if (a) this.ouvrir(a); },
      error: (e) => this.erreurToast('Action impossible', e),
    });
  }
}
