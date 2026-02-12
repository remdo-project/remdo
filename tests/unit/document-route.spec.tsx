import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import DocumentRoute from '@/routes/DocumentRoute';
import { createDocumentPath } from '@/routing';

vi.mock('@/editor/Editor', async () => {
  const React = await import('react');

  function MockEditor({ docId }: { docId: string }) {
    const instanceIdRef = React.useRef(`instance-${Math.random().toString(36).slice(2)}`);
    return <div data-doc-id={docId} data-instance-id={instanceIdRef.current} data-testid="editor-probe" />;
  }

  return { default: MockEditor };
});

vi.mock('@/editor/zoom/ZoomBreadcrumbs', () => ({
  ZoomBreadcrumbs: () => null,
}));

describe('document route', () => {
  it('remounts editor when document id changes via route params', async () => {
    const router = createMemoryRouter(
      [{ path: '/n/:docRef', element: <DocumentRoute /> }],
      { initialEntries: [createDocumentPath('main')] },
    );

    render(<RouterProvider router={router} />);

    const first = await screen.findByTestId('editor-probe');
    const firstInstanceId = first.dataset.instanceId;
    expect(first.dataset.docId).toBe('main');

    await router.navigate(createDocumentPath('other'));

    await waitFor(() => {
      expect(screen.getByTestId('editor-probe').dataset.docId).toBe('other');
    });

    const second = screen.getByTestId('editor-probe');
    expect(second.dataset.instanceId).not.toBe(firstInstanceId);
  });
});
