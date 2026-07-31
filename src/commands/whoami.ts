import { readProjectConfig } from '../lib/config.js';
import { resolveSession } from '../lib/session.js';
import { CliError, ExitCode, heading } from '../lib/ui.js';

export async function whoamiCommand(): Promise<void> {
  const session = await resolveSession();

  if (session === null) {
    throw new CliError('Non connecte. Executez "aps login" (ou definissez APS_TOKEN).', ExitCode.Unauthenticated);
  }

  const config = await readProjectConfig();

  heading('AppStation');
  console.log(`  Base URL  : ${session.appstation.baseUrl}`);

  if (config === null) {
    console.log('  Projet    : (non lie — executez "aps init")');
    return;
  }

  if (config.type === 'software') {
    console.log(`  Software  : ${config.software.name} (id ${config.appstation.softwareId})`);
  } else {
    console.log(`  Module    : ${config.module.name} (id ${config.appstation.packageId})`);
    console.log(`  Parent    : ${config.parentSoftware.name} (id ${config.appstation.parentSoftwareId})`);
  }

  heading('Registra');
  console.log(`  Token     : ${config.type === 'software' ? config.software.token : config.module.token}`);
  console.log(`  Env       : ${config.environment}`);
  console.log(`  Base URL  : ${config.api.baseUrl}`);
  console.log(`  Fingerprint: ${config.appstation.projectFingerprint.slice(0, 12)}…`);
}
