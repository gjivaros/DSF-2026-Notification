# Passerelle SMS centralisée

Passerelle unique d'envoi de SMS pour les applications de l'État. Elle couvre l'authentification par application, les quotas journaliers en segments, le routage vers 3 opérateurs simulés (MTN, MOOV, CELTIIS), une file d'attente prioritaire, les retries, les webhooks signés, un dashboard d'administration et une documentation Swagger.

**Stack** : NestJS 11 · TypeScript · Prisma + PostgreSQL · BullMQ + Redis · Jest + supertest

## Accès rapide (une fois lancé)

| Quoi | URL | Identifiants (valeurs de `.env.sample`) |
|---|---|---|
| **Dashboard admin** | http://localhost:3000/dashboard | `root@sms-gateway.bj` / `ChangeMe-Root-2026` |
| **Swagger** | http://localhost:3000/docs | basic auth `docs` / `change-me-docs-password` |
| API des applications | http://localhost:3000 | voir « Accès de démonstration » ci-dessous |

## Lancer le projet

### Avec Docker

```bash
cp .env.sample .env
docker compose up --build
curl localhost:3000/health   # {"status":"ok","database":"up","redis":"up"}
```

Au démarrage, les migrations et le seed s'exécutent automatiquement.

### En local (Node 22, PostgreSQL et Redis installés)

```bash
nvm use                       # Node 22
npm install
cp .env.sample .env           # adapter DATABASE_URL
npx prisma migrate deploy && npx prisma db seed
npm run start:dev
```

## Tests

```bash
npm test                      # tests unitaires : segments, routage, fenêtre horaire, chiffrement
npm run test:e2e              # tests d'intégration : base PostgreSQL et Redis réels
```

Les tests d'intégration lisent `.env.test`. Pour le créer :

```bash
cp .env .env.test
```

Puis, dans `.env.test`, modifier ces valeurs :

```bash
DATABASE_URL=...sms_gateway_test     # base dédiée aux tests
REDIS_URL=redis://localhost:6379/1   # base Redis distincte
PORT=3100
APP_URL=http://localhost:3100
SIMULATOR_DLR_DELAY_MS=50
SMS_RETRY_BASE_DELAY_MS=10
RATE_LIMIT_PER_SECOND=1000
```

La base de test est créée et migrée automatiquement.

## Accès de démonstration (seed)

| Application | Header `X-App-Code` | Header `X-Api-Key` | Quota/jour |
|---|---|---|---|
| Etat civil | `ETATCIVIL` | `etatcivil-dev-api-key` | 100 segments |
| Courrier | `COURRIER` | `courrier-dev-api-key` | 5 segments |

Le **root admin** est créé par le seed à partir de `ROOT_ADMIN_EMAIL` et `ROOT_ADMIN_PASSWORD`. Il se connecte au dashboard, ou à l'API via `POST /auth/login`, qui renvoie un token `Bearer` valable 8 h.

## Dashboard d'administration

Il est servi sur `/dashboard`, sous forme d'une page HTML avec du JavaScript simple. Il consomme les routes `/auth` et `/admin`.

| Rôle | Ce qu'il peut faire |
|---|---|
| **ROOT** | Vue d'ensemble (volumes par application, opérateur et statut), créer une application (API key affichée une seule fois), suspendre ou réactiver avec historique, **ajouter des administrateurs** et leur attribuer des applications, désactiver un admin |
| **APP_ADMIN** | Sur **ses** applications uniquement : voir les SMS et leurs statuts, annuler ou relancer, voir et **lancer des campagnes**, **envoyer un SMS de test** avec suivi en direct, voir la consommation du quota |

Seul le root ajoute des administrateurs. Il les crée avec un mot de passe initial, qu'il leur transmet lui-même. Les envois faits depuis le dashboard passent par les mêmes services que l'API : mêmes règles, même quota, même idempotence.

**Pour tester** : se connecter en root, puis dans *Administrateurs*, créer un admin rattaché à `ETATCIVIL`. Se reconnecter avec ce compte et utiliser *Envoyer un test*, avec un numéro finissant par 0, 7, 8 ou 9.

## Endpoints

Toutes les erreurs ont le format `{ "code": "...", "message": "..." }`, avec le status HTTP adapté.

