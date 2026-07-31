import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { CliError, ExitCode } from './ui.js';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface LocalCallbackFlow {
  authorizeUrl: string;
  port: number;
  waitForToken: () => Promise<string>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function resultPageHtml(status: 'approved' | 'denied'): string {
  const title = status === 'approved' ? 'Connexion autorisee' : 'Connexion refusee';
  const message =
    status === 'approved'
      ? 'Vous pouvez retourner a votre terminal. Cet onglet peut etre ferme.'
      : "Aucun acces n'a ete accorde. Cet onglet peut etre ferme.";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${title} — App Station</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fafafa;color:#18181b}
main{text-align:center;padding:2rem}
h1{font-size:1.25rem}
</style>
</head>
<body><main><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

function startServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Impossible de determiner le port du serveur local.'));
        return;
      }

      resolve({ server, port: address.port });
    });
  });
}

function waitForCallback(server: Server, expectedState: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new CliError('Delai de connexion depasse. Relancez "aps login".', ExitCode.Unauthenticated));
    }, timeoutMs);

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      // Un state qui ne correspond pas n'interrompt pas l'attente : ce
      // n'est pas la bonne requete (probe, retry, etc.), on continue
      // d'attendre la vraie jusqu'au timeout.
      if (url.searchParams.get('state') !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Etat invalide.');
        return;
      }

      const error = url.searchParams.get('error');
      const token = url.searchParams.get('token');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(resultPageHtml(error === null ? 'approved' : 'denied'));

      clearTimeout(timeout);
      server.close();

      if (error !== null) {
        reject(new CliError('Connexion refusee dans le navigateur.', ExitCode.Unauthenticated));
      } else if (!token) {
        reject(new CliError('Reponse invalide du navigateur (token manquant).', ExitCode.Network));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Demarre le flow "callback local" (equivalent `vercel login` / `wrangler
 * login`, plus resistant au phishing qu'un device-code classique) : un
 * serveur ephemere ecoute sur 127.0.0.1 uniquement, et AppStation ne redirige
 * jamais le token ailleurs que vers ce callback (voir
 * app/Support/Cli/CallbackUrlValidator.php cote serveur) — un attaquant ne
 * peut pas relayer la redirection finale vers sa propre machine.
 *
 * L'appelant doit ouvrir `authorizeUrl` dans le navigateur puis attendre
 * `waitForToken()`.
 */
export async function beginLocalCallbackLogin(
  baseUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<LocalCallbackFlow> {
  const { server, port } = await startServer();
  const state = randomBytes(24).toString('hex');
  const callbackUrl = `http://127.0.0.1:${port}/callback`;
  const authorizeUrl = `${normalizeBaseUrl(baseUrl)}/developers/cli-auth?callback=${encodeURIComponent(callbackUrl)}&state=${state}`;

  return {
    authorizeUrl,
    port,
    waitForToken: () => waitForCallback(server, state, timeoutMs),
  };
}
