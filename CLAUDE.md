# Règles du projet

# Contexte
Test technique pour le poste de backend. L'énoncé complet est dans ENONCE.md. Le relire avant chaque nouvelle étape ou fonctionnalité.

# Stack
- Node.js, NestJS, TypeScript
- Prisma + PostgreSQL
- Docker et docker compose
- Tests : Jest + supertest

# Conventions
- Un module NestJS par domaine (app, auth, etc.)
- Dans chaque module :
  - {domaine}.controller.ts
  - {domaine}.service.ts
  - {domaine}.module.ts
  - {domaine}.inputs.ts (les DTO)
- Logique métier dans les services, jamais dans les controllers
- Noms de tables, colonnes et variables en anglais ; les valeurs métier imposées par l'énoncé (ex. statuts) restent telles quelles
- Routes en anglais
- Erreurs HTTP au format {code, message}, en anglais, avec le bon status HTTP
- Les secrets sont dans un fichier .env qui doit être dans le .gitignore ; fournir un .env.sample

# Manière de travailler
- Toujours proposer un plan avant de coder
- Expliquer les choix techniques et les trade-offs, brièvement
- Travailler par petites étapes ; s'arrêter à la fin de chaque étape et indiquer comment la vérifier
- Ne pas ajouter de dépendances ni de fonctionnalités non demandées
- Tests : prioriser la logique critique (règles métier, contrôle d'accès, paiement) plutôt que la couverture totale
- un commit est proposer a la fin de chaque feature. Je review et commit moi meme avant d'avancer