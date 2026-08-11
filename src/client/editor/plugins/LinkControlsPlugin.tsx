import {
  $createAutoLinkNode,
  $createLinkNode,
  $isLinkNode,
  AutoLinkNode,
  LinkNode,
} from '@lexical/link';
import { FocusTrap } from '@mantine/core';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $findMatchingParent, mergeRegister } from '@lexical/utils';
import {
  $createRangeSelection,
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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  key: NodeKey;
  offset: number;
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
  return { key: point.key, offset: point.offset, type: point.type };
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
    return $isTextNode(node) && point.offset <= node.getTextContentSize();
  }
  return $isElementNode(node) && point.offset <= node.getChildrenSize();
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

function $captureLinkTarget(link: LinkNode, selection: RangeSelection): LinkAuthoringTarget {
  return {
    kind: 'link',
    linkKey: link.getKey(),
    selection: snapshotSelection(selection),
    text: link.getTextContent(),
    url: link.getURL(),
  };
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

  const anchorItem = resolveContentItemFromNode(selection.anchor.getNode());
  const focusItem = resolveContentItemFromNode(selection.focus.getNode());
  const staysInOneRegion = (anchorItem !== null && anchorItem === focusItem) || Boolean($getSelectionBody(selection));
  if (!staysInOneRegion || selection.getNodes().some((node) => $findLinkAncestor(node) !== null)) {
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

function getDestinationAttributes(destination: GenericDestination): { rel?: string; target?: string } {
  return destination.kind === 'web' ? WEB_LINK_ATTRIBUTES : {};
}

function $insertGenericLink(selection: RangeSelection, label: string, destination: GenericDestination): LinkNode {
  const link = $createLinkNode(destination.url, getDestinationAttributes(destination));
  link.append($createTextNode(label));
  $setSelection(selection);
  selection.insertNodes([link]);
  link.selectNext();
  return link;
}

function $insertNoteLink(
  selection: RangeSelection,
  label: string,
  ref: { docId: string; noteId: string },
) {
  const link = $createNoteLinkNode(ref, {});
  link.append($createTextNode(label));
  $setSelection(selection);
  selection.insertNodes([link]);
  link.selectNext();
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

function copyDestination(destination: string) {
  const clipboard = Reflect.get(navigator, 'clipboard') as Clipboard | undefined;
  if (clipboard) {
    void clipboard.writeText(destination);
    return;
  }
  const input = document.createElement('textarea');
  input.value = destination;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  // Legacy fallback remains necessary on supported non-secure HTTP origins.
  // eslint-disable-next-line ts/no-deprecated
  document.execCommand('copy');
  input.remove();
}

function extendSelectionToLinkPointer(anchor: HTMLAnchorElement, event: MouseEvent) {
  const selection = globalThis.getSelection();
  const position = document.caretPositionFromPoint(event.clientX, event.clientY);
  if (!selection || selection.rangeCount === 0 || !position || !anchor.contains(position.offsetNode)) {
    return;
  }
  selection.extend(position.offsetNode, position.offset);
  document.dispatchEvent(new Event('selectionchange'));
}

function addLinkPointerListeners(root: HTMLElement, listener: (event: MouseEvent) => void, signal: AbortSignal) {
  const options = { capture: true, signal };
  root.addEventListener('click', listener, options);
  root.addEventListener('auxclick', listener, options);
  root.addEventListener('mousedown', listener, options);
  root.addEventListener('mouseup', listener, options);
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
      return trimmed;
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
    const handleLinkPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
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

      if (event.shiftKey && event.button === 0) {
        if (event.type === 'mousedown') {
          extendSelectionToLinkPointer(anchorElement, event);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const directActivation = event.button === 1 || event.metaKey || event.ctrlKey;
      if (directActivation) {
        const terminalActivation = (
          event.type === 'click'
          && event.button === 0
          && (event.metaKey || event.ctrlKey)
        ) || (event.type === 'auxclick' && event.button === 1);
        if (!terminalActivation) {
          if (event.type !== 'mousedown') {
            event.preventDefault();
            event.stopPropagation();
          }
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

      if (event.type !== 'click' || event.button !== 0) {
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
          const target = $captureAuthoringTarget();
          if (!target || target.kind !== 'range' || target.text.trim().length === 0) {
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
          const selection = $resolveTargetSelection(target);
          if (!selection) {
            return false;
          }
          $insertGenericLink(selection, target.text, destination);
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

  if (!controls || !portalRoot) {
    return null;
  }

  const style: CSSProperties = { left: controls.anchor.left, top: controls.anchor.top };
  const handleControlsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeControls(true);
    }
  };

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
              activateDestination(controls.destination);
              closeControls(true);
            }}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => {
              copyDestination(controls.destination);
              closeControls(true);
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
