# Contribuer a @app-station/cli

## Developpement local

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/index.js --help
```

- `npm run dev` — build en mode watch (`tsup --watch`).
- La CI (`.github/workflows/ci.yml`) lance typecheck + tests + build sur
  Node 18/20/22 a chaque push/PR sur `main`.

## Publication

La publication sur npm est automatisee via `.github/workflows/publish.yml` :
tout tag `vX.Y.Z` pousse sur `main` declenche le build + les tests, puis
`npm publish --access public --provenance`.

Mise en place (une seule fois) :

1. Sur npmjs.com : Access Tokens -> Generate New Token -> **Granular Access
   Token**, type "Automation", scope limite a `@app-station/cli` (publish).
2. Dans les secrets GitHub Actions du depot : ajouter `NPM_TOKEN` avec ce
   token, sous **Repository secrets** (pas Environment secrets).

Pour chaque nouvelle version :

```bash
npm version patch   # ou minor / major
git push --follow-tags
```

Le tag pousse declenche le workflow, qui publie automatiquement.
