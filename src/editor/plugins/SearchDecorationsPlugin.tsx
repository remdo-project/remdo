import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useRef } from 'react';
import { $getNoteId } from '#lib/editor/note-id-state';
import { forEachContentItemInOutline } from '@/editor/outline/list-traversal';
import { $resolveRootContentList } from '@/editor/outline/schema';

interface SearchDecorationsPluginProps {
  highlightedNoteId?: string | null;
  active?: boolean;
}

interface SearchDecorationEntry {
  key: string;
  noteId: string | null;
}

const NOTE_ID_ATTR = 'noteId';
const HIGHLIGHT_ATTR = 'searchHighlighted';

export function SearchDecorationsPlugin({ highlightedNoteId, active = false }: SearchDecorationsPluginProps) {
  const [editor] = useLexicalComposerContext();
  const knownKeysRef = useRef<Set<string>>(new Set());
  const highlightedNoteIdRef = useRef<string | null>(highlightedNoteId ?? null);
  const activeRef = useRef<boolean>(active);

  const applyDecorations = useCallback((editorState = editor.getEditorState()) => {
    const result = editorState.read(() => {
      const entries: SearchDecorationEntry[] = [];
      const rootList = $resolveRootContentList();
      if (rootList) {
        forEachContentItemInOutline(rootList, (item) => {
          entries.push({ key: item.getKey(), noteId: $getNoteId(item) });
        });
      }

      let highlightedKey: string | null = null;
      if (activeRef.current && highlightedNoteIdRef.current) {
        const match = entries.find((entry) => entry.noteId !== null && entry.noteId === highlightedNoteIdRef.current);
        highlightedKey = match?.key ?? null;
      }

      return { entries, highlightedKey };
    });

    const nextKeys = new Set<string>();

    for (const entry of result.entries) {
      nextKeys.add(entry.key);
      const element = editor.getElementByKey(entry.key);
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      if (entry.noteId) {
        element.dataset[NOTE_ID_ATTR] = entry.noteId;
      } else {
        delete element.dataset[NOTE_ID_ATTR];
      }
      if (result.highlightedKey === entry.key) {
        element.dataset[HIGHLIGHT_ATTR] = 'true';
      } else {
        delete element.dataset[HIGHLIGHT_ATTR];
      }
    }

    for (const key of knownKeysRef.current) {
      if (nextKeys.has(key)) {
        continue;
      }
      const element = editor.getElementByKey(key);
      if (!(element instanceof HTMLElement)) {
        continue;
      }
      delete element.dataset[NOTE_ID_ATTR];
      delete element.dataset[HIGHLIGHT_ATTR];
    }

    knownKeysRef.current = nextKeys;
  }, [editor]);

  useEffect(() => {
    highlightedNoteIdRef.current = highlightedNoteId ?? null;
    activeRef.current = active;
    applyDecorations();
  }, [active, applyDecorations, highlightedNoteId]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      applyDecorations(editorState);
    });
  }, [applyDecorations, editor]);

  useEffect(() => {
    return editor.registerRootListener(() => {
      knownKeysRef.current = new Set();
      applyDecorations();
    });
  }, [applyDecorations, editor]);

  return null;
}
