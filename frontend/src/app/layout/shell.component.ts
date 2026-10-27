import { Component, OnInit, HostListener, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ApiService } from '../core/api.service';
import { NotificationsService } from '../core/notifications.service';
import { NavigationService } from '../core/navigation.service';
import { IconComponent } from '../shared/icon.component';
import { ToastsComponent } from '../shared/toasts.component';
import { DialogueComponent } from '../shared/dialogue.component';
import { AideChatbotComponent } from '../shared/aide-chatbot.component';
import { MODULES_MOYENS_GENERAUX, MODULES_VIE_INTERNE, ModuleMetier, CHEMIN_PAR_TYPE_DOCUMENT } from '../core/modules-metier';
import { NotificationItem } from '../core/models';

@Component({
  selector: 'app-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, IconComponent, ToastsComponent, DialogueComponent, AideChatbotComponent],
  template: `
  <app-toasts />
  <app-dialogue />
  <app-aide-chatbot />
  <div class="layout">
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-mark">S</span>
        <div class="logo-txt">SMART<small>HUB</small></div>
      </div>
      <nav>
        @if (!auth.aRole('AGENT_SECURITE')) {
          <div class="nav-titre">Réservations &amp; audiences</div>
          <a routerLink="/tableau-de-bord" routerLinkActive="actif"><app-icon name="dashboard"/> Tableau de bord</a>
          <a routerLink="/calendrier" routerLinkActive="actif"><app-icon name="calendar"/> Calendrier des salles</a>
          <a routerLink="/reserver" routerLinkActive="actif"><app-icon name="plus"/> Nouvelle réservation</a>
          <a routerLink="/recurrence" routerLinkActive="actif"><app-icon name="repeat"/> Réservation récurrente</a>
          <a routerLink="/mes-reservations" routerLinkActive="actif"><app-icon name="list"/> Mes réservations</a>
          @if (auth.aRole('SECRETAIRE','ADMINISTRATEUR')) {
            <a routerLink="/validation" routerLinkActive="actif"><app-icon name="checkCircle"/> Validation</a>
            <a routerLink="/salles" routerLinkActive="actif"><app-icon name="building"/> Salles</a>
          }
          <a routerLink="/audiences" routerLinkActive="actif"><app-icon name="users"/> Audiences</a>
        }

        @if (modulesVieInterne().length) {
          <div class="nav-titre">Vie interne</div>
          @for (m of modulesVieInterne(); track m.lien) {
            <a [routerLink]="m.lien" routerLinkActive="actif"><app-icon [name]="m.icone"/> {{ m.libelle }}</a>
          }
        }

        @if (modulesVisibles().length) {
          <div class="nav-titre">Moyens généraux</div>
          @for (m of modulesVisibles(); track m.lien) {
            <a [routerLink]="m.lien" routerLinkActive="actif"><app-icon [name]="m.icone"/> {{ m.libelle }}</a>
          }
        }

        @if (auth.aRole('ADMINISTRATEUR')) {
          <div class="nav-titre">Administration</div>
          <a routerLink="/filiales" routerLinkActive="actif"><app-icon name="building"/> Filiales</a>
          <a routerLink="/utilisateurs" routerLinkActive="actif"><app-icon name="settings"/> Utilisateurs</a>
          <a routerLink="/journal" routerLinkActive="actif"><app-icon name="doc"/> Journal d'audit</a>
          <a routerLink="/administration" routerLinkActive="actif"><app-icon name="server"/> Administration</a>
        }
      </nav>
      <div class="sidebar-pied">
        <div class="dot"></div> Système en ligne
      </div>
    </aside>

    <div class="principal">
      <header class="topbar">
        <div class="fil">{{ auth.utilisateur()?.filiale_nom || 'Groupe OSEOR' }}</div>
        <div class="droite">
          <button class="cloche" (click)="basculerNotifs()" aria-label="Notifications">
            <app-icon name="bell" [size]="20"/>
            @if (notifs.nonLues() > 0) {
              <span class="pastille">{{ notifs.nonLues() }}</span>
            }
          </button>
          <a class="user" routerLink="/profil" title="Mon profil">
            @if (auth.utilisateur()?.photo_profil) {
              <img class="avatar" [src]="auth.utilisateur()!.photo_profil" alt="" />
            } @else {
              <span class="avatar">{{ initiales() }}</span>
            }
            <div class="user-txt">
              <strong>{{ auth.utilisateur()?.nom_complet }}</strong>
              <small>{{ auth.utilisateur()?.role_libelle }}</small>
            </div>
          </a>
          <button class="btn secondaire petit" (click)="deconnexion()"><app-icon name="logout" [size]="15"/> Quitter</button>
        </div>

        @if (panneauNotifs()) {
          <div class="panneau-notifs anim-entree">
            <div class="entete">
              <strong>Notifications</strong>
              <a (click)="notifs.toutMarquerLu()">Tout marquer lu</a>
            </div>
            <div class="stagger">
              @for (n of notifs.dernieres(); track n.id) {
                <div class="notif" [class.nonlu]="!n.lu" [class]="'t-' + n.type.toLowerCase()"
                     (click)="ouvrirNotif(n)">
                  <div class="puce"></div>
                  <div>
                    <div class="t">{{ n.titre }}</div>
                    <div class="m">{{ n.message }}</div>
                  </div>
                </div>
              } @empty {
                <div class="vide">Aucune notification</div>
              }
            </div>
          </div>
        }
      </header>

      <main class="contenu">
        <!-- Retour commun à toutes les pages : ferme la vue ouverte, sinon page précédente. -->
        @if (nav.estVisible()) {
          <button type="button" class="btn-retour" (click)="nav.retour()">
            <app-icon name="arrowLeft" [size]="15"/> Retour
          </button>
        }
        <router-outlet />
      </main>
    </div>
  </div>
  `,
  styles: [`
    .layout { display: flex; min-height: 100vh; }
    .sidebar {
      width: 248px; background: linear-gradient(180deg, var(--navy) 0%, var(--navy-900) 100%);
      color: #fff; flex-shrink: 0; display: flex; flex-direction: column; padding: 1.2rem 0;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent;
    }
    .sidebar::-webkit-scrollbar { width: 6px; }
    .sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.25); border-radius: 999px; }
    .logo { display: flex; align-items: center; gap: .7rem; padding: 0 1.4rem 1.4rem; }
    .logo-mark { width: 38px; height: 38px; border-radius: 10px; background: var(--accent);
      display: flex; align-items: center; justify-content: center; font-family: var(--police-titre);
      font-weight: 700; font-size: 1.2rem; box-shadow: 0 4px 12px rgba(249,115,22,.4); }
    .logo-txt { font-family: var(--police-titre); font-size: 1.15rem; font-weight: 700;
      display: flex; flex-direction: column; line-height: 1.05; }
    .logo-txt small { font-size: .62rem; font-weight: 400; opacity: .65; letter-spacing: .18em; }
    nav { display: flex; flex-direction: column; gap: 2px; padding: 0 .7rem; }
    .nav-titre { font-size: .68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em;
      color: rgba(255,255,255,.38); padding: .9rem .8rem .3rem; }
    .nav-titre:first-child { padding-top: 0; }
    nav a {
      color: #cdd9ee; padding: .65rem .8rem; font-size: .88rem; font-weight: 500;
      border-radius: 9px; cursor: pointer; display: flex; align-items: center; gap: .7rem;
      transition: background var(--t), color var(--t);
    }
    nav a app-icon { opacity: .85; }
    nav a:hover { background: rgba(255,255,255,.08); color: #fff; }
    nav a.actif { background: rgba(255,255,255,.14); color: #fff; }
    nav a.actif app-icon { color: var(--accent); opacity: 1; }
    .sidebar-pied { margin-top: auto; padding: 1rem 1.4rem 0; font-size: .76rem; color: #93c5fd;
      display: flex; align-items: center; gap: .5rem; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80;
      box-shadow: 0 0 0 3px rgba(74,222,128,.25); animation: pulseDot 2s infinite; }
    @keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: .5; } }

    .principal { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .topbar {
      background: rgba(255,255,255,.85); backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--bord); padding: .7rem 1.6rem;
      display: flex; justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 30;
    }
    .fil { font-size: .82rem; font-weight: 600; color: var(--txt-2); }
    .droite { display: flex; align-items: center; gap: 1.1rem; }
    .cloche { position: relative; background: none; border: none; cursor: pointer; color: var(--txt-2);
      width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center;
      justify-content: center; transition: background var(--t), color var(--t); }
    .cloche:hover { background: #eff6ff; color: var(--navy); }
    .pastille { position: absolute; top: 4px; right: 4px; background: var(--accent); color: #fff;
      border-radius: 999px; font-size: .66rem; min-width: 16px; height: 16px; padding: 0 4px;
      display: flex; align-items: center; justify-content: center; font-weight: 700; }
    .user { display: flex; align-items: center; gap: .6rem; cursor: pointer; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--navy); color: #fff;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: .82rem;
      object-fit: cover; flex-shrink: 0; }
    .user-txt { display: flex; flex-direction: column; line-height: 1.15; }
    .user-txt small { color: var(--txt-3); font-size: .76rem; }
    .panneau-notifs {
      position: absolute; top: 60px; right: 1.6rem; width: 360px; background: #fff;
      border: 1px solid var(--bord); border-radius: 14px; box-shadow: var(--ombre-lg);
      z-index: 50; max-height: 440px; overflow-y: auto;
    }
    .panneau-notifs .entete { display: flex; justify-content: space-between; align-items: center;
      padding: .9rem 1.1rem; border-bottom: 1px solid var(--bord); position: sticky; top: 0; background: #fff; }
    .panneau-notifs .entete a { font-size: .78rem; }
    .notif { padding: .75rem 1.1rem; border-bottom: 1px solid #f1f5f9; cursor: pointer;
      display: flex; gap: .7rem; transition: background var(--t); }
    .notif:hover { background: #f8fafc; }
    .notif.nonlu { background: #f5f9ff; }
    .notif .puce { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; background: var(--bleu); }
    .notif.t-success .puce { background: var(--vert); }
    .notif.t-warning .puce { background: var(--accent); }
    .notif.t-error .puce { background: var(--rouge); }
    .notif .t { font-weight: 600; font-size: .85rem; }
    .notif .m { font-size: .8rem; color: var(--txt-2); }
    .contenu { padding: 1.8rem; flex: 1; }
    .btn-retour {
      display: inline-flex; align-items: center; gap: .4rem; margin-bottom: 1rem;
      padding: .38rem .85rem; border: 1px solid var(--bord); border-radius: var(--r-sm);
      background: var(--surface); color: var(--navy); font-family: inherit;
      font-size: .82rem; font-weight: 600; cursor: pointer;
      transition: background .15s, border-color .15s;
    }
    .btn-retour:hover { background: var(--bg); border-color: var(--bord-fort); }
    .btn-retour:focus-visible { outline: 2px solid var(--bleu); outline-offset: 2px; }
    @media (max-width: 720px) {
      .sidebar { width: 64px; }
      .logo-txt, nav a span, .sidebar-pied { display: none; }
      .user-txt { display: none; }
    }
  `],
})
export class ShellComponent implements OnInit {
  panneauNotifs = signal(false);

