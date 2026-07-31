import boxen from 'boxen';
import pc from 'picocolors';

export function ok(message: string): void {
  console.log(`${pc.green('✓')} ${message}`);
}

export function fail(message: string): void {
  console.error(`${pc.red('✗')} ${message}`);
}

export function info(message: string): void {
  console.log(`${pc.cyan('i')} ${message}`);
}

export function warn(message: string): void {
  console.warn(`${pc.yellow('!')} ${message}`);
}

export function heading(message: string): void {
  console.log(`\n${pc.bold(message)}`);
}

export function nextSteps(title: string, lines: string[]): void {
  const body = [pc.bold(pc.green(title)), '', ...lines.map((line) => pc.dim('› ') + line)].join('\n');

  console.log(
    boxen(body, {
      padding: 1,
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderColor: 'green',
      borderStyle: 'round',
    }),
  );
}

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export const ExitCode = {
  Success: 0,
  Generic: 1,
  Usage: 2,
  Unauthenticated: 3,
  MissingConfig: 4,
  Network: 5,
} as const;
