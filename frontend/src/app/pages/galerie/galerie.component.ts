import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/toast.service';
import { AuthService } from '../../core/auth.service';
import { Album, GalerieService, Photo } from '../../core/vie-interne.service';
import { NavigationService } from '../../core/navigation.service';

/** Galerie / Mémoire : albums photo de la vie du groupe. */
@Component({
  selector: 'app-galerie',
  imports: [CommonModule, FormsModule, IconComponent],
  template: `
  <div class="tete anim-entree">
    <div>
      <h1>Mémoire du groupe</h1>
      <p class="sous">Les moments de la vie de l'entreprise</p>
    </div>
    <button class="btn cta" (click)="formulaireAlbum.set(true)">
      <app-icon name="plus"/> Nouvel album
    </button>
  </div>

  @if (albumOuvert(); as a) {
    <div class="carte anim-entree">
      <div class="entete-album">
        <div>
          <h2>{{ a.titre }}</h2>
          <p class="sous">
            {{ a.nb_photos }} photo(s)
            @if (a.date_evenement) { · {{ a.date_evenement | date: 'dd MMMM yyyy' }} }
            · {{ a.visibilite_libelle }}
          </p>
          @if (a.description) { <p class="desc">{{ a.description }}</p> }
        </div>
        <label class="btn cta">
          <app-icon name="plus"/> Ajouter des photos
          <input type="file" hidden multiple accept="image/*" (change)="televerser($event)"/>
        </label>
      </div>

      @if (photos().length) {
        <div class="mosaique">
          @for (p of photos(); track p.id) {
            <figure class="tuile" (click)="agrandir(p)">
              <img [src]="p.miniature || p.image" [alt]="p.legende || 'Photo'" loading="lazy"/>
              <figcaption>
                <span>{{ p.legende || p.televersee_par_nom }}</span>
                <button class="retirer" (click)="supprimerPhoto(p, $event)" title="Retirer">
                  <app-icon name="trash" [size]="13"/>
                </button>
              </figcaption>
            </figure>
          }
        </div>
      } @else {
        <div class="vide">Cet album est encore vide.</div>
      }
    </div>
  } @else {
    @if (albums().length) {
      <div class="albums stagger">
        @for (a of albums(); track a.id) {
          <article class="album" (click)="ouvrirAlbum(a)">
            <div class="couverture">
              @if (a.couverture) {
                <img [src]="a.couverture" [alt]="a.titre" loading="lazy"/>
              } @else {
                <div class="sans-photo"><app-icon name="image" [size]="28"/></div>
              }
              <span class="compte">{{ a.nb_photos }}</span>
            </div>
            <div class="corps">
              <h3>{{ a.titre }}</h3>
              <p class="meta">
                @if (a.date_evenement) { {{ a.date_evenement | date: 'dd/MM/yyyy' }} · }
                {{ a.filiale_nom }}
              </p>
            </div>
          </article>
        }
      </div>
    } @else {
      <div class="carte vide">
        Aucun album pour l'instant. Créez le premier pour commencer à
        rassembler les photos du groupe.
      </div>
    }
  }

  @if (formulaireAlbum()) {
    <div class="voile" (click)="formulaireAlbum.set(false)">
      <div class="modale anim-entree" (click)="$event.stopPropagation()">
        <h3>Nouvel album</h3>
        <label>Titre</label>
        <input [(ngModel)]="titre" placeholder="Fête de fin d'année 2026"/>
        <label>Description</label>
        <textarea rows="2" [(ngModel)]="description"></textarea>
        <label>Date de l'évènement</label>
        <input type="date" [(ngModel)]="dateEvenement"/>
        <label>Visibilité</label>
        <select [(ngModel)]="visibilite">
          <option value="FILIALE">Ma filiale</option>
          <option value="GROUPE">Tout le groupe</option>
          <option value="SERVICE">Mon service</option>
        </select>
        <div class="pied">
          <button class="btn fantome" (click)="formulaireAlbum.set(false)">Annuler</button>
          <button class="btn cta" (click)="creerAlbum()">Créer</button>
        </div>
      </div>
    </div>
  }

  @if (agrandie(); as p) {
    <div class="voile sombre" (click)="agrandie.set(null)">
      <img class="plein-ecran" [src]="p.image" [alt]="p.legende || 'Photo'"/>
    </div>
  }
  `,
  styles: [`
    .tete { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.4rem; }
    .sous { color: var(--txt-2); margin-top: -.3rem; font-size: .88rem; }
    .desc { font-size: .88rem; margin-top: .5rem; }

    .albums { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 1rem; }
    .album { background: #fff; border: 1px solid var(--bord); border-radius: var(--r);
      overflow: hidden; box-shadow: var(--ombre); cursor: pointer;
      transition: transform var(--t), box-shadow var(--t); }
    .album:hover { transform: translateY(-4px); box-shadow: var(--ombre-md); }
    .couverture { position: relative; height: 150px; background: #f1f5f9; }
    .couverture img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .sans-photo { height: 100%; display: flex; align-items: center; justify-content: center;
      color: var(--txt-2); opacity: .5; }
    .compte { position: absolute; top: .5rem; right: .5rem; background: rgba(15,23,42,.75);
      color: #fff; border-radius: 999px; padding: .1rem .5rem; font-size: .72rem; font-weight: 600; }
    .album .corps { padding: .8rem .9rem; }
    .album h3 { margin: 0; font-size: .95rem; color: var(--navy); }
    .meta { font-size: .76rem; color: var(--txt-2); margin: .25rem 0 0; }

    .entete-album { display: flex; justify-content: space-between; align-items: flex-start;
      gap: 1rem; margin-bottom: 1.2rem; flex-wrap: wrap; }
    .entete-album h2 { margin: 0; color: var(--navy); }
    .mosaique { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: .7rem; }
    .tuile { position: relative; margin: 0; border-radius: 10px; overflow: hidden;
      cursor: zoom-in; background: #f1f5f9; }
    .tuile img { width: 100%; height: 150px; object-fit: cover; display: block;
      transition: transform var(--t); }
    .tuile:hover img { transform: scale(1.05); }
    .tuile figcaption { position: absolute; inset: auto 0 0 0; padding: 1rem .55rem .4rem;
      background: linear-gradient(transparent, rgba(15,23,42,.8)); color: #fff;
      font-size: .74rem; display: flex; align-items: center; justify-content: space-between; gap: .4rem; }
    .tuile figcaption span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .retirer { background: none; border: none; color: #fff; cursor: pointer; opacity: .75;
      padding: 0; flex-shrink: 0; }
    .retirer:hover { opacity: 1; }

    .vide { text-align: center; color: var(--txt-2); padding: 2.5rem 1rem; font-size: .9rem; }
    .voile { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex;
      align-items: center; justify-content: center; z-index: 60; padding: 1rem; }
    .voile.sombre { background: rgba(15,23,42,.9); cursor: zoom-out; }
    .plein-ecran { max-width: 94vw; max-height: 92vh; border-radius: 8px; }
    .modale { background: #fff; border-radius: var(--r); padding: 1.5rem; width: 100%;
      max-width: 440px; box-shadow: var(--ombre-md); }
    .modale h3 { margin: 0 0 1rem; color: var(--navy); }
    .modale label { display: block; font-size: .8rem; font-weight: 600; color: var(--txt-2);
      margin: .8rem 0 .3rem; }
    .modale input, .modale select, .modale textarea { width: 100%; padding: .6rem .7rem;
      border: 1px solid var(--bord); border-radius: 8px; font-size: .9rem; font-family: inherit; }
    .pied { display: flex; justify-content: flex-end; gap: .6rem; margin-top: 1.4rem; }
    .btn.fantome { background: none; border: 1px solid var(--bord); color: var(--txt); }
    label.btn { cursor: pointer; }
  `],
})
export class GalerieComponent implements OnInit {
  albums = signal<Album[]>([]);
  photos = signal<Photo[]>([]);
  albumOuvert = signal<Album | null>(null);
  agrandie = signal<Photo | null>(null);
  formulaireAlbum = signal(false);

