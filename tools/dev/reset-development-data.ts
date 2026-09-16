import type { SerializedEditorState } from 'lexical';
import { resetDevelopmentUsers } from '../lib/django-user';
import { createFixtureDocuments } from '../lib/fixture-document';
import STABLE_AUTH_USERS from '../../backend/fixtures/development-users.json';

export async function resetDevelopmentData(fixtures: ReadonlyMap<string, SerializedEditorState>) {
  const users = Object.values(STABLE_AUTH_USERS);
  await resetDevelopmentUsers();
  const documents = users.flatMap((user) => Array.from(fixtures, ([name, content]) => ({
    email: user.email,
    title: `fixture: ${name}`,
    content,
  })));
  await createFixtureDocuments(documents);
  return { documentCount: documents.length, userCount: users.length };
}
