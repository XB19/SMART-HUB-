import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DialogueService } from '../../core/dialogue.service';
import { ToastService } from '../../core/toast.service';
import { Salle, Equipement, Filiale } from '../../core/models';
import { SalleVisuelleComponent } from '../../shared/salle-visuelle.component';
import { IconComponent } from '../../shared/icon.component';
import { NavigationService } from '../../core/navigation.service';

@Component({
  selector: 'app-salles',
  imports: [CommonModule, FormsModule, SalleVisuelleComponent, IconComponent],
  template: `
  <div class="entete anim-entree">
    <h1>Salles</h1>
    <button class="btn cta" (click)="nouveau()"><app-icon name="plus"/> Nouvelle salle</button>
  </div>

  @if (formVisible()) {
    <div class="carte form anim-entree">
      <h3>{{ form.id ? 'Modifier' : 'Créer' }} une salle</h3>
      <div class="ligne">
        <div class="champ"><label>Nom</label><input [(ngModel)]="form.nom" /></div>
        <div class="champ"><label>Filiale propriétaire</label>
          <select [(ngModel)]="form.filiale" [disabled]="!estAdmin()">
            @for (f of filiales(); track f.id) {
              @if (f.active || f.id === form.filiale) { <option [ngValue]="f.id">{{ f.nom }}</option> }
            }
          </select>
        </div>
        <div class="champ"><label>Capacité</label>
          <input type="number" min="1" [(ngModel)]="form.capacite" /></div>
      </div>
      <div class="champ"><label>Équipements</label>
        <div class="equip-list">
          @for (e of equipements(); track e.code) {
            <label class="case">
              <input type="checkbox" [checked]="aEquip(e.code)" (change)="basculerEquip(e.code)" />
              {{ e.libelle }}
            </label>
          }
        </div>
      </div>
      <div class="champ"><label>Photo (optionnel)</label>
        <input type="file" accept="image/*" (change)="onPhoto($event)" />
        @if (photoNom()) { <small class="ph-info">Sélectionné : {{ photoNom() }}</small> }
      </div>
      @if (erreur()) { <div class="alerte err">{{ erreur() }}</div> }
      <div class="boutons">
        <button class="btn vert" (click)="enregistrer()">Enregistrer</button>
        <button class="btn secondaire" (click)="formVisible.set(false)">Annuler</button>
      </div>
    </div>
  }

  <div class="grille stagger">
    @for (s of salles(); track s.id) {
      <div class="carte salle">
        @if (s.photo) {
          <img class="photo" [src]="s.photo" [alt]="'Photo ' + s.nom" />
        }
        <app-salle-visuelle [salle]="s" />
        <div class="meta">
          <strong>{{ s.nom }}</strong>
          <small>{{ s.filiale_nom }} · {{ s.capacite }} places</small>
        </div>
        @if (peutGerer(s)) {
          <div class="boutons">
            <button class="btn secondaire petit" (click)="editer(s)"><app-icon name="edit" [size]="14"/> Modifier</button>
            <button class="btn rouge petit" (click)="supprimer(s)"><app-icon name="trash" [size]="14"/> Supprimer</button>
          </div>
        }
      </div>
    } @empty { <div class="vide">Aucune salle.</div> }
  </div>
  `,
  styles: [`
    .entete { display:flex; justify-content:space-between; align-items:center; }
    .form { margin-bottom: 1rem; }
    .equip-list { display: flex; gap: 1rem; flex-wrap: wrap; }
    .case { display: flex; align-items: center; gap: .4rem; font-weight: 500; }
    .case input { width: auto; }
    .boutons { display: flex; gap: .5rem; margin-top: .6rem; }
    .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 1rem; }
    .salle { text-align: center; }
    .photo { width: 100%; height: 130px; object-fit: cover; border-radius: 10px; margin-bottom: .8rem; }
    .meta { margin: .6rem 0; display: flex; flex-direction: column; }
    .meta small { color: var(--gris-texte); }
    .ph-info { color: var(--vert); font-size: .78rem; }
  `],
})
export class SallesComponent implements OnInit {
  salles = signal<Salle[]>([]);
  equipements = signal<Equipement[]>([]);
  filiales = signal<Filiale[]>([]);
  formVisible = signal(false);
  erreur = signal('');
  form: any = { id: null, nom: '', filiale: null, capacite: 10, equipements: [] };
  photoFile: File | null = null;
  photoNom = signal('');

