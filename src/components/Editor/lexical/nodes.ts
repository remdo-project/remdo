import { NotesState, Note } from "./api";
import { patch } from "@/utils";
import {
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { updateChildrenListItemValue } from "@lexical/list/formatList";
import { addClassNamesToElement, removeClassNamesFromElement } from "@lexical/utils";
import { LexicalNode, RangeSelection } from "lexical";
import { EditorConfig } from "lexical";

export function applyNodePatches(NodeType: any) {
  /*
    This function customizes updateDOM and createDOM (see below) in an existing
    lexical node class. An alternative would be to use lexical node replacement
    mechanism, but this turns off TextNode merging (see TextNote.isSimpleText()) 
    This could be fixed, but an additional benefit is that this method is 
    simpler, shorter (doesn't require to implement importJSON, clone, etc.)
    and doesn't rename original types
    */
  patch(NodeType, "updateDOM", function (oldMethod, prevNode, dom, config) {
    //lexicalMethod has to be placed first as it may have some side effects
    return (
      //TODO perform an actual check
      oldMethod(prevNode, dom, config) || true
    );
  });

  patch(NodeType, "createDOM", function (oldMethod, config, editor) {
    const notesState = NotesState.getActive();
    //
    // search filter
    //
    //TODO try to use "changeFocus" tag instead of changing state
    if (notesState.filter) {
      if ($isListNode(this)) {
        //TODO this could be specific for ListNode.createDOM
        if (this.getParent().getKey() === "root") {
          return oldMethod(config, editor);
        }
        return document.createElement("div");
      }
      if (!Note.from(this).text.includes(notesState.filter)) {
        return document.createElement("div");
      } else {
        //during search focus and fold are ignored
        return oldMethod(config, editor);
      }
    }

    //FIXME
    const dom: HTMLElement = oldMethod(config, editor);
    if (Note.from(this).folded) {
      addClassNamesToElement(dom, "note-folded");
    }
    return dom;

    //
    // focus & fold
    //
    //TODO simplify
    const note = Note.from(this);
    const parents = [...note.parents];
    if (
      !notesState.focus ||
      notesState.focus.parentKey === this.getKey() ||
      notesState.focus.nodeKey === this.getKey() ||
      [note, ...note.parents].some(
        p => p.lexicalKey === notesState.focus.nodeKey
      )
    ) {
      //
      // is folded?
      //
      if (notesState?.focus?.nodeKey !== note.lexicalKey) {
        for (const p of parents) {
          if (p.folded) {
            return document.createElement("div");
          }
          if (p.lexicalKey === notesState.focus?.nodeKey) {
            break;
          }
        }
      }
      const dom: HTMLElement = oldMethod(config, editor);
      if (note.folded) {
        addClassNamesToElement(dom, "note-folded");
      }
      return dom;
    } else {
      return document.createElement("div");
    }
  });
}

patch(ListItemNode, "clone", function (oldClone, oldNode: ListItemNode) {
  const newNode = oldClone(oldNode);
  newNode.__folded = oldNode.__folded ?? false;
  return newNode;
});

patch(ListItemNode, "importJSON", function (oldImportJSON, serializedNode) {
  //lexical implements multi-level indents by adding some extra styles to the 
  //node, we don't allow them, so there is no need for the extra styles
  serializedNode.indent = 0;
  const node = oldImportJSON(serializedNode);
  node.__folded = serializedNode["folded"] ?? false;
  return node;
});

patch(ListItemNode, "exportJSON", function (oldExportJSON) {
  return {
    ...oldExportJSON(),
    folded: this.__folded,
  };
});

patch(
  ListItemNode,
  "insertNewAfter",
  function (old, selection: RangeSelection, restoreSelection = true) {
    // if the current element doesn't have children this code does the same what
    // the original method does, which is inserting a new element after the
    // current
    // if the current element has children, the new element is inserted as a
    // first child (if the current element is not folded) or after children list
    const nextListItem = this.getNextSibling();
    let childrenListNode: ListNode = nextListItem
      ?.getChildren()
      .find($isListNode);

    const newElement = old(selection, restoreSelection);

    if (this.getFolded()) {
      nextListItem?.insertAfter(newElement);
    } else {
      childrenListNode?.getFirstChild()?.insertBefore(newElement);
    }

    return newElement;
  }
);

patch(ListItemNode, "transform", function (old, node: LexicalNode) {
  return (node: LexicalNode) => {
    const parent = node.getParent();
    if ($isListNode(parent)) {
      updateChildrenListItemValue(parent);
      //remdo: set checked regardless of parent type
      /*
      if ( parent.getListType() !== "check" && node.getChecked() != null) {
        node.setChecked(undefined);
      }
      */
    }
  };
});

//TODO this method is patched twice, here and above
patch(ListItemNode, "createDOM", function (old, config: EditorConfig, editor) {
  /* 
  add/remove checked class as needed
  it's also done in $setListItemThemeClassNames, but that implementation depends
  on parent list type
  $setListItemThemeClassNames is an unexported and long function, so it's easier
  to patch createDOM/updateDOM
  */
  const dom = old(config, editor);
  const className = config.theme.list.listitemChecked;
  if (this.getChecked()) {
    addClassNamesToElement(dom, className);
  } else {
    removeClassNamesFromElement(dom, className);
  }
  return dom;
});

//TODO this method is patched twice, here and above
patch(ListItemNode, "updateDOM", function (old, prevNode, dom, config) {
  /* 
  add/remove checked class as needed
  it's also done in $setListItemThemeClassNames, but that implementation depends
  on parent list type
  $setListItemThemeClassNames is an unexported and long function, so it's easier
  to patch createDOM/updateDOM
  */
  const update = old(prevNode, dom, config);
  const className = config.theme.list.listitemChecked;
  if (this.getChecked()) {
    addClassNamesToElement(dom, className);
  } else {
    removeClassNamesFromElement(dom, className)
  }
  return update;
});
