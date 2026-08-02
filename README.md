<h1 align="center">@app-station/cli</h1>

<p align="center">Liez vos logiciels et modules a <strong>App Station</strong> depuis votre terminal : configuration, diagnostic, signature de manifest et bascule vers la production.</p>

<p align="center">
  <a aria-label="npm version" href="https://www.npmjs.com/package/@app-station/cli" target="_blank">
    <img alt="npm version" src="https://img.shields.io/npm/v/@app-station/cli.svg?style=for-the-badge&label=npm&labelColor=000000&color=4630EB" />
  </a>
  <a aria-label="CI" href="https://github.com/meledjearmel/aps-cli/actions/workflows/ci.yml" target="_blank">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/meledjearmel/aps-cli/ci.yml?style=for-the-badge&label=CI&labelColor=000000" />
  </a>
  <a aria-label="License: ISC" href="./LICENSE" target="_blank">
    <img alt="License: ISC" src="https://img.shields.io/badge/License-ISC-success.svg?style=for-the-badge&labelColor=000000&color=33CC12" />
  </a>
</p>

<p align="center">
  <a aria-label="npm package" href="https://www.npmjs.com/package/@app-station/cli">📦 npm</a>
  &ensp;•&ensp;
  <a aria-label="contribuer" href="./CONTRIBUTING.md">👏 Contribuer</a>
  &ensp;•&ensp;
  <a aria-label="licence" href="./LICENSE">⚖️ Licence</a>
</p>

---

