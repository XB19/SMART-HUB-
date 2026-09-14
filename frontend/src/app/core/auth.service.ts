import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Utilisateur } from './models';

export interface EtatSSO {
  actif: boolean;
  url_connexion: string;
}

const ACCESS = 'oseor_access';
const REFRESH = 'oseor_refresh';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = environment.apiUrl;

  readonly utilisateur = signal<Utilisateur | null>(null);
  readonly estConnecte = computed(() => this.utilisateur() !== null);
  readonly role = computed(() => this.utilisateur()?.role ?? null);

  constructor(private http: HttpClient) {}

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS);
  }
  get refreshToken(): string | null {
    return localStorage.getItem(REFRESH);
  }

  connexion(username: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.api}/auth/token/`, { username, password }).pipe(
      tap((r) => {
        localStorage.setItem(ACCESS, r.access);
        localStorage.setItem(REFRESH, r.refresh);
      })
    );
  }

  /** Stocke une paire de jetons obtenue autrement que par le formulaire. */
  stockerTokens(access: string, refresh: string): void {
    localStorage.setItem(ACCESS, access);
    localStorage.setItem(REFRESH, refresh);
  }

  /**
   * Le SSO Microsoft est-il configuré sur cette instance ?
   *
   * La page de connexion le demande avant d'afficher le bouton : en
   * proposer un qui mènerait à une erreur de configuration serait pire
   * que de ne pas le proposer.
   */
  etatSSO(): Observable<EtatSSO> {
    return this.http.get<EtatSSO>(`${this.api}/auth/sso/etat/`);
  }

  /**
   * Échange le code du retour Microsoft contre une paire de jetons.
   *
   * Le code voyage dans l'URL, les jetons non : ils s'inscriraient sinon
   * dans l'historique du navigateur et les journaux du serveur.
   */
  echangerCodeSSO(code: string): Observable<any> {
    return this.http
      .post<any>(`${this.api}/auth/sso/echange/`, { code })
      .pipe(tap((r) => this.stockerTokens(r.access, r.refresh)));
  }

  /**
   * Part sur Microsoft. Sortie du contexte Angular : c'est une vraie
   * navigation, le routeur n'a rien à y faire.
   */
  lancerSSO(urlConnexion: string): void {
    window.location.href = urlConnexion;
  }

  rafraichir(): Observable<any> {
    return this.http
      .post<any>(`${this.api}/auth/refresh/`, { refresh: this.refreshToken })
      .pipe(tap((r) => localStorage.setItem(ACCESS, r.access)));
  }

  chargerProfil(): Observable<Utilisateur> {
    return this.http
      .get<Utilisateur>(`${this.api}/auth/me/`)
      .pipe(tap((u) => this.utilisateur.set(u)));
  }

  deconnexion(): void {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
    this.utilisateur.set(null);
  }

  aRole(...roles: string[]): boolean {
    const r = this.role();
    return r !== null && roles.includes(r);
  }

  /**
   * Page d'atterrissage après connexion (ou après un refus d'accès à une
   * route protégée). L'agent de sécurité n'a qu'un seul écran utile — le
   * reste de l'app (tableau de bord, réservations...) ne le concerne pas.
   */
  pageAccueil(): string {
    return this.aRole('AGENT_SECURITE') ? '/visiteurs' : '/tableau-de-bord';
  }
}