  titre = '';
  description = '';
  dateEvenement = '';
  visibilite = 'FILIALE';

  constructor(
    private galerie: GalerieService,
    private toast: ToastService,
    public auth: AuthService,
  ) {
    // Album ouvert : « Retour » ramène à la liste des albums.
    inject(NavigationService).vuesLocales(
      { ouverte: () => !!this.albumOuvert(), fermer: () => this.fermerAlbum() },
      this.formulaireAlbum,
    );
  }

  ngOnInit(): void { this.chargerAlbums(); }

  chargerAlbums(): void {
    this.galerie.albums().subscribe(
      (r) => this.albums.set(r.results ?? (r as any) ?? []));
  }

  ouvrirAlbum(a: Album): void {
    this.albumOuvert.set(a);
    this.galerie.photos(a.id).subscribe(
      (r) => this.photos.set(r.results ?? (r as any) ?? []));
  }

  fermerAlbum(): void {
    this.albumOuvert.set(null);
    this.photos.set([]);
    this.chargerAlbums();
  }

  agrandir(p: Photo): void { this.agrandie.set(p); }

  creerAlbum(): void {
    if (!this.titre.trim()) {
      this.toast.erreur('Donnez un titre à l\'album.');
      return;
    }

    this.galerie.creerAlbum({
      titre: this.titre,
      description: this.description,
      date_evenement: this.dateEvenement || null,
      visibilite: this.visibilite,
    }).subscribe({
      next: () => {
        this.formulaireAlbum.set(false);
        this.titre = this.description = this.dateEvenement = '';
        this.toast.succes('Album créé.');
        this.chargerAlbums();
      },
      error: (e) => this.toast.erreur(e?.error?.detail || 'Création impossible.'),
    });
  }

  televerser(evenement: Event): void {
    const album = this.albumOuvert();
    const entree = evenement.target as HTMLInputElement;
    const fichiers = Array.from(entree.files || []);
    if (!album || !fichiers.length) return;

    let restants = fichiers.length;
    let echecs = 0;

    // Envois séquentiels côté serveur mais lancés ensemble : chaque photo
    // est indépendante, une image refusée ne doit pas annuler les autres.
    fichiers.forEach((fichier) => {
      this.galerie.televerser(album.id, fichier).subscribe({
        next: () => { if (--restants === 0) this.terminerTeleversement(album, echecs); },
        error: () => { echecs++; if (--restants === 0) this.terminerTeleversement(album, echecs); },
      });
    });

    entree.value = '';
  }

  private terminerTeleversement(album: Album, echecs: number): void {
    if (echecs) {
      this.toast.erreur(`${echecs} fichier(s) refusé(s) : format ou taille non acceptés.`);
    } else {
      this.toast.succes('Photos ajoutées.');
    }
    this.ouvrirAlbum(album);
  }

  supprimerPhoto(p: Photo, evenement: Event): void {
    evenement.stopPropagation();

    this.galerie.supprimerPhoto(p.id).subscribe({
      next: () => {
        this.photos.update((l) => l.filter((x) => x.id !== p.id));
        this.toast.succes('Photo retirée.');
      },
      error: (e) => this.toast.erreur(
        e?.error?.detail || 'Vous ne pouvez pas retirer cette photo.'),
    });
  }
}
