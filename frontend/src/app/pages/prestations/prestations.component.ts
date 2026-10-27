import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { Prestation, PrestationsService } from '../../core/vie-interne.service';
import { NavigationService } from '../../core/navigation.service';

/**
 * Prestations de services, suivies par le service qui les réalise.
 *
 * L'avancement affiché vient des jalons réalisés, jamais d'un pourcentage
 * saisi : un chiffre déclaré est juste le jour où on le saisit et faux
 * ensuite. Une prestation sans jalon n'affiche donc pas « 0 % » mais
 * l'absence de jalons — ce n'est pas la même information.
 */
@Component({
  selector: 'app-prestations',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="tete anim-entree">
    <div>
      <h1>Prestations de services</h1>
      <p class="sous">Missions en cours et leur avancement</p>
    </div>
    <button class="btn cta" (click)="formulaire.set(true)">
      <app-icon name="plus"/> Nouvelle prestation
    </button>
  </div>

  @if (bord(); as b) {
    <div class="grille stagger">
      <div class="kpi">
        <div class="ic ic-navy"><app-icon name="briefcase"/></div>
        <div><div class="v">{{ b.total }}</div><div class="l">Prestations</div></div>
      </div>
      <div class="kpi">
        <div class="ic ic-bleu"><app-icon name="clock"/></div>
        <div><div class="v">{{ b.par_statut['EN_COURS'] || 0 }}</div><div class="l">En cours</div></div>
      </div>
      <div class="kpi">
        <div class="ic ic-vert"><app-icon name="checkCircle"/></div>
        <div><div class="v">{{ b.par_statut['TERMINEE'] || 0 }}</div><div class="l">Terminées</div></div>
      </div>
      <div class="kpi" [class.alerte]="b.en_retard.length">
        <div class="ic ic-orange"><app-icon name="bell"/></div>
        <div><div class="v">{{ b.en_retard.length }}</div><div class="l">En retard</div></div>
      </div>
    </div>
  }

  <div class="carte anim-entree">
    @if (prestations().length) {
      <div class="liste">
        @for (p of prestations(); track p.id) {
          <article class="ligne" [class.retard]="p.en_retard">
            <div class="principal">
              <div class="titre-ligne">
                <h4>{{ p.intitule }}</h4>
                <span class="ref">{{ p.reference }}</span>
                @if (p.en_retard) { <span class="badge-retard">En retard</span> }
              </div>
              <p class="meta">
                {{ p.client }} · {{ p.service_nom }} · {{ p.responsable_nom }}
                · échéance {{ p.date_fin_prevue | date: 'dd/MM/yyyy' }}
              </p>

              @if (p.avancement; as a) {
                <div class="avancement">
                  <div class="piste">
                    <div class="rempli" [style.width.%]="a.pourcentage"></div>
                  </div>
                  <span class="pct">{{ a.pourcentage }}%</span>
                  <span class="jalons">{{ a.realises }}/{{ a.jalons }} jalons</span>
                  @if (a.prochain) { <span class="prochain">→ {{ a.prochain }}</span> }
                </div>
              } @else {
                <p class="sans-jalon">Aucun jalon défini — l'avancement ne peut pas être mesuré.</p>
              }
            </div>

            <div class="cote">
              <span class="etat" [class]="'etat-' + p.statut.toLowerCase()">{{ p.statut_libelle }}</span>
              <span class="montant">{{ montant(p.montant) }}</span>
              @if (p.statut !== 'TERMINEE' && p.statut !== 'ANNULEE') {
                <button class="lien" (click)="cloturer(p)">Clôturer</button>
              }
            </div>
          </article>
        }
      </div>
    } @else {
      <div class="vide">Aucune prestation sur votre périmètre.</div>
    }
  </div>

  @if (formulaire()) {
    <div class="voile" (click)="formulaire.set(false)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Nouvelle prestation</h3>
        <label>Intitulé</label>
        <input [(ngModel)]="intitule" placeholder="Audit organisationnel"/>
        <label>Client</label>
        <input [(ngModel)]="client" placeholder="Société Alpha"/>
        <div class="deux-champs">
          <div><label>Début</label><input type="date" [(ngModel)]="dateDebut"/></div>
          <div><label>Fin prévue</label><input type="date" [(ngModel)]="dateFinPrevue"/></div>
        </div>
        <label>Montant (FCFA)</label>
        <input type="number" [(ngModel)]="montantSaisi" min="0"/>
        <label>Description</label>
        <textarea rows="2" [(ngModel)]="description"></textarea>
        <p class="aide">
          Le service réalisateur et le responsable sont renseignés depuis
          l'administration une fois la prestation créée.
        </p>
        <div class="pied">
          <button class="btn fantome" (click)="formulaire.set(false)">Annuler</button>
          <button class="btn cta" (click)="creer()">Créer</button>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .tete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.4rem; }
    .sous { color: var(--txt-2); margin-top: -.3rem; font-size: .88rem; }
    .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem; margin-bottom: 1.2rem; }
    .kpi { background: #fff; border: 1px solid var(--bord); border-radius: var(--r);
      padding: 1rem 1.1rem; box-shadow: var(--ombre); display: flex; align-items: center; gap: .9rem; }
    .kpi.alerte { border-color: #fecaca; }
    .ic { width: 42px; height: 42px; border-radius: 11px; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0; color: #fff; }
    .ic-navy { background: var(--navy); } .ic-bleu { background: var(--bleu); }
    .ic-orange { background: var(--accent); } .ic-vert { background: var(--vert); }
    .kpi .v { font-family: var(--police-titre); font-size: 1.6rem; font-weight: 700;
      color: var(--navy); line-height: 1; }
    .kpi .l { font-size: .78rem; color: var(--txt-2); margin-top: .2rem; }

    .liste { display: flex; flex-direction: column; gap: .7rem; }
    .ligne { display: flex; justify-content: space-between; gap: 1rem; padding: .9rem 1rem;
      border: 1px solid var(--bord); border-radius: 10px; flex-wrap: wrap; }
    .ligne.retard { border-color: #fecaca; background: #fffbfb; }
    .principal { flex: 1; min-width: 220px; }
    .titre-ligne { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
    .titre-ligne h4 { margin: 0; font-size: .95rem; color: var(--navy); }
    .ref { font-size: .72rem; color: var(--txt-2); font-family: monospace; }
    .badge-retard { background: #fee2e2; color: #991b1b; border-radius: 999px;
      padding: .1rem .5rem; font-size: .7rem; font-weight: 600; }
    .meta { font-size: .78rem; color: var(--txt-2); margin: .25rem 0 .5rem; }

    .avancement { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; font-size: .76rem; }
    .piste { flex: 1; min-width: 100px; height: 7px; background: #eef2f7;
      border-radius: 999px; overflow: hidden; }
    .rempli { height: 100%; background: linear-gradient(90deg, var(--bleu), var(--navy));
      border-radius: 999px; transition: width .5s ease; }
    .pct { font-weight: 700; color: var(--navy); }
    .jalons, .prochain { color: var(--txt-2); }
    .sans-jalon { font-size: .76rem; color: var(--txt-2); font-style: italic; margin: .2rem 0 0; }

    .cote { display: flex; flex-direction: column; align-items: flex-end; gap: .4rem; }
    .etat { padding: .2rem .55rem; border-radius: 999px; font-size: .73rem; font-weight: 600; }
    .etat-planifiee { background: #e0e7ff; color: #3730a3; }
    .etat-en_cours { background: #dbeafe; color: #1e40af; }
    .etat-suspendue { background: #fef3c7; color: #92400e; }
    .etat-terminee { background: #dcfce7; color: #166534; }
    .etat-annulee { background: #f1f5f9; color: #475569; }
    .montant { font-weight: 700; color: var(--navy); font-size: .85rem; }
    .lien { background: none; border: none; color: var(--bleu); cursor: pointer;
      font-size: .78rem; text-decoration: underline; padding: 0; }

    .vide { text-align: center; color: var(--txt-2); padding: 2.5rem 1rem; font-size: .9rem; }
    .voile { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex;
      align-items: center; justify-content: center; z-index: 60; padding: 1rem; }
    .modale { background: #fff; border-radius: var(--r); padding: 1.5rem; width: 100%;
      max-width: 460px; max-height: 90vh; overflow-y: auto; box-shadow: var(--ombre-md); }
    .modale h3 { margin: 0 0 1rem; color: var(--navy); }
    .modale label { display: block; font-size: .8rem; font-weight: 600; color: var(--txt-2);
      margin: .8rem 0 .3rem; }
    .modale input, .modale textarea { width: 100%; padding: .6rem .7rem;
      border: 1px solid var(--bord); border-radius: 8px; font-size: .9rem; font-family: inherit; }
    .deux-champs { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
    .aide { font-size: .76rem; color: var(--txt-2); margin: .8rem 0 0; }
    .pied { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.2rem; }
    .btn.fantome { background: none; border: 1px solid var(--bord); color: var(--txt); }
  `],
})
export class PrestationsComponent implements OnInit {
  prestations = signal<Prestation[]>([]);
  bord = signal<{ total: number; par_statut: Record<string, number>; en_retard: Prestation[] } | null>(null);
  formulaire = signal(false);

  intitule = '';
  client = '';
  dateDebut = '';
  dateFinPrevue = '';
  montantSaisi = 0;
  description = '';

  constructor(
    private service: PrestationsService,
    private toast: ToastService,
    public auth: AuthService,
  ) {
    inject(NavigationService).vuesLocales(this.formulaire);
  }

  ngOnInit(): void { this.charger(); }

  charger(): void {
    this.service.liste().subscribe(
      (r) => this.prestations.set(r.results ?? (r as any) ?? []));
    this.service.tableauDeBord().subscribe((b) => this.bord.set(b));
  }

  montant(valeur: string): string {
    const n = parseFloat(valeur);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' F';
  }

  creer(): void {
    if (!this.intitule.trim() || !this.client.trim()
        || !this.dateDebut || !this.dateFinPrevue) {
      this.toast.erreur('Intitulé, client et dates sont obligatoires.');
      return;
    }

    this.service.creer({
      intitule: this.intitule,
      client: this.client,
      date_debut: this.dateDebut,
      date_fin_prevue: this.dateFinPrevue,
      montant: String(this.montantSaisi),
      description: this.description,
    } as any).subscribe({
      next: () => {
        this.formulaire.set(false);
        this.intitule = this.client = this.description = '';
        this.toast.succes('Prestation créée.');
        this.charger();
      },
      error: (e) => this.toast.erreur(
        e?.error?.detail || e?.error?.service?.[0]
        || 'Création impossible : un service réalisateur est requis.'),
    });
  }

  cloturer(p: Prestation): void {
    this.service.cloturer(p.id).subscribe({
      next: () => { this.toast.succes('Prestation clôturée.'); this.charger(); },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Clôture impossible.'),
    });
  }
}
