const rawCollabPort = import.meta.env.VITE_COLLAB_CLIENT_PORT;
const rawCollabEnabled = import.meta.env.VITE_COLLAB_ENABLED;

const collabPort =
  typeof rawCollabPort === 'number'
    ? rawCollabPort
    : rawCollabPort
      ? Number(rawCollabPort)
      : undefined;

const collabEnabled =
  typeof rawCollabEnabled === 'boolean'
    ? rawCollabEnabled
    : rawCollabEnabled === undefined
      ? true
      : rawCollabEnabled !== 'false';

export const env = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  collabPort,
  collabEnabled,
} as const;
