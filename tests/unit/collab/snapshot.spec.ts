import path from "node:path";
import { env } from "#env";
import { execFileSync } from "node:child_process";

import { it } from "vitest";

const shouldRun = env.FORCE_WEBSOCKET;
it.runIf(shouldRun)("load, edit and save editor's content", () => {
  const docID = "snapshot-test"; //TODO make the id unique and clean up
  const loadPath = path.join("tests", "data", "basic.json");
  const savePath = path.join("data", `${docID}.json`);
  execFileSync("npm", ["run", "load", "--", docID, loadPath], {
    stdio: "inherit",
  });
  //TODO make some changes and verify if they are saved correctly
  execFileSync("npm", ["run", "save", "--", docID, savePath], {
    stdio: "inherit",
  });
});
