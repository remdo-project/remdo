import { setTimeout as wait } from 'node:timers/promises';

interface WaitForDevelopmentCollaborationOptions {
  attempts?: number;
  collabReady: () => Promise<boolean>;
  pollIntervalMs?: number;
  port: number;
}

export async function waitForDevelopmentCollaboration({
  attempts = 150,
  collabReady,
  pollIntervalMs = 100,
  port,
}: WaitForDevelopmentCollaborationOptions): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await collabReady()) {
      return;
    }
    await wait(pollIntervalMs);
  }
  throw new Error(`Development collaboration service did not become ready on port ${port}.`);
}
