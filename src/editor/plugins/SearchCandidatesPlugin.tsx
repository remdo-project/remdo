import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLexicalEditorNotes } from '@/editor/notes';
import {
  collectChildCandidateMap,
  collectSearchCandidates,
} from '@/editor/search/search-candidates';
import type { SearchCandidateSnapshot } from '@/editor/search/search-candidates';

interface SearchCandidatesPluginProps {
  docId: string;
  onCandidatesChange?: (snapshot: SearchCandidateSnapshot | null) => void;
}

function entriesMatch(
  leftEntries: SearchCandidateSnapshot['allCandidates'],
  rightEntries: SearchCandidateSnapshot['allCandidates']
): boolean {
  return leftEntries.length === rightEntries.length &&
    leftEntries.every((leftCandidate, index) => {
      const rightCandidate = rightEntries[index];
      return rightCandidate !== undefined &&
        leftCandidate.noteId === rightCandidate.noteId &&
        leftCandidate.text === rightCandidate.text;
    });
}

function mapsMatch(
  leftMap: SearchCandidateSnapshot['childCandidateMap'],
  rightMap: SearchCandidateSnapshot['childCandidateMap']
): boolean {
  const leftNoteIds = Object.keys(leftMap);
  if (leftNoteIds.length !== Object.keys(rightMap).length) {
    return false;
  }

  return leftNoteIds.every((noteId) => {
    const rightCandidates = rightMap[noteId];
    return rightCandidates !== undefined &&
      entriesMatch(leftMap[noteId] ?? [], rightCandidates);
  });
}

function signaturesMatch(
  left: SearchCandidateSnapshot,
  right: SearchCandidateSnapshot
): boolean {
  return entriesMatch(left.allCandidates, right.allCandidates) &&
    mapsMatch(left.childCandidateMap, right.childCandidateMap);
}

const emptySnapshot: SearchCandidateSnapshot = {
  allCandidates: [],
  childCandidateMap: {},
};

export function SearchCandidatesPlugin({
  docId,
  onCandidatesChange,
}: SearchCandidatesPluginProps) {
  const [editor] = useLexicalComposerContext();
  const editorNotes = useMemo(() => createLexicalEditorNotes({ editor, docId }), [docId, editor]);
  const previousSnapshotRef = useRef<SearchCandidateSnapshot>(emptySnapshot);

  const emitCandidates = useCallback((snapshot: SearchCandidateSnapshot) => {
    if (signaturesMatch(previousSnapshotRef.current, snapshot)) {
      return;
    }

    previousSnapshotRef.current = snapshot;
    onCandidatesChange?.(snapshot);
  }, [onCandidatesChange]);

  const readAndEmitCandidates = useCallback((editorState = editor.getEditorState()) => {
    const snapshot = editorState.read(() => ({
      allCandidates: collectSearchCandidates(editorNotes),
      childCandidateMap: collectChildCandidateMap(editorNotes),
    }));
    emitCandidates(snapshot);
  }, [editor, editorNotes, emitCandidates]);

  useEffect(() => {
    previousSnapshotRef.current = emptySnapshot;
    readAndEmitCandidates();
  }, [docId, readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerUpdateListener(({ dirtyElements, dirtyLeaves, editorState }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) {
        return;
      }
      readAndEmitCandidates(editorState);
    });
  }, [editor, readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerRootListener(() => {
      previousSnapshotRef.current = emptySnapshot;
      readAndEmitCandidates();
    });
  }, [editor, readAndEmitCandidates]);

  useEffect(() => {
    return () => {
      previousSnapshotRef.current = emptySnapshot;
      onCandidatesChange?.(null);
    };
  }, [onCandidatesChange]);

  return null;
}
