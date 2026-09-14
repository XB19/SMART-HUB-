# Connexion Microsoft Entra ID

SmartHub sait se connecter par Microsoft Entra ID (ex-Azure AD). La
fonction est **facultative et inactive par défaut** : tant que les
identifiants ci-dessous ne sont pas renseignés, la page de connexion ne
propose que l'identifiant et le mot de passe, exactement comme avant.

---

## 1. Ce que fait le SSO, et ce qu'il ne fait pas

**Il fait :** Entra authentifie la personne — mot de passe, MFA, accès
conditionnel, tout se joue chez Microsoft. SmartHub ne voit jamais le mot
de passe. Au retour, l'application émet ses propres jetons ; le reste de
l'application ne sait pas par quelle porte l'utilisateur est entré.

**Il ne fait pas :** l'organigramme. Le responsable hiérarchique et la
filiale restent gérés dans SmartHub. C'est un choix : ils commandent tout
le circuit de validation (congés, bons de sortie), et l'attribut
`manager` d'Entra ne voyage pas dans le jeton — il demanderait un appel
séparé à Microsoft Graph.

> **Conséquence à connaître.** Un salarié qui se connecte pour la première
> fois sans avoir de compte préexistant arrive **sans responsable et sans
> filiale**. Il ne pourra pas déposer de congé, faute de circuit où
> l'acheminer. Deux façons de l'éviter :
>
> - créer les comptes à l'avance dans SmartHub avec la même adresse e-mail
>   — la connexion Microsoft les retrouve et ne crée pas de doublon ;
> - ou laisser la création automatique, et compléter l'organigramme depuis
>   *Utilisateurs* après la première connexion.

## 2. À faire dans Entra (administrateur du tenant)

**App registrations → Nouvelle inscription**

| Réglage | Valeur |
|---|---|
| Nom | SmartHub |
| Comptes pris en charge | Ce répertoire d'organisation uniquement |
| Redirect URI (type **Web**) | `https://<domaine>/oidc/callback/` |

L'URI de redirection doit correspondre **au caractère près** à celle que
l'application enverra. Entra n'accepte le HTTP que pour `http://localhost`
— en production, HTTPS est obligatoire.

**Certificates & secrets** → nouveau secret client. Noter la *Value* (elle
ne se réaffiche jamais) et sa date d'expiration : le jour où elle expire,
le SSO s'arrête.

**Token configuration** — sans cette étape, tout le monde arrive au rôle
`EMPLOYE` :

