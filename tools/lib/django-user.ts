import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function provisionDjangoUser(account: { email: string; password: string; name: string; admin?: boolean }): Promise<void> {
  await execFileAsync('./tools/django.sh', [
    'provision_user',
    `--email=${account.email}`, `--password=${account.password}`, `--name=${account.name}`,
    ...(account.admin ? ['--admin'] : []),
  ]);
}

/** Development fixture reset is available only with development and test settings. */
export async function resetDevelopmentUsers(): Promise<void> {
  await execFileAsync('./tools/django.sh', ['setup_development_users', '--reset']);
}
