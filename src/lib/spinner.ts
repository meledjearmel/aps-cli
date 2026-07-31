import ora from 'ora';

export async function withSpinner<T>(text: string, fn: () => Promise<T>, successText?: string): Promise<T> {
  const spinner = ora(text).start();

  try {
    const result = await fn();
    spinner.succeed(successText ?? text);
    return result;
  } catch (error) {
    spinner.fail(text);
    throw error;
  }
}
