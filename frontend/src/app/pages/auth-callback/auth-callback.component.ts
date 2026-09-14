/**
 * Retour de l'authentification Microsoft Entra ID.
 *
 * Django redirige ici après une authentification réussie :
 *   /auth/callback?code=<code à usage unique>
 *
 * Le code est échangé en POST contre la paire de jetons, puis le profil
 * est chargé. Les jetons eux-mêmes ne transitent jamais par l'URL : ils
 * s'inscriraient dans l'historique du navigateur, dans les journaux nginx
 * et dans l'en-tête `Referer` des pages suivantes.
 */
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [],
  template: `
    <div class="ecran-sso">
      <div class="logo-sso">
        <span class="mk">S</span>
        <div>SMART<small>HUB</small></div>
      </div>
      <div class="spinner-sso"></div>
      <p class="msg">Authentification Microsoft en cours…</p>
    </div>
  `,
  styles: [`
    .ecran-sso {
      min-height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 1.5rem;
      background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
      color: #fff; font-family: 'Poppins', sans-serif;
    }
    .logo-sso {
      display: flex; align-items: center; gap: .8rem;
      font-weight: 700; font-size: 1.3rem;
    }
    .mk {
      width: 46px; height: 46px; border-radius: 12px;
      background: #f97316; display: flex; align-items: center;
      justify-content: center; font-size: 1.5rem;
      box-shadow: 0 6px 18px rgba(249,115,22,.45);
    }
    .logo-sso > div { display: flex; flex-direction: column; line-height: 1; }
    .logo-sso small { font-size: .65rem; font-weight: 400; opacity: .7; letter-spacing: .2em; }
    .spinner-sso {
      width: 40px; height: 40px;
      border: 3px solid rgba(255,255,255,.2);
      border-top-color: #fff; border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .msg { color: #bfdbfe; font-size: .9rem; }
  `],
})
export class AuthCallbackComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private auth: AuthService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const erreur = params.get('erreur');

    if (erreur || !code) {
      this.echouer(erreur || 'sso_echec');
      return;
    }

    this.auth.echangerCodeSSO(code).subscribe({
      next: () => this.auth.chargerProfil().subscribe({
        next: () => this.router.navigate(['/tableau-de-bord']),
        error: () => this.echouer('profil_echec'),
      }),
      error: () => this.echouer('sso_echec'),
    });
  }

  /** Retour au formulaire : le code est brûlé, il faut relancer le SSO. */
  private echouer(erreur: string): void {
    this.auth.deconnexion();
    this.router.navigate(['/connexion'], { queryParams: { erreur } });
  }
}
