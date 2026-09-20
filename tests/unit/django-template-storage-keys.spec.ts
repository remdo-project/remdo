import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { PENDING_SIGN_OUT_STORAGE_KEY } from '#client/app/session/client';
import { CURRENT_USER_BOOTSTRAP_STORAGE_KEY } from '#client/app/user-data/current-user-bootstrap-storage';

// The signed-in template clears frontend storage directly, so a rename on either
// side silently stops superseding pending sign-out and the cached identity.
describe('server-rendered login completion', () => {
  const template = fs.readFileSync(
    path.join(process.cwd(), 'backend/accounts/templates/accounts/login_complete.html'),
    'utf8',
  );

  it.each([
    ['the pending sign-out marker', PENDING_SIGN_OUT_STORAGE_KEY],
    ['the cached identity bootstrap', CURRENT_USER_BOOTSTRAP_STORAGE_KEY],
  ])('clears %s under the key its frontend owner declares', (_name, key) => {
    expect(template).toContain(`removeItem('${key}')`);
  });
});
