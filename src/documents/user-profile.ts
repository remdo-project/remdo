import { createUniqueNoteId } from '#lib/editor/note-ids';
import { normalizeDocumentId } from '@/routing';
import { getInjectedE2EConfigDocumentId, isE2ERoute } from '@/testing/e2e-runtime';
import { HOME_USER_DOCUMENT } from './defaults';

export const USER_CONFIG_DOC_ID = 'usercfg';

export interface UserProfile {
  homeDocumentId: string;
  configDocumentId: string;
}

let resolvedUserConfigDocId: string | null = null;
let fallbackE2EUserConfigDocId: string | null = null;
let profilePromise: Promise<UserProfile> | null = null;

export function getUserConfigDocumentId(): string {
  resolvedUserConfigDocId ??= resolveUserConfigDocId();
  return resolvedUserConfigDocId;
}

function resolveUserConfigDocId(): string {
  if (!isE2ERoute()) {
    return USER_CONFIG_DOC_ID;
  }

  const injectedDocId = getInjectedE2EConfigDocumentId();
  if (injectedDocId) {
    return injectedDocId;
  }

  fallbackE2EUserConfigDocId ??= `${USER_CONFIG_DOC_ID}${createUniqueNoteId()}`;
  return fallbackE2EUserConfigDocId;
}

export async function getUserProfile(): Promise<UserProfile> {
  if (isE2ERoute()) {
    return {
      homeDocumentId: HOME_USER_DOCUMENT.id,
      configDocumentId: getUserConfigDocumentId(),
    };
  }

  profilePromise ??= fetchUserProfile().catch((error) => {
    profilePromise = null;
    throw error;
  });
  return profilePromise;
}

export async function getHomeDocumentId(): Promise<string> {
  const profile = await getUserProfile();
  return profile.homeDocumentId;
}

async function fetchUserProfile(): Promise<UserProfile> {
  const response = await fetch('/api/profile', {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    throw new Error(`Failed to load user profile: ${response.status}`);
  }

  const body = await response.json() as Partial<UserProfile>;
  const configDocumentId = normalizeDocumentId(body.configDocumentId);
  const homeDocumentId = normalizeDocumentId(body.homeDocumentId);
  if (!configDocumentId || !homeDocumentId) {
    throw new TypeError('User profile returned invalid document ids.');
  }
  return {
    homeDocumentId,
    configDocumentId,
  };
}
