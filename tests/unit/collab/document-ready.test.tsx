import "../common";
import { act } from "@testing-library/react";
import { env } from "#env";
import { expect, it } from "vitest";

const shouldRun = env.FORCE_WEBSOCKET;

it.runIf(shouldRun)(
  "switching documents resolves whenReady after Yjs sync and Lexical apply (real collab)",
  async (context) => {
    const session = () => context.documentSelector;

    if (session().collabDisabled) {
      throw new Error(
        "Collaboration is disabled; run this test in collab-enabled environment",
      );
    }

    const initialEpoch = session().switchEpoch;

    await act(async () => {
      session().setId("flat", "replace");
    });

    await act(async () => {
      await session().whenReady({ since: initialEpoch, timeout: 5000 });
    });

    expect(session().id).toBe("flat");
    expect(session().ready).toBe(true);
    expect(session().yjsProvider?.synced).toBe(true);

    const nextEpoch = session().switchEpoch;

    await act(async () => {
      session().setId("main", "replace");
    });

    await act(async () => {
      await session().whenReady({ since: nextEpoch, timeout: 5000 });
    });

    expect(session().id).toBe("main");
    expect(session().ready).toBe(true);
    expect(session().yjsProvider?.synced).toBe(true);
  },
  15000,
);
