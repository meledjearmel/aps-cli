# @app-station/cli

CLI `aps` pour lier un logiciel ou un module a **AppStation** et recuperer la
cle `X-Software-Api-Key` **Registra** correspondante. Ecrit `registra.conf.json`
(versionnable) et `registra.conf.local.json` (secret, gitignore).

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

Le token CLI se genere dans AppStation -> Parametres -> CLI (aucun endpoint de
login programmatique n'existe encore cote serveur : v1 = coller un token
personnel).

`sign` / `verify` / `promote` / `rotate-key` ne sont pas encore implementes
dans cette v1 (voir doc de reference, §15 Roadmap).

## Developpement

```bash
npm install
npm run typecheck
npm run build
node dist/index.js --help
```
