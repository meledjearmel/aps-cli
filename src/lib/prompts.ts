import {
  confirm as inquirerConfirm,
  input as inquirerInput,
  password as inquirerPassword,
  select as inquirerSelect,
} from '@inquirer/prompts';
import { CliError, ExitCode } from './ui.js';

let nonInteractive = false;

export function setNonInteractive(value: boolean): void {
  nonInteractive = value;
}

export function isNonInteractive(): boolean {
  return nonInteractive;
}

function guard(flagHint: string): void {
  if (nonInteractive) {
    throw new CliError(`Information manquante en mode non-interactif : precisez ${flagHint}.`, ExitCode.Usage);
  }
}

export async function promptSelect<Value>(
  config: Parameters<typeof inquirerSelect<Value>>[0],
  flagHint: string,
): Promise<Value> {
  guard(flagHint);
  return inquirerSelect(config);
}

export async function promptConfirm(config: Parameters<typeof inquirerConfirm>[0], flagHint: string): Promise<boolean> {
  guard(flagHint);
  return inquirerConfirm(config);
}

export async function promptInput(config: Parameters<typeof inquirerInput>[0], flagHint: string): Promise<string> {
  guard(flagHint);
  return inquirerInput(config);
}

export async function promptPassword(config: Parameters<typeof inquirerPassword>[0], flagHint: string): Promise<string> {
  guard(flagHint);
  return inquirerPassword(config);
}
