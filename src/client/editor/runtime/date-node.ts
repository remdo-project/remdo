import { addClassNamesToElement } from '@lexical/utils';
import dayjs from 'dayjs';
import { $applyNodeReplacement, TextNode } from 'lexical';
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedTextNode,
  Spread,
} from 'lexical';

export type SerializedDateNode = Spread<
  {
    isoDate?: string;
  },
  SerializedTextNode
>;

const DATE_NODE_CLASS = 'date-node';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DATE_ERROR = 'DateNode isoDate must be a valid YYYY-MM-DD date.';

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeIsoDateOrThrow(value: unknown): string {
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new Error(INVALID_DATE_ERROR);
  }
  return value;
}

export function formatDateNodeLabel(isoDate: string): string {
  return dayjs(normalizeIsoDateOrThrow(isoDate)).format('MMM D, YYYY');
}

export class DateNode extends TextNode {
  __isoDate: string;

  static getType(): string {
    return 'date';
  }

  static clone(node: DateNode): DateNode {
    return new DateNode(node.__isoDate, node.__text, node.__key);
  }

  constructor(isoDate = '', text?: string, key?: NodeKey) {
    super(text ?? (isoDate ? formatDateNodeLabel(isoDate) : ''), key);
    this.__isoDate = isoDate;
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  static importJSON(serializedNode: SerializedDateNode): DateNode {
    return $createDateNode(normalizeIsoDateOrThrow(serializedNode.isoDate)).updateFromJSON(serializedNode);
  }

  updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedDateNode>): this {
    const writable = super.updateFromJSON(serializedNode);
    return writable.setIsoDate(normalizeIsoDateOrThrow(serializedNode.isoDate));
  }

  exportJSON(): SerializedDateNode {
    return {
      ...super.exportJSON(),
      isoDate: this.getIsoDate(),
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    this.updateDateDOM(null, element);
    addClassNamesToElement(element, DATE_NODE_CLASS);
    element.spellcheck = false;
    return element;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const shouldReplace = super.updateDOM(prevNode, dom, config);
    this.updateDateDOM(prevNode, dom);
    return shouldReplace;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.dataset.dateNode = 'true';
    element.dataset.isoDate = this.getIsoDate();
    element.textContent = this.getTextContent();
    return { element };
  }

  updateDateDOM(prevNode: this | null, element: HTMLElement): void {
    const isoDate = this.getIsoDate();
    if (!prevNode || prevNode.__isoDate !== isoDate) {
      element.dataset.isoDate = isoDate;
    }
    element.dataset.dateNode = 'true';
    element.dataset.dateNodeKey = this.getKey();
  }

  getIsoDate(): string {
    return this.getLatest().__isoDate;
  }

  setIsoDate(isoDate: string): this {
    const normalized = normalizeIsoDateOrThrow(isoDate);
    const writable = this.getWritable();
    writable.__isoDate = normalized;
    writable.__text = formatDateNodeLabel(normalized);
    return writable;
  }

  isTextEntity(): true {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createDateNode(isoDate: string): DateNode {
  const node = new DateNode(normalizeIsoDateOrThrow(isoDate));
  node.setMode('token').toggleDirectionless();
  return $applyNodeReplacement(node);
}

export function $isDateNode(node: LexicalNode | null | undefined): node is DateNode {
  return node instanceof DateNode;
}
