import { createChildren } from "./common";
import * as api from "@/api";
import { v4 as uuidv4 } from "uuid";
import { it } from "vitest";
import * as Y from "yjs";

it("adds a few notes", async ({ yjsDoc }) => {
  //const doc = new api.Document(yjsDoc);
  //console.log(doc.notes.toJSON());
  //console.log(root.getChildren());
  //doc.createChild("note1");

  //const notes: Y.Array<string> = yjsDoc.getArray("notes");

  //notes.delete(0, notes.length);
  //notes.insert(0, ["Note 1", "Note 2", "Note 3"]);

  //const noteMap = yjsDoc.getMap<api.YNoteType>("notes3");
  //const noteMap = yjsDoc.getMap<string>("notes2");
  //console.log("before: ", id, noteMap.toJSON());

  //const yNote: api.YNoteType = {
  //  text: "foo" + id,
  //  children: new Y.Array<string>(),
  //};
  //console.log(yNote.children);
  //
  //const a = new Y.Array<string>();
  //a.push("foo");

  //const a = "foo";

  //noteMap.set("" + id, yNote);

  /*
  const noteMap = yjsDoc.getMap<Y.Array<string>>("notes5");
  const yNote = new Y.Array<string>();
  yNote.push(["child0"]);

  noteMap.set("" + id, yNote);

  const old = noteMap.get("0");
  old.push(["child1"]);

  for (const [k, v] of noteMap.entries()) {
    console.log(k, v.toJSON())
  }
  */

  /*
  const noteMap = yjsDoc.getMap<{text: string, children: Y.Array<string>}>("notes8");
  noteMap.get("0")
  const id = noteMap.size;
  const yNote = {text: "foo0", children: new Y.Array<string>()};
  yNote.children.push(["child0"]);

  noteMap.set("" + id, yNote);

  //const old = noteMap.get("0");
  //old.children.push(["child1"]);

  for (const [k, v] of noteMap.entries()) {
    console.log(k, JSON.stringify(v));
  }
  */

  /*
  const root = yjsDoc.getXmlFragment("notes8");
  console.log("length: ", root.length);
  root.push([new Y.XmlElement(uuidv4())]);

  console.log(root.toJSON());
  */

  const root = api.getDocument(yjsDoc);
  console.log("creating children");
  root.createChild("note1");
  root.createChild("note2");
 // console.log(root._y.toJSON());

  if (!createChildren) {
    console.log("test");
  }
});
