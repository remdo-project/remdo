import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";

const ROOT_NAME = "notes12";

export class Note {
  _y: Y.XmlElement;

  constructor(y: Y.XmlElement) {
    this._y = y;
  }

  createChild(text = "") {
    const yChild = new Y.XmlElement(uuidv4());
    this._y.push([yChild]);
    const child = new Note(yChild);
    child.text = text;
    return child;
  }

  get text() {
    return this._y.getAttribute && this._y.getAttribute("text");
  }

  set text(text: string) {
    this._y.setAttribute("text", text);
  }

  observe(callback: () => void) {
    this._y.observeDeep(callback);
    return this._y.unobserveDeep(callback);
  }

  getChildren() {
    return this._y.toArray().map((yChild) => new Note(yChild as Y.XmlElement));
  }

  get id() {
    return this._y.nodeName;
  }
}

export class Document extends Note {
  constructor(yDoc: Y.Doc) {
    super(yDoc.get(ROOT_NAME, Y.XmlElement) as Y.XmlElement); //getXMLElement is not implemented, so we have to cast
    this._y.nodeName = ROOT_NAME;
  }
}

export function getDocument(yDoc: Y.Doc) {
  return new Document(yDoc);
}
