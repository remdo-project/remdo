import { $getSelection, $isRangeSelection, $isTextNode } from 'lexical';
import type { LexicalEditor, TextNode } from 'lexical';
import { $getNoteBodyFromNode } from '#client/editor/outline/selection/body-region';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { isAnyPopupActive } from '#client/editor/triggers/active-popup';

export const INLINE_FORMATS = ['bold', 'italic', 'underline', 'code'] as const;
export type InlineFormat = typeof INLINE_FORMATS[number];
export type FormatState = 'all' | 'some' | 'none';
export type FormatStates = Record<InlineFormat, FormatState>;

export interface SelectedTextSlice {
  node: TextNode;
  start: number;
  end: number;
}

export interface InlineFormatTarget {
  fingerprint: string;
  states: FormatStates;
  slices: SelectedTextSlice[];
}

// The outline intentionally publishes null for body-local selections. Reject
// structural intent independently, then resolve the actual selection region.
export function $readInlineFormatTarget(editor: LexicalEditor): InlineFormatTarget | null {
  const selection = $getSelection();
  if (!editor.isEditable() || editor.isComposing() || isAnyPopupActive(editor)
    || editor.selection.isStructural() || !$isRangeSelection(selection) || selection.isCollapsed()) return null;

  const anchorNode = selection.anchor.getNode();
  const focusNode = selection.focus.getNode();
  const anchorBody = $getNoteBodyFromNode(anchorNode);
  const focusBody = $getNoteBodyFromNode(focusNode);
  const region = anchorBody ?? resolveContentItemFromNode(anchorNode);
  const focusRegion = focusBody ?? resolveContentItemFromNode(focusNode);
  if (!region || !region.isAttached() || region !== focusRegion) return null;
  if ((!region.is(anchorNode) && !region.isParentOf(anchorNode))
    || (!region.is(focusNode) && !region.isParentOf(focusNode))) return null;

  const [start, end] = selection.isBackward()
    ? [selection.focus, selection.anchor]
    : [selection.anchor, selection.focus];
  const slices: SelectedTextSlice[] = [];
  for (const node of selection.getNodes()) {
    if (!$isTextNode(node)) continue;
    const sliceStart = start.type === 'text' && start.key === node.getKey() ? start.offset : 0;
    const sliceEnd = end.type === 'text' && end.key === node.getKey() ? end.offset : node.getTextContentSize();
    if (sliceStart < sliceEnd) slices.push({ node, start: sliceStart, end: sliceEnd });
  }
  if (slices.length === 0) return null;

  const states = Object.fromEntries(INLINE_FORMATS.map(format => {
    const count = slices.filter(({ node }) => node.hasFormat(format)).length;
    return [format, count === 0 ? 'none' : count === slices.length ? 'all' : 'some'];
  })) as FormatStates;
  const points = [selection.anchor, selection.focus].map(({ key, offset, type }) => [key, offset, type]);
  const fingerprint = JSON.stringify([region.getKey(), points,
    slices.map(({ node, start: from, end: to }) => node.getTextContent().slice(from, to))]);
  return { fingerprint, states, slices };
}
