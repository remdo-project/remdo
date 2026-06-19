import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  collectChildCandidateMap,
  collectSearchCandidates,
} from '#client/editor/search/search-candidates';
import type { SearchCandidate } from '#client/editor/search/search-candidates';
import { matchesPathQuery } from '#client/search/query-match';
import { useSearchNotes } from '#client/editor/view/EditorViewProvider';

interface SearchCandidateState {
  ready: boolean;
  allCandidates: SearchCandidate[];
  childCandidateMap: Record<string, SearchCandidate[]>;
}

interface UseDocumentSearchModelOptions {
  focusEditorInput: () => boolean;
  setZoomNoteId: (noteId: string | null) => void;
}

interface UseDocumentSearchModelResult {
  childCandidateMap: Record<string, SearchCandidate[]>;
  flatResults: SearchCandidate[];
  handleSearchBlur: () => void;
  handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSearchCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchCompositionStart: (_event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchDismiss: () => void;
  handleSearchFocus: (event: FocusEvent<HTMLInputElement>) => void;
  handleSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleSearchResultClick: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  highlightedResultNoteId: string | null;
  searchModeActive: boolean;
  searchModeRequested: boolean;
  searchQuery: string;
}

const EMPTY_SEARCH_CANDIDATES: SearchCandidate[] = [];
const EMPTY_SEARCH_CANDIDATE_STATE: SearchCandidateState = {
  ready: false,
  allCandidates: EMPTY_SEARCH_CANDIDATES,
  childCandidateMap: {},
};
function filterCandidates(candidates: SearchCandidate[], query: string): SearchCandidate[] {
  if (query.length === 0) {
    return candidates;
  }
  return candidates.filter((candidate) => matchesPathQuery(candidate.pathText, query));
}

function getNextHighlightedNoteId(
  candidates: SearchCandidate[],
  highlightedNoteId: string | null,
  direction: 'up' | 'down'
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  if (!highlightedNoteId) {
    return candidates[0]!.noteId;
  }

  const currentIndex = candidates.findIndex((candidate) => candidate.noteId === highlightedNoteId);
  if (currentIndex === -1) {
    return candidates[0]!.noteId;
  }

  const delta = direction === 'down' ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(candidates.length - 1, currentIndex + delta));
  return candidates[nextIndex]!.noteId;
}

function resolveHighlightedNoteId(
  candidates: SearchCandidate[],
  highlightedNoteId: string | null,
  searchModeActive: boolean
): string | null {
  if (!searchModeActive || candidates.length === 0) {
    return null;
  }

  if (highlightedNoteId && candidates.some((candidate) => candidate.noteId === highlightedNoteId)) {
    return highlightedNoteId;
  }

  return candidates[0]!.noteId;
}

export function useDocumentSearchModel({
  focusEditorInput,
  setZoomNoteId,
}: UseDocumentSearchModelOptions): UseDocumentSearchModelResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModeRequested, setSearchModeRequested] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useReducer(
    (_current: string | null, next: string | null) => next,
    null
  );
  const [searchInputComposing, setSearchInputComposing] = useState(false);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);

  // Candidates derive from the editor through the SDK accessor (read once per
  // edit; its identity changes when the editor content does). No materialized
  // snapshot is held — the flat list and child map are recomputed on change.
  const searchNotes = useSearchNotes();
  const currentDocumentCandidates = useMemo<SearchCandidateState>(
    () => searchNotes((notes) => ({
      ready: true,
      allCandidates: collectSearchCandidates(notes),
      childCandidateMap: collectChildCandidateMap(notes),
    })) ?? EMPTY_SEARCH_CANDIDATE_STATE,
    // searchNotes identity changes per editor edit, driving recompute.
    [searchNotes],
  );
  const currentDocumentCandidatesReady = currentDocumentCandidates.ready;
  const searchModeActive = searchModeRequested && currentDocumentCandidatesReady;

  const flatResults = useMemo(
    () => filterCandidates(currentDocumentCandidates.allCandidates, searchQuery),
    [currentDocumentCandidates.allCandidates, searchQuery]
  );
  const navigationCandidates = searchModeActive ? flatResults : EMPTY_SEARCH_CANDIDATES;
  const resolvedHighlightedNoteId = useMemo(
    () => resolveHighlightedNoteId(navigationCandidates, highlightedNoteId, searchModeActive),
    [highlightedNoteId, navigationCandidates, searchModeActive]
  );
  const highlightedNavigationCandidate = resolvedHighlightedNoteId
    ? navigationCandidates.find((candidate) => candidate.noteId === resolvedHighlightedNoteId) ?? null
    : null;

  useEffect(() => {
    if (searchModeActive || !pendingEditorFocusAfterSearchExitRef.current) {
      return;
    }
    pendingEditorFocusAfterSearchExitRef.current = false;
    focusEditorInput();
  }, [focusEditorInput, searchModeActive]);

  useEffect(() => {
    if (highlightedNoteId === resolvedHighlightedNoteId) {
      return;
    }
    setHighlightedNoteId(resolvedHighlightedNoteId);
  }, [highlightedNoteId, resolvedHighlightedNoteId]);

  const closeSearchAndFocusEditor = useCallback(() => {
    setSearchModeRequested(false);
    queueMicrotask(() => {
      focusEditorInput();
    });
  }, [focusEditorInput]);

  const acceptSearchResult = useCallback((noteId: string) => {
    setZoomNoteId(noteId);
    closeSearchAndFocusEditor();
  }, [closeSearchAndFocusEditor, setZoomNoteId]);

  const dismissSearch = useCallback(() => {
    setSearchModeRequested(false);
    setSearchInputComposing(false);
  }, []);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || searchInputComposing) {
      return;
    }

    if (event.key === 'Escape' && !event.altKey && !event.metaKey && !event.ctrlKey) {
      if (focusEditorInput()) {
        event.preventDefault();
        return;
      }
      pendingEditorFocusAfterSearchExitRef.current = true;
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedNoteId(getNextHighlightedNoteId(navigationCandidates, resolvedHighlightedNoteId, 'down'));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedNoteId(getNextHighlightedNoteId(navigationCandidates, resolvedHighlightedNoteId, 'up'));
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (!highlightedNavigationCandidate) {
      return;
    }

    acceptSearchResult(highlightedNavigationCandidate.noteId);
  };

  const handleSearchResultClick = (event: ReactMouseEvent<HTMLElement>, noteId: string) => {
    if (event.button !== 0) {
      return;
    }
    acceptSearchResult(noteId);
  };

  const handleSearchFocus = (_event: FocusEvent<HTMLInputElement>) => {
    setSearchModeRequested(true);
  };

  const handleSearchBlur = () => {
    dismissSearch();
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.currentTarget.value);
  };

  const handleSearchCompositionStart = (_event: CompositionEvent<HTMLInputElement>) => {
    setSearchInputComposing(true);
  };

  const handleSearchCompositionEnd = (_event: CompositionEvent<HTMLInputElement>) => {
    setSearchInputComposing(false);
  };

  const highlightedResultNoteId = searchModeActive ? resolvedHighlightedNoteId : null;
  return {
    childCandidateMap: currentDocumentCandidates.childCandidateMap,
    flatResults,
    handleSearchBlur,
    handleSearchChange,
    handleSearchCompositionEnd,
    handleSearchCompositionStart,
    handleSearchDismiss: dismissSearch,
    handleSearchFocus,
    handleSearchKeyDown,
    handleSearchResultClick,
    highlightedResultNoteId,
    searchModeActive,
    searchModeRequested,
    searchQuery,
  };
}
