import { config } from '#config';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import type { components } from '#platform/http/api-schema';
import { createFixtureDocument } from '#tools/fixture-document';
import { ensureCollabTestUser, getCollabTestAuthentication, withTestAuthentication } from './auth';

export async function createCollabTestDocument(docId?: string): Promise<string> {
  if (!config.env.COLLAB_ENABLED) {
    return docId ?? config.env.DEV_DOCUMENT_ID;
  }
  if (docId !== undefined) {
    // createFixtureDocument looks the owner up by email, so the account must exist.
    await ensureCollabTestUser();
    return createFixtureDocument({ email: TEST_AUTH_ACCOUNT.email, id: docId, title: docId });
  }
  const authentication = await getCollabTestAuthentication();
  const response = await fetch(withTestAuthentication('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Collaboration test' }),
  }, authentication));
  if (!response.ok) throw new Error(`Cannot create collaboration document: ${response.status} ${await response.text()}`);
  const document = await response.json() as components['schemas']['Document'];
  return document.id;
}
