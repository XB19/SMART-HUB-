import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { Calendrier, EvenementsService } from '../../core/vie-interne.service';
import { NavigationService } from '../../core/navigation.service';

/**
 * Événements de la vie interne : cérémonies, discours, fêtes, réceptions,
 * et les anniversaires du mois.
 *
 * Les anniversaires ne sont pas des événements enregistrés : le serveur
 * les calcule à partir des dates de naissance. Ils s'affichent donc à part,
 * sans action possible — on ne modifie ni ne supprime un anniversaire.
 */
@Component({
  selector: 'app-evenements',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="tete anim-entree">
    <div>
      <h1>Événements</h1>
      <p class="sous">La vie du groupe sur les prochaines semaines</p>
    </div>
    <button class="btn cta" (click)="formulaire.set(true)">
      <app-icon name="plus"/> Nouvel événement
    </button>
  </div>

  <div class="periode">
    <label>Du <input type="date" [(ngModel)]="debut" (change)="charger()"/></label>
    <label>Au <input type="date" [(ngModel)]="fin" (change)="charger()"/></label>
  </div>

  <div class="deux">
    <div class="carte anim-entree">
      <h3>Événements</h3>
      @if (calendrier()?.evenements?.length) {
        <div class="liste">
          @for (e of calendrier()!.evenements; track e.id) {
            <article class="ligne">
              <div class="date">
                <span class="jour">{{ e.date_debut | date: 'dd' }}</span>
                <span class="mois">{{ e.date_debut | date: 'MMM' }}</span>
              </div>
              <div class="contenu">
                <h4>{{ e.titre }}</h4>
                <p class="meta">
                  {{ e.type_libelle }}
                  @if (!e.journee_entiere) { · {{ e.date_debut | date: 'HH:mm' }} }
                  @if (e.lieu) { · {{ e.lieu }} }
                  · {{ e.visibilite_libelle }}
                </p>
                @if (e.description) { <p class="desc">{{ e.description }}</p> }
              </div>
              @if (peutGerer(e)) {
                <button class="retirer" (click)="supprimer(e)" title="Supprimer">
                  <app-icon name="trash" [size]="14"/>
                </button>
              }
            </article>
          }
        </div>
      } @else {
        <div class="vide">Aucun événement sur cette période.</div>
      }
    </div>

    <div class="carte anim-entree">
      <h3><app-icon name="gift" [size]="15"/> Anniversaires</h3>
      @if (calendrier()?.anniversaires?.length) {
        <div class="liste">
          @for (a of calendrier()!.anniversaires; track a.utilisateur_id + a.date) {
            <div class="anniv">
              <span class="pastille-date">{{ a.date | date: 'dd/MM' }}</span>
              <span>{{ a.titre }}</span>
            </div>
          }
        </div>
      } @else {
        <div class="vide">Aucun anniversaire sur cette période.</div>
      }
    </div>
  </div>

  @if (formulaire()) {
    <div class="voile" (click)="formulaire.set(false)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Nouvel événement</h3>

        <label>Titre</label>
        <input [(ngModel)]="titre" placeholder="Vœux du Directeur Général"/>

        <label>Type</label>
        <select [(ngModel)]="type">
          <option value="CEREMONIE">Cérémonie</option>
          <option value="DISCOURS">Discours</option>
          <option value="FETE">Fête</option>
          <option value="RECEPTION">Réception</option>
          <option value="SEMINAIRE">Séminaire / Formation</option>
          <option value="AUTRE">Autre</option>
        </select>

        <div class="deux-champs">
          <div><label>Début</label><input type="datetime-local" [(ngModel)]="dateDebut"/></div>
          <div><label>Fin</label><input type="datetime-local" [(ngModel)]="dateFin"/></div>
        </div>

        <label>Lieu</label>
        <input [(ngModel)]="lieu" placeholder="Salle Conseil"/>

        <label>Visibilité</label>
        <select [(ngModel)]="visibilite">
          <option value="FILIALE">Ma filiale</option>
          <option value="GROUPE">Tout le groupe</option>
          <option value="SERVICE">Mon service</option>
        </select>

        <label>Description</label>
        <textarea rows="2" [(ngModel)]="description"></textarea>

        <div class="pied">
          <button class="btn fantome" (click)="formulaire.set(false)">Annuler</button>
          <button class="btn cta" (click)="creer()">Créer</button>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .tete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
    .sous { color: var(--txt-2); margin-top: -.3rem; font-size: .88rem; }
    .periode { display: flex; gap: 1rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
    .periode label { font-size: .82rem; color: var(--txt-2); display: flex;
      align-items: center; gap: .4rem; }
    .periode input { padding: .45rem .6rem; border: 1px solid var(--bord);
      border-radius: 8px; font-size: .85rem; font-family: inherit; }

    .deux { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 900px) { .deux { grid-template-columns: 1fr; } }
    h3 { display: flex; align-items: center; gap: .4rem; }
    h3 app-icon { color: var(--accent); }

    .liste { display: flex; flex-direction: column; gap: .6rem; margin-top: .8rem; }
    .ligne { display: flex; gap: .9rem; padding: .8rem; border: 1px solid var(--bord);
      border-radius: 10px; transition: border-color var(--t), transform var(--t); }
    .ligne:hover { border-color: var(--bleu); transform: translateX(2px); }
    .date { flex-shrink: 0; width: 46px; text-align: center; background: var(--navy);
      color: #fff; border-radius: 8px; padding: .35rem 0; height: fit-content; }
    .date .jour { display: block; font-size: 1.15rem; font-weight: 700; line-height: 1; }
    .date .mois { display: block; font-size: .65rem; text-transform: uppercase; opacity: .85; }
    .contenu { flex: 1; min-width: 0; }
    .contenu h4 { margin: 0; font-size: .93rem; color: var(--navy); }
    .meta { font-size: .76rem; color: var(--txt-2); margin: .2rem 0 0; }
    .desc { font-size: .82rem; margin: .35rem 0 0; }
    .retirer { background: none; border: none; color: var(--txt-2); cursor: pointer;
      align-self: flex-start; padding: .2rem; }
    .retirer:hover { color: #b42318; }

    .anniv { display: flex; align-items: center; gap: .6rem; padding: .55rem .7rem;
      border-radius: 8px; background: #fff7ed; font-size: .85rem; }
    .pastille-date { background: var(--accent); color: #fff; border-radius: 999px;
      padding: .1rem .5rem; font-size: .72rem; font-weight: 600; flex-shrink: 0; }

    .vide { text-align: center; color: var(--txt-2); padding: 1.8rem 1rem; font-size: .88rem; }
    .voile { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex;
      align-items: center; justify-content: center; z-index: 60; padding: 1rem; }
    .modale { background: #fff; border-radius: var(--r); padding: 1.5rem; width: 100%;
      max-width: 460px; max-height: 90vh; overflow-y: auto; box-shadow: var(--ombre-md); }
    .modale h3 { margin: 0 0 1rem; color: var(--navy); }
    .modale label { display: block; font-size: .8rem; font-weight: 600; color: var(--txt-2);
      margin: .8rem 0 .3rem; }
    .modale input, .modale select, .modale textarea { width: 100%; padding: .6rem .7rem;
      border: 1px solid var(--bord); border-radius: 8px; font-size: .9rem; font-family: inherit; }
    .deux-champs { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
    .pied { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.4rem; }
    .btn.fantome { background: none; border: 1px solid var(--bord); color: var(--txt); }
  `],
})
export class EvenementsComponent implements OnInit {
  calendrier = signal<Calendrier | null>(null);
  formulaire = signal(false);

  debut = '';
  fin = '';

  titre = '';
  type = 'AUTRE';
  dateDebut = '';
  dateFin = '';
  lieu = '';
  visibilite = 'FILIALE';
  description = '';

  constructor(
    private evenements: EvenementsService,
    private toast: ToastService,
    public auth: AuthService,
  ) {
    inject(NavigationService).vuesLocales(this.formulaire);
  }

  ngOnInit(): void {
    const aujourdhui = new Date();
    const dans60 = new Date(aujourdhui.getTime() + 60 * 86400000);
    this.debut = aujourdhui.toISOString().slice(0, 10);
    this.fin = dans60.toISOString().slice(0, 10);
    this.charger();
  }

  charger(): void {
    this.evenements.calendrier(this.debut, this.fin).subscribe({
      next: (c) => this.calendrier.set(c),
      error: () => this.toast.erreur('Chargement du calendrier impossible.'),
    });
  }

  peutGerer(e: any): boolean {
    return this.auth.aRole('DIRECTEUR', 'ADMINISTRATEUR', 'SECRETAIRE', 'CHEF_SERVICE')
      || e.createur === this.auth.utilisateur()?.id;
  }

  creer(): void {
    if (!this.titre.trim() || !this.dateDebut || !this.dateFin) {
      this.toast.erreur('Titre, début et fin sont obligatoires.');
      return;
    }

    this.evenements.creer({
      titre: this.titre,
      type_evenement: this.type,
      date_debut: this.dateDebut,
      date_fin: this.dateFin,
      lieu: this.lieu,
      visibilite: this.visibilite,
      description: this.description,
    }).subscribe({
      next: () => {
        this.formulaire.set(false);
        this.titre = this.lieu = this.description = '';
        this.toast.succes('Événement créé.');
        this.charger();
      },
      error: (e) => this.toast.erreur(
        e?.error?.detail || 'Création impossible : vérifiez les dates.'),
    });
  }

  supprimer(e: any): void {
    this.evenements.supprimer(e.id).subscribe({
      next: () => { this.toast.succes('Événement supprimé.'); this.charger(); },
      error: (err) => this.toast.erreur(err?.error?.detail || 'Suppression impossible.'),
    });
  }
}
