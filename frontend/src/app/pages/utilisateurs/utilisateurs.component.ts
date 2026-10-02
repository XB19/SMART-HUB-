import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Utilisateur, Filiale } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

interface ResultatSync {
  crees: number;
  mis_a_jour: number;
  ignores: number;
  total_ad: number;
}

@Component({
  selector: 'app-utilisateurs',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Utilisateurs</h1>
      <p class="sous-titre">{{ utilisateurs().length }} compte(s) enregistré(s)</p>
    </div>
    <div class="actions-entete">
      <!-- Synchronisation depuis l'Active Directory sur site (LDAP) -->
      <button class="btn-ad" (click)="synchroniserAD()" [disabled]="syncing()">
        <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
          <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
          <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
        </svg>
        @if (syncing()) { <span class="spinner petit"></span> Synchronisation… }
        @else { Synchroniser depuis Active Directory }
      </button>
      <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouvel utilisateur</button>
    </div>
  </div>

  <!-- Résultat de la dernière synchronisation -->
  @if (resultatSync()) {
    <div class="carte sync-result anim-entree">
      <div class="sr-titre">
        <app-icon name="checkCircle" [size]="18"/> Synchronisation Active Directory terminée
        <button class="fermer" (click)="resultatSync.set(null)"><app-icon name="close" [size]="14"/></button>
      </div>
      <div class="sr-stats">
        <div class="sr-stat cree">
          <span class="nb">{{ resultatSync()!.crees }}</span>
          <span class="lib">Créés</span>
        </div>
        <div class="sr-stat maj">
          <span class="nb">{{ resultatSync()!.mis_a_jour }}</span>
          <span class="lib">Mis à jour</span>
        </div>
        <div class="sr-stat ign">
          <span class="nb">{{ resultatSync()!.ignores }}</span>
          <span class="lib">Ignorés</span>
        </div>
        <div class="sr-stat tot">
          <span class="nb">{{ resultatSync()!.total_ad }}</span>
          <span class="lib">Total annuaire</span>
        </div>
      </div>
      <p class="sr-note">
        Les comptes synchronisés se connectent <strong>par l'annuaire de
        l'entreprise</strong> (badge <span class="badge sso">SSO</span>) : leur mot de
        passe reste chez Microsoft, aucun mot de passe SMART HUB n'est créé ni modifié.
        Cette synchronisation interroge l'Active Directory <em>sur site</em> en LDAP ;
        elle est distincte de la connexion Microsoft Entra ID de la page d'accueil.
      </p>
    </div>
  }

  @if (erreurSync()) {
    <div class="alerte err anim-entree">
      <app-icon name="close" [size]="16"/> {{ erreurSync() }}
    </div>
  }

  <!-- Formulaire création / édition -->
  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>{{ form.id ? 'Modifier' : 'Créer' }} un utilisateur</h3>

      @if (form.id && utilisateurEnEdition()?.source_auth === 'SSO') {
        <div class="info-sso">
          <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
            <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
          </svg>
          Compte Microsoft — cet utilisateur se connecte par l'annuaire de
          l'entreprise. Le mot de passe SMART HUB ne s'applique pas.
        </div>
      }

      <div class="ligne">
        <div class="champ"><label>Identifiant</label><input [(ngModel)]="form.username" /></div>
        <div class="champ"><label>Prénom</label><input [(ngModel)]="form.first_name" /></div>
        <div class="champ"><label>Nom</label><input [(ngModel)]="form.last_name" /></div>
      </div>
      <div class="ligne">
        <div class="champ"><label>Email</label><input [(ngModel)]="form.email" /></div>
        <div class="champ"><label>Téléphone</label><input [(ngModel)]="form.telephone" /></div>
      </div>
      <div class="ligne">
        <div class="champ"><label>Rôle</label>
          <select [(ngModel)]="form.role">
            <option value="EMPLOYE">Employé</option>
            <option value="SECRETAIRE">Secrétaire</option>
            <option value="DIRECTEUR">Directeur (DG)</option>
            <option value="CHEF_SERVICE">Chef de service</option>
            <option value="COMPTABLE">Comptable</option>
            <option value="RH">RH</option>
            <option value="AGENT_SECURITE">Agent de sécurité</option>
            <option value="ADMINISTRATEUR">Administrateur</option>
          </select>
        </div>
        <div class="champ"><label>Filiale</label>
          <select [(ngModel)]="form.filiale">
            <option [ngValue]="null">— aucune —</option>
            @for (f of filiales(); track f.id) {
              <option [ngValue]="f.id">{{ f.nom }}</option>
            }
          </select>
        </div>
        <!-- Mot de passe : masqué pour comptes SSO -->
        @if (utilisateurEnEdition()?.source_auth !== 'SSO') {
          <div class="champ">
            <label>Mot de passe {{ form.id ? '(laisser vide = inchangé)' : '' }}</label>
            <input type="password" [(ngModel)]="form.password" />
          </div>
        }
      </div>

      @if (form.role === 'SECRETAIRE' && !form.filiale) {
        <div class="alerte err">RG-05 : une secrétaire sans filiale restera inactive.</div>
      }
      @if (form.role === 'AGENT_SECURITE' && !form.filiale) {
        <div class="alerte err">Un agent de sécurité sans filiale ne pourra pas enregistrer de visiteurs.</div>
      }
      @if (erreur()) { <div class="alerte err">{{ erreur() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrer()">Enregistrer</button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <!-- Tableau des utilisateurs -->
  <div class="carte anim-entree">
    <div class="tbl-filtre">
      <input placeholder="Rechercher un utilisateur…" [(ngModel)]="recherche"
             (ngModelChange)="filtrer()" class="champ-recherche"/>
      <select [(ngModel)]="filtreRole" (ngModelChange)="filtrer()">
        <option value="">Tous les rôles</option>
        <option value="EMPLOYE">Employés</option>
        <option value="SECRETAIRE">Secrétaires</option>
        <option value="DIRECTEUR">Directeurs</option>
        <option value="AGENT_SECURITE">Agents de sécurité</option>
        <option value="ADMINISTRATEUR">Administrateurs</option>
      </select>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th>Nom / Email</th>
          <th>Identifiant</th>
          <th>Rôle</th>
          <th>Filiale</th>
          <th>Auth</th>
          <th>Statut</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (u of utilisateursFiltres(); track u.id) {
          <tr [class.inactif]="!u.actif">
            <td>
              <div class="user-cell">
                <span class="avatar-sm">{{ initiales(u) }}</span>
                <div>
                  <strong>{{ u.nom_complet }}</strong>
                  <small>{{ u.email }}</small>
                </div>
              </div>
            </td>
            <td class="mono">{{ u.username }}</td>
            <td><span class="badge info">{{ u.role_libelle }}</span></td>
            <td>{{ u.filiale_nom || '—' }}</td>
            <td>
              @if (u.source_auth === 'SSO') {
                <span class="badge sso" title="Se connecte par l'annuaire Microsoft">
                  <svg width="11" height="11" viewBox="0 0 21 21" style="vertical-align:middle">
                    <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                  </svg>
                  SSO
                </span>
              } @else {
                <span class="badge local" title="Mot de passe SMART HUB local">Local</span>
              }
            </td>
            <td>
              @if (u.actif) { <span class="badge validee">Actif</span> }
              @else { <span class="badge rouge">Inactif</span> }
            </td>
            <td>
              <button class="btn secondaire petit" (click)="editer(u)">
                <app-icon name="edit" [size]="13"/> Modifier
              </button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="vide-td">Aucun utilisateur trouvé.</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Note explicative mots de passe -->
  <div class="note-mdp carte anim-entree">
    <app-icon name="info" [size]="18"/>
    <div>
      <strong>Mots de passe — deux systèmes indépendants</strong>
      <p>
        Les comptes <span class="badge sso">SSO</span> se connectent exclusivement par l'annuaire Microsoft.
        Leur mot de passe Office 365 reste géré par Microsoft — SMART HUB n'y a jamais accès.
        Changer un mot de passe dans SMART HUB n'affecte que la connexion locale (comptes <span class="badge local">Local</span>).
        Les deux systèmes sont complètement indépendants.
      </p>
    </div>
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .actions-entete { display: flex; gap: .7rem; align-items: center; }

    .btn-ad {
      display: flex; align-items: center; gap: .6rem; padding: .55rem 1rem;
      border: 1.5px solid #d1d5db; border-radius: 9px; background: #fff;
      cursor: pointer; font-size: .84rem; font-weight: 600; color: #1f2937;
      font-family: var(--police-corps); transition: background .15s, box-shadow .15s;
    }
    .btn-ad:hover:not(:disabled) { background: #f8fafc; box-shadow: 0 2px 8px rgba(0,0,0,.08); }
    .btn-ad:disabled { opacity: .6; cursor: not-allowed; }

    /* Résultat sync */
    .sync-result { padding: 1rem 1.2rem; border-left: 4px solid #22c55e; margin: 1rem 0; }
    .sr-titre {
      display: flex; align-items: center; gap: .5rem; font-weight: 700;
      color: #15803d; margin-bottom: .8rem; font-size: .92rem;
    }
    .fermer { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--txt-3); }
    .sr-stats { display: flex; gap: 1.5rem; margin-bottom: .8rem; }
    .sr-stat { text-align: center; }
    .sr-stat .nb { display: block; font-size: 1.6rem; font-weight: 700; line-height: 1; }
    .sr-stat .lib { font-size: .72rem; color: var(--txt-2); }
    .sr-stat.cree .nb { color: #16a34a; }
    .sr-stat.maj .nb { color: #2563eb; }
    .sr-stat.ign .nb { color: var(--txt-3); }
    .sr-stat.tot .nb { color: var(--navy); }
    .sr-note { font-size: .79rem; color: var(--txt-2); background: #f8fafc; border-radius: 7px; padding: .6rem .8rem; margin: 0; }

    /* Info SSO dans le form */
    .info-sso {
      display: flex; align-items: center; gap: .6rem; padding: .7rem .9rem;
      background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 9px;
      font-size: .83rem; color: #1d4ed8; margin-bottom: .8rem;
    }

    /* Tableau */
    .tbl-filtre {
      display: flex; gap: .7rem; margin-bottom: .8rem;
    }
    .champ-recherche {
      flex: 1; border: 1px solid var(--bord); border-radius: 8px;
      padding: .4rem .7rem; font-size: .85rem;
    }
    .tbl-filtre select {
      border: 1px solid var(--bord); border-radius: 8px;
      padding: .4rem .7rem; font-size: .85rem; background: #fff;
    }
    .user-cell { display: flex; align-items: center; gap: .6rem; }
    .avatar-sm {
      width: 32px; height: 32px; border-radius: 50%; background: var(--navy);
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: .75rem; font-weight: 700; flex-shrink: 0;
    }
    .user-cell strong { display: block; font-size: .87rem; }
    .user-cell small { color: var(--txt-2); font-size: .75rem; }
    tr.inactif { opacity: .55; }
    .mono { font-family: monospace; font-size: .82rem; }
    .vide-td { text-align: center; color: var(--txt-2); padding: 2rem; }

    /* Badges auth */
    .badge.sso {
      background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
      font-size: .7rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 3px;
    }
    .badge.local { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; font-size: .7rem; }
    .badge.rouge { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }

    /* Note mots de passe */
    .note-mdp {
      display: flex; align-items: flex-start; gap: .8rem; margin-top: 1rem;
      padding: 1rem 1.2rem; border-left: 4px solid var(--bleu); font-size: .82rem;
    }
    .note-mdp app-icon { color: var(--bleu); margin-top: 2px; flex-shrink: 0; }
    .note-mdp strong { display: block; margin-bottom: .3rem; }
    .note-mdp p { margin: 0; color: var(--txt-2); line-height: 1.6; }

    .form { margin-bottom: 1rem; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }
  `],
})
export class UtilisateursComponent implements OnInit {
  utilisateurs = signal<Utilisateur[]>([]);
  utilisateursFiltres = signal<Utilisateur[]>([]);
  filiales = signal<Filiale[]>([]);
  formVisible = signal(false);
  erreur = signal('');
  erreurSync = signal('');
  syncing = signal(false);
  resultatSync = signal<ResultatSync | null>(null);
  form: any = {};
  recherche = '';
  filtreRole = '';

  utilisateurEnEdition = signal<Utilisateur | null>(null);

  constructor(private api: ApiService) {}

  ngOnInit(): void {
    this.charger();
    this.api.filiales().subscribe((p) => this.filiales.set(p.results));
  }

  charger(): void {
    this.api.utilisateurs({ ordering: 'last_name', page_size: 200 })
      .subscribe((p) => {
        this.utilisateurs.set(p.results);
        this.filtrer();
      });
  }

  filtrer(): void {
    let liste = this.utilisateurs();
    if (this.recherche.trim()) {
      const q = this.recherche.toLowerCase();
      liste = liste.filter((u) =>
        u.nom_complet.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
      );
    }
    if (this.filtreRole) {
      liste = liste.filter((u) => u.role === this.filtreRole);
    }
    this.utilisateursFiltres.set(liste);
  }

  nouveau(): void {
    this.form = {
      id: null, username: '', first_name: '', last_name: '',
      email: '', telephone: '', role: 'EMPLOYE', filiale: null, password: '',
    };
    this.utilisateurEnEdition.set(null);
    this.erreur.set('');
    this.formVisible.set(true);
  }

  editer(u: Utilisateur): void {
    this.form = {
      id: u.id, username: u.username, first_name: u.first_name,
      last_name: u.last_name, email: u.email, telephone: u.telephone,
      role: u.role, filiale: u.filiale, password: '',
    };
    this.utilisateurEnEdition.set(u);
    this.erreur.set('');
    this.formVisible.set(true);
  }

  enregistrer(): void {
    this.erreur.set('');
    const obs = this.form.id
      ? this.api.majUtilisateur(this.form.id, this.form)
      : this.api.creerUtilisateur(this.form);
    obs.subscribe({
      next: () => { this.formVisible.set(false); this.charger(); },
      error: (e) => this.erreur.set(
        Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' '),
      ),
    });
  }

  synchroniserAD(): void {
    this.erreurSync.set('');
    this.resultatSync.set(null);
    this.syncing.set(true);
    this.api.synchroniserAD().subscribe({
      next: (r) => {
        this.syncing.set(false);
        this.resultatSync.set(r);
        this.charger();
      },
      error: (e) => {
        this.syncing.set(false);
        this.erreurSync.set(e?.error?.detail || 'Erreur lors de la synchronisation Active Directory.');
      },
    });
  }

  initiales(u: Utilisateur): string {
    return ((u.first_name?.[0] || '') + (u.last_name?.[0] || u.username?.[0] || '')).toUpperCase();
  }
}