  constructor(
    public auth: AuthService,
    public notifs: NotificationsService,
    public nav: NavigationService,
    private api: ApiService,
    private router: Router,
  ) {}

  ngOnInit(): void { this.notifs.demarrer(); }

  /**
   * Un module sans `roles` est ouvert à tout le monde... sauf à l'agent de
   * sécurité : ce compte n'a qu'un seul usage (l'accueil des visiteurs), il
   * ne doit jamais hériter des modules « ouverts à tous » pensés pour les
   * employés du groupe.
   */
  private estVisiblePour(m: ModuleMetier): boolean {
    if (!m.roles) return !this.auth.aRole('AGENT_SECURITE');
    return this.auth.aRole(...m.roles);
  }

  modulesVisibles(): ModuleMetier[] {
    return MODULES_MOYENS_GENERAUX.filter((m) => this.estVisiblePour(m));
  }

  /**
   * Presque tous ouverts à chacun — congés, événements, galerie. La
   * discipline fait exception : elle n'apparaît qu'à ceux qui instruisent,
   * un salarié n'atteignant son propre dossier que par sa notification.
   */
  modulesVieInterne(): ModuleMetier[] {
    return MODULES_VIE_INTERNE.filter((m) => this.estVisiblePour(m));
  }

  /** Marque la notification lue puis navigue vers l'élément concerné, s'il y en a un. */
  ouvrirNotif(n: NotificationItem): void {
    this.notifs.marquerLue(n.id);
    if (!n.objet_id) return;
    this.panneauNotifs.set(false);

    switch (n.objet_type) {
      case 'Reservation':
        if (this.auth.aRole('SECRETAIRE', 'ADMINISTRATEUR')) {
          this.router.navigate(['/validation'], { queryParams: { id: n.objet_id } });
        } else {
          this.router.navigate(['/mes-reservations'], { queryParams: { id: n.objet_id } });
        }
        break;
      case 'Audience':
        this.router.navigate(['/audiences'], { queryParams: { id: n.objet_id } });
        break;
      case 'Document':
        this.api.document(n.objet_id).subscribe((d) => {
          const chemin = CHEMIN_PAR_TYPE_DOCUMENT[d.type_document];
          if (chemin) this.router.navigate([chemin], { queryParams: { id: n.objet_id } });
        });
        break;
      case 'Article':
        this.router.navigate(['/stocks'], { queryParams: { id: n.objet_id } });
        break;
      case 'Contrat':
        this.router.navigate(['/contrats'], { queryParams: { id: n.objet_id } });
        break;
      case 'DemandeConge':
        this.router.navigate(['/conges'], { queryParams: { id: n.objet_id } });
        break;
      case 'Caisse':
      case 'BonSortie':
        this.router.navigate(['/bon-sortie-caisse'], { queryParams: { id: n.objet_id } });
        break;
      case 'ProcedureDisciplinaire':
        // Seule voie d'accès du salarié à son propre dossier : l'entrée de
        // menu est réservée à ceux qui instruisent.
        this.router.navigate(['/discipline'], { queryParams: { id: n.objet_id } });
        break;
      case 'Visite':
        this.router.navigate(['/visiteurs'], { queryParams: { id: n.objet_id } });
        break;
    }
  }

  initiales(): string {
    const u = this.auth.utilisateur();
    if (!u) return '';
    return ((u.first_name?.[0] || '') + (u.last_name?.[0] || u.username?.[0] || '')).toUpperCase();
  }

  basculerNotifs(): void {
    const ouvert = !this.panneauNotifs();
    this.panneauNotifs.set(ouvert);
    if (ouvert) this.notifs.chargerListe();
  }

  /** Ferme le panneau de notifications quand on clique en dehors. */
  @HostListener('document:click', ['$event'])
  onClicDocument(e: MouseEvent): void {
    if (!this.panneauNotifs()) return;
    const cible = e.target as HTMLElement;
    if (cible.closest('.panneau-notifs') || cible.closest('.cloche')) return;
    this.panneauNotifs.set(false);
  }

  deconnexion(): void {
    this.notifs.arreter();
    this.auth.deconnexion();
    this.router.navigate(['/connexion']);
  }
}
