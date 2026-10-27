import { DestroyRef, Injectable, WritableSignal, inject } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Bouton « Retour » commun à toutes les pages.
 *
 * Ferme d'abord la vue ouverte *dans* la page (formulaire, fiche de détail,
 * album…), comme on reviendrait sur l'action précédente ; une fois la page
 * revenue à son état initial, revient à la page précédente.
 *
 * Tient l'historique des pages visitées *dans* l'application, à l'image de
 * celui du navigateur : le bouton y revient d'un cran. Sans page précédente
 * dans l'application (lien ouvert depuis un e-mail, page rechargée, arrivée
 * juste après la connexion), il mène à la page d'accueil plutôt que de
 * quitter SMART HUB ou de retomber sur l'écran de connexion.
 */
export interface VueLocale {
  ouverte: () => boolean;
  fermer: () => void;
}

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private router = inject(Router);
  private location = inject(Location);
  private auth = inject(AuthService);

  private historique: string[] = [];
  private vues: VueLocale[] = [];
  /** La navigation en cours vient-elle des boutons précédent/suivant du navigateur ? */
  private parNavigateur = false;

  constructor() {
    this.enregistrer(this.router.url, false);
    this.router.events.subscribe((e) => {
      if (e instanceof NavigationStart) this.parNavigateur = e.navigationTrigger === 'popstate';
      if (e instanceof NavigationEnd) this.enregistrer(e.urlAfterRedirects, this.parNavigateur);
    });
  }

  private enregistrer(url: string, retour: boolean): void {
    if (!url || url === '/' || url.startsWith('/connexion') || url.startsWith('/auth')) return;
    if (retour && this.historique.at(-2) === url) {
      this.historique.pop();
    } else if (this.historique.at(-1) !== url) {
      this.historique.push(url);
    }
  }

  /**
   * Déclare les vues internes d'une page, de la plus générale à la plus
   * imbriquée (ex. : fiche de détail, puis formulaire). À appeler depuis le
   * constructeur du composant : elles sont oubliées à sa destruction.
   *
   * Un signal suffit le plus souvent — ouverte s'il vaut autre chose que
   * null/false, refermée en le remettant à null (ou false).
   */
  vuesLocales(...vues: (WritableSignal<any> | VueLocale)[]): void {
    const declarees = vues.map((v) => (typeof v === 'function' ? this.depuisSignal(v) : v));
    this.vues.push(...declarees);
    inject(DestroyRef).onDestroy(() => {
      this.vues = this.vues.filter((v) => !declarees.includes(v));
    });
  }

  private depuisSignal(signal: WritableSignal<any>): VueLocale {
    return {
      ouverte: () => signal() !== null && signal() !== undefined && signal() !== false,
      fermer: () => signal.set(typeof signal() === 'boolean' ? false : null),
    };
  }

  private vueOuverte(): VueLocale | undefined {
    return [...this.vues].reverse().find((v) => v.ouverte());
  }

  /** Masqué sur la page d'accueil, sauf si une vue y est ouverte. */
  estVisible(): boolean {
    return this.router.url.split('?')[0] !== this.auth.pageAccueil() || !!this.vueOuverte();
  }

  retour(): void {
    const vue = this.vueOuverte();
    if (vue) {
      vue.fermer();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (this.historique.length > 1) {
      this.location.back();
    } else {
      this.historique = [];
      this.router.navigateByUrl(this.auth.pageAccueil());
    }
  }
}
