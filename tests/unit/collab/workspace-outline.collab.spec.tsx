import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as Y from 'yjs';
import type { components } from '#platform/http/api-schema';
import { resolveApiServerOrigin } from '#platform/net/origins';
import WorkspaceOutline from '#client/editor/shell/WorkspaceOutline';
import { createTestAuthAccount } from '#tests-common/auth-account';
import { installAuthenticatedApiFetch } from './_support/auth';
import { COLLAB_LONG_TIMEOUT_MS } from './_support/timeouts';

// Every update the outline's own document makes that its provider didn't receive from the room.
const readerWrites = vi.hoisted(() => [] as Uint8Array[]);

vi.mock('#collaboration/runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#collaboration/runtime')>();
  return {
    ...actual,
    createProviderFactory: (...args: Parameters<typeof actual.createProviderFactory>) => {
      const factory = actual.createProviderFactory(...args);
      return (id: string, docMap: Map<string, Y.Doc>) => {
        const created = factory(id, docMap);
        created.doc.on('update', (update: Uint8Array, origin: unknown) => {
          if (origin !== created.provider) readerWrites.push(update);
        });
        return created;
      };
    },
  };
});

async function createWorkspace(content: string) {
  const response = await fetch(`${resolveApiServerOrigin()}/api/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations: [{ op: 'insert', parent: 'me', kind: 'workspace', text: 'Outline test', content }],
      expected: {},
      dryRun: false,
    }),
  });
  const created = await response.json() as components['schemas']['CallResult'];
  return String(created.results[0]!.ref);
}

const noteTexts = (container: HTMLElement) =>
  [...container.querySelectorAll('li.list-item:not(.list-nested-item)')].map((item) => item.textContent);

// Lexical commits and syncs back to Yjs in microtasks, so one macrotask lets any write land.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the read-only workspace outline', { timeout: COLLAB_LONG_TIMEOUT_MS }, () => {
  let restore: () => void;
  beforeAll(async () => {
    restore = await installAuthenticatedApiFetch({ ...createTestAuthAccount(), admin: true });
  });
  afterAll(() => restore());

  it('shows a document without writing to its room', async () => {
    const workspace = await createWorkspace('# Trip\n\nFour days.\n\n1. Alfama, **two** `maps` from [the guide](https://example.com)\n2. Belém\n- [x] Book flights\n  - Seats\n');
    const { container, unmount } = render(<WorkspaceOutline workspaceId={workspace} />);
    try {
      await expect.poll(() => noteTexts(container)).toContain('Seats');
      await settle();

      expect(readerWrites).toEqual([]);
    } finally {
      unmount();
    }
  });
});
