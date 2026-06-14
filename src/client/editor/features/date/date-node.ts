import dayjs from 'dayjs';
import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import { createElement } from 'react';
import type {
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical';
import type { ReactNode } from 'react';

import { DateToken } from './DateToken';

export type SerializedDateNode = Spread<
  {
    isoDate?: string;
  },
  SerializedLexicalNode
>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const INVALID_DATE_ERROR = 'DateNode isoDate must be a valid YYYY-MM-DD date.';

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function normalizeIsoDateOrThrow(value: unknown): string {
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new Error(INVALID_DATE_ERROR);
  }
  return value;
}

// isoDate is validated at every mutation boundary (setIsoDate / importJSON /
// $createDateNode), so the stored value is always a valid YYYY-MM-DD here.
export function formatDateNodeLabel(isoDate: string): string {
  return dayjs(isoDate).format('MMM D, YYYY');
}

export class DateNode extends DecoratorNode<ReactNode> {
  __isoDate: string;

  static getType(): string {
    return 'date';
  }

  static clone(node: DateNode): DateNode {
    return new DateNode(node.__isoDate, node.__key);
  }

  constructor(isoDate = '', key?: NodeKey) {
    super(key);
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

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(_prevNode: this, _dom: HTMLElement, _config: EditorConfig): boolean {
    return false;
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.dataset.dateNode = 'true';
    element.dataset.isoDate = this.getIsoDate();
    element.textContent = this.getTextContent();
    return { element };
  }

  getTextContent(): string {
    return formatDateNodeLabel(this.getIsoDate());
  }

  getIsoDate(): string {
    return this.getLatest().__isoDate;
  }

  setIsoDate(isoDate: string): this {
    const normalized = normalizeIsoDateOrThrow(isoDate);
    const writable = this.getWritable();
    writable.__isoDate = normalized;
    return writable;
  }

  decorate(): ReactNode {
    return createElement(DateToken, {
      isoDate: this.getIsoDate(),
      nodeKey: this.getKey(),
    });
  }
}

export function $createDateNode(isoDate: string): DateNode {
  return $applyNodeReplacement(new DateNode(normalizeIsoDateOrThrow(isoDate)));
}

export function $isDateNode(node: LexicalNode | null | undefined): node is DateNode {
  return node instanceof DateNode;
}
