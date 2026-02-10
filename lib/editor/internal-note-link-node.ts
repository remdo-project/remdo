import { LinkNode } from '@lexical/link';
import type { SerializedLinkNode } from '@lexical/link';
import { addClassNamesToElement, isHTMLAnchorElement } from '@lexical/utils';
import { $applyNodeReplacement, $getRoot, $isElementNode } from 'lexical';
import type {
  DOMConversionMap,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  Spread,
} from 'lexical';

import { createInternalNoteLinkUrl, parseInternalNoteLinkUrl } from '@/editor/links/internal-link-url';

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
    const clone = new InternalNoteLinkNode(
      { docId: node.__docId, noteId: node.__noteId },
      { rel: node.__rel, target: node.__target, title: node.__title },
      node.__key
    );
    clone.__url = node.__url;
    return clone;
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
    return new InternalNoteLinkNode({
      docId: serializedNode.docId,
      noteId: normalizeNoteId(serializedNode.noteId),
    }).updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedLinkNode>): this {
    const serializedInternal = serializedNode as LexicalUpdateJSON<SerializedInternalNoteLinkNode>;
    const noteId = normalizeNoteId(serializedInternal.noteId);
    const docId = normalizeDocId(serializedInternal.docId);
    const linkSerialized: LexicalUpdateJSON<SerializedLinkNode> = {
      ...serializedNode,
      rel: serializedNode.rel ?? null,
      target: serializedNode.target ?? null,
      title: serializedNode.title ?? null,
      url: serializedNode.url,
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
    return this.getLatest().__url;
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

  setDocId(docId: string | undefined, currentDocId?: string): this {
    const writable = this.getWritable();
    writable.__docId = normalizeDocId(docId);
    if (currentDocId) {
      writable.__url = createInternalNoteLinkUrl(
        { docId: writable.__docId, noteId: writable.__noteId },
        currentDocId
      );
    }
    return writable;
  }

  setLinkRef(ref: InternalNoteLinkRef, currentDocId?: string): this {
    const writable = this.getWritable();
    writable.__noteId = normalizeNoteId(ref.noteId);
    writable.__docId = normalizeDocId(ref.docId);
    if (currentDocId) {
      writable.__url = createInternalNoteLinkUrl(
        { docId: writable.__docId, noteId: writable.__noteId },
        currentDocId
      );
    }
    return writable;
  }

  syncUrl(currentDocId: string): this {
    const writable = this.getWritable();
    writable.__url = createInternalNoteLinkUrl(
      { docId: writable.__docId, noteId: writable.__noteId },
      currentDocId
    );
    return writable;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): InternalNoteLinkNode {
    const currentDocId = inferCurrentDocIdFromUrl(this.getURL()) ?? this.getDocId();
    if (!currentDocId) {
      throw new Error('Internal link current docId is required to clone same-document links.');
    }
    const linkNode = $createInternalNoteLinkNode(this.getLinkRef(), {
      rel: this.__rel,
      target: this.__target,
      title: this.__title,
    }, currentDocId);
    this.insertAfter(linkNode, restoreSelection);
    return linkNode;
  }
}

export function $createInternalNoteLinkNode(
  ref: InternalNoteLinkRef,
  attributes: { rel?: null | string; target?: null | string; title?: null | string } = {},
  currentDocId?: string
): InternalNoteLinkNode {
  const resolvedCurrentDocId = currentDocId ?? ref.docId;
  if (!resolvedCurrentDocId) {
    throw new Error('Current docId is required when creating same-document internal links.');
  }
  return $applyNodeReplacement(new InternalNoteLinkNode(ref, attributes)).syncUrl(resolvedCurrentDocId);
}

export function $isInternalNoteLinkNode(node: LexicalNode | null | undefined): node is InternalNoteLinkNode {
  return node instanceof InternalNoteLinkNode;
}

export function $syncInternalNoteLinkNodeUrls(currentDocId: string): void {
  const stack: LexicalNode[] = [$getRoot()];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }
    if ($isInternalNoteLinkNode(node)) {
      node.syncUrl(currentDocId);
    }
    if ($isElementNode(node)) {
      const children = node.getChildren();
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child) {
          stack.push(child);
        }
      }
    }
  }
}

function inferCurrentDocIdFromUrl(url: string): string | undefined {
  return parseInternalNoteLinkUrl(url)?.docId;
}
