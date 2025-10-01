import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useEffect } from "react";
import { Routes as AppRoutes } from "@/Routes";
import { useDocumentSelector } from "@/features/editor/DocumentSelector/DocumentSessionProvider";
import { env } from "#env";
import { beforeAll, expect, it } from "vitest";
import WS from "ws";

const shouldRun = env.FORCE_WEBSOCKET;

type SessionRef = ReturnType<typeof useDocumentSelector>;

if (shouldRun) {
  beforeAll(() => {
    if (typeof (globalThis as any).WebSocket === "undefined") {
      (globalThis as any).WebSocket = WS;
    }
  });
}

let sessionRef: SessionRef | null = null;

function SessionProbe() {
  const session = useDocumentSelector();
  useEffect(() => {
    sessionRef = session;
  }, [session]);
  return null;
}

it.runIf(shouldRun)(
  "switching documents resolves whenReady after Yjs sync and Lexical apply (real collab)",
  async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={["/?documentID=primary"]}>
        <>
          <AppRoutes />
          <SessionProbe />
        </>
      </MemoryRouter>,
    );

    await waitFor(() => {
      if (!sessionRef) {
        throw new Error("Session not available");
      }
    }, { timeout: 5000 });

    if (!sessionRef) {
      throw new Error("Session not available");
    }

    if (sessionRef.collabDisabled) {
      throw new Error("Collaboration is disabled; run this test in collab-enabled environment");
    }

    const firstEpoch = sessionRef.switchEpoch;

    act(() => {
      sessionRef!.setId("secondary", "replace");
    });

    await act(async () => {
      await sessionRef!.whenReady({ since: firstEpoch, timeout: 5000 });
    });

    expect(sessionRef!.id).toBe("secondary");
    expect(sessionRef!.ready).toBe(true);
    expect(sessionRef!.yjsProvider?.synced).toBe(true);

    const secondEpoch = sessionRef!.switchEpoch;

    act(() => {
      sessionRef!.setId("primary", "replace");
    });

    await act(async () => {
      await sessionRef!.whenReady({ since: secondEpoch, timeout: 5000 });
    });

    expect(sessionRef!.id).toBe("primary");
    expect(sessionRef!.ready).toBe(true);
    expect(sessionRef!.yjsProvider?.synced).toBe(true);

    unmount();
  },
  20000,
);
