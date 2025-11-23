import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';

import { CollaborationProvider } from '@/editor/plugins/collaboration';
import type { CollaborationStatusValue } from '@/editor/plugins/collaboration';
import { CollabConsumer } from './provider-test-helpers';

export interface CollabHarness {
  getCollab: () => CollaborationStatusValue;
  waitForReady: () => Promise<CollaborationStatusValue>;
  renderResult: RenderResult;
}

export function renderCollabHarness(): CollabHarness {
  const latestRef: { current?: CollaborationStatusValue } = { current: undefined };
  let resolveReady: ((value: CollaborationStatusValue) => void) | undefined;
  const readyPromise = new Promise<CollaborationStatusValue>((resolve) => {
    resolveReady = resolve;
  });

  const renderResult = render(
    <CollaborationProvider>
      <CollabConsumer
        onReady={(value) => {
          latestRef.current = value;
          resolveReady?.(value);
        }}
      />
    </CollaborationProvider>
  );

  const getCollab = () => {
    if (!latestRef.current) {
      throw new Error('Collaboration status unavailable');
    }
    return latestRef.current;
  };

  const waitForReady = () => readyPromise.then(() => getCollab());

  return {
    getCollab,
    waitForReady,
    renderResult,
  };
}
