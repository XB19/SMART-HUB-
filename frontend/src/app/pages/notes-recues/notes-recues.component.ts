import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/toast.service';
import { environment } from '../../../environments/environment';
import { NavigationService } from '../../core/navigation.service';

interface NoteRecue {
  id: number;
  note: number;
  numero: string;
  objet: string;
  corps: string;
  redacteur_nom: string;
  filiale_nom: string;
  lue: boolean;
  date_diffusion: string;
  date_lecture: string | null;
}

interface SuiviDiffusion {
  destinataires: number;
  lues: number;
  non_lues: number;
  en_attente: { utilisateur_id: number; nom: string }[];
}

/**
 * Notes de service reçues, et accusés de lecture.
 *
 * Séparé de `/notes-internes`, qui sert à RÉDIGER une note et n'est ouvert
 * qu'aux secrétaires et à la direction : recevoir une note concerne tout le
 * monde. Une note affichée sur un panneau ne dit pas qui l'a lue ; celle-ci
 * le dit, et c'est tout l'intérêt de la dématérialiser.
 */
@Component({
  selector: 'app-notes-recues',
  imports: [CommonModule, IconComponent],
  template: `
  <div class="tete anim-entree">
    <div>
      <h1>Notes de service</h1>
      <p class="sous">
        Notes qui vous sont adressées
        @if (nonLues() > 0) { — <strong>{{ nonLues() }} non lue(s)</strong> }
      </p>
    </div>
  </div>

  @if (notes().length) {
    <div class="liste stagger">
      @for (n of notes(); track n.id) {
        <article class="note-carte" [class.non-lue]="!n.lue" (click)="ouvrir(n)">
          <div class="bandeau">
            <div>
              <h3>{{ n.objet || n.numero }}</h3>
              <p class="meta">
                {{ n.numero }} · {{ n.redacteur_nom }} · {{ n.filiale_nom }}
                · diffusée le {{ n.date_diffusion | date: 'dd/MM/yyyy' }}
              </p>
            </div>
            @if (n.lue) {
              <span class="etat lue">
                <app-icon name="checkCircle" [size]="13"/>
                Lue le {{ n.date_lecture | date: 'dd/MM/yyyy' }}
              </span>
            } @else {
              <span class="etat a-lire">Non lue</span>
            }
          </div>

          @if (ouverte() === n.id) {
            <div class="corps">
              <p>{{ n.corps }}</p>
              @if (!n.lue) {
                <button class="btn cta petit" (click)="marquerLue(n, $event)">
                  <app-icon name="checkCircle" [size]="14"/> J'ai pris connaissance
                </button>
              }

              @if (suivi(); as s) {
                <div class="suivi">
                  <h4>Diffusion</h4>
                  <p class="sous">
                    {{ s.lues }} lecture(s) sur {{ s.destinataires }} destinataire(s).
                  </p>
                  @if (s.en_attente.length) {
                    <p class="attente">
                      En attente :
                      {{ noms(s.en_attente) }}
                    </p>
                  }
                </div>
              }
            </div>
          }
        </article>
      }
    </div>
  } @else {
    <div class="carte vide">
      Aucune note de service ne vous a été adressée.
    </div>
  }
  `,
  styles: [`
    .tete { margin-bottom: 1.4rem; }
    .sous { color: var(--txt-2); margin-top: -.3rem; font-size: .88rem; }
    .liste { display: flex; flex-direction: column; gap: .8rem; }
    .note-carte { background: #fff; border: 1px solid var(--bord); border-left: 3px solid var(--bord);
      border-radius: var(--r); padding: 1rem 1.1rem; box-shadow: var(--ombre);
      cursor: pointer; transition: border-color var(--t), transform var(--t); }
    .note-carte:hover { transform: translateX(2px); border-color: var(--bleu); }
    .note-carte.non-lue { border-left-color: var(--accent); background: #fffdf8; }
    .bandeau { display: flex; justify-content: space-between; align-items: flex-start;
      gap: 1rem; flex-wrap: wrap; }
    .note-carte h3 { margin: 0; font-size: .98rem; color: var(--navy); }
    .meta { font-size: .76rem; color: var(--txt-2); margin: .25rem 0 0; }
    .etat { font-size: .74rem; font-weight: 600; border-radius: 999px;
      padding: .15rem .6rem; display: inline-flex; align-items: center; gap: .3rem;
      flex-shrink: 0; }
    .etat.lue { background: #dcfce7; color: #166534; }
    .etat.a-lire { background: #fef3c7; color: #92400e; }
    .corps { margin-top: .9rem; padding-top: .9rem; border-top: 1px solid var(--bord); }
    .corps p { white-space: pre-wrap; font-size: .88rem; line-height: 1.6; margin: 0 0 .9rem; }
    .btn.petit { padding: .4rem .8rem; font-size: .8rem; display: inline-flex;
      align-items: center; gap: .4rem; }
    .suivi { margin-top: 1rem; padding: .8rem .9rem; background: #f8fafc;
      border-radius: 8px; }
    .suivi h4 { margin: 0 0 .3rem; font-size: .82rem; color: var(--navy); }
    .attente { font-size: .78rem; color: var(--txt-2); margin: .4rem 0 0; }
    .vide { text-align: center; color: var(--txt-2); padding: 2.5rem 1rem; font-size: .9rem; }
  `],
})
export class NotesRecuesComponent implements OnInit {
  notes = signal<NoteRecue[]>([]);
  ouverte = signal<number | null>(null);
  suivi = signal<SuiviDiffusion | null>(null);

  private api = environment.apiUrl;

  constructor(private http: HttpClient, private toast: ToastService) {
    inject(NavigationService).vuesLocales(this.ouverte);
  }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.http.get<any>(`${this.api}/notes-recues/`).subscribe({
      next: (r) => this.notes.set(r.results ?? r ?? []),
      error: () => this.toast.erreur('Chargement des notes impossible.'),
    });
  }

  nonLues(): number {
    return this.notes().filter((n) => !n.lue).length;
  }

  ouvrir(n: NoteRecue): void {
    if (this.ouverte() === n.id) {
      this.ouverte.set(null);
      this.suivi.set(null);
      return;
    }

    this.ouverte.set(n.id);
    this.suivi.set(null);

    // Le suivi de diffusion n'est visible que du rédacteur et de la
    // direction : un 403 est ici une réponse normale, pas une panne.
    this.http.get<SuiviDiffusion>(
      `${this.api}/notes-recues/diffusion/`, { params: { note: String(n.note) } },
    ).subscribe({
      next: (s) => this.suivi.set(s),
      error: () => this.suivi.set(null),
    });
  }

  marquerLue(n: NoteRecue, evenement: Event): void {
    evenement.stopPropagation();

    this.http.post<NoteRecue>(
      `${this.api}/notes-recues/${n.id}/marquer_lue/`, {},
    ).subscribe({
      next: (maj) => {
        this.notes.update((l) => l.map((x) => (x.id === maj.id ? maj : x)));
        this.toast.succes('Prise de connaissance enregistrée.');
      },
      error: () => this.toast.erreur('Enregistrement impossible.'),
    });
  }

  noms(attente: { nom: string }[]): string {
    return attente.map((p) => p.nom).join(', ');
  }
}
