import { LinkNode } from '@lexical/link';
import type { SerializedLinkNode } from '@lexical/link';
import { addClassNamesToElement, isHTMLAnchorElement } from '@lexical/utils';
import { $applyNodeReplacement } from 'lexical';
import type {
  DOMConversionMap,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  Spread,
} from 'lexical';

import {
  createInternalNoteLinkUrl,
  parseInternalNoteLinkUrl,
  resolveCurrentDocIdFromLocation,
} from '@/editor/links/internal-link-url';

export interface InternalNoteLinkRef {
  noteId: string;
  docId?: string;
}

export type SerializedInternalNoteLinkNode = Spread<
  {
    docId?: string;
    noteId?: string;
  },
  SerializedLinkNode
>;

const DEFAULT_INTERNAL_LINK_REF: InternalNoteLinkRef = { noteId: 'missing-note-id' };

function normalizeDocId(docId: string | undefined): string | undefined {
  if (typeof docId !== 'string') {
    return undefined;
  }
  const trimmed = docId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNoteId(noteId: string | undefined): string {
  return typeof noteId === 'string' && noteId.length > 0 ? noteId : 'missing-note-id';
}

export class InternalNoteLinkNode extends LinkNode {
  __docId?: string;
  __noteId: string;

  static getType(): string {
    return 'internal-note-link';
  }

  static clone(node: InternalNoteLinkNode): InternalNoteLinkNode {
    return new InternalNoteLinkNode(
      { docId: node.__docId, noteId: node.__noteId },
      { rel: node.__rel, target: node.__target, title: node.__title },
      node.__key
    );
  }

  constructor(
    ref: InternalNoteLinkRef = DEFAULT_INTERNAL_LINK_REF,
    attributes: { rel?: null | string; target?: null | string; title?: null | string } = {},
    key?: NodeKey
  ) {
    super('', attributes, key);
    this.__noteId = normalizeNoteId(ref.noteId);
    this.__docId = normalizeDocId(ref.docId);
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  static importJSON(serializedNode: SerializedInternalNoteLinkNode): InternalNoteLinkNode {
    return $createInternalNoteLinkNode({
      docId: serializedNode.docId,
      noteId: normalizeNoteId(serializedNode.noteId),
    }).updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedLinkNode>): this {
    const serializedInternal = serializedNode as LexicalUpdateJSON<SerializedInternalNoteLinkNode>;
    const parsedFromUrl = parseInternalRefFromUrl(serializedNode.url);
    const noteId = normalizeNoteId(serializedInternal.noteId ?? parsedFromUrl.noteId);
    const docId = normalizeDocId(serializedInternal.docId ?? parsedFromUrl.docId);
    const linkSerialized: LexicalUpdateJSON<SerializedLinkNode> = {
      ...serializedNode,
      rel: serializedNode.rel ?? null,
      target: serializedNode.target ?? null,
      title: serializedNode.title ?? null,
      url: createInternalNoteLinkUrl({ docId, noteId }, resolveCurrentDocIdFromLocation()),
    };
    return super
      .updateFromJSON(linkSerialized)
      .setLinkRef({ docId, noteId });
  }

  exportJSON(): SerializedLinkNode {
    const base = super.exportJSON();
    const docId = this.getDocId();
    const serialized: SerializedInternalNoteLinkNode = {
      ...base,
      url: this.getURL(),
      ...(docId ? { docId } : {}),
      noteId: this.getNoteId(),
    };
    return {
      ...serialized,
      type: 'internal-note-link',
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement('a');
    this.updateLinkDOM(null, element);
    addClassNamesToElement(element, config.theme.link);
    return element;
  }

  updateDOM(prevNode: this, anchor: HTMLElement): boolean {
    this.updateLinkDOM(prevNode, anchor);
    return false;
  }

  updateLinkDOM(prevNode: this | null, anchor: HTMLElement): void {
    if (!isHTMLAnchorElement(anchor)) {
      return;
    }

    const prevHref = prevNode ? prevNode.sanitizeUrl(prevNode.getURL()) : null;
    const nextHref = this.sanitizeUrl(this.getURL());
    if (!prevNode || prevHref !== nextHref) {
      anchor.href = nextHref;
    }

    for (const attr of ['target', 'rel', 'title'] as const) {
      const prevValue = prevNode ? prevNode[`__${attr}`] : null;
      const value = this[`__${attr}`];
      if (!prevNode || prevValue !== value) {
        if (value) {
          anchor[attr] = value;
        } else {
          anchor.removeAttribute(attr);
        }
      }
    }
  }

  getURL(): string {
    return createInternalNoteLinkUrl(this.getLinkRef(), resolveCurrentDocIdFromLocation());
  }

  getLinkRef(): InternalNoteLinkRef {
    return {
      ...(this.getDocId() ? { docId: this.getDocId() } : {}),
      noteId: this.getNoteId(),
    };
  }

  getNoteId(): string {
    return this.getLatest().__noteId;
  }

  getDocId(): string | undefined {
    return this.getLatest().__docId;
  }

  setDocId(docId: string | undefined): this {
    const writable = this.getWritable();
    writable.__docId = normalizeDocId(docId);
    return writable;
  }

  setLinkRef(ref: InternalNoteLinkRef): this {
    const writable = this.getWritable();
    writable.__noteId = normalizeNoteId(ref.noteId);
    writable.__docId = normalizeDocId(ref.docId);
    return writable;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): InternalNoteLinkNode {
    const linkNode = $createInternalNoteLinkNode(this.getLinkRef(), {
      rel: this.__rel,
      target: this.__target,
      title: this.__title,
    });
    this.insertAfter(linkNode, restoreSelection);
    return linkNode;
  }
}

export function $createInternalNoteLinkNode(
  ref: InternalNoteLinkRef,
  attributes?: { rel?: null | string; target?: null | string; title?: null | string }
): InternalNoteLinkNode {
  return $applyNodeReplacement(new InternalNoteLinkNode(ref, attributes));
}

export function $isInternalNoteLinkNode(node: LexicalNode | null | undefined): node is InternalNoteLinkNode {
  return node instanceof InternalNoteLinkNode;
}

function parseInternalRefFromUrl(url: string): InternalNoteLinkRef {
  return parseInternalNoteLinkUrl(url) ?? { noteId: 'missing-note-id' };
}
