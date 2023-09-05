import { $createCollabElementNode, CollabElementNode } from "@lexical/yjs/CollabElementNode";
import { $createCollabTextNode } from "@lexical/yjs/CollabTextNode";
import { TextNode } from "lexical";
import { v4 as uuidv4 } from "uuid";
import * as Y from "yjs";

const ROOT_NAME = "notes13";

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
    return this._yText.toString();
  }

  set text(text: string) {
    //console.log("attrs", this._yText.getAttributes());
    //this._yText.delete(0, this._yText.length);
    //this._yText.insert(0, text);
    const map = new Y.Map();
    $createCollabTextNode(
      map,
      text,
      this._collabNode,
      TextNode.getType()
    );
    console.log("text=", text, "yText=", this._yText.toString());
  }

  observe(callback: () => void) {
    this._y.observe(callback);
    return () => this._y.unobserve(callback);
  }

  getChildren() {
    return this._y.toArray().map((yChild) => new Note(yChild as Y.XmlElement));
  }

  get id() {
    return this._y.nodeName;
  }

  get _yText(): Y.XmlText {
    let lexicalYJSRoot: Y.XmlText = this._y.getAttribute("text1") as any; //FIXME rename text1, don't use private API
    if (lexicalYJSRoot) {
      return lexicalYJSRoot;
    }
    lexicalYJSRoot = new Y.XmlText();
    this._y.setAttribute("text1", lexicalYJSRoot);
    return lexicalYJSRoot;
  }

  get _collabNode(): CollabElementNode {
    const yText = this._yText;
    return yText._collabNode = yText._collabNode ?? $createCollabElementNode(yText, null, 'root')  //TODO magic sstring
  }
}

export class Document extends Note {
  isRoot: boolean;

  constructor(yDoc: Y.Doc) {
    super(yDoc.get(ROOT_NAME, Y.XmlElement) as Y.XmlElement); //getXMLElement is not implemented, so we have to cast
    this._y.nodeName = ROOT_NAME;
    this.isRoot = true;
  }
}

export function getDocument(yDoc: Y.Doc) {
  return new Document(yDoc);
}
