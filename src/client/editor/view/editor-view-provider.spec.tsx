import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EditorViewProvider, useEditorViewActions } from './EditorViewProvider';

describe('zoom route acknowledgement', () => {
  it('rejects an older route commit after a newer request and accepts external navigation', () => {
    let actions: ReturnType<typeof useEditorViewActions>;
    function Probe() {
      actions = useEditorViewActions();
      return null;
    }
    const navigate = vi.fn();
    const view = (noteId: string | null, requestId?: number) => (
      <EditorViewProvider docId="zoomDoc" onZoomNoteIdChange={navigate} zoomNoteId={noteId} zoomRequestId={requestId}>
        <Probe />
      </EditorViewProvider>
    );
    const { rerender } = render(view('note3'));

    act(() => actions.requestZoomNoteId('note2'));
    const firstRequest = navigate.mock.lastCall![1] as number;
    rerender(view('note2', firstRequest));
    const firstRouteEffect = actions!.isCurrentZoomRoute;
    expect(firstRouteEffect()).toBe(true);

    act(() => actions.requestZoomNoteId('note1'));
    const secondRequest = navigate.mock.lastCall![1] as number;
    // A previously rendered effect can run after the next command is accepted.
    expect(firstRouteEffect()).toBe(false);
    rerender(view('note2', firstRequest));
    expect(actions!.isCurrentZoomRoute()).toBe(false);

    rerender(view('note1', secondRequest));
    expect(actions!.isCurrentZoomRoute()).toBe(true);
    rerender(view('note2'));
    expect(actions!.isCurrentZoomRoute()).toBe(true);
  });
});
