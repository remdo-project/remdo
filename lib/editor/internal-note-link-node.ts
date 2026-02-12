import { LinkNode } from '@lexical/link';
import type { SerializedLinkNode } from '@lexical/link';
import { addClassNamesToElement, isHTMLAnchorElement } from '@lexical/utils';
import { $applyNodeReplacement, ElementNode } from 'lexical';
import type {
  DOMConversionMap,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  RangeSelection,
  Spread,
} from 'lexical';

import { $requireInternalLinkDocContext } from '#lib/editor/internal-link-doc-context';
import { normalizeNoteIdOrThrow, normalizeOptionalNoteIdOrThrow } from '#lib/editor/note-ids';
import { createDocumentPath } from '@/routing';

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

// Import path still accepts payloads where `url` is missing even though the base
// LinkNode serialization type requires `url: string`.
type SerializedInternalNoteLinkNodeInput = Omit<SerializedInternalNoteLinkNode, 'url'> & {
  url?: string;
};

const INVALID_LINK_DOC_ID_ERROR = 'Internal link docId must be a valid note id.';
const INVALID_LINK_NOTE_ID_ERROR = 'Internal link noteId must be a valid note id.';

function $resolveLinkHref(node: InternalNoteLinkNode): string | null {
  const noteId = node.__noteId;
  const docId = node.__docId;
  const resolvedDocId = docId ?? $requireInternalLinkDocContext();
  return createDocumentPath(resolvedDocId, noteId);
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
      node.__key,
    );
  }

  constructor(
    ref?: InternalNoteLinkRef,
    attributes: { rel?: null | string; target?: null | string; title?: null | string } = {},
    key?: NodeKey,
  ) {
    super('', attributes, key);
    // Lexical/Yjs initializes node property maps by constructing nodes without args.
    if (!ref) {
      this.__noteId = '';
      this.__docId = undefined;
      return;
    }
    this.__noteId = normalizeNoteIdOrThrow(ref.noteId, INVALID_LINK_NOTE_ID_ERROR);
    this.__docId = normalizeOptionalNoteIdOrThrow(ref.docId, INVALID_LINK_DOC_ID_ERROR);
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  static importJSON(serializedNode: SerializedInternalNoteLinkNode): InternalNoteLinkNode {
    return new InternalNoteLinkNode({
      docId: normalizeOptionalNoteIdOrThrow(serializedNode.docId, INVALID_LINK_DOC_ID_ERROR),
      noteId: normalizeNoteIdOrThrow(serializedNode.noteId, INVALID_LINK_NOTE_ID_ERROR),
    }).updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedLinkNode>): this {
    const serializedInternal = serializedNode as LexicalUpdateJSON<SerializedInternalNoteLinkNodeInput>;
    const noteId = normalizeNoteIdOrThrow(serializedInternal.noteId, INVALID_LINK_NOTE_ID_ERROR);
    const docId = normalizeOptionalNoteIdOrThrow(serializedInternal.docId, INVALID_LINK_DOC_ID_ERROR);
    const linkSerialized: LexicalUpdateJSON<SerializedLinkNode> = {
      ...serializedNode,
      rel: serializedNode.rel ?? null,
      target: serializedNode.target ?? null,
      title: serializedNode.title ?? null,
      url: '',
    };
    return super.updateFromJSON(linkSerialized).setLinkRef({ docId, noteId });
  }

  exportJSON(): SerializedLinkNode {
    const base = ElementNode.prototype.exportJSON.call(this) as SerializedLinkNode;
    const noteId = this.getNoteId();
    const docId = this.getDocId();
    const serialized = {
      ...base,
      rel: this.getRel(),
      target: this.getTarget(),
      title: this.getTitle(),
      ...(docId ? { docId } : {}),
      noteId,
    };
    return serialized as unknown as SerializedLinkNode;
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

    const prevRawHref = prevNode ? $resolveLinkHref(prevNode) : null;
    const prevHref = prevNode && prevRawHref ? prevNode.sanitizeUrl(prevRawHref) : null;
    const nextRawHref = $resolveLinkHref(this);
    const nextHref = nextRawHref ? this.sanitizeUrl(nextRawHref) : null;
    if (!prevNode || prevHref !== nextHref) {
      if (nextHref) {
        anchor.href = nextHref;
      } else {
        anchor.removeAttribute('href');
      }
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
    return $resolveLinkHref(this.getLatest()) ?? '';
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
    writable.__docId = normalizeOptionalNoteIdOrThrow(docId, INVALID_LINK_DOC_ID_ERROR);
    return writable;
  }

  setLinkRef(ref: InternalNoteLinkRef): this {
    const writable = this.getWritable();
    writable.__noteId = normalizeNoteIdOrThrow(ref.noteId, INVALID_LINK_NOTE_ID_ERROR);
    writable.__docId = normalizeOptionalNoteIdOrThrow(ref.docId, INVALID_LINK_DOC_ID_ERROR);
    return writable;
  }

  insertNewAfter(_: RangeSelection, restoreSelection = true): InternalNoteLinkNode {
    const currentDocId = this.__docId ?? $requireInternalLinkDocContext();
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
  const noteId = normalizeNoteIdOrThrow(ref.noteId, INVALID_LINK_NOTE_ID_ERROR);
  const docId = normalizeOptionalNoteIdOrThrow(ref.docId, INVALID_LINK_DOC_ID_ERROR);
  const resolvedCurrentDocId = normalizeOptionalNoteIdOrThrow(currentDocId ?? docId, INVALID_LINK_DOC_ID_ERROR);
  if (!resolvedCurrentDocId) {
    throw new Error('Current docId is required when creating same-document internal links.');
  }
  return $applyNodeReplacement(new InternalNoteLinkNode(
    { ...(docId ? { docId } : {}), noteId },
    attributes,
    undefined,
  ));
}

export function $isInternalNoteLinkNode(node: LexicalNode | null | undefined): node is InternalNoteLinkNode {
  return node instanceof InternalNoteLinkNode;
}
