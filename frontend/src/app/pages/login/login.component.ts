import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, EtatSSO } from '../../core/auth.service';
import { IconComponent } from '../../shared/icon.component';

/** Messages des échecs renvoyés par le retour SSO, en clair. */
const MESSAGES_ERREUR: Record<string, string> = {
  sso_echec: "La connexion Microsoft a échoué. Réessayez, ou utilisez votre "
    + "identifiant et votre mot de passe.",
  profil_echec: "Connexion Microsoft réussie, mais votre profil OSEOR n'a pas "
    + "pu être chargé. Signalez-le à l'administrateur.",
  sso_inactif: "La connexion Microsoft n'est pas encore activée sur ce "
    + "serveur. Utilisez votre identifiant et votre mot de passe, ou "
    + "signalez-le à l'administrateur.",
};


@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="ecran">
    <div class="deco deco-1"></div>
    <div class="deco deco-2"></div>

    <div class="panneau-gauche">
      <div class="marque-xl">
        <span class="mk">S</span>
        <div>SMART<small>HUB</small></div>
      </div>
      <h2>Réservez vos salles<br>en toute simplicité.</h2>
      <p>Plateforme centralisée de réservation de salles et de gestion des audiences du groupe OSEOR.</p>
      <ul class="atouts">
        <li><app-icon name="calendar" [size]="18"/> Vue calendrier des disponibilités</li>
        <li><app-icon name="checkCircle" [size]="18"/> Validation et anti-chevauchement</li>
        <li><app-icon name="bell" [size]="18"/> Notifications en temps réel</li>
      </ul>
    </div>

    <div class="carte-login anim-entree">
      <h2>Connexion</h2>
      <p class="sous">Accédez à votre espace de travail</p>

      @if (erreur()) {
        <div class="alerte err"><app-icon name="close" [size]="16"/>{{ erreur() }}</div>
      }

      <button type="button" class="btn-microsoft" (click)="connexionMicrosoft()">
        <svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true">
          <rect x="1" y="1" width="10" height="10" fill="#f25022"/>
          <rect x="12" y="1" width="10" height="10" fill="#7fba00"/>
          <rect x="1" y="12" width="10" height="10" fill="#00a4ef"/>
          <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
        </svg>
        Se connecter avec Microsoft
      </button>

      <div class="separateur"><span>ou</span></div>

      <form (ngSubmit)="seConnecter()">
        <div class="champ">
          <label>Identifiant</label>
          <input [(ngModel)]="username" name="username" autocomplete="username" required
                 placeholder="prenom.nom" />
        </div>
        <div class="champ">
          <label>Mot de passe</label>
          <input type="password" [(ngModel)]="password" name="password"
                 autocomplete="current-password" required placeholder="••••••••" />
        </div>
        <button class="btn cta" style="width:100%" [disabled]="chargement()">
          @if (chargement()) { <span class="spinner"></span> Connexion… }
          @else { Se connecter }
        </button>
      </form>
    </div>
  </div>
  `,
  styles: [`
    .btn-microsoft {
      width: 100%; display: flex; align-items: center; justify-content: center;
      gap: .65rem; padding: .7rem 1rem; margin-bottom: .2rem;
      background: #fff; color: #3b3a39; font-size: .9rem; font-weight: 600;
      font-family: inherit; border: 1px solid #8c8c8c; border-radius: 8px;
      cursor: pointer; transition: background var(--t), border-color var(--t);
    }
    .btn-microsoft:hover { background: #f3f2f1; border-color: #5e5e5e; }
    .separateur {
      display: flex; align-items: center; gap: .8rem;
      margin: 1.1rem 0; color: var(--txt-3); font-size: .78rem;
    }
    .separateur::before, .separateur::after {
      content: ''; flex: 1; height: 1px; background: var(--bord);
    }

    .ecran { min-height: 100vh; display: grid; grid-template-columns: 1fr 420px;
      background: radial-gradient(120% 120% at 0% 0%, #1e40af 0%, #1e3a8a 55%, #16306b 100%);
      position: relative; overflow: hidden; }
    .deco { position: absolute; border-radius: 50%; filter: blur(8px); opacity: .25; }
    .deco-1 { width: 420px; height: 420px; background: #3b82f6; top: -120px; right: 30%; }
    .deco-2 { width: 320px; height: 320px; background: #f97316; bottom: -100px; right: 24%; opacity: .18; }
    .panneau-gauche { color: #fff; padding: 4rem; display: flex; flex-direction: column;
      justify-content: center; max-width: 560px; z-index: 1; }
    .marque-xl { display: flex; align-items: center; gap: .8rem; margin-bottom: 2.5rem; }
    .marque-xl .mk { width: 46px; height: 46px; border-radius: 12px; background: var(--accent);
      display: flex; align-items: center; justify-content: center; font-family: var(--police-titre);
      font-weight: 700; font-size: 1.5rem; box-shadow: 0 6px 18px rgba(249,115,22,.45); }
    .marque-xl > div { font-family: var(--police-titre); font-weight: 700; font-size: 1.4rem;
      display: flex; flex-direction: column; line-height: 1; }
    .marque-xl small { font-size: .66rem; font-weight: 400; opacity: .7; letter-spacing: .2em; }
    .panneau-gauche h2 { color: #fff; font-size: 2.4rem; line-height: 1.15; margin-bottom: 1rem; }
    .panneau-gauche p { color: #c7d7f5; font-size: 1rem; max-width: 420px; }
    .atouts { list-style: none; padding: 0; margin: 2rem 0 0; display: flex; flex-direction: column; gap: .9rem; }
    .atouts li { display: flex; align-items: center; gap: .7rem; color: #dbeafe; font-size: .95rem; }
    .atouts app-icon { color: var(--accent); }

    .carte-login { background: #fff; padding: 2.6rem 2.2rem; z-index: 1;
      display: flex; flex-direction: column; justify-content: center; box-shadow: var(--ombre-lg); }
    .carte-login h2 { font-size: 1.6rem; }
    .sous { color: var(--txt-2); margin: -.3rem 0 1.6rem; font-size: .9rem; }

    @media (max-width: 900px) {
      .ecran { grid-template-columns: 1fr; }
      .panneau-gauche { display: none; }
      .carte-login { min-height: 100vh; }
    }
  `],
})
export class LoginComponent implements OnInit {
  username = '';
  password = '';
  chargement = signal(false);
  erreur = signal('');
  sso = signal<EtatSSO>({ actif: false, url_connexion: '' });

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const echec = this.route.snapshot.queryParamMap.get('erreur');
    if (echec) {
      this.erreur.set(MESSAGES_ERREUR[echec] ?? MESSAGES_ERREUR['sso_echec']);
    }

    // Sans réponse — instance sans SSO, API momentanément muette — le
    // bouton Microsoft reste visible mais renvoie au formulaire, qui
    // fonctionne dans tous les cas.
    this.auth.etatSSO().subscribe({
      next: (etat) => this.sso.set(etat),
      error: () => this.sso.set({ actif: false, url_connexion: '' }),
    });
  }

  /**
   * Le bouton est toujours affiché, pour que la connexion Microsoft se
   * voie. Tant que l'instance n'est pas reliée à Entra ID (variables
   * AZURE_* vides), le clic explique pourquoi elle n'aboutit pas, plutôt
   * que de partir vers une page d'erreur.
   */
  connexionMicrosoft(): void {
    const { actif, url_connexion } = this.sso();
    if (actif && url_connexion) {
      this.auth.lancerSSO(url_connexion);
    } else {
      this.erreur.set(MESSAGES_ERREUR['sso_inactif']);
    }
  }

  seConnecter(): void {
    this.erreur.set('');
    this.chargement.set(true);
    this.auth.connexion(this.username, this.password).subscribe({
      next: () => {
        this.auth.chargerProfil().subscribe({
          next: () => { this.chargement.set(false); this.router.navigate([this.auth.pageAccueil()]); },
          error: () => { this.chargement.set(false); this.router.navigate([this.auth.pageAccueil()]); },
        });
      },
      error: () => {
        this.chargement.set(false);
        this.erreur.set('Identifiant ou mot de passe incorrect.');
      },
    });
  }
}
