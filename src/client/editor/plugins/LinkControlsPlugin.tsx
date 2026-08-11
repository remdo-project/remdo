import {
  $createAutoLinkNode,
  $createLinkNode,
  $isLinkNode,
  $toggleLink,
  AutoLinkNode,
  LinkNode,
} from '@lexical/link';
import { FocusTrap } from '@mantine/core';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
  $copyNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import type { LexicalNode, NodeKey, RangeSelection } from 'lexical';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { $getSelectionBody } from '#client/editor/features/note-body/note-body-ops';
import {
  normalizeGenericDestination,
  recognizeCompleteAutomaticLink,
  WEB_LINK_ATTRIBUTES,
} from '#client/editor/links/generic-link';
import type { GenericDestination } from '#client/editor/links/generic-link';
import { parseOwnedNoteLinkUrl } from '#client/editor/links/note-link-url';
import { resolveContentItemFromNode } from '#client/editor/outline/schema';
import { $findNoteById } from '#client/editor/outline/note-traversal';
import { getNoteOwnText } from '#client/editor/outline/selection/note-body';
import { $isNoteLinkNode, $createNoteLinkNode } from '#client/editor/runtime/note-link-node';
import { $setAutomaticLinkUnlinkedText } from '#client/editor/runtime/automatic-link-state';
import { resolveCaretPickerAnchor, resolveElementPickerAnchor } from '#client/editor/triggers/anchor';
import { isOtherPopupActive, setPopupActive } from '#client/editor/triggers/active-popup';
import type { PickerAnchor } from '#client/editor/triggers/types';
import { useCollaborationStatus } from './collaboration';

interface ModelPoint {
  afterKey?: NodeKey | null;
  beforeKey?: NodeKey | null;
  key: NodeKey;
  offset: number;
  textBefore?: string;
  type: 'element' | 'text';
}

interface SelectionSnapshot {
  anchor: ModelPoint;
  focus: ModelPoint;
}

type LinkAuthoringTarget =
  | {
      kind: 'caret';
      selection: SelectionSnapshot;
    }
  | {
      kind: 'range';
      selection: SelectionSnapshot;
      text: string;
    }
  | {
      kind: 'link';
      linkKey: NodeKey;
      selection: SelectionSnapshot;
      text: string;
      url: string;
    };

interface LinkControlsState {
  anchor: PickerAnchor;
  destination: string;
  error: string | null;
  label: string;
  labelAutomatic: boolean;
  mode: 'actions' | 'create' | 'edit';
  target: LinkAuthoringTarget;
}

const LINK_CONTROL_SELECTOR = '[data-link-controls]';

function snapshotPoint(point: RangeSelection['anchor']): ModelPoint {
  const node = point.getNode();
  const isElement = $isElementNode(node);
  return {
    afterKey: isElement ? node.getChildAtIndex(point.offset)?.getKey() ?? null : undefined,
    beforeKey: isElement ? node.getChildAtIndex(point.offset - 1)?.getKey() ?? null : undefined,
    key: point.key,
    offset: point.offset,
    textBefore: $isTextNode(node) ? node.getTextContent().slice(0, point.offset) : undefined,
    type: point.type,
  };
}

function snapshotSelection(selection: RangeSelection): SelectionSnapshot {
  return {
    anchor: snapshotPoint(selection.anchor),
    focus: snapshotPoint(selection.focus),
  };
}

function $isPointValid(point: ModelPoint): boolean {
  const node = $getNodeByKey(point.key);
  if (!node?.isAttached()) {
    return false;
  }
  if (point.type === 'text') {
    return $isTextNode(node)
      && point.offset <= node.getTextContentSize()
      && (point.textBefore === undefined || point.textBefore === node.getTextContent().slice(0, point.offset));
  }
  return $isElementNode(node)
    && point.offset <= node.getChildrenSize()
    && (point.beforeKey === undefined
      || point.beforeKey === (node.getChildAtIndex(point.offset - 1)?.getKey() ?? null))
    && (point.afterKey === undefined
      || point.afterKey === (node.getChildAtIndex(point.offset)?.getKey() ?? null));
}

function $resolveSelectionSnapshot(snapshot: SelectionSnapshot): RangeSelection | null {
  if (!$isPointValid(snapshot.anchor) || !$isPointValid(snapshot.focus)) {
    return null;
  }
  const selection = $createRangeSelection();
  selection.anchor.set(snapshot.anchor.key, snapshot.anchor.offset, snapshot.anchor.type);
  selection.focus.set(snapshot.focus.key, snapshot.focus.offset, snapshot.focus.type);
  return selection;
}

