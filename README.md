# SMART HUB — OSEOR Digitalisation

Plateforme de gestion administrative du groupe OSEOR : réservation de
salles, audiences, visiteurs, congés, documents administratifs (fiche de
besoin, demande d'achat, fiche de transport, bon de sortie de caisse…),
connexion et annuaire Microsoft Entra ID.

| Dossier | Contenu |
|---|---|
| `backend/` | API REST Django, WebSocket (notifications), tâches Celery |
| `frontend/` | Application Angular, servie par nginx en production |
| `deploy/` | Configuration de Caddy (HTTPS) pour le VPS |
| `docs/` | Documentation détaillée (Microsoft Entra ID) |
| `docker-compose.yml` | Lancement complet de l'application |
| `docker-compose.vps.yml` | Surcouche pour un VPS en HTTPS |

## Lancer en local (Docker)

Prérequis : [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
docker compose exec api python manage.py createsuperuser
```

- Application : http://localhost
- Admin Django : http://localhost/admin

Le compte créé par `createsuperuser` est **administrateur** de SMART HUB
(rôle « Administrateur Groupe ») et de l'admin Django.

Pour un jeu de données de démonstration (comptes de test, filiales, salles) :

```bash
docker compose exec api python manage.py loaddata fixtures/donnees_test.json
docker compose exec api python manage.py seed_config_documents
docker compose exec api python manage.py seed_aide
```

## Déploiement sur un VPS

Le VPS sert l'application en HTTPS (obligatoire pour la connexion
Microsoft). Caddy obtient et renouvelle seul le certificat Let's Encrypt :
rien d'autre que Docker à installer.

**Prérequis**

- un VPS Linux avec Docker et Docker Compose 2.24 ou plus récent ;
- un nom de domaine dont l'enregistrement DNS `A` pointe vers l'IP du VPS ;
- les ports **80 et 443** ouverts (pare-feu du VPS et de l'hébergeur).

**Premier déploiement**

```bash
git clone https://github.com/XB19/SMART-HUB-.git smarthub && cd smarthub
cp .env.vps.example .env
nano .env        # DOMAINE, SECRET_KEY, DB_PASSWORD, AZURE_*, e-mails
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.vps.yml \
    exec api python manage.py createsuperuser
```

L'application répond ensuite sur `https://<DOMAINE>`. Les migrations
s'appliquent seules au démarrage du conteneur `api`.

**Mettre à jour**

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

**Consulter les journaux**

```bash
docker compose -f docker-compose.yml -f docker-compose.vps.yml logs api --tail 100
```

**Ce que fait `docker-compose.vps.yml`** : Caddy écoute sur 80/443 et relaie
tout à nginx ; l'API, le WebSocket et nginx ne sont plus exposés sur
Internet ; Django passe en production (`DEBUG=False`) et ne répond qu'au
domaine.

## Microsoft Entra ID

Avec les trois variables `AZURE_*`, SMART HUB propose :

- **« Se connecter avec Microsoft »** sur la page de connexion ;
- **« Synchroniser depuis Entra ID »** sur la page *Utilisateurs*, qui
  importe les comptes de l'annuaire Microsoft de l'entreprise ;
- **Administration → Microsoft Entra ID**, qui affiche la configuration
  et teste la connexion.

À faire dans Entra (inscription d'application) : Redirect URI
`https://<DOMAINE>/oidc/callback/` (type Web), un secret client, et la
permission Microsoft Graph `User.Read.All` (type Application, avec
consentement administrateur) pour la synchronisation. Pas à pas complet et
dépannage : [`docs/ENTRA_ID.md`](docs/ENTRA_ID.md).

Les identifiants se règlent uniquement dans le `.env` du serveur, jamais
dans l'application.

## Configuration

Variables lues par le backend : `.env` à la racine pour Docker (modèle
`.env.vps.example`), `backend/.env` en développement sans Docker (modèle
`backend/.env.example`).

| Variable | Rôle |
|---|---|
| `DOMAINE` | Nom de domaine public (VPS uniquement). |
| `SECRET_KEY` | Clé secrète Django — longue, aléatoire, propre au serveur. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Base PostgreSQL. Le mot de passe est fixé au premier lancement. |
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | Microsoft Entra ID (facultatif). |
| `EMAIL_BACKEND`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | Envoi des e-mails. Sans eux, les e-mails s'affichent dans les journaux. |
| `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | Réglés automatiquement sur le VPS ; utiles seulement hors VPS. |

## Développement sans Docker

Prérequis : Python 3.12+, Node 22+, PostgreSQL.

```bash
# Backend (http://127.0.0.1:8000)
cd backend
python -m venv venv && venv\Scripts\activate    # Linux/macOS : source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                          # puis renseigner DB_PASSWORD…
python manage.py migrate
python manage.py runserver

# Frontend (http://localhost:4200), dans un second terminal
cd frontend
npm install
npm start
```

`runserver` sert à la fois l'API et le WebSocket : pas besoin de Redis en
développement. Tests du backend : `python manage.py test`.

## Rôles utilisateurs

| Rôle | Accès principal |
|---|---|
| Administrateur Groupe | Accès complet, y compris Administration et gestion des utilisateurs. |
| Directeur | Approuve/décline les documents et audiences de tout le groupe. |
| Secrétaire | Réservation de salles, audiences, visiteurs, bons de commande, factures, notes internes. |
| Chef de service | Contrats, prestations de services, gestion de stocks. |
| Comptable | Factures, rapports administratifs, bon de sortie de caisse. |
| RH | Validation des congés, dossiers disciplinaires. |
| Agent de sécurité | Accueil des visiteurs et enregistrement de leur départ. |
| Employé | Réservations, audiences, demandes courantes. |

Les droits SMART HUB dépendent uniquement de ce rôle, modifiable dans
*Utilisateurs* ; les cases « super-utilisateur » de Django ne concernent
que l'admin Django (`/admin`).
