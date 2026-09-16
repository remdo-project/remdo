import { config } from '#config';
import { TEST_AUTH_ACCOUNT } from '#tests-common/auth-account';
import { createFixtureDocument } from '#tools/fixture-document';
import { getCollabTestAuthentication } from './auth';

export async function createCollabTestDocument(docId: string): Promise<void> {
  if (!config.env.COLLAB_ENABLED) {
    return;
  }
  await getCollabTestAuthentication();
  await createFixtureDocument({ email: TEST_AUTH_ACCOUNT.email, id: docId, title: docId });
}
