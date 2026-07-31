import 'dotenv/config';
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { setNonInteractive } from './lib/prompts.js';
import { CliError, ExitCode, fail } from './lib/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };

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
  .description('Authentifie la CLI aupres d\'AppStation.')
  .option('--token <token>', 'Token CLI genere dans AppStation -> Parametres -> CLI (ou APS_TOKEN)')
  .option('--base-url <url>', 'URL de base AppStation (ou APPSTATION_BASE_URL)')
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