| Méthode | Route | Accès | Description |
|---|---|---|---|
| POST | `/sms` | App + `Idempotency-Key` | Soumettre un SMS : `to`, `text`, `category` (`OTP` ou `INFO`), `reference?`, `scheduledAt?`. Répond `{id, segments, status}` |
| GET | `/sms` | App | Lister ses SMS (`status`, `category`, `campaignId`, `page`, `limit`) |
| GET | `/sms/:id` | App | Statut d'un SMS |
| POST | `/sms/:id/cancel` | App | Annuler un SMS `pending` (le quota est rendu) |
| POST | `/sms/:id/retry` | App + `Idempotency-Key` | Relancer un SMS `failed` (le quota est consommé à nouveau) |
| POST | `/campaigns` | App + `Idempotency-Key` | Campagne INFO, 500 destinataires au plus (`recipients[]`, `text`, …) |
| GET | `/campaigns`, `/campaigns/:id` | App | Campagnes, avec le nombre de SMS par statut |
| GET | `/usage/daily` | App | Consommation du jour : `{day, quota, used, remaining}` |
| POST | `/auth/login`, `/auth/logout` · GET `/auth/me` | Public / Bearer | Session du dashboard |
| GET | `/admin/stats?from&to` | ROOT | Volumes par application, par opérateur et par statut (jour courant par défaut) |
| GET · POST | `/admin/applications` | ROOT (lecture aussi APP_ADMIN) | Lister ou créer des applications |
| PATCH · GET | `/admin/applications/:appId/status`, `/status-history` | ROOT | Suspendre ou réactiver, historique |
| GET · POST | `/admin/users`, PUT `/admin/users/:id/applications`, PATCH `/admin/users/:id/status` | ROOT | Administrateurs d'application |
| GET · POST | `/admin/applications/:appId/sms[/:smsId[/cancel\|/retry]]` | ROOT, APP_ADMIN (ses apps) | SMS de l'application, envoi de test |
| GET · POST | `/admin/applications/:appId/campaigns[/:id]`, GET `/admin/applications/:appId/usage` | ROOT, APP_ADMIN (ses apps) | Campagnes et quota |
| POST | `/operators/:operator/dlr` | Signature opérateur | Accusé de livraison (appelé par le simulateur) |
| POST | `/simulator/webhook-sink` | Signature webhook | Récepteur de démonstration des webhooks clients |
| GET | `/health` | Public | État de PostgreSQL et Redis |

### Exemples

```bash
APP=(-H 'X-App-Code: ETATCIVIL' -H 'X-Api-Key: etatcivil-dev-api-key' -H 'Content-Type: application/json')

# OTP : envoyé immédiatement, prioritaire, puis delivered environ 1 s plus tard
curl -X POST localhost:3000/sms "${APP[@]}" -H 'Idempotency-Key: otp-1' \
  -d '{"to":"0150000000","text":"Votre code est 123456","category":"OTP"}'
# Rejouer la même commande renvoie la même réponse, sans doublon
curl localhost:3000/sms/<id> "${APP[@]}"

# INFO programmé, puis annulé
curl -X POST localhost:3000/sms "${APP[@]}" -H 'Idempotency-Key: info-1' \
  -d '{"to":"0140000000","text":"Votre acte est prêt","category":"INFO","scheduledAt":"2030-01-01T10:00:00+01:00"}'
curl -X POST localhost:3000/sms/<id>/cancel "${APP[@]}"

# Échec définitif (numéro finissant par 8), puis retry manuel
curl -X POST localhost:3000/sms "${APP[@]}" -H 'Idempotency-Key: fail-1' \
  -d '{"to":"0190000008","text":"Code 654321","category":"OTP"}'
curl -X POST localhost:3000/sms/<id>/retry "${APP[@]}" -H 'Idempotency-Key: retry-1'

# Campagne
curl -X POST localhost:3000/campaigns "${APP[@]}" -H 'Idempotency-Key: camp-1' \
  -d '{"recipients":["0150000000","0140000000","0190000000"],"text":"Fermeture exceptionnelle"}'

curl localhost:3000/usage/daily "${APP[@]}"

# Admin : connexion puis statistiques
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"root@sms-gateway.bj","password":"ChangeMe-Root-2026"}' | jq -r .token)
curl localhost:3000/admin/stats -H "Authorization: Bearer $TOKEN"
```

## Simuler les erreurs opérateur

Les erreurs dépendent du **dernier chiffre du numéro** :

