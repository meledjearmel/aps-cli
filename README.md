# @app-station/cli

CLI `aps` pour lier un logiciel ou un module a **AppStation** et recuperer la
cle `X-Software-Api-Key` **Registra** correspondante. Ecrit `appstation.conf.json`
(versionnable) et `appstation.conf.local.json` (secret, gitignore).

Doc de reference complete : `app-station/docs/cli/appstation-cli.md`.

## Installation

```bash
npx @app-station/cli init
# ou en global
npm install -g @app-station/cli
aps --version
```

## Commandes (v1)

```bash
aps login [--token <token>] [--base-url <url>]
aps logout
aps init [--link | --create] [--type software|module] [--env development|production] \
         [--software-id <id>] [--package-id <id>] [--parent-software-id <id>] \
         [--name <name>] [--tagline <tagline>] [--force-link] [-y|--yes]
aps doctor [--env development|production]
aps whoami
```

`aps login` ouvre le navigateur par defaut via un **callback local** : la CLI
demarre un serveur ephemere sur `127.0.0.1`, ouvre AppStation dans le navigateur,
et recupere le token via la redirection retour une fois l'utilisateur authentifie
et l'approbation donnee — sans code a copier/coller. `--token <token>` (ou
`APS_TOKEN`) saute le navigateur pour un usage CI/script (token genere dans
AppStation -> Parametres -> CLI).

Ce mecanisme est volontairement different d'un flow "device code" classique
(GitHub/Google/Docker) : AppStation ne redirige jamais le token que vers un
callback strictement `127.0.0.1`/`localhost` (voir
`App\Support\Cli\CallbackUrlValidator` cote serveur), ce qui le rend resistant
au phishing a distance — un attaquant ne peut pas relayer la redirection finale
vers sa propre machine, quel que soit le lien qu'il parvient a faire cliquer a
une victime. Contrepartie : ca ne marche pas depuis une session SSH sans
redirection de port (utilisez `--token`/`APS_TOKEN` dans ce cas).

`sign` / `verify` / `promote` / `rotate-key` ne sont pas encore implementes
dans cette v1 (voir doc de reference, §15 Roadmap).

## Depannage

**`fetch failed` contre une instance locale (Laravel Herd, Valet, etc.)** —
Node ne fait pas confiance au certificat auto-signe/CA locale de votre outil
de dev, meme si votre navigateur oui. Le message d'erreur inclut maintenant
la cause exacte (`error.cause`) ; si elle mentionne `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
relancez avec le CA systeme :

```bash
node --use-system-ca dist/index.js login --base-url https://mon-site.test
# ou, en global :
NODE_OPTIONS=--use-system-ca aps login --base-url https://mon-site.test
```

(`--use-system-ca` necessite Node 22+. Sur une version plus ancienne,
utilisez `NODE_EXTRA_CA_CERTS=/chemin/vers/le/ca-local.pem` a la place.)

## Developpement

```bash
npm install
npm run typecheck
npm run build
node dist/index.js --help
```

## Publication

La publication sur npm est automatisee via `.github/workflows/publish.yml` :
tout tag `vX.Y.Z` pousse sur `main` declenche le build + les tests, puis
`npm publish --access public --provenance`.

Mise en place (une seule fois) :

1. Sur npmjs.com : Access Tokens -> Generate New Token -> **Granular Access
   Token**, type "Automation", scope limite a `@app-station/cli` (publish).
2. Dans les secrets GitHub Actions du depot : ajouter `NPM_TOKEN` avec ce
   token.

Pour chaque nouvelle version :

```bash
npm version patch   # ou minor / major
git push --follow-tags
```

Le tag pousse declenche le workflow, qui publie automatiquement.