function $findLinkAncestor(node: LexicalNode): LinkNode | null {
  if ($isLinkNode(node)) {
    return node instanceof AutoLinkNode && node.getIsUnlinked() ? null : node;
  }
  const link = $findMatchingParent(node, $isLinkNode);
  return link instanceof AutoLinkNode && link.getIsUnlinked() ? null : link;
}

function $unwrapSuppressedLinksAtSelection(selection: RangeSelection) {
  const nodes = selection.isCollapsed() ? [selection.anchor.getNode()] : selection.getNodes();
  const links = new Map<NodeKey, AutoLinkNode>();
  for (const node of nodes) {
    const link = node instanceof AutoLinkNode
      ? node
      : $findMatchingParent(node, (parent): parent is AutoLinkNode => parent instanceof AutoLinkNode);
    if (link?.getIsUnlinked()) {
      links.set(link.getKey(), link);
    }
  }
  for (const link of links.values()) {
    const parent = link.getParentOrThrow();
    parent.splice(link.getIndexWithinParent(), 1, link.getChildren());
  }
}

function $captureLinkTarget(link: LinkNode, selection: RangeSelection): LinkAuthoringTarget {
  return {
    kind: 'link',
    linkKey: link.getKey(),
    selection: snapshotSelection(selection),
    text: link.getTextContent(),
    url: link.getURL(),
  };
}

function $selectionStaysInOneRegion(selection: RangeSelection): boolean {
  const anchorItem = resolveContentItemFromNode(selection.anchor.getNode());
  const focusItem = resolveContentItemFromNode(selection.focus.getNode());
  return (anchorItem !== null && anchorItem === focusItem) || Boolean($getSelectionBody(selection));
}

function $getWhollySelectedGenericLink(selection: RangeSelection): LinkNode | null {
  const links = new Map<NodeKey, LinkNode>();
  for (const node of selection.getNodes()) {
    const link = node instanceof LinkNode ? node : $findMatchingParent(node, $isLinkNode);
    if (
      !(link instanceof LinkNode)
      || $isNoteLinkNode(link)
      || (link instanceof AutoLinkNode && link.getIsUnlinked())
    ) {
      return null;
    }
    links.set(link.getKey(), link);
  }
  const link = links.size === 1 ? [...links.values()][0]! : null;
  return link && selection.getTextContent() === link.getTextContent() ? link : null;
}

function $captureAuthoringTarget(forcedLinkKey?: NodeKey): LinkAuthoringTarget | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return null;
  }

  if (forcedLinkKey) {
    const forcedLink = $getNodeByKey(forcedLinkKey);
    return forcedLink instanceof LinkNode && !$isNoteLinkNode(forcedLink)
      ? $captureLinkTarget(forcedLink, selection)
      : null;
  }

  const anchorLink = $findLinkAncestor(selection.anchor.getNode());
  const focusLink = $findLinkAncestor(selection.focus.getNode());
  if (anchorLink || focusLink) {
    if (!anchorLink || !focusLink || !anchorLink.is(focusLink) || $isNoteLinkNode(anchorLink)) {
      return null;
    }
    return $captureLinkTarget(anchorLink, selection);
  }

  if (selection.isCollapsed()) {
    return { kind: 'caret', selection: snapshotSelection(selection) };
  }

  const selectedLink = $getWhollySelectedGenericLink(selection);
  if (selectedLink) {
    return $captureLinkTarget(selectedLink, selection);
  }

  if (!$selectionStaysInOneRegion(selection) || selection.getNodes().some((node) => $findLinkAncestor(node) !== null)) {
    return null;
  }

  return {
    kind: 'range',
    selection: snapshotSelection(selection),
    text: selection.getTextContent(),
  };
}

function $resolveTargetSelection(target: LinkAuthoringTarget): RangeSelection | null {
  const selection = $resolveSelectionSnapshot(target.selection);
  if (!selection) {
    return null;
  }
  if (target.kind === 'range' && selection.getTextContent() !== target.text) {
    return null;
  }
  if (target.kind === 'link') {
    const link = $getNodeByKey(target.linkKey);
    if (!(link instanceof LinkNode) || $isNoteLinkNode(link)) {
      return null;
    }
    if (link.getTextContent() !== target.text || link.getURL() !== target.url) {
      return null;
    }
  }
  return selection;
}

