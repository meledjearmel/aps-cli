import { readLocalProjectConfig, readProjectConfig, resolveApiKeyEnvVar } from '../lib/config.js';
import { resolveSession } from '../lib/session.js';
import { heading } from '../lib/ui.js';

function describeSecretSource(envValue: string | undefined, envVarName: string, hasLocalValue: boolean): string {
  if (envValue && envValue.trim().length > 0) {
    return `variable d'environnement ${envVarName}`;
  }

  if (hasLocalValue) {
    return 'appstation.conf.local.json';
  }

  return `introuvable (ni ${envVarName}, ni appstation.conf.local.json)`;
}

/**
 * Dump la configuration resolue : session, appstation.conf.json, et la
 * *source* (pas la valeur) de la cle API / du signingSecret. Utile pour
 * deboguer "pourquoi ma variable d'environnement n'est pas prise en compte"
 * sans avoir a lire le code. Ne fait aucun appel reseau (voir "aps doctor"
 * pour verifier que ces secrets fonctionnent reellement).
 */
export async function configCommand(): Promise<void> {
  const session = await resolveSession();

  heading('Session');
  console.log(`  App Station  : ${session?.appstation.baseUrl ?? '(non connecte — executez "aps login")'}`);

  const config = await readProjectConfig();

  heading('Projet (appstation.conf.json)');

  if (config === null) {
    console.log('  (non lie — executez "aps init")');
    return;
  }

  console.log(`  Type         : ${config.type}`);
  console.log(`  Environnement: ${config.environment}`);
  console.log(
    config.type === 'module'
      ? `  Module       : ${config.module.name} (${config.module.slug})`
      : `  Software     : ${config.software.name}`,
  );
  console.log(`  Registra     : ${config.api.baseUrl}`);

  heading('Resolution des secrets (source uniquement, jamais la valeur)');

  const local = await readLocalProjectConfig();
  const apiKeyEnvVar = resolveApiKeyEnvVar(config.environment);

  console.log(`  Cle API      : ${describeSecretSource(process.env[apiKeyEnvVar], apiKeyEnvVar, Boolean(local?.auth.apiKey))}`);
  console.log(
    `  signingSecret: ${describeSecretSource(process.env.APS_SIGNING_SECRET, 'APS_SIGNING_SECRET', Boolean(local?.signingSecret))}`,
  );
}
