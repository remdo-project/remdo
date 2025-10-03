import path from "node:path";
import { env } from "#env";
import { execFileSync } from "node:child_process";

import { expect, it } from "vitest";
import { readFileSync } from "node:fs";

const shouldRun = env.FORCE_WEBSOCKET;
it.runIf(shouldRun)("load, edit and save editor's content", () => {
  const docID = "snapshot-test"; //TODO make the id unique and clean up
  const loadPath = path.join("tests", "data", "basic.json");
  const savePath = path.join("data", `${docID}.json`);
  execFileSync("npm", ["run", "load", "--", docID, loadPath], {
    stdio: "inherit",
  });
  //execFileSync("npm", ["run", "save", "--", docID, savePath], {
  //  stdio: "inherit",
  //});

  //expect files to match
  const saved = JSON.parse(readFileSync(savePath, "utf-8"));
  const loaded = JSON.parse(readFileSync(loadPath, "utf-8"));
  expect(saved).toEqual(loaded);
});
