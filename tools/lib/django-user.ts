import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Fixture commands are registered only in development and verification. */
export async function provisionDjangoUser(account: { email: string; password: string; name: string; admin?: boolean }): Promise<void> {
  await execFileAsync('./tools/django.sh', [
    'provision_user',
    `--email=${account.email}`, `--password=${account.password}`, `--name=${account.name}`,
    ...(account.admin ? ['--admin'] : []),
  ]);
}

export async function resetDevelopmentUsers(): Promise<void> {
  await execFileAsync('./tools/django.sh', ['setup_development_users', '--reset']);
}
