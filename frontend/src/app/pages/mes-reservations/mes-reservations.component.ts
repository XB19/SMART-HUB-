import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { Reservation } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';
import {
  GroupeReservations, grouperParSerie, libelleSerie, resumeStatuts, trouverGroupe,
} from '../../shared/serie.util';

@Component({
  selector: 'app-mes-reservations',
  imports: [CommonModule, RouterLink, IconComponent],
  template: `
  <div class="entete anim-entree">
    <h1>Mes réservations</h1>
    <a class="btn cta" routerLink="/reserver"><app-icon name="plus"/> Nouvelle</a>
  </div>

  <div class="carte anim-entree">
    @if (groupes().length) {
      <table class="tbl">
        <tr><th>Salle</th><th>Date</th><th>Horaire</th><th>Statut</th><th></th></tr>
        @for (g of groupes(); track g.premiere.id) {
          @if (g.estSerie) {
            <!-- Série récurrente : une seule ligne, dépliable -->
            <tr class="ligne-serie" (click)="basculerSerie(g.premiere.serie!)">
              <td>{{ g.premiere.salle_nom }}<br><small>{{ g.premiere.filiale_nom }}</small></td>
              <td>
                <span class="badge recurrente"><app-icon name="repeat" [size]="11"/> Récurrente</span><br>
                <small>{{ libelle(g.premiere) }}</small>
              </td>
              <td>{{ g.premiere.heure_debut.slice(0,5) }}–{{ g.premiere.heure_fin.slice(0,5) }}</td>
              <td><small>{{ resume(g.occurrences) }}</small></td>
              <td>
                <button class="btn secondaire petit">
                  <app-icon [name]="serieOuverte() === g.premiere.serie ? 'chevronLeft' : 'chevronRight'" [size]="13"/>
                  {{ g.occurrences.length }} occurrence{{ g.occurrences.length > 1 ? 's' : '' }}
                </button>
              </td>
            </tr>
            @if (serieOuverte() === g.premiere.serie) {
              @for (r of g.occurrences; track r.id) {
                <tr class="occurrence" [id]="'resa-' + r.id" [class.surlignee]="ligneSurlignee() === r.id">
                  <td><small>↳ occurrence</small></td>
                  <td>{{ r.date_reunion }}</td>
                  <td>{{ r.heure_debut.slice(0,5) }}–{{ r.heure_fin.slice(0,5) }}</td>
                  <td>
                    <span class="badge" [class]="cls(r.statut)">{{ r.statut_libelle }}</span>
                    @if (motifStatut(r); as m) { <br><small class="motif">{{ m }}</small> }
                  </td>
                  <td>
                    @if (r.statut === 'EN_ATTENTE' || r.statut === 'VALIDEE') {
                      <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ id: r.id }"><app-icon name="edit" [size]="14"/> Modifier</a>
                      <button class="btn rouge petit" (click)="annuler(r)"><app-icon name="close" [size]="14"/> Annuler</button>
                    }
                    @if (r.statut === 'DEPLACEE' || r.statut === 'ANNULEE' || r.statut === 'REFUSEE') {
                      <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ copier: r.id }"><app-icon name="repeat" [size]="14"/> Reprogrammer</a>
                    }
                  </td>
                </tr>
              }
            }
          } @else {
            <tr [id]="'resa-' + g.premiere.id" [class.surlignee]="ligneSurlignee() === g.premiere.id">
              <td>{{ g.premiere.salle_nom }}<br><small>{{ g.premiere.filiale_nom }}</small></td>
              <td>{{ g.premiere.date_reunion }}</td>
              <td>{{ g.premiere.heure_debut.slice(0,5) }}–{{ g.premiere.heure_fin.slice(0,5) }}</td>
              <td>
                <span class="badge" [class]="cls(g.premiere.statut)">{{ g.premiere.statut_libelle }}</span>
                @if (motifStatut(g.premiere); as m) { <br><small class="motif">{{ m }}</small> }
              </td>
              <td>
                @if (g.premiere.statut === 'EN_ATTENTE' || g.premiere.statut === 'VALIDEE') {
                  <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ id: g.premiere.id }"><app-icon name="edit" [size]="14"/> Modifier</a>
                  <button class="btn rouge petit" (click)="annuler(g.premiere)"><app-icon name="close" [size]="14"/> Annuler</button>
                }
                @if (g.premiere.statut === 'DEPLACEE' || g.premiere.statut === 'ANNULEE' || g.premiere.statut === 'REFUSEE') {
                  <a class="btn secondaire petit" [routerLink]="['/reserver']" [queryParams]="{ copier: g.premiere.id }"><app-icon name="repeat" [size]="14"/> Reprogrammer</a>
                }
              </td>
            </tr>
          }
        }
      </table>
    } @else { <div class="vide">Aucune réservation pour le moment.</div> }
  </div>
  `,
  styles: [`.entete { display:flex; justify-content:space-between; align-items:center; } small{color:var(--gris-texte);}
    .motif { font-style: italic; max-width: 220px; display: inline-block; }
    .badge.recurrente { background: #ede9fe; color: #6d28d9; display: inline-flex;
      align-items: center; gap: .25rem; }
    .ligne-serie { cursor: pointer; background: #faf9ff; }
    .ligne-serie:hover { background: #f3f0ff; }
    .occurrence { background: #fcfcfd; }
    .occurrence td:first-child { padding-left: 1.6rem; }
    tr.surlignee { background: #fff7e6 !important; box-shadow: inset 3px 0 0 var(--accent); animation: pulseSurlignee 1.6s ease-out 1; }
    @keyframes pulseSurlignee { 0% { background: #ffedc2 !important; } 100% { background: #fff7e6 !important; } }`],
})
export class MesReservationsComponent implements OnInit {
  groupes = signal<GroupeReservations[]>([]);
  serieOuverte = signal<number | null>(null);
  ligneSurlignee = signal<number | null>(null);

