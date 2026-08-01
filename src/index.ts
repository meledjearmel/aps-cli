import 'dotenv/config';
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { promoteCommand } from './commands/promote.js';
import { rotateKeyCommand } from './commands/rotate-key.js';
import { signCommand } from './commands/sign.js';
import { verifyCommand } from './commands/verify.js';
import { whoamiCommand } from './commands/whoami.js';
import { setNonInteractive } from './lib/prompts.js';
import { CliError, ExitCode, fail } from './lib/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

// --use-system-ca (implique par --dev) est un flag de demarrage Node, pas
// togglable une fois le process lance : si demande, on se re-execute une
// fois avec le flag pose via NODE_OPTIONS puis on sort avec le meme code.
const rawArgs = process.argv.slice(2);
const wantsSystemCa = rawArgs.includes('login') && (rawArgs.includes('--dev') || rawArgs.includes('--use-system-ca'));
const alreadyHasSystemCa = (process.env.NODE_OPTIONS ?? '').includes('--use-system-ca');

if (wantsSystemCa && !alreadyHasSystemCa) {
  const nodeOptions = [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ');
  const result = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  });
  process.exit(result.status ?? 1);
}

// Non-interactif si demande explicitement, si on tourne en CI, ou si aucun
// TTY n'est attache (pipe, script, cron) — meme logique que la plupart des
// CLIs modernes (eas, vercel, ...).
const explicitFlag = process.argv.includes('--non-interactive');
const noTty = !process.stdin.isTTY || !process.stdout.isTTY;
const ci = Boolean(process.env.CI);
setNonInteractive(explicitFlag || noTty || ci);

const NON_INTERACTIVE_OPTION = ['--non-interactive', "Ne jamais prompter ; echoue avec un message clair si une info manque"] as const;

const program = new Command();

program
  .name('aps')
  .description('CLI App Station — lier un logiciel ou un module a AppStation/Registra.')
  .version(pkg.version);

program
  .command('login')
  .description("Authentifie la CLI aupres d'AppStation (ouvre le navigateur par defaut).")
  .option('--token <token>', 'Saute le navigateur : token colle directement (ou APS_TOKEN)')
  .option('--base-url <url>', 'URL de base AppStation (ou APPSTATION_BASE_URL). Par defaut : https://app-station.neocode.ci')
  .option('--dev', 'Environnement de test : https://app-station.test par defaut, et confiance CA systeme (equivaut a --use-system-ca)')
  .option('--use-system-ca', 'Fait aussi confiance au magasin de certificats du systeme (certificat local auto-signe ; Node 22+)')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(loginCommand));

program
  .command('logout')
  .description('Supprime les credentials locaux.')
  .action(withErrorHandling(logoutCommand));

program
  .command('init')
  .description('Lie ou cree un software/module AppStation et ecrit la config Registra locale.')
  .option('--link', 'Lier un software/module AppStation existant')
  .option('--create', 'Creer un nouveau software/module sur AppStation')
  .option('--type <type>', 'software (defaut) ou module', 'software')
  .option('--env <env>', 'development (defaut) ou production', 'development')
  .option('--software-id <id>', 'ID AppStation du software (mode --link)')
  .option('--package-id <id>', 'ID AppStation du module (mode --link --type module)')
  .option('--parent-software-id <id>', 'ID AppStation du software parent (mode --create --type module)')
  .option('--name <name>', 'Nom du software/module (mode --create)')
  .option('--tagline <tagline>', 'Tagline du software (optionnel, mode --create)')
  .option('--force-link', 'Remplacer un fingerprint projet deja enregistre')
  .option('-y, --yes', 'Ecraser les fichiers existants sans confirmation')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(initCommand));

program
  .command('doctor')
  .description('Diagnostique la liaison AppStation/Registra locale.')
  .option('--env <env>', 'Force l\'environnement a diagnostiquer')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(doctorCommand));

program
  .command('whoami')
  .description('Affiche le software/module et l\'environnement lies a la config locale.')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(whoamiCommand));

program
  .command('sign')
  .description('Signe un manifest (HMAC-SHA256) prouvant la liaison repo local <-> software/module AppStation <-> Registra.')
  .option('--output <file>', 'Chemin du manifest signe', 'appstation.manifest.signed.json')
  .action(withErrorHandling(signCommand));

program
  .command('verify <file>')
  .description('Verifie un manifest signe (schema, signature HMAC-SHA256, fraicheur).')
  .action(withErrorHandling((file: string) => verifyCommand({ file })));

program
  .command('rotate-key')
  .description('Rafraichit la cle Registra locale apres une rotation faite cote Registra (admin).')
  .option('--env <env>', 'development ou production — doit correspondre a l\'environnement du projet')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(rotateKeyCommand));

program
  .command('promote')
  .description('Bascule la config locale de development vers production (software/module publie).')
  .option('-y, --yes', 'Ne pas demander de confirmation')
  .option(...NON_INTERACTIVE_OPTION)
  .action(withErrorHandling(promoteCommand));

function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await handler(...args);
    } catch (error) {
      if (error instanceof CliError) {
        fail(error.message);
        process.exitCode = error.exitCode;
        return;
      }

      fail(error instanceof Error ? error.message : String(error));
      process.exitCode = ExitCode.Generic;
    }
  };
}

await program.parseAsync(process.argv);