function $restoreTargetSelection(target: LinkAuthoringTarget): boolean {
  const selection = $resolveTargetSelection(target);
  if (!selection) {
    return false;
  }
  $setSelection(selection);
  return true;
}

function getDestinationAttributes(destination: GenericDestination): {
  rel: null | string;
  target: null | string;
} {
  return destination.kind === 'web'
    ? WEB_LINK_ATTRIBUTES
    : { rel: null, target: null };
}

function $insertGenericLink(selection: RangeSelection, label: string, destination: GenericDestination): LinkNode {
  $unwrapSuppressedLinksAtSelection(selection);
  if (!selection.isCollapsed() && selection.getTextContent() === label) {
    $setSelection(selection);
    $toggleLink({ url: destination.url, ...getDestinationAttributes(destination) });
    const updatedSelection = $getSelection();
    const link = $isRangeSelection(updatedSelection)
      ? $findMatchingParent(updatedSelection.anchor.getNode(), $isLinkNode)
      : null;
    if (!(link instanceof LinkNode)) {
      throw new TypeError('Expected generic link creation to wrap the selected text.');
    }
    link.selectNext(0, 0);
    return link;
  }

  const link = $createLinkNode(destination.url, getDestinationAttributes(destination));
  link.append($createTextNode(label));
  $setSelection(selection);
  selection.insertNodes([link]);
  link.selectNext(0, 0);
  return link;
}

function $unwrapSelectedAutoLinks(selection: RangeSelection) {
  const extracted = selection.extract();
  const autoLinks = new Set<AutoLinkNode>();
  for (const node of extracted) {
    const link = $findMatchingParent(node, (parent): parent is AutoLinkNode => parent instanceof AutoLinkNode);
    if (link) {
      autoLinks.add(link);
    }
  }

  for (const link of autoLinks) {
    const children = link.getChildren();
    const selectedChildren = children.filter((child) => (
      extracted.some(node => child.is(node) || ($isElementNode(child) && child.isParentOf(node)))
    ));
    if (selectedChildren.length === 0) {
      continue;
    }
    const firstIndex = children.indexOf(selectedChildren[0]!);
    const lastIndex = children.indexOf(selectedChildren.at(-1)!);
    if (firstIndex === 0 && lastIndex === children.length - 1) {
      for (const child of selectedChildren) {
        link.insertBefore(child);
      }
      link.remove();
      continue;
    }
    if (firstIndex === 0) {
      for (const child of selectedChildren) {
        link.insertBefore(child);
      }
      continue;
    }
    for (let index = selectedChildren.length - 1; index >= 0; index -= 1) {
      link.insertAfter(selectedChildren[index]!);
    }
    if (lastIndex < children.length - 1) {
      const trailingLink = $copyNode(link);
      selectedChildren.at(-1)!.insertAfter(trailingLink);
      trailingLink.append(...children.slice(lastIndex + 1));
    }
  }
}

function $replaceSelectionWithGenericLink(
  selection: RangeSelection,
  label: string,
  destination: GenericDestination,
) {
  $setSelection(selection);
  $unwrapSelectedAutoLinks(selection);
  $toggleLink(null);
  const unlinkedSelection = $getSelection();
  if (!$isRangeSelection(unlinkedSelection)) {
    return;
  }
  const link = $createLinkNode(destination.url, getDestinationAttributes(destination));
  link.append($createTextNode(label));
  unlinkedSelection.insertNodes([link]);
  link.selectNext(0, 0);
}

function $insertNoteLink(
  selection: RangeSelection,
  label: string,
  ref: { docId: string; noteId: string },
) {
  $unwrapSuppressedLinksAtSelection(selection);
  const link = $createNoteLinkNode(ref, {});
  link.append($createTextNode(label));
  $setSelection(selection);
  selection.insertNodes([link]);
  link.selectNext(0, 0);
}

