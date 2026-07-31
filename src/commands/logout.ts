import { clearCredentials } from '../lib/credentials.js';
import { ok } from '../lib/ui.js';

export async function logoutCommand(): Promise<void> {
  await clearCredentials();
  ok('Deconnecte. Credentials locaux supprimes.');
}