- *Add groups claim* → groupes de sécurité, dans le jeton d'identité
- *Add optional claim* → ID token → `jobTitle` (repli quand un salarié
  n'est dans aucun groupe)

**Enterprise application → Properties** : mettre *User assignment
required* à **Oui** pour n'ouvrir SmartHub qu'aux personnes explicitement
affectées. C'est le meilleur endroit pour filtrer — Entra refuse alors
bien avant que SmartHub ne soit sollicité.

## 3. Groupes attendus

Les noms sont dans `backend/applications/utilisateurs/oidc.py`
(`GROUPES_ROLES`), à adapter à ceux du tenant. Les ObjectID de groupes
fonctionnent aussi comme clés, si Entra est configuré pour les émettre à
la place des noms.

| Groupe Entra | Rôle SmartHub |
|---|---|
| `OSEOR-Administrateurs` | ADMINISTRATEUR |
| `OSEOR-DG` | DIRECTEUR |
| `OSEOR-Secretariat` | SECRETAIRE |
| `OSEOR-RH` | RH |
| `OSEOR-Comptabilite` | COMPTABLE |
| `OSEOR-Chefs-Service` | CHEF_SERVICE |

Un rôle déjà attribué dans SmartHub **n'est jamais écrasé** par l'annuaire :
promouvoir quelqu'un dans l'application reste possible sans toucher à
Entra. L'annuaire ne décide du rôle qu'à la création du compte, ou tant
que celui-ci est resté à `EMPLOYE`.

## 4. À faire côté serveur

Dans `backend/.env` (ou l'environnement du conteneur) :

```ini
AZURE_TENANT_ID=<Directory (tenant) ID>
AZURE_CLIENT_ID=<Application (client) ID>
AZURE_CLIENT_SECRET=<la Value du secret>
FRONTEND_URL=https://<domaine>
```

Puis :

```bash
docker compose up -d --build
```

La migration `0009_codeconnexionsso` s'applique au démarrage du service
`api` (`RUN_MIGRATIONS=1`).

Le bouton « Se connecter avec Microsoft » apparaît alors de lui-même : la
page de connexion demande à l'API si le SSO est configuré, et ne l'affiche
que dans ce cas.

## 5. Points de vigilance

**HTTPS est obligatoire.** `frontend/nginx.conf` écoute en clair sur le
port 80 ; il faut un certificat devant (terminaison TLS sur nginx, ou un
reverse proxy en amont) avant que le SSO puisse fonctionner ailleurs que
sur `localhost`. Django est déjà prêt : `SECURE_PROXY_SSL_HEADER` est
configuré, et nginx transmet `X-Forwarded-Proto`. Sans cela, l'application
annoncerait `http` dans son URI de redirection et Entra refuserait
l'échange.

**Garder une porte locale.** L'authentification par mot de passe reste
active en parallèle, volontairement : l'administration Django en dépend,
et un tenant indisponible ne doit pas fermer l'application à tout le
monde. Conserver au moins un compte administrateur local.

**Fermer un accès.** Décocher « actif » dans SmartHub suffit : la
connexion est refusée même par Microsoft, sans attendre que le compte
Entra soit supprimé.

**Ne pas confondre avec le LDAP.** *Administration → Active Directory* et
le bouton *Synchroniser depuis Active Directory* visent un contrôleur de
domaine **sur site**, en LDAP. Entra ID ne parle pas LDAP : les deux
intégrations sont indépendantes et peuvent coexister ou non.

## 6. Comment les jetons circulent

Après authentification, Entra renvoie sur `/oidc/callback/`, qui émet un
**code à usage unique valable une minute** et redirige vers
`/auth/callback?code=…`. Le frontend l'échange en POST contre la paire de
jetons.

Ce détour évite de faire voyager les jetons dans l'URL de redirection, où
ils se seraient inscrits dans l'historique du navigateur, dans les
journaux nginx et dans l'en-tête `Referer` des pages suivantes — un jeton
de rafraîchissement vaut sept jours d'accès. Seule l'empreinte du code est
stockée en base.

## 7. Vérifier

```bash
# Sans configuration : deux tests se sautent d'eux-mêmes.
python manage.py test applications.utilisateurs.tests_sso

# Avec des identifiants (même factices) : la chaîne complète est exercée,
# sans qu'aucun appel ne parte chez Microsoft.
AZURE_TENANT_ID=x AZURE_CLIENT_ID=y AZURE_CLIENT_SECRET=z \
    python manage.py test applications.utilisateurs.tests_sso
```

## 8. Si ça ne marche pas

| Symptôme | Cause probable |
|---|---|
| Pas de bouton Microsoft | Une des trois variables `AZURE_*` est vide — vérifier `/api/auth/sso/etat/` |
| `AADSTS50011` (redirect URI mismatch) | L'URI inscrite dans Entra ne correspond pas ; en HTTPS, vérifier que nginx transmet bien `X-Forwarded-Proto` |
| La page d'accueil s'affiche au lieu de partir chez Microsoft | La règle `location /oidc/` manque dans nginx |
| « Code de connexion invalide ou expiré » | Code déjà utilisé, ou plus d'une minute écoulée — relancer la connexion |
| Tout le monde arrive en `EMPLOYE` | Le claim `groups` n'est pas configuré dans *Token configuration* |
| Connexion refusée sans message | Compte inactif dans SmartHub, ou non affecté à l'application dans Entra |
