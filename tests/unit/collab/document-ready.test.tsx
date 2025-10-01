import "../common";
import { act } from "@testing-library/react";
import { env } from "#env";
import { expect, it } from "vitest";

const shouldRun = env.FORCE_WEBSOCKET;

it.runIf(shouldRun)(
  "switching documents resolves whenReady after Yjs sync and Lexical apply (real collab)",
  async (context) => {
    const getSession = () => context.documentSelector;
    const initialSession = getSession();

    if (initialSession.collabDisabled) {
      throw new Error(
        "Collaboration is disabled; run this test with FORCE_WEBSOCKET and a websocket server",
      );
    }

    const firstSince = initialSession.switchEpoch;

    await act(async () => {
      getSession().setId("collab-secondary", "replace");
    });

    await getSession().whenReady({ since: firstSince, timeout: 5000 });

    const afterFirstSwitch = getSession();
    expect(afterFirstSwitch.id).toBe("collab-secondary");
    expect(afterFirstSwitch.switchEpoch).toBe(firstSince + 1);
    expect(afterFirstSwitch.ready).toBe(true);
    expect(afterFirstSwitch.yjsProvider?.synced).toBe(true);

    const secondSince = afterFirstSwitch.switchEpoch;

    await act(async () => {
      getSession().setId("main", "replace");
    });

    await getSession().whenReady({ since: secondSince, timeout: 5000 });

    const afterSecondSwitch = getSession();
    expect(afterSecondSwitch.id).toBe("main");
    expect(afterSecondSwitch.switchEpoch).toBe(secondSince + 1);
    expect(afterSecondSwitch.ready).toBe(true);
    expect(afterSecondSwitch.yjsProvider?.synced).toBe(true);
  },
  15000,
);
