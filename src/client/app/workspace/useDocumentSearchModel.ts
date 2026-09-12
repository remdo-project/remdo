import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { LoadState, DocumentSnapshot } from '#note-sdk';
import { collectDocumentSearchResults } from '#client/search/document-search';
import type { SearchResult } from '#client/search/document-search';
import { useDocumentSession } from '#client/editor/view/EditorViewProvider';

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
// collectDocumentSearchResults), so the query walk stops after finding one
// additional match. The first results in document order are the useful ones;
// the rest are reached by a more specific query.
const SEARCH_RESULT_LIMIT = 10;

export interface DocumentSearchModel {
  activeResultOptionId?: string;
  flatResults: SearchResult[];
  hasMoreResults: boolean;
  handleSearchBlur: () => void;
  handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSearchCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchCompositionStart: (_event: CompositionEvent<HTMLInputElement>) => void;
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

const EMPTY_SEARCH_CANDIDATES: SearchResult[] = [];
const LOADING_DOCUMENT: LoadState<DocumentSnapshot> = Object.freeze({ status: 'loading' });
const getLoadingDocument = () => LOADING_DOCUMENT;
const subscribeToNothing = () => () => {};

function getNextHighlightedNoteId(
  candidates: SearchResult[],
  highlightedNoteId: string | null,
  direction: 'up' | 'down'
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  if (!highlightedNoteId) {
    return candidates[0]!.note.id;
  }

  const currentIndex = candidates.findIndex((candidate) => candidate.note.id === highlightedNoteId);
  if (currentIndex === -1) {
    return candidates[0]!.note.id;
  }

  const delta = direction === 'down' ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(candidates.length - 1, currentIndex + delta));
  return candidates[nextIndex]!.note.id;
}

function resolveHighlightedNoteId(
  candidates: SearchResult[],
  highlightedNoteId: string | null,
  searchModeActive: boolean
): string | null {
  if (!searchModeActive || candidates.length === 0) {
    return null;
  }

  if (highlightedNoteId && candidates.some((candidate) => candidate.note.id === highlightedNoteId)) {
    return highlightedNoteId;
  }

  return candidates[0]!.note.id;
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

  // The session is registered by the active editor, but its document read model
  // is lazy: search subscribes only while requested. Loading and error states do
  // not masquerade as an empty document (docs/specs/outliner/search.md).
  const documentSession = useDocumentSession();
  const documentStore = searchModeRequested ? documentSession?.document : null;
  const documentState = useSyncExternalStore(
    documentStore?.subscribe ?? subscribeToNothing,
    documentStore?.getSnapshot ?? getLoadingDocument,
    getLoadingDocument,
  );
  const searchResults = useMemo(
    () => documentState.status === 'ready'
      ? collectDocumentSearchResults(documentState.data, {
          query: searchQuery,
          limit: SEARCH_RESULT_LIMIT,
          childPreviewLimit: CHILD_PREVIEW_LIMIT,
        })
      : null,
    [documentState, searchQuery],
  );
  const searchModeActive = searchModeRequested && searchResults !== null;

  const flatResults = searchResults?.flatResults ?? EMPTY_SEARCH_CANDIDATES;
  const navigationCandidates = searchModeActive ? flatResults : EMPTY_SEARCH_CANDIDATES;
  const resolvedHighlightedNoteId = useMemo(
    () => resolveHighlightedNoteId(navigationCandidates, highlightedNoteId, searchModeActive),
    [highlightedNoteId, navigationCandidates, searchModeActive]
  );

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
    if (!resolvedHighlightedNoteId) {
      return;
    }

    acceptSearchResult(resolvedHighlightedNoteId);
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
    ? flatResults.findIndex((result) => result.note.id === highlightedResultNoteId)
    : -1;
  const activeResultOptionId = highlightedResultIndex >= 0
    ? `${searchResultsListboxId}-option-${highlightedResultIndex}`
    : undefined;
  return {
    activeResultOptionId,
    flatResults,
    hasMoreResults: searchModeActive ? searchResults.hasMore : false,
    handleSearchBlur,
    handleSearchChange,
    handleSearchCompositionEnd,
    handleSearchCompositionStart,
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
