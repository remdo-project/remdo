import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActionIcon, Combobox, TextInput, useCombobox } from '@mantine/core';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { createHardcodedUserConfigNoteSdk } from '@/editor/outline/sdk';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPathForPathname, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import './DocumentRoute.css';

interface SearchCandidate {
  noteId: string;
  text: string;
  visible: boolean;
}

const SEARCHABLE_NOTE_SELECTOR = '.editor-input li.list-item:not(.list-nested-item)[data-note-id]';

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

function collectSearchCandidates(root: ParentNode | null): SearchCandidate[] {
  if (!root) {
    return [];
  }
  const elements = Array.from(root.querySelectorAll<HTMLElement>(SEARCHABLE_NOTE_SELECTOR));
  const seen = new Set<string>();
  const candidates: SearchCandidate[] = [];

  for (const element of elements) {
    const noteId = element.dataset.noteId;
    if (!noteId || seen.has(noteId)) {
      continue;
    }
    seen.add(noteId);
    candidates.push({
      noteId,
      text: element.textContent,
      visible: isVisibleInCurrentView(element),
    });
  }

  return candidates;
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
  const [searchCandidates, setSearchCandidates] = useReducer(
    (_current: SearchCandidate[], next: SearchCandidate[]) => next,
    []
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pendingEditorFocusAfterSearchExitRef = useRef(false);
  const previousSearchModeRef = useRef(false);
  const previousSearchQueryRef = useRef(searchQuery);
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

  const refreshSearchCandidates = useCallback(() => {
    setSearchCandidates(collectSearchCandidates(shellRef.current));
  }, []);

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

  useEffect(() => {
    if (!searchModeActive) {
      setSearchCandidates([]);
      return;
    }

    let observedEditorInput: HTMLElement | null = null;
    let editorObserver: MutationObserver | null = null;

    const disconnectEditorObserver = () => {
      if (editorObserver) {
        editorObserver.disconnect();
        editorObserver = null;
      }
      observedEditorInput = null;
    };

    const attachEditorObserver = (editorInput: HTMLElement) => {
      if (observedEditorInput === editorInput) {
        return;
      }

      disconnectEditorObserver();
      observedEditorInput = editorInput;
      editorObserver = new MutationObserver(() => {
        refreshSearchCandidates();
      });
      editorObserver.observe(editorInput, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'data-folded', 'data-note-id'],
      });
    };

    const updateEditorObservation = () => {
      const editorInput = shellRef.current?.querySelector<HTMLElement>('.editor-input') ?? null;
      if (!editorInput) {
        disconnectEditorObserver();
        return;
      }
      attachEditorObserver(editorInput);
    };

    refreshSearchCandidates();
    updateEditorObservation();

    const shell = shellRef.current;
    if (!shell) {
      return () => {
        disconnectEditorObserver();
      };
    }

    const shellObserver = new MutationObserver(() => {
      const nextEditorInput = shell.querySelector<HTMLElement>('.editor-input') ?? null;
      if (nextEditorInput !== observedEditorInput) {
        updateEditorObservation();
        refreshSearchCandidates();
      }
    });

    shellObserver.observe(shell, {
      subtree: true,
      childList: true,
    });

    return () => {
      shellObserver.disconnect();
      disconnectEditorObserver();
    };
  }, [docId, refreshSearchCandidates, searchModeActive]);

  const flatResults = useMemo(() => {
    if (searchQuery.length === 0) {
      return [] as SearchCandidate[];
    }
    const needle = searchQuery.toLocaleLowerCase();
    return searchCandidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(needle));
  }, [searchCandidates, searchQuery]);

  const visibleCandidates = useMemo(
    () => searchCandidates.filter((candidate) => candidate.visible),
    [searchCandidates]
  );

  const isFlatResultsActive = searchModeActive && searchQuery.length > 0;
  const navigationCandidates = isFlatResultsActive ? flatResults : visibleCandidates;

  useEffect(() => {
    const modeEntered = searchModeActive && !previousSearchModeRef.current;
    const queryChanged = previousSearchQueryRef.current !== searchQuery;
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
      queryChanged ||
      !highlightedNoteId ||
      !navigationCandidates.some((candidate) => candidate.noteId === highlightedNoteId)
    ) {
      setHighlightedNoteId(navigationCandidates[0]!.noteId);
    }
  }, [highlightedNoteId, navigationCandidates, searchModeActive, searchQuery]);

  const moveSearchHighlight = (direction: 'up' | 'down') => {
    if (navigationCandidates.length === 0) {
      setHighlightedNoteId(null);
      return;
    }

    if (!highlightedNoteId) {
      setHighlightedNoteId(navigationCandidates[0]!.noteId);
      return;
    }

    const currentIndex = navigationCandidates.findIndex((candidate) => candidate.noteId === highlightedNoteId);
    if (currentIndex === -1) {
      setHighlightedNoteId(navigationCandidates[0]!.noteId);
      return;
    }

    const delta = direction === 'down' ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(navigationCandidates.length - 1, currentIndex + delta));
    setHighlightedNoteId(navigationCandidates[nextIndex]!.noteId);
  };

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

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    if (!highlightedNoteId) {
      return;
    }
    setZoomNoteId(highlightedNoteId);
    setSearchModeActive(false);
    queueMicrotask(() => {
      focusEditorInput();
    });
  };

  const handleSearchFocus = () => {
    setSearchModeActive(true);
    refreshSearchCandidates();
  };

  const handleSearchBlur = () => {
    setSearchModeActive(false);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.currentTarget.value);
  };

  const highlightedResultNoteId = isFlatResultsActive ? highlightedNoteId : null;
  const editorSearchModeActive = searchModeActive && !isFlatResultsActive;

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
          <TextInput
            aria-label="Search document"
            className="document-header-search remdo-interaction-surface"
            ref={searchInputRef}
            leftSection={<IconSearch aria-hidden="true" size={14} />}
            onBlur={handleSearchBlur}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search"
            size="xs"
            value={searchQuery}
          />
          <div className="document-header-status" ref={setStatusHost} />
        </div>
      </header>
      {isFlatResultsActive ? (
        <section className="document-search-results" data-testid="document-search-results">
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
            <p className="document-search-results-empty">No matches</p>
          )}
        </section>
      ) : null}
      <div className={isFlatResultsActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
        <Editor
          key={docId}
          docId={docId}
          onZoomNoteIdChange={setZoomNoteId}
          onZoomPathChange={setZoomPath}
          searchHighlightedNoteId={editorSearchModeActive ? highlightedNoteId : null}
          searchModeActive={editorSearchModeActive}
          statusPortalRoot={statusHost}
          zoomNoteId={zoomNoteId}
        />
      </div>
    </div>
  );
}