function $replaceWithLabeledLink(node: LinkNode, label: string, destination: GenericDestination): LinkNode {
  const attributes = getDestinationAttributes(destination);
  // Move the live selection off the link before replacing its children. The
  // controls retain their own model snapshot, but Lexical still requires the
  // committed selection not to point at nodes removed by clear/replace.
  node.selectNext();
  if (!(node instanceof AutoLinkNode)) {
    node
      .setURL(destination.url)
      .setTarget(attributes.target ?? null)
      .setRel(attributes.rel ?? null);
    if (node.getTextContent() !== label) {
      const children = node.getChildren();
      const labelNode = children.find($isTextNode) ?? $createTextNode();
      if (!labelNode.getParent()) {
        node.append(labelNode);
      }
      labelNode.setTextContent(label);
      labelNode.select(0, label.length);
      for (const child of children) {
        if (!child.is(labelNode)) {
          child.remove();
        }
      }
    }
    return node;
  }

  const replacement = $createLinkNode(destination.url, attributes);
  if (node.getTextContent() === label) {
    replacement.append(...node.getChildren());
  } else {
    replacement.append($createTextNode(label));
  }
  node.replace(replacement);
  return replacement;
}

function $removeGenericLink(node: LinkNode) {
  const text = node.getTextContent();
  const recognized = recognizeCompleteAutomaticLink(text);
  if (node instanceof AutoLinkNode) {
    $setAutomaticLinkUnlinkedText(node, text);
    node.setIsUnlinked(true);
    node.select(0, node.getChildrenSize());
    return;
  }
  if (recognized) {
    const replacement = $createAutoLinkNode(recognized.url, {
      ...(recognized.kind === 'web' ? WEB_LINK_ATTRIBUTES : {}),
      isUnlinked: true,
    });
    replacement.append(...node.getChildren());
    $setAutomaticLinkUnlinkedText(replacement, text);
    node.replace(replacement);
    replacement.select(0, replacement.getChildrenSize());
    return;
  }

  const parent = node.getParentOrThrow();
  const index = node.getIndexWithinParent();
  const children = node.getChildren();
  parent.splice(index, 1, children);
  parent.select(index, index + children.length);
}

function isClipboardEvent(event: unknown): event is ClipboardEvent {
  return event instanceof ClipboardEvent;
}

function activateDestination(url: string) {
  const isWeb = /^https?:/i.test(url);
  globalThis.open(url, isWeb ? '_blank' : '_self', isWeb ? 'noopener,noreferrer' : undefined);
}

function copyDestinationFallback(destination: string) {
  const input = document.createElement('textarea');
  input.value = destination;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  try {
    // Legacy fallback remains necessary on supported non-secure HTTP origins.
    // eslint-disable-next-line ts/no-deprecated
    return document.execCommand('copy');
  } finally {
    input.remove();
  }
}

async function copyDestination(destination: string) {
  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (clipboard) {
    try {
      await clipboard.writeText(destination);
      return true;
    } catch {
      // The async Clipboard API can be exposed while permission is denied.
    }
  }
  try {
    return copyDestinationFallback(destination);
  } catch {
    return false;
  }
}

function clampPopupPosition(anchor: PickerAnchor, popup: HTMLElement, container: HTMLElement): PickerAnchor {
  const margin = 8;
  const popupRect = popup.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const minLeft = Math.max(margin, margin - containerRect.left);
  const maxLeft = Math.max(minLeft, Math.min(
    container.clientWidth - popupRect.width - margin,
    globalThis.innerWidth - containerRect.left - popupRect.width - margin,
  ));
  const minTop = margin - containerRect.top;
  const maxTop = Math.max(
    minTop,
    globalThis.innerHeight - containerRect.top - popupRect.height - margin,
  );
  return {
    left: Math.min(Math.max(anchor.left, minLeft), maxLeft),
    top: Math.min(Math.max(anchor.top, minTop), maxTop),
  };
}

function extendSelectionToLinkPointer(anchor: HTMLAnchorElement, event: MouseEvent): boolean {
  const selection = globalThis.getSelection();
  const caretPositionFromPoint = Reflect.get(document, 'caretPositionFromPoint') as
    | ((x: number, y: number) => CaretPosition | null)
    | undefined;
  const position = caretPositionFromPoint?.call(document, event.clientX, event.clientY);
  // Safari exposes only the older Range-returning API in the supported baseline.
  const caretRangeFromPoint = Reflect.get(document, 'caretRangeFromPoint') as
    | ((x: number, y: number) => Range | null)
    | undefined;
  const range = position ? null : caretRangeFromPoint?.call(document, event.clientX, event.clientY);
  const node = position?.offsetNode ?? range?.startContainer;
  const offset = position?.offset ?? range?.startOffset;
  if (!selection || selection.rangeCount === 0 || !node || offset === undefined || !anchor.contains(node)) {
    return false;
  }
  selection.extend(node, offset);
  document.dispatchEvent(new Event('selectionchange'));
  return true;
}

