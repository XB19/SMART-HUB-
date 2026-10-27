import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Article, MouvementStock } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';

@Component({
  selector: 'app-stocks',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="entete anim-entree">
    <div>
      <h1>Gestion de stocks</h1>
      <p class="sous-titre">{{ articles().length }} article(s) — matériel, informatique, fournitures de bureau</p>
    </div>
    <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouvel article</button>
  </div>

  @if (articlesEnAlerte().length) {
    <div class="alerte err anim-entree">
      <app-icon name="close" [size]="16"/>
      {{ articlesEnAlerte().length }} article(s) au seuil d'alerte ou en dessous :
      {{ articlesEnAlerte().join(', ') }}
    </div>
  }

  <!-- Formulaire nouvel article / édition -->
  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>{{ form.id ? "Modifier l'article" : 'Nouvel article' }}</h3>
      <div class="ligne">
        <div class="champ"><label>Nom</label><input [(ngModel)]="form.nom" /></div>
        <div class="champ"><label>Catégorie</label>
          <select [(ngModel)]="form.categorie">
            <option value="MATERIEL">Matériel</option>
            <option value="INFORMATIQUE">Matériel informatique</option>
            <option value="FOURNITURES">Fournitures de bureau</option>
          </select>
        </div>
        <div class="champ"><label>Unité</label><input [(ngModel)]="form.unite" placeholder="pièce, ramette, boîte…" /></div>
        <div class="champ"><label>Seuil d'alerte</label><input type="number" [(ngModel)]="form.seuil_alerte" /></div>
      </div>
      <div class="champ"><label>Description (facultatif)</label><textarea [(ngModel)]="form.description" rows="2"></textarea></div>
      @if (erreur()) { <div class="alerte err">{{ erreur() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrer()">Enregistrer</button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <!-- Formulaire mouvement (entrée/sortie) -->
  @if (mouvementVisible(); as article) {
    <div class="carte form anim-entree">
      <h3>{{ mouvementForm.type_mouvement === 'ENTREE' ? 'Entrée de stock' : 'Sortie de stock' }} — {{ article.nom }}</h3>
      <p class="note">Stock actuel : <strong>{{ article.quantite_stock }} {{ article.unite }}</strong></p>
      <div class="ligne">
        <div class="champ"><label>Type</label>
          <select [(ngModel)]="mouvementForm.type_mouvement">
            <option value="ENTREE">Entrée</option>
            <option value="SORTIE">Sortie</option>
          </select>
        </div>
        <div class="champ"><label>Quantité</label><input type="number" min="1" [(ngModel)]="mouvementForm.quantite" /></div>
        <div class="champ"><label>Motif (facultatif)</label><input [(ngModel)]="mouvementForm.motif" /></div>
      </div>
      @if (erreurMouvement()) { <div class="alerte err">{{ erreurMouvement() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrerMouvement(article)" [disabled]="mouvementEnCours()">
          @if (mouvementEnCours()) { <span class="spinner petit"></span> Envoi… } @else { Confirmer }
        </button>
        <button class="btn secondaire" (click)="mouvementVisible.set(null)">Annuler</button>
      </div>
    </div>
  }

  <!-- Filtre catégorie -->
  <div class="carte anim-entree">
    <div class="tbl-filtre">
      <select [(ngModel)]="filtreCategorie" (ngModelChange)="filtrer()">
        <option value="">Toutes les catégories</option>
        <option value="MATERIEL">Matériel</option>
        <option value="INFORMATIQUE">Matériel informatique</option>
        <option value="FOURNITURES">Fournitures de bureau</option>
      </select>
    </div>

    <table class="tbl">
      <thead>
        <tr><th>Article</th><th>Catégorie</th><th>Stock</th><th>Seuil</th><th>Statut</th><th></th></tr>
      </thead>
      <tbody>
        @for (a of articlesFiltres(); track a.id) {
          <tr [class.attente]="a.en_alerte">
            <td><strong>{{ a.nom }}</strong>@if (a.description) { <br><small>{{ a.description }}</small> }</td>
            <td><span class="badge info">{{ a.categorie_libelle }}</span></td>
            <td>{{ a.quantite_stock }} {{ a.unite }}</td>
            <td>{{ a.seuil_alerte }}</td>
            <td>
              @if (a.en_alerte) { <span class="badge rouge">Alerte</span> }
              @else { <span class="badge validee">OK</span> }
            </td>
            <td class="actions">
              <button class="btn vert petit" (click)="ouvrirMouvement(a, 'ENTREE')"><app-icon name="plus" [size]="12"/> Entrée</button>
              <button class="btn secondaire petit" (click)="ouvrirMouvement(a, 'SORTIE')"><app-icon name="close" [size]="12"/> Sortie</button>
              <button class="btn secondaire petit" (click)="modifier(a)"><app-icon name="edit" [size]="12"/></button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="vide-td">Aucun article pour le moment.</td></tr>
        }
      </tbody>
    </table>
  </div>

  <!-- Historique des mouvements -->
  <div class="carte anim-entree historique">
    <h3>Historique des mouvements</h3>
    <table class="tbl">
      <thead><tr><th>Date</th><th>Article</th><th>Type</th><th>Quantité</th><th>Motif</th><th>Par</th></tr></thead>
      <tbody>
        @for (m of mouvements(); track m.id) {
          <tr>
            <td>{{ m.date_creation | date:'dd/MM/yyyy HH:mm' }}</td>
            <td>{{ m.article_nom }}</td>
            <td><span class="badge" [class.validee]="m.type_mouvement === 'ENTREE'" [class.info]="m.type_mouvement === 'SORTIE'">{{ m.type_mouvement_libelle }}</span></td>
            <td>{{ m.quantite }}</td>
            <td>{{ m.motif || '—' }}</td>
            <td>{{ m.utilisateur_nom }}</td>
          </tr>
        } @empty {
          <tr><td colspan="6" class="vide-td">Aucun mouvement pour le moment.</td></tr>
        }
      </tbody>
    </table>
  </div>
  `,
  styles: [`
    .entete { display: flex; justify-content: space-between; align-items: flex-start; }
    .sous-titre { color: var(--txt-2); font-size: .82rem; margin: .2rem 0 0; }
    .form { margin-bottom: 1rem; }
    .note { font-size: .85rem; color: var(--txt-2); margin: -.3rem 0 .8rem; }
    .ligne { display: flex; gap: 1rem; margin-bottom: .9rem; flex-wrap: wrap; }
    .champ { flex: 1; min-width: 140px; display: flex; flex-direction: column; gap: .3rem; margin-bottom: .8rem; }
    .champ label { font-size: .78rem; font-weight: 600; color: var(--txt-2); }
    .champ input, .champ select, textarea { border: 1px solid var(--bord); border-radius: 8px;
      padding: .5rem .7rem; font-size: .85rem; font-family: inherit; }
    textarea { width: 100%; resize: vertical; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }

    .tbl-filtre { margin-bottom: .8rem; }
    .tbl-filtre select { border: 1px solid var(--bord); border-radius: 8px; padding: .4rem .7rem; font-size: .85rem; background: #fff; }
    tr.attente { background: #fffbeb; }
    .actions { display: flex; gap: .4rem; flex-wrap: wrap; }
    .vide-td { text-align: center; color: var(--txt-2); padding: 2rem; }

    .historique { margin-top: 1rem; }
    .historique h3 { margin-top: 0; }
  `],
})
export class StocksComponent implements OnInit {
  articles = signal<Article[]>([]);
  articlesFiltres = signal<Article[]>([]);
  mouvements = signal<MouvementStock[]>([]);
  formVisible = signal(false);
  mouvementVisible = signal<Article | null>(null);
  erreur = signal('');
  erreurMouvement = signal('');
  mouvementEnCours = signal(false);
  filtreCategorie = '';

  form: any = {};
  mouvementForm: any = { type_mouvement: 'ENTREE', quantite: 1, motif: '' };

  constructor(private route: ActivatedRoute, private api: ApiService, private toasts: ToastService) {
    inject(NavigationService).vuesLocales(this.formVisible);
  }

  ngOnInit(): void {
    this.charger();
    this.chargerMouvements();

    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.article(+id).subscribe({
        next: () => {
          // L'article n'a pas de vue "détail" dédiée : le signaler via toast
          // suffit, il est déjà visible dans le tableau ci-dessous.
          this.toasts.afficher({ titre: 'Stock', message: 'Article ouvert depuis la notification.', type: 'INFO' });
        },
      });
    }
  }

  charger(): void {
    this.api.articles().subscribe((p) => { this.articles.set(p.results); this.filtrer(); });
  }

  chargerMouvements(): void {
    this.api.mouvementsStock().subscribe((p) => this.mouvements.set(p.results));
  }

  filtrer(): void {
    const liste = this.filtreCategorie
      ? this.articles().filter((a) => a.categorie === this.filtreCategorie)
      : this.articles();
    this.articlesFiltres.set(liste);
  }

  articlesEnAlerte(): string[] {
    return this.articles().filter((a) => a.en_alerte).map((a) => a.nom);
  }

  nouveau(): void {
    this.form = { id: null, nom: '', categorie: 'FOURNITURES', unite: 'unité', seuil_alerte: 0, description: '' };
    this.erreur.set('');
    this.formVisible.set(true);
  }

  modifier(a: Article): void {
    this.form = {
      id: a.id, nom: a.nom, categorie: a.categorie, unite: a.unite,
      seuil_alerte: a.seuil_alerte, description: a.description,
    };
    this.erreur.set('');
    this.formVisible.set(true);
  }

  enregistrer(): void {
    this.erreur.set('');
    const obs = this.form.id
      ? this.api.majArticle(this.form.id, this.form)
      : this.api.creerArticle(this.form);
    obs.subscribe({
      next: () => { this.formVisible.set(false); this.charger(); },
      error: (e) => this.erreur.set(Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' ')),
    });
  }

  ouvrirMouvement(a: Article, type: 'ENTREE' | 'SORTIE'): void {
    this.mouvementForm = { type_mouvement: type, quantite: 1, motif: '' };
    this.erreurMouvement.set('');
    this.mouvementVisible.set(a);
  }

  enregistrerMouvement(article: Article): void {
    this.erreurMouvement.set('');
    this.mouvementEnCours.set(true);
    this.api.creerMouvementStock({
      article: article.id,
      type_mouvement: this.mouvementForm.type_mouvement,
      quantite: this.mouvementForm.quantite,
      motif: this.mouvementForm.motif,
    }).subscribe({
      next: () => {
        this.mouvementEnCours.set(false);
        this.mouvementVisible.set(null);
        this.charger();
        this.chargerMouvements();
      },
      error: (e) => {
        this.mouvementEnCours.set(false);
        this.erreurMouvement.set(Object.values(e?.error || { x: ['Erreur.'] }).flat().join(' '));
      },
    });
  }
}
