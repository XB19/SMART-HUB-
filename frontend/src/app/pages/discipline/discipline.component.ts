import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ActivatedRoute } from '@angular/router';
import { NavigationService } from '../../core/navigation.service';
import {
  BaremeDisciplinaire, DisciplineService, ProcedureDisciplinaire,
} from '../../core/gestion.service';

/**
 * Procédures disciplinaires — article 58 de la Convention Collective.
 *
 * L'écran affiche les garanties plutôt que de les laisser deviner : le
 * délai de deux mois est visible en permanence, le bouton « prononcer »
 * reste inaccessible tant que le salarié ne s'est pas expliqué, et les
 * bornes de durée de chaque sanction sont rappelées au moment du choix.
 *
 * Un salarié n'y voit que son propre dossier — le service ne lui en
 * renvoie pas d'autre.
 */
@Component({
  selector: 'app-discipline',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="tete anim-entree">
    <div>
      <h1>Discipline</h1>
      <p class="sous">
        @if (peutInstruire()) {
          Procédures ouvertes — article 58 de la Convention Collective
        } @else {
          Vos dossiers
        }
      </p>
    </div>
    @if (peutInstruire()) {
      <button class="btn cta" (click)="ouvrirFormulaire()">
        <app-icon name="plus"/> Ouvrir un dossier
      </button>
    }
  </div>

  @if (procedures().length) {
    <div class="liste stagger">
      @for (p of procedures(); track p.id) {
        <article class="dossier" [class.urgent]="!p.sanction && p.delai_depasse"
                 (click)="ouvrir(p)">
          <div class="bandeau">
            <div>
              <h3>{{ p.salarie_nom }}</h3>
              <p class="meta">
                {{ p.reference }} · faits du {{ p.date_faits | date: 'dd/MM/yyyy' }}
                · {{ p.qualification_libelle }}
              </p>
            </div>
            <div class="etats">
              <span class="etat" [class]="'etat-' + p.statut.toLowerCase()">
                {{ p.statut_libelle }}
              </span>
              @if (p.mise_a_pied_conservatoire) {
                <span class="etat conservatoire">Mise à pied conservatoire</span>
              }
            </div>
          </div>

          @if (!p.sanction && p.statut !== 'CLASSEE') {
            <p class="delai" [class.expire]="p.delai_depasse">
              <app-icon name="clock" [size]="13"/>
              @if (p.delai_depasse) {
                Délai de deux mois dépassé depuis le
                {{ p.date_limite_sanction | date: 'dd/MM/yyyy' }} — plus aucune
                sanction n'est possible.
              } @else {
                Sanction possible jusqu'au
                {{ p.date_limite_sanction | date: 'dd/MM/yyyy' }} (deux mois
                après l'établissement de la preuve).
              }
            </p>
          }

          @if (ouverte() === p.id) {
            <div class="corps">
              <h4>Faits reprochés</h4>
              <p class="texte">{{ p.faits }}</p>

              <h4>Explications du salarié</h4>
              @if (p.explications.length) {
                @for (e of p.explications; track e.id) {
                  <div class="explication">
                    <div class="meta">
                      {{ e.mode_libelle }} · {{ e.date_explication | date: 'dd/MM/yyyy' }}
                      @if (e.delegue_present) { · assisté d'un délégué }
                    </div>
                    @if (e.contenu) { <p class="texte">{{ e.contenu }}</p> }
                  </div>
                }
              } @else {
                <p class="manque">
                  Aucune explication recueillie. L'article 58 les exige avant
                  toute sanction — le refus de s'expliquer se consigne aussi.
                </p>
              }

              @if (p.sanction; as s) {
                <h4>Sanction</h4>
                <div class="sanction">
                  <strong>{{ s.type_libelle }}</strong>
                  @if (s.duree_jours) { — {{ s.duree_jours }} jour(s) }
                  <div class="meta">
                    Prononcée par {{ s.prononcee_par_nom }} le
                    {{ s.date_prononce | date: 'dd/MM/yyyy' }}
                  </div>
                  <p class="texte">{{ s.motif }}</p>
                  @if (!s.formalites_completes) {
                    <p class="manque">
                      Formalités incomplètes :
                      @if (!s.date_notification) { signification au salarié }
                      @if (!s.date_notification && !s.date_inspection_travail) { et }
                      @if (!s.date_inspection_travail) { ampliation à l'Inspection du Travail }
                      restent à faire.
                    </p>
                    @if (peutInstruire()) {
                      <button class="btn petit fantome" (click)="formalites(p, $event)">
                        Enregistrer les formalités (aujourd'hui)
                      </button>
                    }
                  }
                </div>
              }

              @if (p.motif_classement) {
                <h4>Classement</h4>
                <p class="texte">{{ p.motif_classement }}</p>
              }

              <div class="actions" (click)="$event.stopPropagation()">
                @if (estConcerne(p) && p.statut !== 'SANCTIONNEE' && p.statut !== 'CLASSEE') {
                  <button class="btn petit" (click)="ouvrirExplication(p)">
                    Fournir mes explications
                  </button>
                }
                @if (peutInstruire() && !p.sanction && p.statut !== 'CLASSEE') {
                  <button class="btn petit fantome" (click)="ouvrirExplication(p)">
                    Consigner des explications
                  </button>
                  <button class="btn petit fantome" (click)="classer(p)">
                    Classer sans suite
                  </button>
                }
                @if (peutPrononcer() && !p.sanction && p.statut !== 'CLASSEE') {
                  <button class="btn petit rouge"
                          [disabled]="!p.explications_recueillies || p.delai_depasse"
                          [title]="raisonBlocage(p)"
                          (click)="ouvrirSanction(p)">
                    Prononcer une sanction
                  </button>
                }
              </div>
            </div>
          }
        </article>
      }
    </div>
  } @else {
    <div class="carte vide">Aucun dossier disciplinaire.</div>
  }

  @if (formulaireOuvert()) {
    <div class="voile" (click)="formulaireOuvert.set(false)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Ouvrir un dossier</h3>
        <label>Salarié</label>
        <select [(ngModel)]="salarie">
          <option [ngValue]="null">— choisir —</option>
          @for (u of personnel(); track u.id) {
            <option [ngValue]="u.id">{{ u.nom_complet }}</option>
          }
        </select>
        <label>Faits reprochés</label>
        <textarea rows="3" [(ngModel)]="faits"></textarea>
        <div class="deux-champs">
          <div><label>Date des faits</label><input type="date" [(ngModel)]="dateFaits"/></div>
          <div><label>Preuve établie le</label><input type="date" [(ngModel)]="datePreuve"/></div>
        </div>
        <p class="encart">
          Le délai de deux mois court à compter de l'établissement de la
          preuve, pas des faits : une faute découverte tardivement reste
          sanctionnable.
        </p>
        <label>Qualification</label>
        <select [(ngModel)]="qualification">
          <option value="FAUTE_SIMPLE">Faute professionnelle</option>
          <option value="FAUTE_LOURDE">Faute lourde</option>
        </select>
        @if (qualification === 'FAUTE_LOURDE' && bareme(); as b) {
          <label>Faute lourde invoquée</label>
          <select [(ngModel)]="fauteLourde">
            <option value="">— non listée (décrite dans les faits) —</option>
            @for (f of b.fautes_lourdes; track f.code) {
              <option [value]="f.code">{{ f.libelle }}</option>
            }
          </select>
        }
        <label class="case">
          <input type="checkbox" [(ngModel)]="miseAPied"/>
          Mise à pied conservatoire (mesure d'attente, pas une sanction)
        </label>
        <div class="pied">
          <button class="btn fantome" (click)="formulaireOuvert.set(false)">Annuler</button>
          <button class="btn cta" (click)="ouvrirDossier()">Ouvrir</button>
        </div>
      </div>
    </div>
  }

  @if (explicationOuverte(); as p) {
    <div class="voile" (click)="explicationOuverte.set(null)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Explications</h3>
        <p class="encart">
          L'article 58 les admet écrites ou verbales, le salarié pouvant se
          faire assister d'un délégué du personnel. Un refus de s'expliquer
          se consigne également.
        </p>
        <label>Mode</label>
        <select [(ngModel)]="modeExplication">
          <option value="ECRITE">Écrites</option>
          <option value="VERBALE">Verbales, consignées</option>
          <option value="REFUS">Refus de s'expliquer</option>
        </select>
        @if (modeExplication !== 'REFUS') {
          <label>Teneur</label>
          <textarea rows="4" [(ngModel)]="contenuExplication"></textarea>
        }
        <label class="case">
          <input type="checkbox" [(ngModel)]="deleguePresent"/>
          Salarié assisté d'un délégué du personnel
        </label>
        <div class="pied">
          <button class="btn fantome" (click)="explicationOuverte.set(null)">Annuler</button>
          <button class="btn cta" (click)="consigner(p)">Consigner</button>
        </div>
      </div>
    </div>
  }

  @if (sanctionOuverte(); as p) {
    <div class="voile" (click)="sanctionOuverte.set(null)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Prononcer une sanction</h3>
        <label>Sanction (article 58)</label>
        <select [(ngModel)]="typeSanction">
          @for (s of sanctionsPossibles(p); track s.code) {
            <option [value]="s.code">{{ s.libelle }}</option>
          }
        </select>
        @if (sanctionChoisie(); as s) {
          @if (s.jours_min !== null) {
            <label>Durée (jours)</label>
            <input type="number" [(ngModel)]="dureeJours"
                   [min]="s.jours_min" [max]="s.jours_max"/>
            <p class="encart">
              L'article 58 borne cette sanction à
              {{ s.jours_min }}–{{ s.jours_max }} jours.
            </p>
          }
        }
        <label>Motivation (écrite, obligatoire)</label>
        <textarea rows="3" [(ngModel)]="motifSanction"></textarea>
        <p class="encart">
          La décision devra être signifiée au salarié, et ampliation
          adressée à l'Inspecteur du Travail du ressort.
        </p>
        <div class="pied">
          <button class="btn fantome" (click)="sanctionOuverte.set(null)">Annuler</button>
          <button class="btn rouge" (click)="prononcer(p)">Prononcer</button>
        </div>
      </div>
    </div>
  }
  `,
  styles: [`
    .tete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.4rem; }
    .sous { color: var(--txt-2); margin-top: -.3rem; font-size: .88rem; }
    .liste { display: flex; flex-direction: column; gap: .8rem; }
    .dossier { background: #fff; border: 1px solid var(--bord); border-left: 3px solid var(--bord);
      border-radius: var(--r); padding: 1rem 1.1rem; box-shadow: var(--ombre);
      cursor: pointer; transition: border-color var(--t); }
    .dossier:hover { border-color: var(--bleu); }
    .dossier.urgent { border-left-color: #b42318; }
    .bandeau { display: flex; justify-content: space-between; align-items: flex-start;
      gap: 1rem; flex-wrap: wrap; }
    .dossier h3 { margin: 0; font-size: .98rem; color: var(--navy); }
    .dossier h4 { margin: 1rem 0 .3rem; font-size: .82rem; color: var(--navy); }
    .meta { font-size: .76rem; color: var(--txt-2); margin: .2rem 0 0; }
    .texte { font-size: .86rem; line-height: 1.55; white-space: pre-wrap; margin: .2rem 0 0; }
    .etats { display: flex; gap: .35rem; flex-wrap: wrap; }
    .etat { padding: .2rem .55rem; border-radius: 999px; font-size: .72rem; font-weight: 600; }
    .etat-ouverte { background: #fef3c7; color: #92400e; }
    .etat-explications_demandees { background: #ffedd5; color: #9a3412; }
    .etat-explications_fournies { background: #dbeafe; color: #1e40af; }
    .etat-sanctionnee { background: #fee2e2; color: #991b1b; }
    .etat-classee { background: #dcfce7; color: #166534; }
    .conservatoire { background: #ede9fe; color: #5b21b6; }

    .delai { display: flex; align-items: center; gap: .4rem; font-size: .78rem;
      color: var(--txt-2); margin: .6rem 0 0; }
    .delai.expire { color: #b42318; font-weight: 600; }

    .corps { margin-top: .9rem; padding-top: .9rem; border-top: 1px solid var(--bord); }
    .explication { padding: .6rem .8rem; background: #f8fafc; border-radius: 8px;
      margin-bottom: .5rem; }
    .sanction { padding: .8rem .9rem; background: #fef2f2; border: 1px solid #fecaca;
      border-radius: 8px; font-size: .88rem; }
    .manque { font-size: .8rem; color: #b45309; background: #fffbeb;
      border: 1px solid #fde68a; border-radius: 8px; padding: .6rem .7rem; margin: .5rem 0 0; }
    .actions { display: flex; gap: .5rem; margin-top: 1rem; flex-wrap: wrap; }
    .btn.petit { padding: .35rem .8rem; font-size: .8rem; }
    .btn.rouge { background: #b42318; color: #fff; }
    .btn.rouge:disabled { background: #fca5a5; cursor: not-allowed; }
    .btn.fantome { background: none; border: 1px solid var(--bord); color: var(--txt); }

    .vide { text-align: center; color: var(--txt-2); padding: 2.5rem 1rem; font-size: .9rem; }
    .voile { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex;
      align-items: center; justify-content: center; z-index: 60; padding: 1rem; }
    .modale { background: #fff; border-radius: var(--r); padding: 1.5rem; width: 100%;
      max-width: 480px; max-height: 90vh; overflow-y: auto; box-shadow: var(--ombre-md); }
    .modale h3 { margin: 0 0 1rem; color: var(--navy); }
    .modale label { display: block; font-size: .8rem; font-weight: 600; color: var(--txt-2);
      margin: .8rem 0 .3rem; }
    .modale label.case { display: flex; align-items: center; gap: .5rem; font-weight: 400; }
    .modale label.case input { width: auto; }
    .modale input, .modale select, .modale textarea { width: 100%; padding: .6rem .7rem;
      border: 1px solid var(--bord); border-radius: 8px; font-size: .9rem; font-family: inherit; }
    .deux-champs { display: grid; grid-template-columns: 1fr 1fr; gap: .8rem; }
    .encart { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;
      padding: .7rem .8rem; font-size: .82rem; color: #1e40af; margin: .7rem 0 0; line-height: 1.5; }
    .pied { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.4rem; }
  `],
})
export class DisciplineComponent implements OnInit {
  procedures = signal<ProcedureDisciplinaire[]>([]);
  bareme = signal<BaremeDisciplinaire | null>(null);
  personnel = signal<any[]>([]);
  ouverte = signal<number | null>(null);

  formulaireOuvert = signal(false);
  explicationOuverte = signal<ProcedureDisciplinaire | null>(null);
  sanctionOuverte = signal<ProcedureDisciplinaire | null>(null);

  salarie: number | null = null;
  faits = '';
  dateFaits = '';
  datePreuve = '';
  qualification = 'FAUTE_SIMPLE';
  fauteLourde = '';
  miseAPied = false;

  modeExplication = 'ECRITE';
  contenuExplication = '';
  deleguePresent = false;

  typeSanction = 'AVERTISSEMENT';
  dureeJours: number | null = null;
  motifSanction = '';

  constructor(
    private service: DisciplineService,
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute,
    public auth: AuthService,
  ) {
    inject(NavigationService).vuesLocales(this.ouverte, this.formulaireOuvert);
  }

  ngOnInit(): void {
    // Le salarié arrive ici par la notification de son dossier : l'ouvrir
    // d'emblée lui évite de le chercher dans une liste.
    const cible = Number(this.route.snapshot.queryParamMap.get('id'));
    if (cible) this.ouverte.set(cible);

    this.charger();
    this.service.bareme().subscribe((b) => this.bareme.set(b));
    if (this.peutInstruire()) {
      this.api.utilisateurs().subscribe(
        (r: any) => this.personnel.set(r.results ?? []));
    }
  }

  charger(): void {
    this.service.liste().subscribe(
      (r) => this.procedures.set((r.results ?? (r as any) ?? []) as ProcedureDisciplinaire[]));
  }

  peutInstruire(): boolean {
    return this.auth.aRole('RH', 'DIRECTEUR', 'ADMINISTRATEUR');
  }

  peutPrononcer(): boolean {
    return this.auth.aRole('DIRECTEUR', 'ADMINISTRATEUR');
  }

  estConcerne(p: ProcedureDisciplinaire): boolean {
    return p.salarie === this.auth.utilisateur()?.id;
  }

  /** Explique pourquoi le bouton est inactif, plutôt que de le laisser muet. */
  raisonBlocage(p: ProcedureDisciplinaire): string {
    if (p.delai_depasse) {
      return "Le délai de deux mois de l'article 58 est dépassé.";
    }
    if (!p.explications_recueillies) {
      return "Le salarié doit d'abord s'être expliqué — ou son refus être consigné.";
    }
    return '';
  }

  ouvrir(p: ProcedureDisciplinaire): void {
    this.ouverte.set(this.ouverte() === p.id ? null : p.id);
  }

  sanctionsPossibles(p: ProcedureDisciplinaire) {
    const toutes = this.bareme()?.sanctions ?? [];
    // Le licenciement sans préavis suppose une faute lourde : ne pas le
    // proposer ailleurs évite un refus après coup.
    return toutes.filter(
      (s) => !s.faute_lourde_requise || p.qualification === 'FAUTE_LOURDE');
  }

  sanctionChoisie() {
    return (this.bareme()?.sanctions ?? []).find((s) => s.code === this.typeSanction);
  }

  ouvrirFormulaire(): void {
    this.salarie = null;
    this.faits = '';
    this.dateFaits = this.datePreuve = new Date().toISOString().slice(0, 10);
    this.qualification = 'FAUTE_SIMPLE';
    this.fauteLourde = '';
    this.miseAPied = false;
    this.formulaireOuvert.set(true);
  }

  ouvrirDossier(): void {
    if (!this.salarie || !this.faits.trim()) {
      this.toast.erreur('Salarié et faits sont obligatoires.');
      return;
    }

    this.service.ouvrir({
      salarie: this.salarie,
      faits: this.faits,
      date_faits: this.dateFaits,
      date_preuve: this.datePreuve,
      qualification: this.qualification,
      faute_lourde_invoquee: this.fauteLourde,
      mise_a_pied_conservatoire: this.miseAPied,
    }).subscribe({
      next: () => {
        this.formulaireOuvert.set(false);
        this.toast.succes('Dossier ouvert ; le salarié en est informé.');
        this.charger();
      },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Ouverture impossible.'),
    });
  }

  ouvrirExplication(p: ProcedureDisciplinaire): void {
    this.modeExplication = 'ECRITE';
    this.contenuExplication = '';
    this.deleguePresent = false;
    this.explicationOuverte.set(p);
  }

  consigner(p: ProcedureDisciplinaire): void {
    this.service.expliquer(p.id, {
      mode: this.modeExplication,
      contenu: this.contenuExplication,
      delegue_present: this.deleguePresent,
    }).subscribe({
      next: () => {
        this.explicationOuverte.set(null);
        this.toast.succes('Explications consignées.');
        this.charger();
      },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Consignation impossible.'),
    });
  }

  ouvrirSanction(p: ProcedureDisciplinaire): void {
    this.typeSanction = this.sanctionsPossibles(p)[0]?.code ?? 'AVERTISSEMENT';
    this.dureeJours = null;
    this.motifSanction = '';
    this.sanctionOuverte.set(p);
  }

  prononcer(p: ProcedureDisciplinaire): void {
    if (!this.motifSanction.trim()) {
      this.toast.erreur('La sanction doit être motivée par écrit.');
      return;
    }

    this.service.prononcer(p.id, {
      type_sanction: this.typeSanction,
      motif: this.motifSanction,
      duree_jours: this.dureeJours,
    }).subscribe({
      next: () => {
        this.sanctionOuverte.set(null);
        this.toast.succes('Sanction prononcée ; reste à la signifier.');
        this.charger();
      },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Prononcé refusé.'),
    });
  }

  formalites(p: ProcedureDisciplinaire, evenement: Event): void {
    evenement.stopPropagation();
    const aujourdhui = new Date().toISOString().slice(0, 10);

    this.service.formalites(p.id, {
      date_notification: aujourdhui,
      date_inspection_travail: aujourdhui,
    }).subscribe({
      next: () => { this.toast.succes('Formalités enregistrées.'); this.charger(); },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Enregistrement impossible.'),
    });
  }

  classer(p: ProcedureDisciplinaire): void {
    const motif = window.prompt('Motif du classement sans suite :');
    if (!motif) return;

    this.service.classer(p.id, motif).subscribe({
      next: () => { this.toast.succes('Dossier classé.'); this.charger(); },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Classement impossible.'),
    });
  }
}
