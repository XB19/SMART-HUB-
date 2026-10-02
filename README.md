# SMART HUB — OSEOR Digitalisation

Plateforme de gestion administrative du groupe OSEOR (réservation de salles,
audiences, documents administratifs — Fiche de besoin, Demande d'achat,
Fiche de transport, Bon de sortie de caisse). Backend Django (API REST) +
frontend Angular, dockerisés.

## Démarrage rapide (Docker)

Prérequis : [Docker Desktop](https://www.docker.com/products/docker-desktop/) installé.

```bash
docker compose up --build
```

- Application : http://localhost
- API : http://localhost/api
- Admin Django : http://localhost/admin

Hébergement sur un VPS, en HTTPS (requis pour « Se connecter avec
Microsoft ») : copier `.env.vps.example` en `.env`, le remplir, puis

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

Détails et configuration Microsoft Entra ID : `docs/ENTRA_ID.md`.

### Première connexion

Au premier démarrage, la base est vide. Créer un compte administrateur :

```bash
docker compose exec api python manage.py createsuperuser
```

Ou charger le jeu de données de démonstration (comptes de test, filiales,
salles) :

```bash
docker compose exec api python manage.py loaddata fixtures/donnees_test.json
docker compose exec api python manage.py seed_config_documents
```

## Configuration

Le comportement de l'application se règle par variables d'environnement,
passées via `docker-compose.yml` (valeurs par défaut incluses) ou un fichier
`backend/.env` en développement local (voir `backend/.env.example`).

| Variable | Rôle |
|---|---|
| `SECRET_KEY` | Clé secrète Django — **à changer en production**. |
| `DEBUG` | `True` en développement, `False` en production. |
| `ALLOWED_HOSTS` | Domaines autorisés à servir l'application. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` | Connexion PostgreSQL. |
| `REDIS_URL` | Partage des notifications temps réel entre les services `api` et `ws`. |
| `CORS_ALLOWED_ORIGINS` | Origines autorisées à appeler l'API. |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` | SMTP pour l'envoi d'e-mails (notifications). Sans ça, les e-mails s'affichent seulement dans les logs. |

## Active Directory (LDAP) — synchronisation des utilisateurs

La page **Utilisateurs** propose un bouton de synchronisation des comptes
depuis un annuaire **Active Directory local de l'entreprise** (LDAP) — à ne
pas confondre avec Azure AD (cloud). Cette fonctionnalité **ne peut pas être
configurée par le développeur** : elle nécessite des informations propres au
réseau interne de l'entreprise, à demander à votre service informatique.

### Ce que le service informatique doit fournir

1. **Adresse du serveur LDAP** du contrôleur de domaine (ex. `ldap://192.168.1.10`
   ou `ldaps://...` si le chiffrement TLS est activé).
2. **Domaine NetBIOS** (nom court du domaine Windows, ex. `OSEOR`).
3. **Base DN** — racine de recherche dans l'annuaire (ex. `DC=oseor,DC=local`).
4. **Un compte de service** dédié à cette synchronisation (recommandé : lecture
   seule, sans droits d'administration), avec :
   - son DN complet (ex. `CN=svcOseorSync,OU=Services,DC=oseor,DC=local`)
   - son mot de passe

Le serveur qui héberge l'application (le conteneur `api`) doit aussi avoir un
accès réseau à ce contrôleur de domaine (même réseau local, ou VPN site-à-site
si l'application est hébergée ailleurs).

### Où le configurer

Une fois ces informations en main, un compte **Administrateur** de
l'application les saisit lui-même, sans intervention développeur :

**Administration → Active Directory** (menu latéral, visible uniquement par
les administrateurs) → remplir les 5 champs → bouton **« Tester la
connexion »** pour vérifier avant d'enregistrer.

Le mot de passe du compte de service est stocké chiffré en base (jamais en
clair), et cette configuration peut être modifiée à tout moment sans
redémarrer l'application.

### Limite connue

La correspondance entre les **groupes Active Directory** et les **rôles de
l'application** (Administrateur, Directeur, Secrétaire, Comptable...) est
actuellement définie dans le code (`backend/applications/utilisateurs/services_ad.py`,
dictionnaire `GROUPES_ROLES`). Si les noms de groupes AD de l'entreprise
diffèrent de ceux prévus par défaut, une petite modification de code est
nécessaire pour les faire correspondre — à demander au développeur si besoin.

## Rôles utilisateurs

| Rôle | Accès principal |
|---|---|
| Administrateur | Accès complet, y compris Administration et gestion des utilisateurs. |
| Directeur Général | Approuve/décline les documents et audiences de tout le groupe. |
| Secrétaire | Réservation de salles, audiences, bons de commande, factures, notes internes. |
| Chef de service | Contrats, prestations de services, gestion de stocks. |
| Comptable | Factures, rapports administratifs, bon de sortie de caisse. |
| RH | Accès de base. |
| Employé | Réservations, audiences, demandes courantes. |
