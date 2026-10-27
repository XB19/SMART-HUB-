import {
  Component, OnInit, OnDestroy, computed, signal, effect, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { NotificationsService } from '../../core/notifications.service';
import { NavigationService } from '../../core/navigation.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { Salle, Reservation, Filiale } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { libelleSerie } from '../../shared/serie.util';

const H_DEBUT = 7;
const H_FIN = 20;
const PX_H = 56;

@Component({
  selector: 'app-calendrier',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  template: `
  <!-- En-tête page -->
  <div class="page-entete anim-entree">
    <div>
      <h1>Disponibilité des salles</h1>
      <p class="sous-titre">Toutes les salles du groupe — mis à jour en temps réel</p>
    </div>
    <a class="btn cta" routerLink="/reserver"><app-icon name="plus"/> Réserver</a>
  </div>

  <!-- Barre de navigation -->
  <div class="barre-ctrl carte anim-entree">
    <div class="nav-date">
      <button class="btn secondaire petit" (click)="decaler(-1)" title="Jour précédent">
        <app-icon name="chevronLeft" [size]="15"/>
      </button>
      <button class="btn secondaire petit" (click)="aujourdhui()"
              [class.actif]="estAujourdhui()">Aujourd'hui</button>
      <button class="btn secondaire petit" (click)="decaler(1)" title="Jour suivant">
        <app-icon name="chevronRight" [size]="15"/>
      </button>
    </div>

    <div class="date-label" [class.auj]="estAujourdhui()">
      <app-icon name="calendar" [size]="16"/>
      {{ dateLabel() }}
    </div>

    <input type="date" [ngModel]="dateStr()" (ngModelChange)="onDateChange($event)"
           class="champ-date"/>

    <div class="sep"></div>

    <div class="champ-inline">
      <app-icon name="building" [size]="15"/>
      <select (change)="onFilialeChange($event)">
        <option value="">Toutes les filiales</option>
        @for (f of filiales(); track f.id) {
          <option [value]="f.id">{{ f.nom }}</option>
        }
      </select>
    </div>

    @if (chargement()) {
      <div class="spinner petit"></div>
    } @else {
      <div class="rt-badge" title="Mise à jour temps réel active">
        <span class="rt-dot"></span>Temps réel
      </div>
    }
  </div>

  <!-- Légende statuts -->
  <div class="legende anim-entree">
    <span class="litem validee"><span class="puce"></span>Validée</span>
    <span class="litem attente"><span class="puce"></span>En attente</span>
    <span class="litem libre"><span class="puce"></span>Libre</span>
    @if (totalReservations() > 0) {
      <span class="nb-res">{{ totalReservations() }} réservation{{ totalReservations() > 1 ? 's' : '' }} ce jour</span>
    }
  </div>

  <!-- État vide -->
  @if (sallesFiltrees().length === 0) {
    <div class="etat-vide carte anim-entree">
      <app-icon name="building" [size]="42"/>
      <p>Aucune salle pour cette filiale.</p>
      <a class="btn secondaire" routerLink="/salles">Gérer les salles</a>
    </div>

  } @else {
    <!-- Calendrier multi-salles -->
    <div class="calendrier-wrap carte anim-entree">
      <div class="grille-cal" [style.gridTemplateColumns]="colonnes()">

        <!-- Coin (heure × header) -->
        <div class="coin">
          <span>Heure</span>
        </div>

        <!-- En-têtes salles -->
        @for (s of sallesFiltrees(); track s.id) {
          <div class="salle-header">
            <div class="sh-nom">{{ s.nom }}</div>
            <div class="sh-meta">
              <span class="badge-filiale">{{ s.filiale_nom }}</span>
              <app-icon name="users" [size]="11"/> {{ s.capacite }} pl.
            </div>
            <div class="occup-wrap">
              <div class="occup-bar">
                <div class="barre" [style.width.%]="occupationJour(s.id)"
                     [class.haute]="occupationJour(s.id) > 75"
                     [class.moy]="occupationJour(s.id) > 40 && occupationJour(s.id) <= 75">
                </div>
              </div>
              <span class="occup-pct"
                    [class.rouge]="occupationJour(s.id) > 75"
                    [class.orange]="occupationJour(s.id) > 40 && occupationJour(s.id) <= 75">
                {{ occupationJour(s.id) }}%
              </span>
            </div>
          </div>
        }

        <!-- Colonne heures -->
        <div class="col-h">
          @for (h of heures; track h) {
            <div class="heure" [style.height.px]="PX_H">{{ h }}h</div>
          }
          @if (ligneMaintenantTop() !== null) {
            <div class="etiquette-now" [style.top.px]="ligneMaintenantTop()!">
              {{ heureNow() }}
            </div>
          }
        </div>

        <!-- Colonnes salles -->
        @for (s of sallesFiltrees(); track s.id) {
          <div class="col-salle" [style.height.px]="hauteurTotale">
            <!-- Grille horaire -->
            @for (h of heures; track h) {
              <div class="ligne-h" [style.height.px]="PX_H"
                   [class.heure-pleine]="h % 2 === 0"></div>
            }

            <!-- Ligne "maintenant" -->
            @if (ligneMaintenantTop() !== null) {
              <div class="ligne-now" [style.top.px]="ligneMaintenantTop()!"></div>
            }

            <!-- Blocs de réservation -->
            @for (r of reservationsDeSalle(s.id); track r.id) {
              <div class="bloc-res" [class]="classeBloc(r.statut)"
                   [style.top.px]="posTop(r)" [style.height.px]="posHaut(r)"
                   [title]="tooltip(r)" (click)="ouvrirDetail(r)">
                <div class="b-time">
                  <app-icon name="clock" [size]="9"/>
                  {{ r.heure_debut.slice(0,5) }}–{{ r.heure_fin.slice(0,5) }}
                </div>
                <div class="b-who">{{ r.nom_reservant }}</div>
                @if (r.motif && posHaut(r) > 50) {
                  <div class="b-motif">{{ r.motif }}</div>
                }
                @if (posHaut(r) > 68) {
                  <span class="b-badge">
                    {{ r.statut === 'VALIDEE' ? '✓ Validée' : '⏳ En attente' }}
                  </span>
                }
              </div>
            }
          </div>
        }

      </div>
    </div>

    <!-- Panneau de détail / actions au clic sur un créneau -->
    @if (selection(); as r) {
      <div class="voile" (click)="selection.set(null)"></div>
      <div class="panneau-res carte">
        <div class="p-tete">
          <h3>{{ r.nom_reservant }}</h3>
          <span class="badge" [class]="r.statut === 'VALIDEE' ? 'validee' : 'attente'">
            {{ r.statut_libelle }}</span>
        </div>
        <p class="p-infos">
          <strong>Salle :</strong> {{ nomSalle(r.salle) }}<br>
          <strong>Date :</strong> {{ r.date_reunion }}<br>
          <strong>Horaire :</strong> {{ r.heure_debut.slice(0,5) }}–{{ r.heure_fin.slice(0,5) }}<br>
          @if (r.motif) { <strong>Motif :</strong> {{ r.motif }}<br> }
          @if (r.demandeur_nom) { <strong>Demandeur :</strong> {{ r.demandeur_nom }}<br> }
          @if (r.telephone) { <strong>Téléphone :</strong> {{ r.telephone }} }
        </p>
        @if (r.serie) {
          <p><span class="badge recurrente"><app-icon name="repeat" [size]="11"/> Récurrente</span>
            <small> {{ libelleRecurrence(r) }}</small></p>
        }
        <div class="p-actions">
          @if (estGestionnaire(r)) {
            @if (r.statut === 'EN_ATTENTE') {
              <button class="btn vert petit" (click)="valider(r)"><app-icon name="check" [size]="14"/> Valider</button>
              <button class="btn rouge petit" (click)="refuser(r)"><app-icon name="close" [size]="14"/> Refuser</button>
            }
            <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ id: r.id }">
              <app-icon name="edit" [size]="14"/> Modifier (avec motif)</a>
            <button class="btn rouge petit" (click)="annuler(r)"><app-icon name="close" [size]="14"/> Annuler</button>
          } @else if (estMienne(r)) {
            <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ id: r.id }">
              <app-icon name="edit" [size]="14"/> Modifier</a>
            <button class="btn rouge petit" (click)="annuler(r)"><app-icon name="close" [size]="14"/> Annuler</button>
          }
          <button class="btn secondaire petit" (click)="selection.set(null)">Fermer</button>
        </div>
      </div>
    }

    <!-- Résumé bas de page -->
    <div class="resume anim-entree">
      @for (s of sallesFiltrees(); track s.id) {
        @if (reservationsDeSalle(s.id).length > 0) {
          <div class="resume-salle carte">
            <div class="rs-titre">
              <strong>{{ s.nom }}</strong>
              <span class="badge" [class]="occupationJour(s.id) > 75 ? 'rouge' : 'info'">
                {{ occupationJour(s.id) }}% occupée
              </span>
            </div>
            <div class="rs-liste">
              @for (r of reservationsDeSalle(s.id); track r.id) {
                <div class="rs-item" [class]="classeBloc(r.statut)">
                  <span class="rs-heure">{{ r.heure_debut.slice(0,5) }}–{{ r.heure_fin.slice(0,5) }}</span>
                  <span class="rs-qui">{{ r.nom_reservant }}</span>
                  @if (r.motif) { <span class="rs-motif">— {{ r.motif }}</span> }
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  }
  `,
  styles: [`
    .page-entete {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: .5rem;
    }
    .page-entete h1 { margin: 0; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }

    /* Barre de contrôle */
    .barre-ctrl {
      display: flex; gap: .8rem; align-items: center; flex-wrap: wrap;
      margin: 1rem 0; padding: .8rem 1.1rem;
    }
    .nav-date { display: flex; gap: .3rem; }
    .nav-date .actif { background: var(--bleu) !important; color: #fff !important; }
    .date-label {
      font-family: var(--police-titre); font-weight: 600; font-size: .92rem;
      color: var(--navy); display: flex; align-items: center; gap: .4rem; flex: 1;
      text-transform: capitalize;
    }
    .date-label.auj { color: var(--bleu); }
    .champ-date {
      border: 1px solid var(--bord); border-radius: 8px; padding: .38rem .6rem;
      font-size: .82rem; color: var(--txt); background: #fff; cursor: pointer;
    }
    .sep { flex: 1; }
    .champ-inline {
      display: flex; align-items: center; gap: .4rem; color: var(--txt-2);
    }
    .champ-inline select {
      border: 1px solid var(--bord); border-radius: 8px; padding: .38rem .6rem;
      font-size: .82rem; background: #fff; color: var(--txt);
    }

    /* Badge temps réel */
    .rt-badge {
      display: flex; align-items: center; gap: .4rem; font-size: .73rem;
      color: #16a34a; font-weight: 600;
    }
    .rt-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #4ade80;
      box-shadow: 0 0 0 3px rgba(74,222,128,.25); animation: pulseDot 2s infinite;
    }
    @keyframes pulseDot { 0%,100% { opacity:1; } 50% { opacity:.45; } }

    /* Légende */
    .legende {
      display: flex; gap: 1.2rem; align-items: center; margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .litem { display: flex; align-items: center; gap: .38rem; font-size: .79rem; color: var(--txt-2); }
    .puce { width: 11px; height: 11px; border-radius: 3px; }
    .litem.validee .puce { background: #16a34a; }
    .litem.attente .puce { background: #ea580c; }
    .litem.libre .puce { background: #e2e8f0; border: 1px solid #cbd5e1; }
    .nb-res {
      margin-left: auto; font-size: .79rem; color: var(--txt-2); font-style: italic;
    }

    /* État vide */
    .etat-vide {
      text-align: center; padding: 3rem 2rem; color: var(--txt-2);
      display: flex; flex-direction: column; align-items: center; gap: 1rem;
    }

    /* Grille principale */
    .calendrier-wrap { padding: 0; overflow: auto; max-height: 76vh; }
    .grille-cal { display: grid; }

    /* Coin */
    .coin {
      border-bottom: 2px solid var(--bord); border-right: 1px solid #dde3ee;
      background: #f0f4fa; padding: .5rem .4rem;
      font-size: .68rem; color: var(--txt-3); text-align: center;
      font-weight: 600; text-transform: uppercase; letter-spacing: .05em;
      position: sticky; top: 0; left: 0; z-index: 20;
    }

    /* En-tête salle */
    .salle-header {
      border-bottom: 2px solid var(--bord); border-left: 1px solid #dde3ee;
      padding: .6rem .75rem; background: #f8fafc;
      position: sticky; top: 0; z-index: 10;
    }
    .sh-nom {
      font-family: var(--police-titre); font-weight: 700; color: var(--navy);
      font-size: .88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .sh-meta {
      display: flex; align-items: center; gap: .3rem;
      font-size: .7rem; color: var(--txt-2); margin: .2rem 0 .45rem;
    }
    .badge-filiale {
      background: #eff6ff; color: var(--bleu); border-radius: 4px;
      padding: 1px 5px; font-size: .63rem; font-weight: 600;
    }
    .occup-wrap { display: flex; align-items: center; gap: .4rem; }
    .occup-bar {
      flex: 1; background: #e2e8f0; height: 5px; border-radius: 99px; overflow: hidden;
    }
    .occup-bar .barre {
      height: 100%; background: #22c55e; border-radius: 99px; transition: width .5s ease;
    }
    .occup-bar .barre.moy { background: #f97316; }
    .occup-bar .barre.haute { background: #ef4444; }
    .occup-pct { font-size: .68rem; color: var(--txt-3); min-width: 26px; text-align: right; }
    .occup-pct.rouge { color: #dc2626; font-weight: 700; }
    .occup-pct.orange { color: #ea580c; font-weight: 600; }

    /* Colonne heures */
    .col-h {
      border-right: 1px solid #dde3ee; background: #f8fafc;
      position: sticky; left: 0; z-index: 5;
    }
    .heure {
      font-size: .68rem; color: var(--txt-3); text-align: right;
      padding-right: 8px; border-bottom: 1px solid #eef1f6;
      display: flex; align-items: flex-start; padding-top: 3px;
      font-weight: 500;
    }

    /* Colonne salle */
    .col-salle { position: relative; border-left: 1px solid #dde3ee; }
    .ligne-h { border-bottom: 1px solid #eef1f6; }
    .ligne-h.heure-pleine { border-bottom: 1px solid #e2e8f0; }

    /* Ligne "maintenant" */
    .ligne-now {
      position: absolute; left: 0; right: 0; height: 2px;
      background: #ef4444; z-index: 8; pointer-events: none;
    }
    .ligne-now::before {
      content: ''; position: absolute; left: -5px; top: -4px;
      width: 10px; height: 10px; border-radius: 50%;
      background: #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,.25);
    }

    /* Étiquette « maintenant » sur la colonne des heures */
    .etiquette-now {
      position: absolute; left: 2px; right: 2px; transform: translateY(-50%);
      background: #ef4444; color: #fff; font-size: .62rem; font-weight: 700;
      text-align: center; padding: 1px 3px; border-radius: 5px; z-index: 9;
      box-shadow: 0 1px 4px rgba(239,68,68,.4); pointer-events: none;
    }

    /* Blocs de réservation */
    .bloc-res {
      position: absolute; left: 3px; right: 3px; border-radius: 7px;
      padding: 4px 6px; font-size: .71rem; overflow: hidden;
      cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.15);
      transition: box-shadow .15s, transform .15s;
    }

    /* Panneau de détail (clic sur un créneau) */
    .voile {
      position: fixed; inset: 0; background: rgba(15,23,42,.35); z-index: 60;
    }
    .panneau-res {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      z-index: 70; min-width: 320px; max-width: 420px; padding: 1.2rem 1.4rem;
      box-shadow: var(--ombre-lg);
    }
    .p-tete { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    .p-tete h3 { margin: 0; }
    .p-infos { font-size: .88rem; line-height: 1.7; }
    .p-actions { display: flex; gap: .45rem; flex-wrap: wrap; margin-top: .8rem; }
    .badge.recurrente { background: #ede9fe; color: #6d28d9; display: inline-flex;
      align-items: center; gap: .25rem; }
    .bloc-res:hover {
      box-shadow: 0 4px 14px rgba(0,0,0,.22); transform: scaleX(1.01);
    }
    .bloc-res.validee {
      background: linear-gradient(145deg, #16a34a 0%, #15803d 100%);
      color: #fff; border-left: 3px solid #166534;
    }
    .bloc-res.attente {
      background: linear-gradient(145deg, #ea580c 0%, #c2410c 100%);
      color: #fff; border-left: 3px solid #9a3412;
    }
    .b-time {
      font-weight: 700; font-size: .65rem; opacity: .85;
      display: flex; align-items: center; gap: 2px;
    }
    .b-who {
      font-weight: 700; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .b-motif {
      font-size: .63rem; opacity: .82; margin-top: 1px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .b-badge {
      display: inline-block; margin-top: 3px; padding: 1px 5px;
      border-radius: 99px; font-size: .58rem;
      background: rgba(255,255,255,.22); color: #fff;
    }

    /* Résumé bas de page */
    .resume {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem; margin-top: 1rem;
    }
    .resume-salle { padding: .9rem 1rem; }
    .rs-titre {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: .6rem; font-size: .85rem;
    }
    .rs-liste { display: flex; flex-direction: column; gap: .3rem; }
    .rs-item {
      display: flex; align-items: center; gap: .5rem; font-size: .78rem;
      padding: .3rem .5rem; border-radius: 6px;
    }
    .rs-item.validee { background: #f0fdf4; color: #15803d; border-left: 3px solid #22c55e; }
    .rs-item.attente { background: #fff7ed; color: #c2410c; border-left: 3px solid #f97316; }
    .rs-heure { font-weight: 700; min-width: 90px; }
    .rs-qui { font-weight: 600; }
    .rs-motif { opacity: .7; font-style: italic; }
  `],
})
export class CalendrierComponent implements OnInit, OnDestroy {
  readonly salles = signal<Salle[]>([]);
  readonly filiales = signal<Filiale[]>([]);
  readonly reservations = signal<Reservation[]>([]);
  readonly chargement = signal(false);
  readonly dateStr = signal('');
  readonly filialeId = signal<number | null>(null);
  readonly ligneMaintenantTop = signal<number | null>(null);
  readonly heureNow = signal('');
  readonly selection = signal<Reservation | null>(null);

  readonly PX_H = PX_H;
  readonly heures = Array.from({ length: H_FIN - H_DEBUT }, (_, i) => H_DEBUT + i);
  readonly hauteurTotale = (H_FIN - H_DEBUT) * PX_H;

  readonly sallesFiltrees = computed(() => {
    const fid = this.filialeId();
    return fid ? this.salles().filter((s) => s.filiale === fid) : this.salles();
  });

  readonly colonnes = computed(
    () => `56px repeat(${this.sallesFiltrees().length}, minmax(180px, 1fr))`,
  );

  readonly dateLabel = computed(() => {
    const d = this.dateStr();
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  });

  readonly estAujourdhui = computed(
    () => this.dateStr() === new Date().toISOString().slice(0, 10),
  );

  readonly totalReservations = computed(
    () => this.reservations().filter(
      (r) => ['EN_ATTENTE', 'VALIDEE'].includes(r.statut),
    ).length,
  );

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly notifs = inject(NotificationsService);
  private readonly dialogue = inject(DialogueService);
  private readonly toasts = inject(ToastService);
  private timerNow?: ReturnType<typeof setInterval>;
  private lastNotifCount = -1;

  constructor() {
    inject(NavigationService).vuesLocales(this.selection);
    // Rafraîchissement automatique à chaque nouvelle notification (WebSocket)
    effect(() => {
      const count = this.notifs.dernieres().length;
      if (this.lastNotifCount >= 0 && count > this.lastNotifCount) {
        this.charger();
      }
      this.lastNotifCount = count;
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.dateStr.set(new Date().toISOString().slice(0, 10));
    this.api.filiales().subscribe((p) => this.filiales.set(p.results));
    this.api.salles({ page_size: 100 }).subscribe((p) => {
      this.salles.set(p.results);
      this.charger();
    });
    this.majLigneNow();
    this.timerNow = setInterval(() => this.majLigneNow(), 60_000);
  }

  ngOnDestroy(): void {
    clearInterval(this.timerNow);
  }

  decaler(n: number): void {
    const d = new Date(this.dateStr() + 'T12:00:00');
    d.setDate(d.getDate() + n);
    this.dateStr.set(d.toISOString().slice(0, 10));
    this.charger();
  }

  aujourdhui(): void {
    this.dateStr.set(new Date().toISOString().slice(0, 10));
    this.charger();
  }

  onDateChange(val: string): void {
    if (val) { this.dateStr.set(val); this.charger(); }
  }

  onFilialeChange(event: Event): void {
    const v = (event.target as HTMLSelectElement).value;
    this.filialeId.set(v ? Number(v) : null);
  }

  charger(): void {
    if (!this.dateStr()) return;
    this.chargement.set(true);
    this.api.reservations({
      date_min: this.dateStr(),
      date_max: this.dateStr(),
      page_size: 500,
    }).subscribe({
      next: (p) => { this.reservations.set(p.results); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  reservationsDeSalle(salleId: number): Reservation[] {
    return this.reservations().filter(
      (r) => r.salle === salleId && ['EN_ATTENTE', 'VALIDEE'].includes(r.statut),
    );
  }

  posTop(r: Reservation): number {
    const [h, m] = r.heure_debut.split(':').map(Number);
    return Math.max(0, ((h - H_DEBUT) + m / 60) * PX_H);
  }

  posHaut(r: Reservation): number {
    const [h1, m1] = r.heure_debut.split(':').map(Number);
    const [h2, m2] = r.heure_fin.split(':').map(Number);
    return Math.max(28, ((h2 + m2 / 60) - (h1 + m1 / 60)) * PX_H - 2);
  }

  occupationJour(salleId: number): number {
    const duree = H_FIN - H_DEBUT;
    const tot = this.reservationsDeSalle(salleId).reduce((acc, r) => {
      const [h1, m1] = r.heure_debut.split(':').map(Number);
      const [h2, m2] = r.heure_fin.split(':').map(Number);
      return acc + Math.min(H_FIN, h2 + m2 / 60) - Math.max(H_DEBUT, h1 + m1 / 60);
    }, 0);
    return Math.round(Math.min(100, (tot / duree) * 100));
  }

  classeBloc(statut: string): string {
    return statut === 'VALIDEE' ? 'validee' : 'attente';
  }

  tooltip(r: Reservation): string {
    return [
      r.nom_reservant,
      r.motif ? `Motif : ${r.motif}` : '',
      `${r.heure_debut.slice(0, 5)} → ${r.heure_fin.slice(0, 5)}`,
      r.statut_libelle || r.statut,
      'Cliquer pour voir les actions',
    ].filter(Boolean).join('\n');
  }

  // ---------- Panneau de détail / actions ----------

  ouvrirDetail(r: Reservation): void { this.selection.set(r); }

  nomSalle(id: number): string {
    return this.salles().find((s) => s.id === id)?.nom ?? '';
  }

  libelleRecurrence(r: Reservation): string { return libelleSerie(r); }

  /** Secrétaire de la filiale propriétaire de la salle, ou admin. */
  estGestionnaire(r: Reservation): boolean {
    const u = this.auth.utilisateur();
    if (!u) return false;
    if (u.role === 'ADMINISTRATEUR') return true;
    const salle = this.salles().find((s) => s.id === r.salle);
    return u.role === 'SECRETAIRE' && !!salle && salle.filiale === u.filiale;
  }

  estMienne(r: Reservation): boolean {
    return r.demandeur === this.auth.utilisateur()?.id;
  }

  private erreurToast(titre: string, e: any): void {
    this.toasts.afficher({ titre, message: e?.error?.detail || 'Erreur inconnue.', type: 'ERROR' });
  }

  valider(r: Reservation): void {
    this.api.validerReservation(r.id).subscribe({
      next: () => { this.selection.set(null); this.charger(); },
      error: (e) => this.erreurToast('Validation impossible', e),
    });
  }

  async refuser(r: Reservation): Promise<void> {
    const motif = await this.dialogue.demanderMotif({
      titre: 'Refuser la demande',
      message: `${r.nom_reservant} — ${this.nomSalle(r.salle)}`,
      placeholder: 'Motif du refus (transmis au demandeur)',
      libelleConfirmer: 'Refuser',
      dangereux: true,
      obligatoire: true,
    });
    if (motif === null) return;
    this.api.refuserReservation(r.id, motif).subscribe({
      next: () => { this.selection.set(null); this.charger(); },
      error: (e) => this.erreurToast('Refus impossible', e),
    });
  }

  async annuler(r: Reservation): Promise<void> {
    const motif = await this.dialogue.demanderMotif({
      titre: 'Annuler la réservation',
      message: `${r.nom_reservant} — ${this.nomSalle(r.salle)}`,
      placeholder: "Motif de l'annulation (transmis au demandeur)",
      libelleConfirmer: 'Annuler',
      dangereux: true,
    });
    if (motif === null) return;
    this.api.annulerReservation(r.id, motif).subscribe({
      next: () => { this.selection.set(null); this.charger(); },
      error: (e) => this.erreurToast('Annulation impossible', e),
    });
  }

  private majLigneNow(): void {
    if (!this.estAujourdhui()) { this.ligneMaintenantTop.set(null); return; }
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < H_DEBUT || h > H_FIN) { this.ligneMaintenantTop.set(null); return; }
    this.ligneMaintenantTop.set((h - H_DEBUT) * PX_H);
    this.heureNow.set(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
  }
}
