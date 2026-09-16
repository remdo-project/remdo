import type { SerializedEditorState } from 'lexical';
import { resetDevelopmentUsers } from '../lib/django-user';
import { createFixtureDocument } from '../lib/fixture-document';
import STABLE_AUTH_USERS from '../../backend/fixtures/development-users.json';

export async function resetDevelopmentData(fixtures: ReadonlyMap<string, SerializedEditorState>) {
  const users = Object.values(STABLE_AUTH_USERS);
  await resetDevelopmentUsers();
  let documentCount = 0;
  for (const user of users) {
    for (const [name, content] of fixtures) {
      await createFixtureDocument({ email: user.email, title: `fixture: ${name}` }, content);
      documentCount += 1;
    }
  }
  return { documentCount, userCount: users.length };
}
