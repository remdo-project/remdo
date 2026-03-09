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

interface SlashScopeState {
  sourceDocId: string;
  pathNoteIds: string[];
}

interface SearchInputSelection {
  start: number;
  end: number;
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

const EMPTY_SEARCH_CANDIDATES: SearchCandidate[] = [];
const EMPTY_NOTE_IDS: string[] = [];
const EMPTY_SEARCH_CANDIDATE_STATE: SearchCandidateState = {
  sourceDocId: '',
  allCandidates: EMPTY_SEARCH_CANDIDATES,
  childCandidateMap: {},
};
const INVALID_SEARCH_SCOPE_ID = '__invalid_search_scope__';

function mapSearchCandidates(
  candidates: ReadonlyArray<{ noteId: string; text: string }>
): SearchCandidate[] {
  return candidates.map((candidate) => ({
    noteId: candidate.noteId,
    text: candidate.text,
  }));
}

function countSlashes(query: string): number {
  return query.split('/').length - 1;
}

function filterCandidates(candidates: SearchCandidate[], needle: string): SearchCandidate[] {
  if (needle.length === 0) {
    return candidates;
  }
  return candidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(needle));
}

function matchCompletedSegmentCandidates(candidates: SearchCandidate[], segment: string): SearchCandidate[] {
  if (segment.length === 0) {
    return candidates;
  }
  return candidates.filter((candidate) => candidate.text.toLocaleLowerCase() === segment);
}

function resolveCompletedSlashPath(
  query: string,
  currentPath: string[],
  highlightedNoteId: string | null,
  childCandidateMap: Record<string, SearchCandidate[]>
): string[] {
  const completedSegments = query.split('/').slice(1, -1);
  const nextPath: string[] = [];

  for (const [index, segment] of completedSegments.entries()) {
    const parentNoteId = nextPath.at(-1) ?? ROOT_SEARCH_SCOPE_ID;
    const scopeCandidates = childCandidateMap[parentNoteId] ?? EMPTY_SEARCH_CANDIDATES;
    const matches = matchCompletedSegmentCandidates(scopeCandidates, segment.toLocaleLowerCase());
    if (matches.length === 0) {
      nextPath.push(INVALID_SEARCH_SCOPE_ID);
      break;
    }

    const currentPathCandidate = currentPath[index];
    const matchedCurrentPathCandidate = currentPathCandidate
      ? matches.find((candidate) => candidate.noteId === currentPathCandidate) ?? null
      : null;
    const matchedHighlightedCandidate = highlightedNoteId
      ? matches.find((candidate) => candidate.noteId === highlightedNoteId) ?? null
      : null;
    nextPath.push((matchedCurrentPathCandidate ?? matchedHighlightedCandidate ?? matches[0])!.noteId);
  }

  return nextPath;
}

function pathsMatch(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    left.every((noteId, index) => noteId === right[index]);
}

