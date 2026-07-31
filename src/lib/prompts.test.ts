import { afterEach, describe, expect, it } from 'vitest';
import { CliError, ExitCode } from './ui.js';
import {
  isNonInteractive,
  promptConfirm,
  promptInput,
  promptPassword,
  promptSelect,
  setNonInteractive,
} from './prompts.js';

afterEach(() => {
  // Etat de module partage entre les tests de ce fichier : on le remet a
  // l'etat par defaut pour ne pas contaminer les tests suivants.
  setNonInteractive(false);
});

describe('setNonInteractive / isNonInteractive', () => {
  it('defaults to false', () => {
    expect(isNonInteractive()).toBe(false);
  });

  it('reflects the value passed to setNonInteractive', () => {
    setNonInteractive(true);
    expect(isNonInteractive()).toBe(true);

    setNonInteractive(false);
    expect(isNonInteractive()).toBe(false);
  });
});

describe('prompt guards in non-interactive mode', () => {
  it('promptSelect throws a CliError mentioning the flag hint instead of prompting', async () => {
    setNonInteractive(true);

    await expect(promptSelect({ message: 'x', choices: [] }, '--software-id <id>')).rejects.toThrow(CliError);
    await expect(promptSelect({ message: 'x', choices: [] }, '--software-id <id>')).rejects.toThrow(
      /--software-id <id>/,
    );
  });

  it('promptConfirm throws a CliError instead of prompting', async () => {
    setNonInteractive(true);

    await expect(promptConfirm({ message: 'x' }, '--yes')).rejects.toThrow(CliError);
    await expect(promptConfirm({ message: 'x' }, '--yes')).rejects.toThrow(/--yes/);
  });

  it('promptInput throws a CliError instead of prompting', async () => {
    setNonInteractive(true);

    await expect(promptInput({ message: 'x' }, '--name <name>')).rejects.toThrow(CliError);
  });

  it('promptPassword throws a CliError instead of prompting', async () => {
    setNonInteractive(true);

    await expect(promptPassword({ message: 'x' }, '--token <token>')).rejects.toThrow(CliError);
  });

  it('the thrown error carries the Usage exit code', async () => {
    setNonInteractive(true);

    try {
      await promptConfirm({ message: 'x' }, '--yes');
      expect.unreachable();
    } catch (error) {
      expect((error as CliError).exitCode).toBe(ExitCode.Usage);
    }
  });
});
