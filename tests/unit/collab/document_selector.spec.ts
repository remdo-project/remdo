import "../common";
import { act, waitFor } from "@testing-library/react";
import { env } from "#env";
import type { TestContext } from "vitest";
import { it } from "vitest";
import { getMinimizedState } from "../common";
import * as Y from "yjs";

async function switchDocument(context: TestContext, id: string) {
  const previousEditor = context.editor;

  await act(async () => {
    context.documentSelector.setDocumentID(id);
  });

  await waitFor(() => context.documentSelector.documentID === id);
  await waitFor(() => context.editor !== previousEditor);
  await waitFor(() => context.documentSelector.getYjsProvider() !== null);
  await waitFor(
    () => context.documentSelector.getYjsProvider()?.synced === true,
    { timeout: 5000 },
  );
  await waitFor(() => {
    const doc = context.documentSelector.getYjsDoc();
    if (!doc) {
      return false;
    }
    if (!doc.share.has("root")) {
      doc.get("root", Y.XmlText);
    }
    return true;
  });
}

const shouldRun = env.FORCE_WEBSOCKET;

//FIXME re-enable
it.runIf(shouldRun && false)("preserves independent state for each document", async (context) => {
  const { load, lexicalUpdate, expect } = context;

  const { note0: mainNote } = load("basic");

  lexicalUpdate(() => {
    mainNote.text = "main note updated";
    mainNote.createChild("main child 1");
  });

  await waitFor(
    () => {
      const doc = context.documentSelector.getYjsDoc();
      if (!doc) {
        return false;
      }
      const rootXmlText = doc.get("root", Y.XmlText);
      return rootXmlText.length > 0;
    },
    { timeout: 5000 },
  );

  const mainSnapshot = getMinimizedState(context.editor);

  await switchDocument(context, "flat");

  const { note0: flatNote0, note1: flatNote1 } = load("flat");

  lexicalUpdate(() => {
    flatNote0.text = "flat note0 updated";
    flatNote1.text = "flat note1 updated";
  });

  await waitFor(
    () => {
      const doc = context.documentSelector.getYjsDoc();
      if (!doc) {
        return false;
      }
      const rootXmlText = doc.get("root", Y.XmlText);
      return rootXmlText.length > 0;
    },
    { timeout: 5000 },
  );

  const flatSnapshot = getMinimizedState(context.editor);

  expect(flatSnapshot).not.toEqual(mainSnapshot);

  await switchDocument(context, "main");

  await waitFor(() => {
    const doc = context.documentSelector.getYjsDoc();
    if (!doc) {
      return false;
    }
    const rootXmlText = doc.get("root", Y.XmlText);
    return rootXmlText.length > 0;
  });

  await waitFor(() => {
    expect(getMinimizedState(context.editor)).toEqual(mainSnapshot);
  }, { timeout: 5000 });

  await switchDocument(context, "flat");

  await waitFor(() => {
    const doc = context.documentSelector.getYjsDoc();
    if (!doc) {
      return false;
    }
    const rootXmlText = doc.get("root", Y.XmlText);
    return rootXmlText.length > 0;
  });

  await waitFor(() => {
    expect(getMinimizedState(context.editor)).toEqual(flatSnapshot);
  }, { timeout: 5000 });
});