  constructor(
    private api: ApiService, private auth: AuthService,
    private dialogue: DialogueService, private toasts: ToastService,
  ) {
    inject(NavigationService).vuesLocales(this.formVisible);
  }

  ngOnInit(): void {
    this.charger();
    this.api.equipements().subscribe((e) => this.equipements.set(e));
    this.api.filiales().subscribe((p) => this.filiales.set(p.results));
  }

  charger(): void {
    this.api.salles({ toutes: 1 }).subscribe((p) => this.salles.set(p.results));
  }

  estAdmin(): boolean { return this.auth.aRole('ADMINISTRATEUR'); }
  peutGerer(s: Salle): boolean {
    const u = this.auth.utilisateur();
    return this.estAdmin() || (u?.role === 'SECRETAIRE' && u.filiale === s.filiale);
  }

  nouveau(): void {
    const u = this.auth.utilisateur();
    this.form = { id: null, nom: '', filiale: u?.filiale ?? this.filiales().find((f) => f.active)?.id ?? null,
      capacite: 10, equipements: [] };
    this.photoFile = null; this.photoNom.set('');
    this.erreur.set(''); this.formVisible.set(true);
  }
  editer(s: Salle): void {
    this.form = { id: s.id, nom: s.nom, filiale: s.filiale, capacite: s.capacite,
      equipements: [...(s.equipements || [])] };
    this.photoFile = null; this.photoNom.set('');
    this.erreur.set(''); this.formVisible.set(true);
  }

  onPhoto(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.photoFile = f;
    this.photoNom.set(f?.name ?? '');
  }

  aEquip(code: string): boolean { return this.form.equipements.includes(code); }
  basculerEquip(code: string): void {
    this.form.equipements = this.aEquip(code)
      ? this.form.equipements.filter((c: string) => c !== code)
      : [...this.form.equipements, code];
  }

  enregistrer(): void {
    this.erreur.set('');
    // Si une photo est sélectionnée : envoi en multipart (FormData).
    let corps: any = this.form;
    if (this.photoFile) {
      const fd = new FormData();
      fd.append('nom', this.form.nom);
      fd.append('filiale', String(this.form.filiale));
      fd.append('capacite', String(this.form.capacite));
      fd.append('equipements', JSON.stringify(this.form.equipements));
      fd.append('photo', this.photoFile);
      corps = fd;
    }
    const obs = this.form.id
      ? this.api.majSalle(this.form.id, corps)
      : this.api.creerSalle(corps);
    obs.subscribe({
      next: () => { this.formVisible.set(false); this.charger(); },
      error: (e) => this.erreur.set(this.msg(e)),
    });
  }
  async supprimer(s: Salle): Promise<void> {
    const ok = await this.dialogue.demanderConfirmation({
      titre: 'Supprimer la salle',
      message: `« ${s.nom} » — cette action est définitive.`,
      libelleConfirmer: 'Supprimer',
      dangereux: true,
    });
    if (!ok) return;
    this.api.supprimerSalle(s.id).subscribe({
      next: () => this.charger(),
      error: (e) => this.toasts.afficher({ titre: 'Suppression impossible', message: this.msg(e), type: 'ERROR' }),
    });
  }

  private msg(e: any): string {
    const d = e?.error;
    if (typeof d === 'string') return d;
    if (d?.detail) return d.detail;
    if (d && typeof d === 'object') return Object.values(d).flat().join(' ');
    return 'Erreur.';
  }
}