function addLinkPointerListeners(root: HTMLElement, listener: (event: MouseEvent) => void, signal: AbortSignal) {
  const options = { capture: true, signal };
  root.addEventListener('click', listener, options);
  root.addEventListener('auxclick', listener, options);
  root.addEventListener('mousedown', listener, options);
  root.addEventListener('mouseup', listener, options);
}

const FIELD_EDITING_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'Backspace',
  'Delete',
  'End',
  'Enter',
  'Home',
  'PageDown',
  'PageUp',
  'Tab',
]);
const FIELD_EDITING_SHORTCUTS = new Set(['a', 'c', 'v', 'x', 'y', 'z']);

function isFieldEditingKey(event: ReactKeyboardEvent<HTMLDivElement>): boolean {
  if (event.nativeEvent.isComposing) {
    return true;
  }
  const key = event.key.toLowerCase();
  if (event.altKey) {
    return event.ctrlKey && !event.metaKey && event.key.length === 1;
  }
  if (event.metaKey || event.ctrlKey) {
    return FIELD_EDITING_SHORTCUTS.has(key)
      || ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Backspace', 'Delete', 'End', 'Home'].includes(event.key);
  }
  return FIELD_EDITING_KEYS.has(event.key) || event.key.length === 1;
}

export function LinkControlsPlugin() {
  const [editor] = useLexicalComposerContext();
  const { docId } = useCollaborationStatus();
  const popupToken = useRef(Symbol('link-controls')).current;
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(() => {
    const root = editor.getRootElement();
    return root ? root.closest<HTMLElement>('.editor-container') : null;
  });
  const [controls, setControls] = useState<LinkControlsState | null>(null);
  const controlsRef = useRef<LinkControlsState | null>(null);

  const setControlsState = useCallback((next: LinkControlsState | null) => {
    controlsRef.current = next;
    setPopupActive(editor, popupToken, next !== null);
    setControls(next);
  }, [editor, popupToken]);

  const closeControls = useCallback((restoreSelection: boolean) => {
    const current = controlsRef.current;
    setControlsState(null);
    if (restoreSelection && current) {
      editor.update(() => {
        $restoreTargetSelection(current.target);
      });
      editor.focus();
    }
  }, [editor, setControlsState]);

  const defaultCreationLabel = useCallback((destination: string, target: LinkAuthoringTarget) => {
    if (target.kind === 'link') {
      return '';
    }
    if (target.kind === 'range' && target.text.trim().length > 0) {
      return target.text;
    }
    const trimmed = destination.trim();
    const noteRef = parseOwnedNoteLinkUrl(trimmed, {
      currentDocId: docId,
      currentOrigin: globalThis.location.origin,
    });
    if (!noteRef) {
      return target.kind === 'range' ? target.text : trimmed;
    }
    return editor.getEditorState().read(() => {
      const note = noteRef.docId === docId ? $findNoteById(noteRef.noteId) : null;
      const ownText = note ? getNoteOwnText(note) : '';
      return ownText.trim().length > 0 ? ownText : trimmed;
    }, { editor });
  }, [docId, editor]);

  const openControls = useCallback((target: LinkAuthoringTarget, anchor: PickerAnchor) => {
    if (isOtherPopupActive(editor, popupToken)) {
      editor.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape' }));
    }
    if (isOtherPopupActive(editor, popupToken)) {
      return;
    }
    setControlsState({
      anchor,
      destination: target.kind === 'link' ? target.url : '',
      error: null,
      label: target.kind === 'range' || target.kind === 'link' ? target.text : '',
      labelAutomatic: target.kind === 'caret' || (target.kind === 'range' && target.text.trim().length === 0),
      mode: target.kind === 'link' ? 'actions' : 'create',
      target,
    });
  }, [editor, popupToken, setControlsState]);

  const submitFields = useCallback(() => {
    const current = controlsRef.current;
    if (!current || current.mode === 'actions') {
      return;
    }
    const label = current.label;
    const destinationInput = current.destination.trim();
    if (label.trim().length === 0) {
      setControlsState({ ...current, error: 'Enter link text.' });
      return;
    }

    const noteRef = parseOwnedNoteLinkUrl(destinationInput, {
      currentDocId: docId,
      currentOrigin: globalThis.location.origin,
    });
    if (current.mode === 'edit' && noteRef) {
      setControlsState({ ...current, error: 'A note URL cannot replace a web link.' });
      return;
    }
    const generic = noteRef ? null : normalizeGenericDestination(destinationInput);
    if (!noteRef && !generic) {
      setControlsState({ ...current, error: 'Enter a valid web address or email address.' });
      return;
    }

    editor.update(() => {
      const selection = $resolveTargetSelection(current.target);
      if (!selection) {
        return;
      }
      if (current.mode === 'create') {
        if (noteRef) {
          $insertNoteLink(selection, label, noteRef);
        } else if (generic) {
          $insertGenericLink(selection, label, generic);
        }
        return;
      }

      if (current.target.kind !== 'link' || !generic) {
        return;
      }
      const link = $getNodeByKey(current.target.linkKey);
      if (!(link instanceof LinkNode) || $isNoteLinkNode(link)) {
        return;
      }
      const edited = $replaceWithLabeledLink(link, label, generic);
      edited.select(0, edited.getChildrenSize());
    });

    setControlsState(null);
    editor.focus();
  }, [docId, editor, setControlsState]);

  const removeLink = useCallback(() => {
    const current = controlsRef.current;
    if (!current || current.target.kind !== 'link') {
      return;
    }
    const target = current.target;
    editor.update(() => {
      if (!$resolveTargetSelection(target)) {
        return;
      }
      const link = $getNodeByKey(target.linkKey);
      if (link instanceof LinkNode && !$isNoteLinkNode(link)) {
        $removeGenericLink(link);
      }
    });
    setControlsState(null);
    editor.focus();
  }, [editor, setControlsState]);

  useEffect(() => {
    let primaryLinkPointerDown: { x: number; y: number } | null = null;
    let primaryLinkPointerDragged = false;

    const handleLinkPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (event.type === 'mousedown' && event.button === 0) {
        primaryLinkPointerDown = { x: event.clientX, y: event.clientY };
        primaryLinkPointerDragged = false;
      }
      const linkKey = editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(target);
        const link = node ? $findLinkAncestor(node) : null;
        return link && !$isNoteLinkNode(link) ? link.getKey() : null;
      }, { editor });
      if (!linkKey) {
        return;
      }
      const anchorElement = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a')
        : target.parentElement?.closest<HTMLAnchorElement>('a');
      if (!anchorElement) {
        return;
      }

      if (
        event.type === 'click'
        && event.button === 0
        && event.detail === 0
        && !event.shiftKey
        && !event.metaKey
        && !event.ctrlKey
      ) {
        const url = editor.getEditorState().read(() => {
          const link = $getNodeByKey(linkKey);
          return link instanceof LinkNode ? link.getURL() : null;
        }, { editor });
        if (url) {
          closeControls(false);
          activateDestination(url);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.shiftKey && event.button === 0) {
        if (event.type === 'mousedown') {
          primaryLinkPointerDown = null;
          primaryLinkPointerDragged = false;
          if (!extendSelectionToLinkPointer(anchorElement, event)) {
            return;
          }
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const directActivation = event.button === 1 || event.metaKey || event.ctrlKey;
      if (directActivation) {
        primaryLinkPointerDown = null;
        primaryLinkPointerDragged = false;
        const terminalActivation = (
          event.type === 'click'
          && event.button === 0
          && (event.metaKey || event.ctrlKey)
        ) || (event.type === 'auxclick' && event.button === 1);
        if (!terminalActivation) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const url = editor.getEditorState().read(() => {
          const link = $getNodeByKey(linkKey);
          return link instanceof LinkNode ? link.getURL() : null;
        }, { editor });
        if (url) {
          closeControls(false);
          activateDestination(url);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (event.type === 'mousedown' && event.button === 0) {
        return;
      }
      if (event.type === 'mouseup' && event.button === 0) {
        if (primaryLinkPointerDown) {
          const deltaX = event.clientX - primaryLinkPointerDown.x;
          const deltaY = event.clientY - primaryLinkPointerDown.y;
          primaryLinkPointerDragged = deltaX * deltaX + deltaY * deltaY > 9;
        }
        return;
      }
      if (event.type !== 'click' || event.button !== 0) {
        return;
      }
      const wasDrag = primaryLinkPointerDragged;
      primaryLinkPointerDown = null;
      primaryLinkPointerDragged = false;
      const domSelection = globalThis.getSelection();
      const root = editor.getRootElement();
      if (
        wasDrag
        &&
        domSelection
        && !domSelection.isCollapsed
        && root?.contains(domSelection.anchorNode)
        && root.contains(domSelection.focusNode)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const captured = editor.getEditorState().read(() => $captureAuthoringTarget(linkKey), { editor });
      const anchor = resolveElementPickerAnchor(editor, anchorElement);
      if (captured && anchor) {
        openControls(captured, anchor);
      }
      event.preventDefault();
      event.stopPropagation();
    };

    const handleLinkKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter'
        || event.repeat
        || event.altKey
        || event.shiftKey
        || event.metaKey
        || event.ctrlKey
      ) {
        return;
      }
      const target = event.target;
      const anchorElement = target instanceof Element
        ? target.closest<HTMLAnchorElement>('a')
        : null;
      if (!anchorElement || !editor.getRootElement()?.contains(anchorElement)) {
        return;
      }
      const url = editor.getEditorState().read(() => {
        const node = $getNearestNodeFromDOMNode(anchorElement);
        const link = node ? $findLinkAncestor(node) : null;
        return link && !$isNoteLinkNode(link) ? link.getURL() : null;
      }, { editor });
      if (!url) {
        return;
      }
      closeControls(false);
      activateDestination(url);
      event.preventDefault();
      event.stopPropagation();
    };

    const handleOutsidePointer = (event: MouseEvent) => {
      if (!controlsRef.current) {
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest(LINK_CONTROL_SELECTOR)) {
        return;
      }
      const insideEditor = target instanceof Node && editor.getRootElement()?.contains(target);
      closeControls(!insideEditor);
    };

    document.addEventListener('pointerdown', handleOutsidePointer, true);
    document.addEventListener('mousedown', handleOutsidePointer, true);

    let rootListeners: AbortController | null = null;
    const bindRoot = (nextRoot: HTMLElement | null) => {
      rootListeners?.abort();
      rootListeners = nextRoot ? new AbortController() : null;
      if (nextRoot && rootListeners) {
        addLinkPointerListeners(nextRoot, handleLinkPointer, rootListeners.signal);
        nextRoot.addEventListener('keydown', handleLinkKeyDown, {
          capture: true,
          signal: rootListeners.signal,
        });
      }
      setPortalRoot(nextRoot ? nextRoot.closest<HTMLElement>('.editor-container') : null);
    };

    return mergeRegister(
      editor.registerRootListener(bindRoot),
      editor.registerUpdateListener(() => {
        const current = controlsRef.current;
        if (!current) {
          return;
        }
        queueMicrotask(() => {
          const latest = controlsRef.current;
          if (!latest) {
            return;
          }
          const valid = editor.getEditorState().read(() => $resolveTargetSelection(latest.target) !== null, { editor });
          if (!valid) {
            closeControls(true);
          }
        });
      }),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          const current = controlsRef.current;
          if (!current) {
            return false;
          }
          setControlsState(null);
          $restoreTargetSelection(current.target);
          queueMicrotask(() => editor.focus());
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (event.isComposing || event.altKey || event.shiftKey) {
            return false;
          }
          const withCommand = event.metaKey || event.ctrlKey;
          if (!withCommand || event.key.toLowerCase() !== 'k') {
            return false;
          }
          const target = editor.selection.isStructural() ? null : $captureAuthoringTarget();
          const anchor = target ? resolveCaretPickerAnchor(editor) : null;
          if (target && anchor) {
            openControls(target, anchor);
          }
          event.preventDefault();
          event.stopPropagation();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!isClipboardEvent(event) || !event.clipboardData) {
            return false;
          }
          if (editor.selection.isStructural()) {
            return false;
          }
          const selected = $getSelection();
          if (!$isRangeSelection(selected) || selected.isCollapsed()) {
            return false;
          }
          const selectedText = selected.getTextContent();
          if (selectedText.trim().length === 0) {
            return false;
          }
          const target = $captureAuthoringTarget();
          if (target?.kind === 'caret') {
            return false;
          }
          const pastedText = event.clipboardData.getData('text/plain');
          const noteRef = parseOwnedNoteLinkUrl(pastedText.trim(), {
            currentDocId: docId,
            currentOrigin: globalThis.location.origin,
          });
          if (noteRef) {
            return false;
          }
          const destination = normalizeGenericDestination(pastedText);
          if (!destination) {
            return false;
          }
          const selection = target ? $resolveTargetSelection(target) : selected;
          if (!selection || selection.isCollapsed()) {
            return false;
          }
          if (!target || (target.kind === 'link' && selectedText !== target.text)) {
            $replaceSelectionWithGenericLink(selection, selectedText, destination);
          } else if (target.kind === 'range') {
            $insertGenericLink(selection, target.text, destination);
          } else {
            const link = $getNodeByKey(target.linkKey);
            if (!(link instanceof LinkNode) || $isNoteLinkNode(link)) {
              return false;
            }
            const edited = $replaceWithLabeledLink(link, target.text, destination);
            edited.select(0, edited.getChildrenSize());
          }
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      () => {
        rootListeners?.abort();
        document.removeEventListener('pointerdown', handleOutsidePointer, true);
        document.removeEventListener('mousedown', handleOutsidePointer, true);
        setControlsState(null);
      },
    );
  }, [closeControls, docId, editor, openControls, setControlsState]);

  useLayoutEffect(() => {
    const popup = portalRoot?.querySelector<HTMLElement>(LINK_CONTROL_SELECTOR);
    if (!controls || !portalRoot || !popup) {
      return;
    }
    const position = clampPopupPosition(controls.anchor, popup, portalRoot);
    popup.style.left = `${position.left}px`;
    popup.style.top = `${position.top}px`;
  }, [controls, portalRoot]);

  if (!controls || !portalRoot) {
    return null;
  }

  const style: CSSProperties = controls.anchor;
  const handleControlsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeControls(true);
      return;
    }
    if (event.key === 'Tab') {
      return;
    }
    const fieldEditing = event.target instanceof HTMLInputElement && isFieldEditingKey(event);
    const buttonActivation = event.target instanceof HTMLButtonElement && event.key === 'Enter';
    if (!fieldEditing && !buttonActivation) {
      event.preventDefault();
    }
    event.stopPropagation();
  };
  const resolveActionDestination = () => editor.getEditorState().read(() => {
    if (controls.target.kind !== 'link' || !$resolveTargetSelection(controls.target)) {
      return null;
    }
    const link = $getNodeByKey(controls.target.linkKey);
    return link instanceof LinkNode && !$isNoteLinkNode(link) ? link.getURL() : null;
  }, { editor });

  return createPortal(
    <FocusTrap>
      <div
        key={controls.mode}
        className="link-controls"
        data-link-controls
        role="dialog"
        aria-label="Link controls"
        style={style}
        onKeyDown={handleControlsKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {controls.mode === 'actions' ? (
          <div className="link-controls__actions">
          <button
            type="button"
            onClick={() => {
              const destination = resolveActionDestination();
              if (!destination) {
                closeControls(false);
                return;
              }
              activateDestination(destination);
              closeControls(true);
            }}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => {
              const destination = resolveActionDestination();
              if (!destination) {
                closeControls(false);
                return;
              }
              const originatingControls = controls;
              void copyDestination(destination).then(() => {
                if (controlsRef.current === originatingControls) {
                  closeControls(true);
                }
              });
            }}
          >
            Copy destination
          </button>
          <button
            data-autofocus
            type="button"
            onClick={() => setControlsState({ ...controls, error: null, mode: 'edit' })}
          >
            Edit
          </button>
          <button type="button" onClick={removeLink}>Remove link</button>
          </div>
        ) : (
          <form
            className="link-controls__fields"
            onSubmit={(event) => {
              event.preventDefault();
              submitFields();
            }}
          >
          <label>
            Text
            <input
              value={controls.label}
              onChange={(event) => setControlsState({
                ...controls,
                error: null,
                label: event.target.value,
                labelAutomatic: false,
              })}
            />
          </label>
          <label>
            Destination
            <input
              data-autofocus
              value={controls.destination}
              inputMode="url"
              onChange={(event) => {
                const destination = event.target.value;
                setControlsState({
                  ...controls,
                  destination,
                  error: null,
                  label: controls.labelAutomatic
                    ? defaultCreationLabel(destination, controls.target)
                    : controls.label,
                });
              }}
            />
          </label>
          {controls.error ? <div className="link-controls__error" role="alert">{controls.error}</div> : null}
          <button type="submit" tabIndex={-1}>{controls.mode === 'create' ? 'Create link' : 'Save link'}</button>
          </form>
        )}
      </div>
    </FocusTrap>,
    portalRoot,
  );
}