CLI officielle **App Station** : elle relie un depot de logiciel (ou un module
d'un logiciel existant) a votre compte **App Station**, puis recupere et
stocke localement la cle API **Registra** (`X-Software-Api-Key`) necessaire
pour verifier des licences depuis votre code.

Elle couvre tout le cycle de vie du developpeur : lier ou creer le projet,
verifier que l'integration fonctionne, prouver cryptographiquement que le
depot est bien celui declare, puis basculer vers la production une fois le
logiciel approuve — sans jamais avoir besoin d'acceder a l'admin Registra.

## Demarrage rapide

Node.js 18 ou superieur est requis.

```bash
# ponctuel, sans installation globale (recommande)
npx @app-station/cli@latest login
npx @app-station/cli@latest init
npx @app-station/cli@latest doctor

# ou installe globalement
npm install -g @app-station/cli
aps login
aps init
aps doctor
```

`aps init` est interactif par defaut (il vous demande ce que vous voulez
faire, quel logiciel lier, etc.). Pour un usage script/CI, tous les choix
sont aussi disponibles en flags — voir la [reference des commandes](#reference-des-commandes)
ci-dessous.

Une fois lie, dans le code de votre logiciel :

```bash
# Prouver que ce depot est bien celui declare sur App Station
aps sign
aps verify appstation.manifest.signed.json

# Apres approbation admin : basculer vers la production
aps promote
```

## Ce que vous pouvez faire

- **[`aps login`](#aps-login) / [`aps logout`](#aps-logout)** — authentifier la CLI aupres d'App Station (navigateur, ou token pour la CI).
- **[`aps init`](#aps-init)** — lier ce depot a un logiciel/module App Station existant, ou en creer un, et ecrire la configuration Registra locale.
- **[`aps doctor`](#aps-doctor)** — verifier de bout en bout que la cle API resolue fonctionne reellement contre Registra.
- **[`aps whoami`](#aps-whoami)** — afficher le logiciel/module et l'environnement lies au depot courant.
- **[`aps config`](#aps-config)** — dump la config resolue (session, `appstation.conf.json`, source des secrets) pour deboguer sans deviner.
- **[`aps update`](#aps-update)** — mettre a jour les metadonnees (nom, tagline, prix, essai) du logiciel/module depuis le terminal, sans passer par l'UI App Station.
- **[`aps sign`](#aps-sign) / [`aps verify`](#aps-verify-file)** — signer (HMAC-SHA256) et verifier un manifest prouvant la liaison depot ↔ App Station ↔ Registra, pour la soumission ou la CI.
- **[`aps rotate-key`](#aps-rotate-key)** — rafraichir la cle locale apres une rotation faite cote Registra.
- **[`aps promote`](#aps-promote)** — basculer la config locale de `development` vers `production` une fois le logiciel publie.
- **[`aps release <file>`](#aps-release-file)** — publier une release (upload de fichier) pour le logiciel/module lie.

## Politique de version

`@app-station/cli` est concu pour etre installe globalement ou lance avec
`npx` — c'est un outil de **developpeur**, pas une dependance runtime de
votre logiciel. L'installer dans les dependances du projet est deconseille :
votre application finale n'a besoin que de `appstation.conf.json` et d'une
variable d'environnement (voir [Ou sont stockees les donnees](#ou-sont-stockees-les-donnees)),
jamais de Node.js ni de la CLI elle-meme au runtime.

`npx @app-station/cli@latest <commande>` garantit toujours la derniere
version ; en installation globale, `npm update -g @app-station/cli`.

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
- `appstation.conf.local.json` — contient la cle API Registra et le
  `signingSecret` (secret, ajoute automatiquement au `.gitignore`).

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

### `aps config`

Dump la configuration resolue : instance App Station, contenu de
`appstation.conf.json`, et la **source** (jamais la valeur) de la cle API et
du `signingSecret` — variable d'environnement ou `appstation.conf.local.json`.
Ne fait aucun appel reseau.

```bash
aps config
```

Utile pour deboguer "pourquoi ma variable d'environnement n'est pas prise en
compte" sans lire le code. Pour verifier que les secrets fonctionnent
*reellement* contre Registra, voir [`aps doctor`](#aps-doctor).

### `aps update`

Met a jour les metadonnees du logiciel/module lie via l'API App Station,
sans passer par l'UI web.

```bash
aps update [--name <name>] [--tagline <tagline>] [--description <text>] \
           [--price-per-day <xof>] [--lifetime-price <xof>] \
           [--trial-period-days <n>] [--disable-trial] [--non-interactive]
```

| Flag | Description |
| --- | --- |
| `--name <name>` | Nom, 120 caracteres max (software ou module). |
| `--description <text>` | Description, 10 000 caracteres max (software ou module). |
| `--tagline <tagline>` | Description courte, 180 caracteres max (**software uniquement**). |
| `--price-per-day <xof>` | Prix par jour en XOF (**software uniquement**). |
| `--lifetime-price <xof>` | Prix a vie en XOF (**software uniquement**). |
| `--trial-period-days <n>` | Active l'essai gratuit, duree entre 1 et 365 jours (**software uniquement**). |
| `--disable-trial` | Desactive l'essai gratuit (**software uniquement**). |

Seuls les champs passes en flag sont modifies (mise a jour partielle). Sur un
module, les flags marques "software uniquement" echouent avec un message
clair plutot que d'etre ignores silencieusement. Les limites de longueur/
plage ci-dessus sont **verifiees par la CLI elle-meme**, alignees sur le
formulaire App Station officiel — l'API `/api/v1/publisher/...` qu'elle
consomme est plus permissive que ce formulaire sur certains de ces champs.

### `aps sign`

Genere un manifest signe (HMAC-SHA256) prouvant la liaison entre ce depot
local, le logiciel/module App Station et l'environnement Registra. Le
manifest ne contient jamais la cle API en clair, uniquement son empreinte
SHA-256.

```bash
aps sign [--output <file>]   # par defaut : appstation.manifest.signed.json
```

Soumettez le fichier genere a App Station (dashboard editeur ou review).

### `aps verify <file>`

Verifie un manifest signe : schema, signature HMAC-SHA256, fraicheur de
generation (30 jours par defaut). Code de sortie `0` si valide, `1` sinon.

```bash
aps verify appstation.manifest.signed.json
```

Necessite le meme `signingSecret` que celui utilise pour signer :
`appstation.conf.local.json` du depot concerne, ou la variable
`APS_SIGNING_SECRET` (utile en CI ou pour une verification hors du depot
d'origine, par ex. cote App Station).

### `aps rotate-key`

Rafraichit `appstation.conf.local.json` (cle API + signingSecret) apres une
rotation de la cle faite cote Registra. Ne declenche pas la rotation
elle-meme (aujourd'hui manuelle, cote admin Registra) : recupere juste la
cle courante.

```bash
aps rotate-key [--env development|production]
aps doctor
```

`--env`, s'il est fourni, doit correspondre a l'environnement deja inscrit
dans `appstation.conf.json` — pour changer d'environnement, utilisez
`aps init --env <env>`.

### `aps promote`

Bascule `appstation.conf.json`/`appstation.conf.local.json` de
`development` vers `production`, une fois le logiciel/module **publie**
sur App Station (approbation admin). Ecrase la configuration locale avec
les identifiants et la cle Registra de production.

```bash
aps promote [-y|--yes] [--non-interactive]
```

En CI/CD, remplacez `REGISTRA_DEV_API_KEY` par `REGISTRA_API_KEY` apres la
promotion.

### `aps release <file>`

Publie une release (upload du fichier `<file>`) pour le logiciel/module lie —
memes regles de validation que le formulaire App Station officiel.

```bash
aps release ./dist/mon-logiciel-1.4.0.exe --release-version 1.4.0 \
  [--channel stable|beta|rc|nightly] [--platform windows|macos|linux|android|ios|universal] \
  [--notes <text>] [--min-software-version <version>] [--max-software-version <version>]
```

| Flag | Description |
| --- | --- |
| `--release-version <version>` | **Requis.** 20 caracteres max. Pas `--version` (reserve au numero de version de la CLI elle-meme, collision avec `-V`/`--version` de Commander). |
| `--channel <channel>` | `stable` (defaut), `beta`, `rc` ou `nightly`. |
| `--platform <platform>` | `windows`, `macos`, `linux`, `android`, `ios` ou `universal`. Omis = archive generique. |
| `--notes <text>` | Notes de version (markdown), 10 000 caracteres max. |
| `--min-software-version` / `--max-software-version` | Compatibilite avec le logiciel hote (**module uniquement**). |

Si aucun `signingSecret` n'existe encore pour ce logiciel, la release est
publiee sans signature (`signature: null`) — elle est calculee
retroactivement des que possible, pas une erreur a corriger.

## Ou sont stockees les donnees

| Donnee | Emplacement | Versionne ? |
| --- | --- | --- |
| Session (token App Station) | `~/.config/app-station/credentials.json` (Linux/macOS) ou `%APPDATA%\app-station\credentials.json` (Windows), permissions `0600` | Non — local a la machine |
| Config du projet | `appstation.conf.json` a la racine du depot | Oui |
| Cle API Registra + signingSecret | `appstation.conf.local.json` a la racine du depot | Non — ajoute au `.gitignore` par `aps init` |

## Contribuer

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour le developpement local et le
processus de publication.

## Licence

[ISC](./LICENSE)
