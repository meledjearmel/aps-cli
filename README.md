# @app-station/cli

CLI officielle **App Station** : elle relie un depot de logiciel (ou un module
d'un logiciel existant) a votre compte **App Station**, puis recupere et
stocke localement la cle API **Registra** (`X-Software-Api-Key`) necessaire
pour verifier des licences depuis votre code.

En resume : `aps login` vous authentifie, `aps init` lie le depot courant a
un logiciel/module App Station et ecrit la configuration, `aps doctor`
verifie que tout fonctionne.

## Installation

Node.js 18 ou superieur est requis.

```bash
# ponctuel, sans installation globale
npx @app-station/cli init

# ou installe globalement
npm install -g @app-station/cli
aps --version
```

## Demarrage rapide

Dans le depot du logiciel (ou module) a lier :

```bash
aps login              # ouvre le navigateur pour vous authentifier
aps init                # lie le depot a un logiciel/module App Station existant, ou en cree un
aps doctor              # verifie que la cle API fonctionne contre Registra
```

`aps init` est interactif par defaut (il vous demande ce que vous voulez
faire, quel logiciel lier, etc.). Pour un usage script/CI, tous les choix
sont aussi disponibles en flags — voir la reference des commandes ci-dessous.

## Reference des commandes

### `aps login`

Authentifie la CLI aupres d'App Station et enregistre les identifiants
localement (voir [Ou sont stockees les donnees](#ou-sont-stockees-les-donnees)).

```bash
aps login [--token <token>] [--base-url <url>] [--dev] [--use-system-ca] [--non-interactive]
```

| Flag | Description |
| --- | --- |
| `--token <token>` | Saute l'ouverture du navigateur : colle directement un token (genere dans App Station -> Parametres -> CLI). Equivalent a la variable `APS_TOKEN`. |
| `--base-url <url>` | URL de l'instance App Station a utiliser. Par defaut : `https://app-station.neocode.ci`. Equivalent a la variable `APPSTATION_BASE_URL`. |
| `--dev` | Raccourci pour pointer vers un environnement de test : utilise `https://app-station.test` par defaut et active automatiquement `--use-system-ca`. |
| `--use-system-ca` | Fait aussi confiance au magasin de certificats du systeme, en plus des CA racines integrees a Node — necessaire face a un certificat local auto-signe (Herd, Valet, mkcert...). Necessite Node 22+. |
| `--non-interactive` | N'affiche jamais de prompt ; echoue avec un message clair si une information manque (utile en CI). |

Sans `--token`, `aps login` ouvre votre navigateur par defaut : la CLI
demarre un petit serveur local, vous authentifie sur App Station, et recupere
le token via une redirection retour vers ce serveur — sans code a copier/coller.

Ce mecanisme est volontairement different d'un flow "device code" classique
(GitHub/Google/Docker) : App Station ne redirige jamais le token que vers un
callback strictement `127.0.0.1`/`localhost`, ce qui le rend resistant au
phishing a distance — un attaquant ne peut pas relayer la redirection finale
vers sa propre machine, quel que soit le lien qu'il parvient a faire cliquer a
une victime. Contrepartie : ca ne fonctionne pas depuis une session SSH sans
redirection de port ; utilisez `--token`/`APS_TOKEN` dans ce cas.

### `aps logout`

Supprime les identifiants stockes localement.

```bash
aps logout
```

### `aps init`

Lie le depot courant a un logiciel ou un module App Station, puis ecrit la
configuration Registra locale (cle API, URL de l'API, etc.).

```bash
aps init [--link | --create] [--type software|module] [--env development|production] \
         [--software-id <id>] [--package-id <id>] [--parent-software-id <id>] \
         [--name <name>] [--tagline <tagline>] [--force-link] [-y|--yes] [--non-interactive]
```

| Flag | Description |
| --- | --- |
| `--link` | Lie le depot a un logiciel/module App Station existant (choix interactif ou via `--software-id`/`--package-id`). |
| `--create` | Cree un nouveau logiciel/module sur App Station puis lie le depot a celui-ci. |
| `--type <type>` | `software` (defaut) ou `module`. |
| `--env <env>` | `development` (defaut) ou `production` — determine quelle cle Registra est emise. |
| `--software-id <id>` | ID App Station du logiciel a lier (mode `--link --type software`). |
| `--package-id <id>` | ID App Station du module a lier (mode `--link --type module`). |
| `--parent-software-id <id>` | ID App Station du logiciel parent (mode `--create --type module`). |
| `--name <name>` | Nom du logiciel/module (mode `--create`). Detecte depuis `package.json`/`composer.json` si omis. |
| `--tagline <tagline>` | Description courte du logiciel (optionnel, mode `--create`). |
| `--force-link` | Force la liaison meme si ce logiciel/module est deja lie a un autre depot local. |
| `-y, --yes` | Ecrase `appstation.conf.json` existant sans confirmation. |
| `--non-interactive` | N'affiche jamais de prompt. |

Ecrit deux fichiers a la racine du depot :

- `appstation.conf.json` — configuration non sensible (a versionner).
- `appstation.conf.local.json` — contient la cle API Registra (secret, ajoute
  automatiquement au `.gitignore`).

### `aps doctor`

Diagnostique la liaison App Station/Registra du depot courant : valide
`appstation.conf.json`, resout la cle API, puis effectue deux appels reels
contre l'API Registra pour confirmer qu'elle est acceptee.

```bash
aps doctor [--env development|production] [--non-interactive]
```

`--env` force le diagnostic sur un environnement different de celui inscrit
dans `appstation.conf.json` (utile pour verifier une cle de production tout
en developpant en local).

### `aps whoami`

Affiche l'instance App Station connectee et le logiciel/module lie au depot
courant.

```bash
aps whoami
```

## Ou sont stockees les donnees

| Donnee | Emplacement | Versionne ? |
| --- | --- | --- |
| Session (token App Station) | `~/.config/app-station/credentials.json` (Linux/macOS) ou `%APPDATA%\app-station\credentials.json` (Windows), permissions `0600` | Non — local a la machine |
| Config du projet | `appstation.conf.json` a la racine du depot | Oui |
| Cle API Registra | `appstation.conf.local.json` a la racine du depot | Non — ajoute au `.gitignore` par `aps init` |

## Contribuer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour le developpement local et le
processus de publication.

## Licence

[ISC](./LICENSE)
