import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { useEffect, useRef } from "react";
import {
  DocumentSelectorProvider,
  useDocumentSelector,
  type DocumentSession,
} from "@/features/editor/DocumentSelector/DocumentSessionProvider";
import { useCollabFactory } from "@/features/editor/collab/useCollabFactory";
import { useCollabSession } from "@/features/editor/collab/useCollabSession";
import { env } from "#env";
import * as Y from "yjs";

const shouldRun = env.FORCE_WEBSOCKET;

let sessionRef: (DocumentSession & { _notifyEditorReady: (epoch: number) => void }) | null = null;

function SessionCapture() {
  const session = useDocumentSelector() as DocumentSession & {
    _notifyEditorReady: (epoch: number) => void;
  };
  useEffect(() => {
    sessionRef = session;
    return () => {
      if (sessionRef === session) {
        sessionRef = null;
      }
    };
  }, [session]);
  return null;
}

function ProviderBridge() {
  const factory = useCollabFactory();
  const session = useDocumentSelector();
  const docMapRef = useRef<Map<string, Y.Doc>>(new Map());

  useEffect(() => {
    const provider = factory(session.id, docMapRef.current);
    provider.connect?.();
    return () => {
      provider.destroy();
    };
  }, [factory, session.id]);

  return null;
}

function ReadyBridge() {
  const session = useDocumentSelector() as DocumentSession & {
    _notifyEditorReady: (epoch: number) => void;
  };
  const { synced } = useCollabSession(session.id);
  const previousSynced = useRef(false);

  useEffect(() => {
    if (!previousSynced.current && synced) {
      queueMicrotask(() => {
        session._notifyEditorReady(session.switchEpoch);
      });
    }
    previousSynced.current = synced;
  }, [session, synced]);

  return null;
}

function Harness() {
  return (
    <MemoryRouter initialEntries={["/?documentID=main"]}>
      <DocumentSelectorProvider>
        <SessionCapture />
        <ProviderBridge />
        <ReadyBridge />
      </DocumentSelectorProvider>
    </MemoryRouter>
  );
}

it.runIf(shouldRun)(
  "switching documents resolves whenReady after Yjs sync and Lexical apply (real collab)",
  async () => {
    render(<Harness />);

    await waitFor(() => sessionRef?.yjsProvider?.synced === true, { timeout: 5000 });

    let session = sessionRef!;

    const since = session.switchEpoch;

    await act(async () => {
      session.setId("secondary", "replace");
    });

    await act(async () => {
      await session.whenReady({ since, timeout: 10000 });
    });

    session = sessionRef!;

    expect(session.id).toBe("secondary");
    expect(session.ready).toBe(true);
    expect(session.yjsProvider?.synced).toBe(true);

    const since2 = session.switchEpoch;

    await act(async () => {
      session.setId("main", "replace");
    });

    await act(async () => {
      await session.whenReady({ since: since2, timeout: 10000 });
    });

    session = sessionRef!;

    expect(session.id).toBe("main");
    expect(session.ready).toBe(true);
    expect(session.yjsProvider?.synced).toBe(true);
  },
  20000,
);
