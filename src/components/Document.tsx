import * as api from "@/api";
import { useYJSContext } from "@/contexts/YJSContext";
import { CollaborationPlugin } from "@/lexical/RemdoCollaborationPlugin";
//import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { useCollaborationContext } from "@lexical/react/LexicalCollaborationContext";
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
//import * as yjsCollaboration from "@lexical/react/shared/useYjsCollaboration";
import invariant from "@lexical/shared/invariant";
import React, {
  KeyboardEventHandler,
  useEffect,
  useRef,
  useState,
} from "react";
import { Doc } from "yjs";

const logCache = new Set<string>();

function uniqueLog(prefix: string, message: string): void {
  const combinedMessage = `${prefix}:${message}`;
  if (!logCache.has(combinedMessage)) {
    //console.log(combinedMessage);
    logCache.add(combinedMessage);
  }
}

const editorConfig: InitialConfigType & { disableCollab: boolean } = {
  onError(error) {
    throw error;
  },
  namespace: "notes",
  theme: {
    text: {
      bold: "font-weight-bold",
      code: "",
      italic: "font-italic",
      strikethrough: "strikethrough",
      subscript: "subscript",
      superscript: "superscript",
      underline: "underline",
      underlineStrikethrough: "underline strikethrough",
    },
  },
  editorState: null,
  disableCollab: !!(import.meta as any).env.VITE_DISABLECOLLAB,
};

const Children = ({ note }: { note: api.Note }) => {
  const [children, setChildren] = useState<api.Note[]>([]);

  useEffect(() => {
    const updateChildren = () => {
      setChildren(note.getChildren());
    };

    updateChildren();

    return note.observe(updateChildren);
  }, [setChildren, note]);

  return (
    <ul>
      {children.map((note) => (
        <Note note={note} key={note.id} />
      ))}
    </ul>
  );
};

const NoteCollabPlugin = ({ note }: { note: api.Note }) => {
  const { provider, doc } = useYJSContext();
  const [editor] = useLexicalComposerContext();
  const collabContext = useCollaborationContext();

  function providerFactory(yjsDocID: string, yjsDocMap: Map<string, Doc>) {
    const docHandler = {
      get(target: typeof doc, prop: keyof typeof doc) {
        if (prop === "get") {
          return (rootID: string) => {
            invariant(
              rootID === "root",
              "element ID is expected to be hardcoded in lexical as 'root'"
            );
            return note._yText;
          };
        }
        uniqueLog("doc", prop);
        return target[prop];
      },
    };

    const proxyHandler = {
      get(target: typeof provider, prop: keyof typeof provider) {
        if (prop === "disconnect") {
          return () => {};
        }
        if (prop === "connect") {
          return () => {
            //@ts-ignore
            const binding = collabContext.binding;
            //console.log("connecting", binding.root.getSharedType()._collabNode, note._yText._collabNode);
            console.log("connecting1", note.id, binding.root.getSharedType().toJSON());
            if (binding?.root?.getSharedType().toDelta) {
              console.log("updating");
              binding.root.applyChildrenYjsDelta(
                binding,
                binding.root.getSharedType().toDelta()
              );
              editor.update(
                () => {
                  binding.root.syncChildrenFromYjs(binding);
                },
                { discrete: true }
              );
            }
          };
        }
        uniqueLog("provider", prop);
        return target[prop];
      },
    };

    const docProxy = new Proxy(doc, docHandler);
    const providerProxy = new Proxy(provider, proxyHandler);

    yjsDocMap.set(yjsDocID, docProxy);

    return providerProxy;
  }

  return (
    <CollaborationPlugin
      id={note.id}
      providerFactory={providerFactory}
      shouldBootstrap={true}
    />
  );
};

const Note = ({ note }: { note: api.Note }) => {
  return (
    <li tabIndex={0} className="sample1">
      {!note.isRoot && (
        <LexicalComposer initialConfig={editorConfig}>
          <div className="editor-container editor-shell" tabIndex={0}>
            <RichTextPlugin
              contentEditable={
                <div className="editor" tabIndex={0}>
                  <ContentEditable className="sample" />
                </div>
              }
              placeholder={null}
              ErrorBoundary={LexicalErrorBoundary}
            />
            <NoteCollabPlugin note={note} />
          </div>
        </LexicalComposer>
      )}
      {note.text}
      <Children note={note} />
    </li>
  );
};

const Document = () => {
  const { doc } = useYJSContext();

  const handleInput: KeyboardEventHandler = (event: KeyboardEvent) => {
    for (
      let node = window.getSelection().focusNode;
      node;
      node = node.parentNode
    ) {
      if ((node as Element).classList?.contains("sample")) {
        console.log("dispaching event fr", event.target);
        console.log("dispaching event to", node);
        const e = event.nativeEvent;
        const clonedEvent = new e.constructor(e.type, e);
        node.dispatchEvent(clonedEvent);
        return;
      }
    }
    console.log("stopping");
    event.preventDefault();
    event.stopPropagation();
    return;
  };

  const handleKeyDown: KeyboardEventHandler = (event: KeyboardEvent) => {
    for (
      let node = window.getSelection().focusNode;
      node;
      node = node.parentNode
    ) {
      if ((node as Element).classList?.contains("sample")) {
        console.log("found sample");
        return;
      }
    }
    console.log("stopping");
    event.preventDefault();
    event.stopPropagation();
    return;

    const allowedKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "Tab",
    ];
    if (allowedKeys.includes(event.key)) {
      return;
    }
    for (
      let node = window.getSelection().focusNode;
      node;
      node = node.parentNode
    ) {
      if ((node as Element).classList?.contains("editor")) {
        console.log("can edit: ");
        return;
      }
    }
    //TODO explain
    event.preventDefault();
  };

  return (
    <div>
      <div
        className="outter"
        suppressContentEditableWarning={true}
        contentEditable={true}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
      >
        Document
        {doc ? <Children note={api.getDocument(doc)} /> : <div>Loading...</div>}
      </div>
    </div>
  );
};

export default Document;