  constructor(
    private api: ApiService, private route: ActivatedRoute,
    private dialogue: DialogueService, private toasts: ToastService,
  ) {
    inject(NavigationService).vuesLocales(this.serieOuverte);
  }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.api.reservations({ mes: 1, ordering: '-date_reunion', page_size: 200 })
      .subscribe((p) => {
        this.groupes.set(grouperParSerie(p.results));
        this.ouvrirDepuisNotif();
      });
  }

  /** Ouverture directe depuis une notification (?id=...) : déplie la série si besoin, surligne et scroll. */
  private ouvrirDepuisNotif(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('id'));
    if (!id) return;
    const g = trouverGroupe(this.groupes(), id);
    if (!g) return;
    if (g.estSerie) this.serieOuverte.set(g.premiere.serie!);
    this.ligneSurlignee.set(id);
    setTimeout(() => document.getElementById('resa-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  basculerSerie(serieId: number): void {
    this.serieOuverte.set(this.serieOuverte() === serieId ? null : serieId);
  }

  libelle(r: Reservation): string { return libelleSerie(r); }
  resume(occ: Reservation[]): string { return resumeStatuts(occ); }

  async annuler(r: Reservation): Promise<void> {
    const motif = await this.dialogue.demanderMotif({
      titre: 'Annuler la réservation',
      message: `${r.salle_nom} — ${r.date_reunion} ${r.heure_debut.slice(0, 5)}–${r.heure_fin.slice(0, 5)}`,
      placeholder: "Motif d'annulation (optionnel)",
      libelleConfirmer: 'Annuler la réservation',
      dangereux: true,
    });
    if (motif === null) return;
    this.api.annulerReservation(r.id, motif).subscribe({
      next: () => this.charger(),
      error: (e) => this.toasts.afficher({
        titre: 'Annulation impossible', message: e?.error?.detail || 'Erreur inconnue.', type: 'ERROR',
      }),
    });
  }

  cls(s: string): string {
    return s === 'VALIDEE' ? 'validee' : s === 'EN_ATTENTE' ? 'attente'
      : ['REFUSEE', 'ANNULEE', 'DEPLACEE'].includes(s) ? 'annulee' : 'info';
  }

  /** Motif à afficher sous le badge de statut (refus, annulation, déplacement). */
  motifStatut(r: Reservation): string {
    if (r.statut === 'REFUSEE') return r.motif_refus || '';
    if (r.statut === 'ANNULEE') return r.motif_annulation || '';
    if (r.statut === 'DEPLACEE') {
      const m = r.motif_annulation ? ` (${r.motif_annulation})` : '';
      return `Créneau libéré par le secrétariat${m} — reprogrammez à un autre horaire.`;
    }
    return '';
  }
}
