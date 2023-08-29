import "./common";
import { it } from "vitest";

it("create a few notes", async ({ document }) => {
  document.createChild("note0");
  document.createChild("note1");
  document.createChild("note2");
});

it("create a few children", async ({ document }) => {
  const note0 = document.createChild("note0");
  note0.createChild("note00").createChild("note000");
  note0.createChild("note01");
});
