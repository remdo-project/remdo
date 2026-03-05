import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActionIcon, Combobox, TextInput, useCombobox } from '@mantine/core';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { createHardcodedUserConfigNoteSdk } from '@/editor/outline/sdk';
import type { SdkSearchCandidateSnapshot } from '@/editor/search/sdk-search-candidates';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPathForPathname, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import './DocumentRoute.css';

interface SearchCandidate {
  noteId: string;
  text: string;
}

function isVisibleInCurrentView(element: HTMLElement): boolean {
  if (element.classList.contains('zoom-hidden')) {
    return false;
  }
  let current: HTMLElement | null = element;
  while (current) {
    const style = globalThis.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

interface SearchCandidateState {
  sourceDocId: string;
  allCandidates: SearchCandidate[];
  topLevelCandidates: SearchCandidate[];
  childCandidateMap: Record<string, SearchCandidate[]>;
}

interface SearchInputSelection {
  start: number;
  end: number;
}

export default function DocumentRoute() {
  const { docRef } = useParams<{ docRef?: string }>();
  const parsedRef = parseDocumentRef(docRef);
  const docId = parsedRef?.docId ?? DEFAULT_DOC_ID;
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [zoomPath, setZoomPath] = useState<NotePathItem[]>([]);
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [highlightedNoteId, setHighlightedNoteId] = useReducer(
    (_current: string | null, next: string | null) => next,
    null
  );
  const [sdkSearchCandidateState, setSdkSearchCandidateState] = useReducer(
    (_current: SearchCandidateState, next: SearchCandidateState) => next,
    { sourceDocId: '', allCandidates: [], topLevelCandidates: [], childCandidateMap: {} }
  );
  const [slashScopePathNoteIds, setSlashScopePathNoteIds] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);
  const previousSearchModeRef = useRef(false);
  const previousSearchQueryRef = useRef(searchQuery);
  const skipHighlightResetForQueryChangeRef = useRef(false);
  const [searchInputSelection, setSearchInputSelection] = useState<SearchInputSelection>({ start: 0, end: 0 });
  const [searchInputComposing, setSearchInputComposing] = useState(false);
  const zoomNoteId = parsedRef?.noteId ?? null;
  const sdk = useMemo(() => createHardcodedUserConfigNoteSdk(), []);
  const documentOptions = useMemo(
    () => {
      const documentList = sdk.userConfig().children().find((entry) => entry.kind() === 'document-list');
      if (!documentList) {
        return [];
      }
      return documentList
        .children()
        .filter((entry) => entry.kind() === 'document')
        .map((document) => ({ value: document.id(), label: document.text() }));
    },
    [sdk]
  );
  const documentPicker = useCombobox({
    onDropdownClose: () => documentPicker.resetSelectedOption(),
  });

  const setZoomNoteId = useCallback((noteId: string | null) => {
    const nextSearch = searchParams.toString();
    void navigate(
      {
        pathname: createDocumentPathForPathname(location.pathname, docId, noteId),
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [docId, location.pathname, navigate, searchParams]);

  const setDocumentId = (nextDocId: string) => {
    if (nextDocId === docId) {
      return;
    }
    const nextSearch = searchParams.toString();
    void navigate({
      pathname: createDocumentPathForPathname(location.pathname, nextDocId),
      search: nextSearch ? `?${nextSearch}` : '',
    });
  };
  const focusEditorInput = useCallback(() => {
    const editorInput = shellRef.current?.querySelector<HTMLElement>('.editor-input') ?? null;
    if (!editorInput) {
      return false;
    }
    if (!isVisibleInCurrentView(editorInput)) {
      return false;
    }
    editorInput.focus();
    return document.activeElement === editorInput;
  }, []);

  const handleSdkSearchCandidatesChange = useCallback((snapshot: SdkSearchCandidateSnapshot) => {
    const mapCandidates = (candidates: SdkSearchCandidateSnapshot['allCandidates']): SearchCandidate[] => (
      candidates.map((candidate) => ({
        noteId: candidate.noteId,
        text: candidate.text,
      }))
    );

    setSdkSearchCandidateState({
      sourceDocId: docId,
      allCandidates: mapCandidates(snapshot.allCandidates),
      topLevelCandidates: mapCandidates(snapshot.topLevelCandidates),
      childCandidateMap: Object.fromEntries(
        Object.entries(snapshot.childCandidateMap).map(([noteId, candidates]) => [
          noteId,
          mapCandidates(candidates),
        ])
      ),
    });
  }, [docId]);

  useEffect(() => {
    const handleFindShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }
      const isFindShortcut = event.code === 'KeyF' || (!!event.key && event.key.toLowerCase() === 'f');
      if (!isFindShortcut) {
        return;
      }
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      const searchInput = searchInputRef.current;
      if (!searchInput) {
        return;
      }

      // Allow browser find on the next press when search is already focused.
      if (document.activeElement === searchInput) {
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
    if (searchModeActive || !pendingEditorFocusAfterSearchExitRef.current) {
      return;
    }
    pendingEditorFocusAfterSearchExitRef.current = false;
    focusEditorInput();
  }, [focusEditorInput, searchModeActive]);

  const sdkSearchCandidates = useMemo(
    () => (sdkSearchCandidateState.sourceDocId === docId ? sdkSearchCandidateState : {
      sourceDocId: docId,
      allCandidates: [],
      topLevelCandidates: [],
      childCandidateMap: {},
    }),
    [docId, sdkSearchCandidateState]
  );
  const isSlashMode = searchModeActive && searchQuery.startsWith('/');
  const textNeedle = searchQuery.toLocaleLowerCase();
  const slashSegmentNeedle = searchQuery.slice(searchQuery.lastIndexOf('/') + 1).toLocaleLowerCase();
  const slashScopePath = useMemo(
    () => (sdkSearchCandidates.sourceDocId === docId ? slashScopePathNoteIds : []),
    [docId, sdkSearchCandidates.sourceDocId, slashScopePathNoteIds]
  );
  const slashScopeParentNoteId = slashScopePath.at(-1) ?? null;

  const textResults = useMemo(() => {
    if (searchQuery.length === 0) {
      return sdkSearchCandidates.allCandidates;
    }
    return sdkSearchCandidates.allCandidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(textNeedle));
  }, [sdkSearchCandidates.allCandidates, searchQuery.length, textNeedle]);

  const slashScopeCandidates = useMemo(
    () => {
      if (!slashScopeParentNoteId) {
        return sdkSearchCandidates.topLevelCandidates;
      }
      const scopedCandidates = sdkSearchCandidates.childCandidateMap[slashScopeParentNoteId];
      return scopedCandidates ?? sdkSearchCandidates.topLevelCandidates;
    },
    [sdkSearchCandidates.childCandidateMap, sdkSearchCandidates.topLevelCandidates, slashScopeParentNoteId]
  );

  const slashResults = useMemo(() => {
    if (slashSegmentNeedle.length === 0) {
      return slashScopeCandidates;
    }
    return slashScopeCandidates.filter((candidate) => (
      candidate.text.toLocaleLowerCase().includes(slashSegmentNeedle)
    ));
  }, [slashScopeCandidates, slashSegmentNeedle]);

  const flatResults = isSlashMode ? slashResults : textResults;
  const noteTextById = useMemo(() => {
    const textById: Record<string, string> = {};
    for (const candidate of sdkSearchCandidates.allCandidates) {
      textById[candidate.noteId] = candidate.text;
    }
    for (const candidate of sdkSearchCandidates.topLevelCandidates) {
      if (textById[candidate.noteId] === undefined) {
        textById[candidate.noteId] = candidate.text;
      }
    }
    return textById;
  }, [sdkSearchCandidates.allCandidates, sdkSearchCandidates.topLevelCandidates]);

  const isFlatResultsActive = searchModeActive;
  const navigationCandidates = useMemo(
    () => (isFlatResultsActive ? flatResults : []),
    [flatResults, isFlatResultsActive]
  );
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
        ? searchQuery.split('/').length - 1
        : 0;
      const nextSlashCount = nextSearchQuery.split('/').length - 1;
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

  const syncSlashSearchQuery = useCallback((nextHighlightedNoteId: string) => {
    const nextPathSegments = [...slashScopePath, nextHighlightedNoteId].map((noteId) => noteTextById[noteId] ?? '');
    const nextSearchQuery = `/${nextPathSegments.join('/')}`;
    if (nextSearchQuery === searchQuery) {
      return;
    }

    applySearchQuery(nextSearchQuery, {
      preserveHighlight: true,
      forceCaretAtEnd: true,
    });
  }, [applySearchQuery, noteTextById, searchQuery, slashScopePath]);

  const moveSearchHighlight = (direction: 'up' | 'down') => {
    if (navigationCandidates.length === 0) {
      setHighlightedNoteId(null);
      return;
    }

    let nextHighlightedNoteId: string;
    if (highlightedNoteId) {
      const currentIndex = navigationCandidates.findIndex((candidate) => candidate.noteId === highlightedNoteId);
      if (currentIndex === -1) {
        nextHighlightedNoteId = navigationCandidates[0]!.noteId;
      } else {
        const delta = direction === 'down' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(navigationCandidates.length - 1, currentIndex + delta));
        nextHighlightedNoteId = navigationCandidates[nextIndex]!.noteId;
      }
    } else {
      nextHighlightedNoteId = navigationCandidates[0]!.noteId;
    }

    setHighlightedNoteId(nextHighlightedNoteId);
    if (isSlashMode) {
      syncSlashSearchQuery(nextHighlightedNoteId);
    }
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

    const highlightedCandidate = highlightedNoteId
      ? navigationCandidates.find((candidate) => candidate.noteId === highlightedNoteId) ?? null
      : null;

    if (!highlightedCandidate) {
      return;
    }
    setZoomNoteId(highlightedCandidate.noteId);
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

  return (
    <div className="document-editor-shell" ref={shellRef}>
      <header className="document-header">
        <div className="document-header-breadcrumbs">
          <ZoomBreadcrumbs
            docLabel={docId}
            documentControl={(
              <Combobox
                offset={{ mainAxis: 4, crossAxis: -44 }}
                onOptionSubmit={(value) => {
                  setDocumentId(value);
                  documentPicker.closeDropdown();
                }}
                position="bottom-start"
                shadow="md"
                store={documentPicker}
                withinPortal={false}
              >
                <Combobox.Target>
                  <ActionIcon
                    aria-label="Choose document"
                    className="document-header-doc-menu remdo-interaction-surface"
                    disabled={documentOptions.length === 0}
                    onClick={() => documentPicker.toggleDropdown()}
                    size="sm"
                    variant="subtle"
                  >
                    <IconChevronDown aria-hidden="true" size={14} />
                  </ActionIcon>
                </Combobox.Target>
                <Combobox.Dropdown className="document-header-doc-dropdown">
                  <Combobox.Options>
                    {documentOptions.map((document) => (
                      <Combobox.Option
                        active={document.value === docId}
                        key={document.value}
                        value={document.value}
                      >
                        {document.label}
                      </Combobox.Option>
                    ))}
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            )}
            path={zoomPath}
            onSelectNoteId={setZoomNoteId}
          />
        </div>
        <div className="document-header-actions">
          <div className="document-header-search-shell">
            <TextInput
              aria-label="Search document"
              className="document-header-search remdo-interaction-surface"
              ref={searchInputRef}
              leftSection={<IconSearch aria-hidden="true" size={14} />}
              onBlur={handleSearchBlur}
              onChange={handleSearchChange}
              onCompositionEnd={handleSearchCompositionEnd}
              onCompositionStart={handleSearchCompositionStart}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              onSelect={handleSearchSelect}
              placeholder={searchModeActive ? '' : 'Search'}
              size="xs"
              value={searchQuery}
            />
            {inlineCompletionVisible ? (
              <div
                aria-hidden="true"
                className="document-header-search-inline-completion"
                data-inline-completion-hint={inlineCompletionHint}
                data-inline-completion-text={inlineCompletionText}
                data-testid="document-search-inline-completion"
              >
                <span className="document-header-search-inline-prefix">{searchQuery}</span>
                <span className="document-header-search-inline-suffix">{inlineCompletionText}</span>
                <span className="document-header-search-inline-hint">{inlineCompletionHint}</span>
              </div>
            ) : null}
          </div>
          <div className="document-header-status" ref={setStatusHost} />
        </div>
      </header>
      {isFlatResultsActive ? (
        <section
          className="document-search-results"
          data-search-mode={isSlashMode ? 'slash' : 'text'}
          data-testid="document-search-results"
        >
          {flatResults.length > 0 ? (
            <ol className="document-search-results-list">
              {flatResults.map((result) => (
                <li
                  key={result.noteId}
                  className="document-search-results-item"
                  data-search-result-active={result.noteId === highlightedResultNoteId ? 'true' : undefined}
                  data-search-result-item
                >
                  {result.text.length > 0 ? result.text : '(empty note)'}
                </li>
              ))}
            </ol>
          ) : (
            <p className="document-search-results-empty">
              {searchQuery.length > 0 ? 'No matches' : 'No notes'}
            </p>
          )}
        </section>
      ) : null}
      <div className={isFlatResultsActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
        <Editor
          key={docId}
          docId={docId}
          onSearchCandidatesChange={handleSdkSearchCandidatesChange}
          onZoomNoteIdChange={setZoomNoteId}
          onZoomPathChange={setZoomPath}
          searchHighlightedNoteId={null}
          searchModeActive={false}
          statusPortalRoot={statusHost}
          zoomNoteId={zoomNoteId}
        />
      </div>
    </div>
  );
}