function resolveSlashScopePath(
  query: string,
  currentPath: string[],
  highlightedNoteId: string | null,
  childCandidateMap: Record<string, SearchCandidate[]>
): string[] {
  if (!query.startsWith('/')) {
    return EMPTY_NOTE_IDS;
  }

  const completedSlashDepth = Math.max(0, countSlashes(query) - 1);
  if (query === '/' || completedSlashDepth === 0) {
    return EMPTY_NOTE_IDS;
  }

  return resolveCompletedSlashPath(query, currentPath, highlightedNoteId, childCandidateMap);
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
  const [slashScopeState, setSlashScopeState] = useState<SlashScopeState>({
    sourceDocId: docId,
    pathNoteIds: EMPTY_NOTE_IDS,
  });
  const [searchInputSelection, setSearchInputSelection] = useState<SearchInputSelection>({ start: 0, end: 0 });
  const [searchInputComposing, setSearchInputComposing] = useState(false);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);

  const sdkSearchCandidates = sdkSearchCandidateState.sourceDocId === docId
    ? sdkSearchCandidateState
    : { ...EMPTY_SEARCH_CANDIDATE_STATE, sourceDocId: docId };
  const slashScopePathNoteIds = slashScopeState.sourceDocId === docId
    ? slashScopeState.pathNoteIds
    : EMPTY_NOTE_IDS;
  const resolvedSlashScopePathNoteIds = useMemo(
    () => resolveSlashScopePath(
      searchQuery,
      slashScopePathNoteIds,
      highlightedNoteId,
      sdkSearchCandidates.childCandidateMap
    ),
    [highlightedNoteId, sdkSearchCandidates.childCandidateMap, searchQuery, slashScopePathNoteIds]
  );
  const isSlashMode = searchModeActive && searchQuery.startsWith('/');
  const slashScopeParentNoteId = resolvedSlashScopePathNoteIds.at(-1) ?? ROOT_SEARCH_SCOPE_ID;
  const textNeedle = searchQuery.toLocaleLowerCase();
  const slashSegmentNeedle = searchQuery.slice(searchQuery.lastIndexOf('/') + 1).toLocaleLowerCase();

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
  const highlightedNavigationCandidate = highlightedNoteId
    ? navigationCandidates.find((candidate) => candidate.noteId === highlightedNoteId) ?? null
    : null;
  const completionSourceCandidate = highlightedNavigationCandidate ?? navigationCandidates[0] ?? null;

  useEffect(() => {
    if (searchModeActive || !pendingEditorFocusAfterSearchExitRef.current) {
      return;
    }
    pendingEditorFocusAfterSearchExitRef.current = false;
    focusEditorInput();
  }, [focusEditorInput, searchModeActive]);

  useEffect(() => {
    if (!searchModeActive || navigationCandidates.length === 0) {
      setHighlightedNoteId(null);
      return;
    }

    if (highlightedNoteId && navigationCandidates.some((candidate) => candidate.noteId === highlightedNoteId)) {
      return;
    }

    setHighlightedNoteId(navigationCandidates[0]!.noteId);
  }, [highlightedNoteId, navigationCandidates, searchModeActive]);

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

  const updateSlashScopePath = useCallback((
    nextPath: string[] | ((currentPath: string[]) => string[])
  ) => {
    setSlashScopeState((currentState) => {
      const currentPath = currentState.sourceDocId === docId ? currentState.pathNoteIds : EMPTY_NOTE_IDS;
      const resolvedPath = typeof nextPath === 'function' ? nextPath(currentPath) : nextPath;
      return {
        sourceDocId: docId,
        pathNoteIds: resolvedPath,
      };
    });
  }, [docId]);

  const applySearchQuery = useCallback((nextSearchQuery: string) => {
    const nextSlashScopePath = resolveSlashScopePath(
      nextSearchQuery,
      resolvedSlashScopePathNoteIds,
      highlightedNoteId,
      sdkSearchCandidates.childCandidateMap
    );

    if (!pathsMatch(nextSlashScopePath, resolvedSlashScopePathNoteIds)) {
      updateSlashScopePath(nextSlashScopePath);
    }

    setSearchQuery(nextSearchQuery);
  }, [
    highlightedNoteId,
    resolvedSlashScopePathNoteIds,
    sdkSearchCandidates.childCandidateMap,
    updateSlashScopePath,
  ]);

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
      setHighlightedNoteId(getNextHighlightedNoteId(navigationCandidates, highlightedNoteId, 'down'));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedNoteId(getNextHighlightedNoteId(navigationCandidates, highlightedNoteId, 'up'));
      return;
    }

    if (event.key === 'ArrowRight') {
      if (!inlineCompletionVisible) {
        return;
      }
      event.preventDefault();
      const nextQuery = `${searchQuery}${inlineCompletionText}`;
      applySearchQuery(nextQuery);
      setSearchInputSelection({ start: nextQuery.length, end: nextQuery.length });
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
    updateSearchInputSelection(event.currentTarget);
    applySearchQuery(event.currentTarget.value);
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
