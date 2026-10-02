import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { LoginComponent } from './pages/login/login.component';
import { MODULES_MOYENS_GENERAUX, CHEMIN_PAR_TYPE_DOCUMENT } from './core/modules-metier';

// Inverse de CHEMIN_PAR_TYPE_DOCUMENT : chemin -> type de document.
const TYPES_DOCUMENT_IMPLEMENTES: Record<string, string> = Object.fromEntries(
  Object.entries(CHEMIN_PAR_TYPE_DOCUMENT).map(([type, chemin]) => [chemin, type]),
);

// Types de documents avec une mise en page dédiée (structure trop
// spécifique pour le moteur générique DocumentsComponent).
// `Partial<>` : un accès à une clé absente doit être typé `undefined`
// (Record seul le typerait à tort comme toujours défini).
const COMPOSANTS_DEDIES: Partial<Record<string, () => Promise<any>>> = {
  FICHE_TRANSPORT: () =>
    import('./pages/fiche-transport/fiche-transport.component').then((c) => c.FicheTransportComponent),
};

// Modules « Moyens Généraux » qui ne sont pas des documents à circuit de
// visa (pas de ConfigurationDocument) mais une fonctionnalité dédiée à part
// entière — chemin -> composant.
const COMPOSANTS_PAR_CHEMIN: Partial<Record<string, () => Promise<any>>> = {
  '/stocks': () => import('./pages/stocks/stocks.component').then((c) => c.StocksComponent),
  // Le bon de sortie n'est plus un document de plus dans le moteur
  // générique : il naît dans la caisse, qui en engendre la pièce à
  // imprimer. Un seul écran, donc, pour la demande et pour l'argent.
  '/bon-sortie-caisse': () =>
    import('./pages/caisse/caisse.component').then((c) => c.CaisseComponent),
  '/contrats': () => import('./pages/contrats/contrats.component').then((c) => c.ContratsComponent),
  '/rapports-administratifs': () =>
    import('./pages/rapports/rapports.component').then((c) => c.RapportsComponent),
};

// Routes générées depuis le registre des modules « Moyens Généraux ». Les
// modules non encore implémentés pointent vers EnConstructionComponent en
// attendant leur tour, sans toucher à la navigation ni aux permissions.
const routesModulesMetier: Routes = MODULES_MOYENS_GENERAUX.map((m) => {
  const typeDocument = TYPES_DOCUMENT_IMPLEMENTES[m.lien];
  const composantDedie = COMPOSANTS_PAR_CHEMIN[m.lien] ?? (typeDocument ? COMPOSANTS_DEDIES[typeDocument] : undefined);
  return {
    path: m.lien.replace(/^\//, ''),
    ...(m.roles ? { canActivate: [roleGuard(...m.roles)] } : {}),
    data: { titre: m.libelle, type: typeDocument },
    loadComponent: composantDedie
      ? composantDedie
      : typeDocument
        ? () => import('./pages/documents/documents.component').then((c) => c.DocumentsComponent)
        : () => import('./pages/en-construction/en-construction.component').then((c) => c.EnConstructionComponent),
  };
});

export const routes: Routes = [
  { path: 'connexion', component: LoginComponent },
  // Retour d'Entra ID. Hors du shell et sans garde : on arrive ici
  // précisément parce qu'on n'est pas encore connecté.
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./pages/auth-callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'tableau-de-bord', pathMatch: 'full' },
      {
        path: 'tableau-de-bord',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'calendrier',
        loadComponent: () =>
          import('./pages/calendrier/calendrier.component').then((m) => m.CalendrierComponent),
      },
      {
        path: 'reserver',
        loadComponent: () =>
          import('./pages/reservation-form/reservation-form.component').then((m) => m.ReservationFormComponent),
      },
      {
        path: 'recurrence',
        loadComponent: () =>
          import('./pages/recurrence/recurrence.component').then((m) => m.RecurrenceComponent),
      },
      {
        path: 'mes-reservations',
        loadComponent: () =>
          import('./pages/mes-reservations/mes-reservations.component').then((m) => m.MesReservationsComponent),
      },
      {
        path: 'validation',
        canActivate: [roleGuard('SECRETAIRE', 'ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/validation/validation.component').then((m) => m.ValidationComponent),
      },
      {
        path: 'salles',
        canActivate: [roleGuard('SECRETAIRE', 'ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/salles/salles.component').then((m) => m.SallesComponent),
      },
      {
        path: 'audiences',
        loadComponent: () =>
          import('./pages/audiences/audiences.component').then((m) => m.AudiencesComponent),
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard('ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/utilisateurs/utilisateurs.component').then((m) => m.UtilisateursComponent),
      },
      {
        path: 'journal',
        canActivate: [roleGuard('ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/journal/journal.component').then((m) => m.JournalComponent),
      },
      {
        path: 'administration',
        canActivate: [roleGuard('ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/administration/administration.component').then((m) => m.AdministrationComponent),
      },
      {
        path: 'conges',
        loadComponent: () =>
          import('./pages/conges/conges.component').then((m) => m.CongesComponent),
      },
      {
        path: 'evenements',
        loadComponent: () =>
          import('./pages/evenements/evenements.component').then((m) => m.EvenementsComponent),
      },
      {
        path: 'notes-recues',
        loadComponent: () =>
          import('./pages/notes-recues/notes-recues.component').then((m) => m.NotesRecuesComponent),
      },
      {
        path: 'galerie',
        loadComponent: () =>
          import('./pages/galerie/galerie.component').then((m) => m.GalerieComponent),
      },
      {
        path: 'prestations-services',
        canActivate: [roleGuard('CHEF_SERVICE', 'DIRECTEUR', 'ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/prestations/prestations.component').then((m) => m.PrestationsComponent),
      },
      {
        path: 'visiteurs',
        canActivate: [roleGuard('AGENT_SECURITE', 'SECRETAIRE', 'DIRECTEUR', 'ADMINISTRATEUR')],
        loadComponent: () =>
          import('./pages/visiteurs/visiteurs.component').then((m) => m.VisiteursComponent),
      },
      {
        // Sans garde de rôle : un salarié convoqué suit le lien de sa
        // notification et ne voit que son propre dossier (le service ne
        // lui en renvoie pas d'autre). L'entrée de menu, elle, reste
        // réservée à ceux qui instruisent.
        path: 'discipline',
        loadComponent: () =>
          import('./pages/discipline/discipline.component').then((m) => m.DisciplineComponent),
      },
      {
        path: 'profil',
        loadComponent: () =>
          import('./pages/profil/profil.component').then((m) => m.ProfilComponent),
      },
      ...routesModulesMetier,
    ],
  },
  { path: '**', redirectTo: '' },
];