| Dernier chiffre | Résultat |
|---|---|
| `7` | `ECHEC_TEMPORAIRE` : 3 retries automatiques (2 s, 4 s, 8 s), puis `failed` |
| `8` | `ECHEC_DEFINITIF` : `failed` immédiatement |
| `9` | `ECHEC_OPERATEUR` : 3 retries automatiques, puis `failed` |
| autre | Succès : `transmitted`, puis `delivered` quand l'accusé signé arrive |

Des échecs aléatoires peuvent aussi être activés avec `SIMULATOR_*_FAILURE_RATE` (entre 0 et 1).

## Webhooks clients

À chaque statut final (`delivered`, `failed` ou `cancelled`), la passerelle envoie un `POST` à l'URL de webhook de l'application. Le body contient `event`, `smsId`, `campaignId`, `reference`, `status`, `failureReason`, `segments` et `occurredAt`. **Le texte n'est jamais inclus.**

Pour vérifier la signature côté client :

```
X-Signature = "sha256=" + HMAC_SHA256(webhookSecret, X-Timestamp + "." + rawBody)
```

Le `webhookSecret` de chaque application est affiché dans les logs du seed. En démo, les webhooks sont envoyés à `/simulator/webhook-sink`, qui vérifie la signature et logge `signatureValid=true`.

## Fonctionnalités implémentées

- [x] Authentification des applications par code et API key (hachée), statut `active`/`suspended` avec historique
- [x] RBAC (rôles `APP`, `ROOT` et `APP_ADMIN`) et ABAC : une application ou un admin d'application ne voit que ses propres ressources (404 sinon)
- [x] Dashboard d'administration (`/dashboard`) : comptes root et admins d'application (email + mot de passe scrypt, sessions révocables), gestion des applications et des admins, SMS, campagnes, envoi de test
- [x] Documentation Swagger (`/docs`) protégée par basic auth
- [x] Validation des numéros (`01` + 8 chiffres) et routage par préfixe : CELTIIS 40-49, MTN 50-69, MOOV 90-99
- [x] Calcul des segments (160 caractères en ASCII, 70 sinon), 6 segments au maximum
- [x] Quota journalier en segments, remis à zéro à minuit GMT+1, réservé de façon atomique (pas de dépassement en concurrence)
- [x] File BullMQ : OTP prioritaires et immédiats ; INFO envoyés seulement entre 07h et 21h (GMT+1), sinon reportés à 07h ; envois programmés
- [x] Statuts `pending → transmitted → delivered | failed`, plus `cancelled` ; annulation et retry manuel
- [x] 3 retries avec backoff exponentiel sur les échecs temporaires et opérateur
- [x] Accusés de livraison opérateur acceptés uniquement avec une signature HMAC valide
- [x] Webhooks clients signés HMAC, avec retries
- [x] Idempotence (`Idempotency-Key`, valable 24 h, par application)
- [x] Campagnes INFO jusqu'à 500 destinataires (tout ou rien)
- [x] OTP protégés : chiffrés en base (AES-256-GCM), jamais dans les réponses, les logs, les webhooks ni la file
- [x] Rate limiting par application (stocké dans Redis), logs de requêtes, `/health`, statistiques admin

## Choix techniques et limites

- **BullMQ + Redis** : priorité, envois différés et backoff exponentiel sont natifs. L'API et les workers sont sans état, il suffit d'ajouter des réplicas pour monter en charge.
- **Quota consommé à la soumission** : l'application est fixée tout de suite. Le quota est rendu à l'annulation et consommé à nouveau au retry manuel ; un échec ne le rembourse pas.
- **Idempotence** : le hash de requête est un HMAC avec une clé serveur. Un simple SHA-256 du body permettrait de retrouver un code OTP par force brute.
- **Accusés de livraison simulés** par un timer en mémoire : ils sont perdus si le process redémarre, ce qui est acceptable pour un simulateur.
- **Rate limit** : il se base sur `X-App-Code` avant l'authentification. Un tiers qui connaît le code d'une application pourrait épuiser son compteur.
- **Dashboard sans framework** : une page HTML avec du JavaScript simple, servie par Nest, sans dépendance ni build front.
- **Sessions** : token opaque, dont seul le SHA-256 est stocké en base. Il est révocable (déconnexion, désactivation d'un admin), sans JWT ni dépendance supplémentaire.
- **Limites** : pas d'envoi d'email d'invitation (le mot de passe initial est transmis par le root) et pas de verrouillage dédié contre le brute force sur `/auth/login` (seulement le rate limit par IP).
