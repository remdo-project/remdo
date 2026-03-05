import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { createLexicalNoteSdk } from '@/editor/outline/sdk/adapters/lexical';
import { collectSearchCandidatesFromSdk } from '@/editor/search/sdk-search-candidates';
import type { SdkSearchCandidate } from '@/editor/search/sdk-search-candidates';

interface SearchCandidatesPluginProps {
  docId: string;
  onCandidatesChange?: (candidates: SdkSearchCandidate[]) => void;
}

function signaturesMatch(left: SdkSearchCandidate[], right: SdkSearchCandidate[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftCandidate = left[index];
    const rightCandidate = right[index];
    if (!leftCandidate || !rightCandidate) {
      return false;
    }
    if (leftCandidate.noteId !== rightCandidate.noteId || leftCandidate.text !== rightCandidate.text) {
      return false;
    }
  }

  return true;
}

export function SearchCandidatesPlugin({ docId, onCandidatesChange }: SearchCandidatesPluginProps) {
  const [editor] = useLexicalComposerContext();
  const sdk = useMemo(() => createLexicalNoteSdk({ editor, docId }), [docId, editor]);
  const previousCandidatesRef = useRef<SdkSearchCandidate[]>([]);

  const emitCandidates = useCallback((candidates: SdkSearchCandidate[]) => {
    if (signaturesMatch(previousCandidatesRef.current, candidates)) {
      return;
    }

    previousCandidatesRef.current = candidates;
    onCandidatesChange?.(candidates);
  }, [onCandidatesChange]);

  const readAndEmitCandidates = useCallback((editorState = editor.getEditorState()) => {
    const candidates = editorState.read(() => collectSearchCandidatesFromSdk(sdk));
    emitCandidates(candidates);
  }, [editor, emitCandidates, sdk]);

  useEffect(() => {
    previousCandidatesRef.current = [];
    readAndEmitCandidates();
  }, [readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      readAndEmitCandidates(editorState);
    });
  }, [editor, readAndEmitCandidates]);

  useEffect(() => {
    return editor.registerRootListener(() => {
      previousCandidatesRef.current = [];
      readAndEmitCandidates();
    });
  }, [editor, readAndEmitCandidates]);

  useEffect(() => {
    return () => {
      previousCandidatesRef.current = [];
      onCandidatesChange?.([]);
    };
  }, [onCandidatesChange]);

  return null;
}
