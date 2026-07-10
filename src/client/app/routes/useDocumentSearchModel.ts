import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { collectDocumentSearchResults } from '#client/editor/search/search-candidates';
import type {
  ChildPreview,
  SearchCandidate,
} from '#client/editor/search/search-candidates';
import { useSearchNotes } from '#client/editor/view/EditorViewProvider';

interface SearchResultsState {
  ready: boolean;
  flatResults: SearchCandidate[];
  childPreviewByNoteId: Record<string, ChildPreview>;
  hasMore: boolean;
}

// Direct children shown in each result row's preview (the row reports "+N more"
// for the remainder); kept beside the result limit since both bound the work the
// capped collection walk does per result.
const CHILD_PREVIEW_LIMIT = 2;

interface UseDocumentSearchModelOptions {
  focusEditorInput: () => boolean;
  setZoomNoteId: (noteId: string | null) => void;
}

// Cap the flat results: a large document otherwise matches hundreds of notes
// (every note on an empty query). The cap is applied during collection (see
// collectDocumentSearchResults), so opening search stays fast. The first results
// in document order are the useful ones; the rest are reached by a more specific
// query.
const SEARCH_RESULT_LIMIT = 10;

export interface DocumentSearchModel {
  activeResultOptionId?: string;
  childPreviewByNoteId: Record<string, ChildPreview>;
  flatResults: SearchCandidate[];
  hasMoreResults: boolean;
  handleSearchBlur: () => void;
  handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSearchCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchCompositionStart: (_event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchDismiss: () => void;
  handleSearchFocus: (event: FocusEvent<HTMLInputElement>) => void;
  handleSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleSearchResultClick: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  handleSearchResultPointerEnter: (noteId: string) => void;
  highlightedResultNoteId: string | null;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  searchModeActive: boolean;
  searchModeRequested: boolean;
  searchQuery: string;
  searchResultsListboxId: string;
  searchResultsRef: React.RefObject<HTMLElement | null>;
}

const EMPTY_SEARCH_CANDIDATES: SearchCandidate[] = [];
const EMPTY_SEARCH_RESULTS_STATE: SearchResultsState = {
  ready: false,
  flatResults: EMPTY_SEARCH_CANDIDATES,
  childPreviewByNoteId: {},
  hasMore: false,
};

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
}: UseDocumentSearchModelOptions): DocumentSearchModel {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsRef = useRef<HTMLElement | null>(null);
  const searchResultsListboxId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModeRequested, setSearchModeRequested] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useReducer(
    (_current: string | null, next: string | null) => next,
    null
  );
  const [searchInputComposing, setSearchInputComposing] = useState(false);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);

  // Results derive from the editor through the SDK accessor, in one capped,
  // query-aware walk (see collectDocumentSearchResults). The cap is applied
  // during collection, so opening search on a large document only visits notes
  // up to the limit instead of building the whole document's candidate set.
  // Recomputed per edit (accessor identity) and per query.
  const searchNotes = useSearchNotes();
  const searchResults = useMemo<SearchResultsState>(
    () => searchNotes((notes) => ({
      ready: true,
      ...collectDocumentSearchResults(notes, {
        query: searchQuery,
        limit: SEARCH_RESULT_LIMIT,
        childPreviewLimit: CHILD_PREVIEW_LIMIT,
      }),
    })) ?? EMPTY_SEARCH_RESULTS_STATE,
    // searchNotes identity changes per editor edit; searchQuery per keystroke.
    [searchNotes, searchQuery],
  );
  const searchModeActive = searchModeRequested && searchResults.ready;

  const flatResults = searchResults.flatResults;
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

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }
      const isFindShortcut = event.code === 'KeyF' || (!!event.key && event.key.toLowerCase() === 'f');
      if (!isFindShortcut || (!event.metaKey && !event.ctrlKey)) {
        return;
      }

      const searchInput = searchInputRef.current;
      if (!searchInput || document.activeElement === searchInput) {
        return;
      }

      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    };

    document.addEventListener('keydown', handleFindShortcut);
    return () => {
      document.removeEventListener('keydown', handleFindShortcut);
    };
  }, []);

  useEffect(() => {
    if (!searchModeActive) {
      return;
    }

    const handlePointerDownOutsideSearch = (event: PointerEvent) => {
      if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (searchInputRef.current?.contains(target) || searchResultsRef.current?.contains(target)) {
        return;
      }

      dismissSearch();
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideSearch, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutsideSearch, true);
    };
  }, [dismissSearch, searchModeActive]);

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

  const handleSearchResultPointerEnter = (noteId: string) => {
    setHighlightedNoteId(noteId);
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
  const highlightedResultIndex = highlightedResultNoteId
    ? flatResults.findIndex((result) => result.noteId === highlightedResultNoteId)
    : -1;
  const activeResultOptionId = highlightedResultIndex >= 0
    ? `${searchResultsListboxId}-option-${highlightedResultIndex}`
    : undefined;
  return {
    activeResultOptionId,
    childPreviewByNoteId: searchResults.childPreviewByNoteId,
    flatResults,
    hasMoreResults: searchModeActive && searchResults.hasMore,
    handleSearchBlur,
    handleSearchChange,
    handleSearchCompositionEnd,
    handleSearchCompositionStart,
    handleSearchDismiss: dismissSearch,
    handleSearchFocus,
    handleSearchKeyDown,
    handleSearchResultClick,
    handleSearchResultPointerEnter,
    highlightedResultNoteId,
    searchInputRef,
    searchModeActive,
    searchModeRequested,
    searchQuery,
    searchResultsListboxId,
    searchResultsRef,
  };
}
