import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import {
  collectChildCandidateMapFromSdk,
  collectSearchCandidatesFromSdk,
} from '@/editor/search/sdk-search-candidates';
import type { SdkSearchCandidateSnapshot } from '@/editor/search/sdk-search-candidates';

interface SearchCandidatesPluginProps {
  docId: string;
  onCandidatesChange?: (snapshot: SdkSearchCandidateSnapshot) => void;
}

function entriesMatch(
  leftEntries: SdkSearchCandidateSnapshot['allCandidates'],
  rightEntries: SdkSearchCandidateSnapshot['allCandidates']
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
  leftMap: SdkSearchCandidateSnapshot['childCandidateMap'],
  rightMap: SdkSearchCandidateSnapshot['childCandidateMap']
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
  left: SdkSearchCandidateSnapshot,
  right: SdkSearchCandidateSnapshot
): boolean {
  return entriesMatch(left.allCandidates, right.allCandidates) &&
    mapsMatch(left.childCandidateMap, right.childCandidateMap);
}

const emptySnapshot: SdkSearchCandidateSnapshot = {
  allCandidates: [],
  childCandidateMap: {},
};

export function SearchCandidatesPlugin({
  docId,
  onCandidatesChange,
}: SearchCandidatesPluginProps) {
  const [editor] = useLexicalComposerContext();
  const sdk = useMemo(() => createLexicalNoteSdk({ editor, docId }), [docId, editor]);
  const previousSnapshotRef = useRef<SdkSearchCandidateSnapshot>(emptySnapshot);

  const emitCandidates = useCallback((snapshot: SdkSearchCandidateSnapshot) => {
    if (signaturesMatch(previousSnapshotRef.current, snapshot)) {
      return;
    }

    previousSnapshotRef.current = snapshot;
    onCandidatesChange?.(snapshot);
  }, [onCandidatesChange]);

  const readAndEmitCandidates = useCallback((editorState = editor.getEditorState()) => {
    const snapshot = editorState.read(() => ({
      allCandidates: collectSearchCandidatesFromSdk(sdk),
      childCandidateMap: collectChildCandidateMapFromSdk(sdk),
    }));
    emitCandidates(snapshot);
  }, [editor, emitCandidates, sdk]);

  useEffect(() => {
    previousSnapshotRef.current = emptySnapshot;
    readAndEmitCandidates();
  }, [docId, readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => readAndEmitCandidates(editorState));
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
      onCandidatesChange?.(emptySnapshot);
    };
  }, [onCandidatesChange]);

  return null;
}
