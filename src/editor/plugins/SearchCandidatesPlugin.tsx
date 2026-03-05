import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import {
  collectChildCandidateMapFromSdk,
  collectSearchCandidatesFromSdk,
  collectTopLevelSearchCandidatesFromSdk,
} from '@/editor/search/sdk-search-candidates';
import type { SdkSearchCandidateSnapshot } from '@/editor/search/sdk-search-candidates';

interface SearchCandidatesPluginProps {
  docId: string;
  onCandidatesChange?: (snapshot: SdkSearchCandidateSnapshot) => void;
}

function signaturesMatch(
  left: SdkSearchCandidateSnapshot,
  right: SdkSearchCandidateSnapshot
): boolean {
  const entriesMatch = (
    leftEntries: SdkSearchCandidateSnapshot['allCandidates'],
    rightEntries: SdkSearchCandidateSnapshot['allCandidates']
  ): boolean => {
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    for (let index = 0; index < leftEntries.length; index += 1) {
      const leftCandidate = leftEntries[index];
      const rightCandidate = rightEntries[index];
      if (!leftCandidate || !rightCandidate) {
        return false;
      }
      if (leftCandidate.noteId !== rightCandidate.noteId || leftCandidate.text !== rightCandidate.text) {
        return false;
      }
    }

    return true;
  };

  const mapsMatch = (
    leftMap: SdkSearchCandidateSnapshot['childCandidateMap'],
    rightMap: SdkSearchCandidateSnapshot['childCandidateMap']
  ): boolean => {
    const leftEntries = Object.entries(leftMap);
    const rightEntries = Object.entries(rightMap);
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    for (const [noteId, candidates] of leftEntries) {
      const rightCandidates = rightMap[noteId];
      if (!rightCandidates || !entriesMatch(candidates, rightCandidates)) {
        return false;
      }
    }

    return true;
  };

  return entriesMatch(left.allCandidates, right.allCandidates) &&
    entriesMatch(left.topLevelCandidates, right.topLevelCandidates) &&
    mapsMatch(left.childCandidateMap, right.childCandidateMap);
}

const emptySnapshot: SdkSearchCandidateSnapshot = {
  allCandidates: [],
  topLevelCandidates: [],
  childCandidateMap: {},
};

export function SearchCandidatesPlugin({ docId, onCandidatesChange }: SearchCandidatesPluginProps) {
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
      topLevelCandidates: collectTopLevelSearchCandidatesFromSdk(sdk),
      childCandidateMap: collectChildCandidateMapFromSdk(sdk),
    }));
    emitCandidates(snapshot);
  }, [editor, emitCandidates, sdk]);

  useEffect(() => {
    previousSnapshotRef.current = emptySnapshot;
    readAndEmitCandidates();
  }, [readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
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
      onCandidatesChange?.(emptySnapshot);
    };
  }, [onCandidatesChange]);

  return null;
}
