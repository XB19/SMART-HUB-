import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { EtatEntra } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { DatesNaissanceService, LigneDateNaissance } from '../../core/gestion.service';

@Component({
  selector: 'app-administration',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Administration générale</h1>
      <p class="sous-titre">Paramètres système réservés aux administrateurs</p>
    </div>
  </div>

  <div class="carte anim-entree">
    <div class="carte-entete">
      <div class="carte-titre">
        <app-icon name="server" [size]="18"/>
        <h3>Microsoft Entra ID</h3>
        @if (entra()?.actif) {
          <span class="badge validee">Configuré</span>
        } @else if (entra()) {
          <span class="badge rouge">Non configuré</span>
        }
      </div>
      <p class="carte-sous-titre">
        Annuaire Microsoft de l'entreprise : il sert à la connexion « Se connecter
        avec Microsoft » et au bouton « Synchroniser depuis Entra ID » de la page
        Utilisateurs. Les identifiants se règlent dans le fichier <code>.env</code>
        du serveur (<code>AZURE_TENANT_ID</code>, <code>AZURE_CLIENT_ID</code>,
        <code>AZURE_CLIENT_SECRET</code>), jamais depuis l'application.
      </p>
    </div>

    @if (chargement()) {
      <p class="txt-attente">Chargement…</p>
    } @else if (entra(); as e) {
      <dl class="valeurs">
        <dt>ID de l'annuaire (tenant)</dt>
        <dd>{{ e.tenant_id || '—' }}</dd>
        <dt>ID de l'application (client)</dt>
        <dd>{{ e.client_id || '—' }}</dd>
        <dt>URI de redirection à inscrire (type Web)</dt>
        <dd><code>{{ e.url_retour }}</code></dd>
      </dl>

      <p class="carte-sous-titre">
        Pour la synchronisation, l'application doit aussi avoir la permission
        Microsoft Graph <strong>User.Read.All</strong> (type « Application »),
        avec le consentement administrateur accordé dans Entra.
      </p>

      @if (message()) {
        <div class="alerte" [class.err]="!messageOk()" [class.ok]="messageOk()">
          <app-icon [name]="messageOk() ? 'checkCircle' : 'close'" [size]="16"/> {{ message() }}
        </div>
      }

      <div class="boutons">
        <button class="btn secondaire" (click)="tester()" [disabled]="test_en_cours() || !e.actif">
          @if (test_en_cours()) { <span class="spinner petit"></span> Test en cours… }
          @else { Tester la connexion }
        </button>
      </div>
    }
  </div>
  <div class="carte anim-entree espace">
    <div class="carte-entete">
      <div class="carte-titre">
        <app-icon name="cake" [size]="18"/>
        <h3>Dates de naissance</h3>
        <span class="badge" [class.validee]="renseignees() > 0">
          {{ renseignees() }} / {{ lignes().length }}
        </span>
      </div>
      <p class="carte-sous-titre">
        Les anniversaires du calendrier se déduisent de ces dates : sans
        elles, rien ne s'affiche et aucun rappel n'est envoyé. Chacun peut
        renseigner la sienne depuis son profil, mais peu le font — d'où
        cette saisie d'un bloc. Le champ reste facultatif : laissez vide
        pour qui ne souhaite pas la partager, videz-le pour effacer.
      </p>
    </div>

    @if (chargementDates()) {
      <p class="txt-attente">Chargement…</p>
    } @else {
      <input class="filtre" [(ngModel)]="recherche" placeholder="Filtrer par nom…"/>

      <div class="table-naissances">
        @for (l of lignesFiltrees(); track l.id) {
          <div class="ligne-nais">
            <div class="qui">
              <span class="nom">{{ l.nom_complet }}</span>
              @if (l.filiale) { <span class="fil">{{ l.filiale }}</span> }
            </div>
            <input type="date" [max]="aujourdhui"
                   [ngModel]="saisies[l.id] ?? ''"
                   (ngModelChange)="modifier(l.id, $event)"/>
          </div>
        } @empty {
          <p class="txt-attente">Aucun utilisateur ne correspond.</p>
        }
      </div>

      @if (messageDates()) {
        <div class="alerte" [class.err]="!messageDatesOk()" [class.ok]="messageDatesOk()">
          <app-icon [name]="messageDatesOk() ? 'checkCircle' : 'close'" [size]="16"/> {{ messageDates() }}
        </div>
      }

      <div class="boutons">
        <button class="btn vert" [disabled]="!modifiees() || envoiDates()"
                (click)="enregistrerDates()">
          @if (envoiDates()) { <span class="spinner petit"></span> Envoi… }
          @else { Enregistrer {{ modifiees() }} modification(s) }
        </button>
        @if (modifiees()) {
          <button class="btn" (click)="annulerDates()">Annuler les modifications</button>
        }
      </div>
    }
  </div>
  `,
  styles: [`
    .espace { margin-top: 1.2rem; }
    .filtre { width: 100%; border: 1px solid var(--bord); border-radius: 8px;
      padding: .55rem .7rem; font-size: .85rem; margin-bottom: .8rem; }
    .table-naissances { max-height: 420px; overflow-y: auto; border: 1px solid var(--bord);
      border-radius: 8px; }
    .ligne-nais { display: flex; justify-content: space-between; align-items: center;
      gap: 1rem; padding: .5rem .7rem; border-bottom: 1px solid var(--bord); }
    .ligne-nais:last-child { border-bottom: none; }
    .ligne-nais input { border: 1px solid var(--bord); border-radius: 8px;
      padding: .4rem .5rem; font-size: .82rem; }
    .qui { display: flex; flex-direction: column; }
    .nom { font-size: .87rem; }
    .fil { font-size: .74rem; color: var(--txt-2); }
    .badge.validee { background: #f0fdf4; color: #15803d; }
    .entete { display: flex; justify-content: space-between; align-items: flex-start; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }

    .carte-entete { margin-bottom: 1.2rem; }
    .carte-titre { display: flex; align-items: center; gap: .6rem; }
    .carte-titre h3 { margin: 0; }
    .carte-sous-titre { font-size: .82rem; color: var(--txt-2); margin: .5rem 0 0; line-height: 1.6; }

    .txt-attente { color: var(--txt-2); font-size: .85rem; }

    .valeurs { display: grid; grid-template-columns: max-content 1fr; gap: .45rem 1.2rem;
      margin: 0 0 1rem; font-size: .84rem; }
    .valeurs dt { font-weight: 600; color: var(--txt-2); }
    .valeurs dd { margin: 0; word-break: break-all; }
    @media (max-width: 640px) { .valeurs { grid-template-columns: 1fr; } }

    .alerte { display: flex; align-items: center; gap: .5rem; margin: .8rem 0; padding: .6rem .9rem;
      border-radius: 8px; font-size: .83rem; }
    .alerte.err { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .alerte.ok { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }

    .boutons { display: flex; gap: .6rem; margin-top: .6rem; }
  `],
})
export class AdministrationComponent implements OnInit {
  entra = signal<EtatEntra | null>(null);
  chargement = signal(true);
  test_en_cours = signal(false);
  message = signal('');
  messageOk = signal(false);

  // ------------------------------------------------ dates de naissance
  lignes = signal<LigneDateNaissance[]>([]);
  chargementDates = signal(true);
  envoiDates = signal(false);
  messageDates = signal('');
  messageDatesOk = signal(false);
  recherche = '';
  /** Saisie en cours, indexée par identifiant. */
  saisies: Record<number, string> = {};
  private initiales: Record<number, string> = {};

  readonly aujourdhui = new Date().toISOString().slice(0, 10);

  lignesFiltrees(): LigneDateNaissance[] {
    const q = this.recherche.trim().toLowerCase();
    if (!q) return this.lignes();
    return this.lignes().filter((l) => l.nom_complet.toLowerCase().includes(q));
  }

  renseignees(): number {
    return Object.values(this.saisies).filter((v) => !!v).length;
  }

  /** N'envoyer que ce qui a bougé : le serveur ne réécrit pas le reste. */
  private changements(): Record<string, string | null> {
    const sortie: Record<string, string | null> = {};
    for (const [id, valeur] of Object.entries(this.saisies)) {
      if ((this.initiales[+id] ?? '') !== valeur) {
        sortie[id] = valeur || null;
      }
    }
    return sortie;
  }

  modifiees(): number {
    return Object.keys(this.changements()).length;
  }

  modifier(id: number, valeur: string): void {
    this.saisies = { ...this.saisies, [id]: valeur ?? '' };
  }

  private chargerDates(): void {
    this.chargementDates.set(true);
    this.dates.liste().subscribe({
      next: (lignes) => {
        this.lignes.set(lignes);
        this.saisies = {};
        this.initiales = {};
        for (const l of lignes) {
          this.saisies[l.id] = l.date_naissance ?? '';
          this.initiales[l.id] = l.date_naissance ?? '';
        }
        this.chargementDates.set(false);
      },
      error: () => this.chargementDates.set(false),
    });
  }

  annulerDates(): void {
    this.saisies = { ...this.initiales };
  }

  enregistrerDates(): void {
    const changements = this.changements();
    if (!Object.keys(changements).length) return;

    this.envoiDates.set(true);
    this.messageDates.set('');

    this.dates.enregistrer(changements).subscribe({
      next: (r) => {
        this.envoiDates.set(false);
        this.initiales = { ...this.saisies };
        this.messageDatesOk.set(true);
        this.messageDates.set(`${r.mis_a_jour} date(s) enregistrée(s).`);
      },
      error: (e) => {
        this.envoiDates.set(false);
        this.messageDatesOk.set(false);
        this.messageDates.set(e?.error?.detail || "Échec de l'enregistrement.");
      },
    });
  }

  constructor(private api: ApiService,
    private dates: DatesNaissanceService) {}

  ngOnInit(): void {
    this.chargerDates();
    this.charger();
  }

  charger(): void {
    this.chargement.set(true);
    this.api.etatEntra().subscribe({
      next: (e) => { this.entra.set(e); this.chargement.set(false); },
      error: () => this.chargement.set(false),
    });
  }

  tester(): void {
    this.message.set('');
    this.test_en_cours.set(true);
    this.api.testerEntra().subscribe({
      next: (r) => {
        this.test_en_cours.set(false);
        this.messageOk.set(true);
        this.message.set(r.detail);
      },
      error: (e) => {
        this.test_en_cours.set(false);
        this.messageOk.set(false);
        this.message.set(e?.error?.detail || 'Échec du test de connexion.');
      },
    });
  }
}
