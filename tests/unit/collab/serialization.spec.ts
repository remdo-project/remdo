import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { env } from "#env";
import { describe, expect, it } from "vitest";

const shouldRun = env.FORCE_WEBSOCKET;

describe.runIf(shouldRun)("snapshot CLI", () => {
  it("round-trips bare Lexical JSON via load/save", () => {
    const docId = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resultsDir = path.join("tests", "data", "tests-results");
    fs.mkdirSync(resultsDir, { recursive: true });

    execFileSync("npm", ["run", "load-v2", "--", docId, "tests/data/basic.json"], {
      stdio: "inherit",
    });

    const loadedPath = path.join(resultsDir, `${docId}.loaded.json`);
    execFileSync("npm", ["run", "save-v2", "--", docId, loadedPath], {
      stdio: "inherit",
    });

    const fixture = JSON.parse(fs.readFileSync("tests/data/basic.json", "utf8"));
    const loaded = JSON.parse(fs.readFileSync(loadedPath, "utf8"));
    expect(stableStringify(loaded)).toBe(stableStringify(fixture));

    const edited = JSON.parse(JSON.stringify(fixture));
    const newText = `SMOKE_EDIT ${docId}`;
    const rootList = edited.root?.children?.[0];
    if (!rootList || !Array.isArray(rootList.children)) {
      throw new Error("Unexpected Lexical JSON structure");
    }

    const nextValue = rootList.children.length + 1;
    rootList.children.push({
      direction: "ltr",
      folded: false,
      format: "",
      indent: 0,
      type: "listitem",
      value: nextValue,
      version: 1,
      children: [
        {
          detail: 0,
          format: 0,
          mode: "normal",
          style: "",
          text: newText,
          type: "text",
          version: 1,
        },
      ],
    });

    const editedPath = path.join(resultsDir, `${docId}.edited.json`);
    fs.writeFileSync(editedPath, stableStringify(edited));

    execFileSync("npm", ["run", "load-v2", "--", docId, editedPath], {
      stdio: "inherit",
    });

    const finalPath = path.join(resultsDir, `${docId}.final.json`);
    execFileSync("npm", ["run", "save-v2", "--", docId, finalPath], {
      stdio: "inherit",
    });

    const finalState = JSON.parse(fs.readFileSync(finalPath, "utf8"));
    expect(collectText(finalState.root)).toContain(newText);
  });
});

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value), null, 2);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      out[key] = sortValue(val);
    }
    return out;
  }
  return value;
}

function collectText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }
  let text = "";
  const maybeText = (node as { text?: unknown }).text;
  if (typeof maybeText === "string") {
    text += maybeText;
  }
  const children = (node as { children?: unknown }).children;
  if (Array.isArray(children)) {
    for (const child of children) {
      text += collectText(child);
    }
  }
  return text;
}
