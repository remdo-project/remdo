import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ROOT_SEARCH_SCOPE_ID } from '@/editor/search/sdk-search-candidates';
import type { SdkSearchCandidateSnapshot } from '@/editor/search/sdk-search-candidates';

interface SearchCandidate {
  noteId: string;
  text: string;
}

interface SearchCandidateState {
  sourceDocId: string;
  allCandidates: SearchCandidate[];
  childCandidateMap: Record<string, SearchCandidate[]>;
}

interface SearchInputSelection {
  start: number;
  end: number;
}

const EMPTY_SEARCH_CANDIDATES: SearchCandidate[] = [];
const EMPTY_SEARCH_CANDIDATE_STATE: SearchCandidateState = {
  sourceDocId: '',
  allCandidates: EMPTY_SEARCH_CANDIDATES,
  childCandidateMap: {},
};

function mapSearchCandidates(
  candidates: ReadonlyArray<{ noteId: string; text: string }>
): SearchCandidate[] {
  return candidates.map((candidate) => ({
    noteId: candidate.noteId,
    text: candidate.text,
  }));
}

function filterCandidates(candidates: SearchCandidate[], needle: string): SearchCandidate[] {
  if (needle.length === 0) {
    return candidates;
  }
  return candidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(needle));
}

function countSlashes(query: string): number {
  return query.split('/').length - 1;
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

interface UseDocumentSearchModelOptions {
  docId: string;
  focusEditorInput: () => boolean;
  setZoomNoteId: (noteId: string | null) => void;
}

interface UseDocumentSearchModelResult {
  childCandidateMap: Record<string, SearchCandidate[]>;
  flatResults: SearchCandidate[];
  handleSearchBlur: () => void;
  handleSearchCandidatesChange: (snapshot: SdkSearchCandidateSnapshot) => void;
  handleSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handleSearchCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchCompositionStart: (_event: CompositionEvent<HTMLInputElement>) => void;
  handleSearchFocus: (event: FocusEvent<HTMLInputElement>) => void;
  handleSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  handleSearchSelect: (event: SyntheticEvent<HTMLInputElement>) => void;
  hasSearchResultOptions: boolean;
  highlightedResultNoteId: string | null;
  inlineCompletionHint: string;
  inlineCompletionText: string;
  inlineCompletionVisible: boolean;
  isSlashMode: boolean;
  searchModeActive: boolean;
  searchQuery: string;
}

export function useDocumentSearchModel({
  docId,
  focusEditorInput,
  setZoomNoteId,
}: UseDocumentSearchModelOptions): UseDocumentSearchModelResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useReducer(
    (_current: string | null, next: string | null) => next,
    null
  );
  const [sdkSearchCandidateState, setSdkSearchCandidateState] = useState<SearchCandidateState>(
    EMPTY_SEARCH_CANDIDATE_STATE
  );
  const [slashScopePathNoteIds, setSlashScopePathNoteIds] = useState<string[]>([]);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);
  const previousSearchModeRef = useRef(false);
  const previousSearchQueryRef = useRef(searchQuery);
  const skipHighlightResetForQueryChangeRef = useRef(false);
  const [searchInputSelection, setSearchInputSelection] = useState<SearchInputSelection>({ start: 0, end: 0 });
  const [searchInputComposing, setSearchInputComposing] = useState(false);

  const handleSearchCandidatesChange = useCallback((snapshot: SdkSearchCandidateSnapshot) => {
    setSdkSearchCandidateState({
      sourceDocId: docId,
      allCandidates: mapSearchCandidates(snapshot.allCandidates),
      childCandidateMap: Object.fromEntries(
        Object.entries(snapshot.childCandidateMap).map(([noteId, candidates]) => [
          noteId,
          mapSearchCandidates(candidates),
        ])
      ),
    });
  }, [docId]);

  useEffect(() => {
    if (searchModeActive || !pendingEditorFocusAfterSearchExitRef.current) {
      return;
    }
    pendingEditorFocusAfterSearchExitRef.current = false;
    focusEditorInput();
  }, [focusEditorInput, searchModeActive]);

  const sdkSearchCandidates = sdkSearchCandidateState.sourceDocId === docId
    ? sdkSearchCandidateState
    : { ...EMPTY_SEARCH_CANDIDATE_STATE, sourceDocId: docId };
  const isSlashMode = searchModeActive && searchQuery.startsWith('/');
  const textNeedle = searchQuery.toLocaleLowerCase();
  const slashSegmentNeedle = searchQuery.slice(searchQuery.lastIndexOf('/') + 1).toLocaleLowerCase();
  const slashScopeParentNoteId = slashScopePathNoteIds.at(-1) ?? ROOT_SEARCH_SCOPE_ID;

  const textResults = useMemo(
    () => filterCandidates(sdkSearchCandidates.allCandidates, textNeedle),
    [sdkSearchCandidates.allCandidates, textNeedle]
  );

  const slashScopeCandidates = useMemo(
    () => sdkSearchCandidates.childCandidateMap[slashScopeParentNoteId] ?? EMPTY_SEARCH_CANDIDATES,
    [sdkSearchCandidates.childCandidateMap, slashScopeParentNoteId]
  );

  const slashResults = useMemo(
    () => filterCandidates(slashScopeCandidates, slashSegmentNeedle),
    [slashScopeCandidates, slashSegmentNeedle]
  );

  const flatResults = isSlashMode ? slashResults : textResults;
  const navigationCandidates = searchModeActive ? flatResults : EMPTY_SEARCH_CANDIDATES;
  const highlightedNavigationCandidate = useMemo(
    () => (
      highlightedNoteId
        ? navigationCandidates.find((candidate) => candidate.noteId === highlightedNoteId) ?? null
        : null
    ),
    [highlightedNoteId, navigationCandidates]
  );
  const completionSourceCandidate = highlightedNavigationCandidate ?? navigationCandidates[0] ?? null;
  const isSearchInputCaretAtEnd = searchInputSelection.start === searchInputSelection.end &&
    searchInputSelection.end === searchQuery.length;
  const inlineCompletionText = useMemo(() => {
    if (!searchModeActive) {
      return '';
    }

    if (searchQuery.length === 0) {
      return '/';
    }

    if (!isSlashMode || !completionSourceCandidate) {
      return '';
    }

    const currentSegment = searchQuery.slice(searchQuery.lastIndexOf('/') + 1);
    const sourceText = completionSourceCandidate.text;
    const currentSegmentLower = currentSegment.toLocaleLowerCase();
    const sourceTextLower = sourceText.toLocaleLowerCase();
    if (!sourceTextLower.startsWith(currentSegmentLower)) {
      return '';
    }

    if (currentSegment.length < sourceText.length) {
      return sourceText.slice(currentSegment.length);
    }

    const sourceChildren = sdkSearchCandidates.childCandidateMap[completionSourceCandidate.noteId] ?? [];
    return sourceChildren.length > 0 ? '/' : '';
  }, [completionSourceCandidate, isSlashMode, sdkSearchCandidates.childCandidateMap, searchModeActive, searchQuery]);
  const inlineCompletionHint = inlineCompletionText.length > 0 ? '→' : '';
  const inlineCompletionVisible = searchModeActive &&
    !searchInputComposing &&
    isSearchInputCaretAtEnd &&
    inlineCompletionText.length > 0;

  useEffect(() => {
    const modeEntered = searchModeActive && !previousSearchModeRef.current;
    const queryChanged = previousSearchQueryRef.current !== searchQuery;
    const shouldResetForQueryChange = queryChanged && !skipHighlightResetForQueryChangeRef.current;
    skipHighlightResetForQueryChangeRef.current = false;
    previousSearchModeRef.current = searchModeActive;
    previousSearchQueryRef.current = searchQuery;

    if (!searchModeActive) {
      setHighlightedNoteId(null);
      return;
    }

    if (navigationCandidates.length === 0) {
      setHighlightedNoteId(null);
      return;
    }

    if (
      modeEntered ||
      shouldResetForQueryChange ||
      !highlightedNoteId ||
      !navigationCandidates.some((candidate) => candidate.noteId === highlightedNoteId)
    ) {
      setHighlightedNoteId(navigationCandidates[0]!.noteId);
    }
  }, [highlightedNoteId, navigationCandidates, searchModeActive, searchQuery]);

  const applySearchQuery = useCallback((
    nextSearchQuery: string,
    options?: { preserveHighlight?: boolean; forceCaretAtEnd?: boolean }
  ) => {
    if (options?.preserveHighlight) {
      skipHighlightResetForQueryChangeRef.current = true;
    }

    if (nextSearchQuery.startsWith('/')) {
      const previousSlashCount = searchQuery.startsWith('/')
        ? countSlashes(searchQuery)
        : 0;
      const nextSlashCount = countSlashes(nextSearchQuery);
      const appendedSlash = nextSlashCount > previousSlashCount && nextSearchQuery.endsWith('/');

      if (nextSearchQuery === '/') {
        setSlashScopePathNoteIds([]);
      } else if (nextSlashCount < previousSlashCount) {
        const nextDepth = Math.max(0, nextSlashCount - 1);
        setSlashScopePathNoteIds((currentPath) => currentPath.slice(0, nextDepth));
      } else if (appendedSlash && highlightedNoteId) {
        setSlashScopePathNoteIds((currentPath) => [...currentPath, highlightedNoteId]);
      }
    } else if (slashScopePathNoteIds.length > 0) {
      setSlashScopePathNoteIds([]);
    }

    setSearchQuery(nextSearchQuery);
    if (options?.forceCaretAtEnd) {
      setSearchInputSelection({ start: nextSearchQuery.length, end: nextSearchQuery.length });
    }
  }, [highlightedNoteId, searchQuery, slashScopePathNoteIds]);

  const moveSearchHighlight = (direction: 'up' | 'down') => {
    setHighlightedNoteId(getNextHighlightedNoteId(navigationCandidates, highlightedNoteId, direction));
  };

  const closeSearchAndFocusEditor = useCallback(() => {
    setSearchModeActive(false);
    queueMicrotask(() => {
      focusEditorInput();
    });
  }, [focusEditorInput]);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
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
      moveSearchHighlight('down');
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveSearchHighlight('up');
      return;
    }

    if (event.key === 'ArrowRight') {
      if (!inlineCompletionVisible) {
        return;
      }
      event.preventDefault();
      applySearchQuery(`${searchQuery}${inlineCompletionText}`, {
        preserveHighlight: true,
        forceCaretAtEnd: true,
      });
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (isSlashMode && searchQuery === '/') {
      setZoomNoteId(null);
      closeSearchAndFocusEditor();
      return;
    }

    if (!highlightedNavigationCandidate) {
      return;
    }
    setZoomNoteId(highlightedNavigationCandidate.noteId);
    closeSearchAndFocusEditor();
  };

  const updateSearchInputSelection = (input: HTMLInputElement) => {
    const nextStart = input.selectionStart ?? input.value.length;
    const nextEnd = input.selectionEnd ?? input.value.length;
    setSearchInputSelection({ start: nextStart, end: nextEnd });
  };

  const handleSearchFocus = (event: FocusEvent<HTMLInputElement>) => {
    setSearchModeActive(true);
    updateSearchInputSelection(event.currentTarget);
  };

  const handleSearchBlur = () => {
    setSearchModeActive(false);
    setSearchInputComposing(false);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextSearchQuery = event.currentTarget.value;
    updateSearchInputSelection(event.currentTarget);
    applySearchQuery(nextSearchQuery);
  };

  const handleSearchSelect = (event: SyntheticEvent<HTMLInputElement>) => {
    updateSearchInputSelection(event.currentTarget);
  };

  const handleSearchCompositionStart = (_event: CompositionEvent<HTMLInputElement>) => {
    setSearchInputComposing(true);
  };

  const handleSearchCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    setSearchInputComposing(false);
    updateSearchInputSelection(event.currentTarget);
  };

  const highlightedResultNoteId = searchModeActive ? highlightedNoteId : null;
  const hasSearchResultOptions = navigationCandidates.length > 0;

  return {
    childCandidateMap: sdkSearchCandidates.childCandidateMap,
    flatResults,
    handleSearchBlur,
    handleSearchCandidatesChange,
    handleSearchChange,
    handleSearchCompositionEnd,
    handleSearchCompositionStart,
    handleSearchFocus,
    handleSearchKeyDown,
    handleSearchSelect,
    hasSearchResultOptions,
    highlightedResultNoteId,
    inlineCompletionHint,
    inlineCompletionText,
    inlineCompletionVisible,
    isSlashMode,
    searchModeActive,
    searchQuery,
  };
}
