import type {
  ChangeEvent,
  CompositionEvent,
  FocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from 'react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActionIcon, Combobox, TextInput, useCombobox } from '@mantine/core';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { createHardcodedUserConfigNoteSdk } from '@/editor/outline/sdk';
import { ROOT_SEARCH_SCOPE_ID } from '@/editor/search/sdk-search-candidates';
import type { SdkSearchCandidateSnapshot } from '@/editor/search/sdk-search-candidates';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPathForPathname, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import './DocumentRoute.css';

interface SearchCandidate {
  noteId: string;
  text: string;
}

const EMPTY_SNAPSHOT: SdkSearchCandidateSnapshot = {
  allCandidates: [],
  childCandidateMap: {},
};

function clampHighlight(
  results: SearchCandidate[],
  highlightedNoteId: string | null,
  direction: 'up' | 'down'
): string | null {
  if (results.length === 0) {
    return null;
  }
  const currentIndex = highlightedNoteId
    ? results.findIndex((result) => result.noteId === highlightedNoteId)
    : -1;
  const baseIndex = Math.max(currentIndex, 0);
  const delta = direction === 'down' ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(results.length - 1, baseIndex + delta));
  return results[nextIndex]?.noteId ?? null;
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchResultsListboxId = useId();
  const zoomNoteId = parsedRef?.noteId ?? null;
  const sdk = useMemo(() => createHardcodedUserConfigNoteSdk(), []);
  const [searchModeActive, setSearchModeActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedNoteId, setHighlightedNoteId] = useState<string | null>(null);
  const [slashScopePath, setSlashScopePath] = useState<string[]>([]);
  const [searchSnapshot, setSearchSnapshot] = useState<SdkSearchCandidateSnapshot>(EMPTY_SNAPSHOT);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [composing, setComposing] = useState(false);

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
    editorInput.focus();
    return document.activeElement === editorInput;
  }, []);

  const isSlashMode = searchModeActive && searchQuery.startsWith('/');
  const slashScopeParentNoteId = slashScopePath.at(-1) ?? ROOT_SEARCH_SCOPE_ID;
  const flatResults = useMemo(() => {
    if (isSlashMode) {
      const slashNeedle = searchQuery.slice(searchQuery.lastIndexOf('/') + 1).toLocaleLowerCase();
      const scopeCandidates = searchSnapshot.childCandidateMap[slashScopeParentNoteId] ?? [];
      if (slashNeedle.length === 0) {
        return scopeCandidates;
      }
      return scopeCandidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(slashNeedle));
    }

    const textNeedle = searchQuery.toLocaleLowerCase();
    if (textNeedle.length === 0) {
      return searchSnapshot.allCandidates;
    }
    return searchSnapshot.allCandidates.filter((candidate) => candidate.text.toLocaleLowerCase().includes(textNeedle));
  }, [isSlashMode, searchQuery, searchSnapshot, slashScopeParentNoteId]);

  const activeHighlightedNoteId = highlightedNoteId && flatResults.some((result) => result.noteId === highlightedNoteId)
    ? highlightedNoteId
    : (flatResults[0]?.noteId ?? null);

  const inlineCompletion = useMemo(() => {
    if (!searchModeActive) {
      return { text: '', hint: '' };
    }
    if (searchQuery.length === 0) {
      return { text: '/', hint: '→' };
    }
    if (!isSlashMode) {
      return { text: '', hint: '' };
    }

    const source = (activeHighlightedNoteId && flatResults.find((result) => result.noteId === activeHighlightedNoteId)) ?? flatResults[0];
    if (!source) {
      return { text: '', hint: '' };
    }

    const segment = searchQuery.slice(searchQuery.lastIndexOf('/') + 1);
    if (segment.length > source.text.length || !source.text.startsWith(segment)) {
      return { text: '', hint: '' };
    }

    if (segment.length < source.text.length) {
      return { text: source.text.slice(segment.length), hint: '→' };
    }

    const hasChildren = (searchSnapshot.childCandidateMap[source.noteId]?.length ?? 0) > 0;
    return hasChildren ? { text: '/', hint: '→' } : { text: '', hint: '' };
  }, [activeHighlightedNoteId, flatResults, isSlashMode, searchModeActive, searchQuery, searchSnapshot.childCandidateMap]);

  const caretAtEnd = selection.start === selection.end && selection.end === searchQuery.length;
  const inlineCompletionVisible = inlineCompletion.text.length > 0 && !composing && caretAtEnd;

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

  const onSearchCandidatesChange = useCallback((snapshot: SdkSearchCandidateSnapshot) => {
    setSearchSnapshot(snapshot);
    setSlashScopePath([]);
  }, []);

  const onSearchFocus = (event: FocusEvent<HTMLInputElement>) => {
    setSearchModeActive(true);
    const target = event.currentTarget;
    setSelection({ start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0 });
  };

  const onSearchBlur = () => {
    setSearchModeActive(false);
    setSlashScopePath([]);
    setSelection({ start: 0, end: 0 });
    setComposing(false);
  };

  const onSearchSelect = (event: SyntheticEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    setSelection({ start: target.selectionStart ?? 0, end: target.selectionEnd ?? 0 });
  };

  const onSearchCompositionStart = (_event: CompositionEvent<HTMLInputElement>) => {
    setComposing(true);
  };

  const onSearchCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    setComposing(false);
    setSelection({ start: event.currentTarget.selectionStart ?? 0, end: event.currentTarget.selectionEnd ?? 0 });
  };

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.currentTarget.value;
    const previousSlashCount = searchQuery.split('/').length - 1;
    const nextSlashCount = nextQuery.split('/').length - 1;

    if (!nextQuery.startsWith('/')) {
      setSlashScopePath([]);
    } else if (searchQuery.startsWith('/') && nextQuery.endsWith('/') && nextSlashCount === previousSlashCount + 1 && activeHighlightedNoteId) {
      setSlashScopePath((current) => [...current, activeHighlightedNoteId]);
    } else {
      const depth = Math.max(0, nextSlashCount - 1);
      setSlashScopePath((current) => current.slice(0, depth));
    }

    setSearchQuery(nextQuery);
    setSelection({
      start: event.currentTarget.selectionStart ?? nextQuery.length,
      end: event.currentTarget.selectionEnd ?? nextQuery.length,
    });
  };

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedNoteId((current) => clampHighlight(flatResults, activeHighlightedNoteId ?? current, event.key === 'ArrowDown' ? 'down' : 'up'));
      return;
    }

    if (event.key === 'ArrowRight' && inlineCompletionVisible) {
      event.preventDefault();
      const nextQuery = `${searchQuery}${inlineCompletion.text}`;
      setSearchQuery(nextQuery);
      setSelection({ start: nextQuery.length, end: nextQuery.length });
      return;
    }

    if (event.key === 'Escape') {
      if (focusEditorInput()) {
        event.preventDefault();
      } else {
        event.currentTarget.blur();
      }
      return;
    }

    if (event.key === 'Enter') {
      if (searchQuery === '/') {
        event.preventDefault();
        setSearchModeActive(false);
        setSlashScopePath([]);
        setZoomNoteId(null);
        globalThis.setTimeout(() => {
          focusEditorInput();
        }, 0);
        return;
      }
      if (!activeHighlightedNoteId) {
        return;
      }
      event.preventDefault();
      setSearchModeActive(false);
      setSlashScopePath([]);
      setZoomNoteId(activeHighlightedNoteId);
      globalThis.setTimeout(() => {
        focusEditorInput();
      }, 0);
    }
  };

  const highlightedResultIndex = activeHighlightedNoteId
    ? flatResults.findIndex((result) => result.noteId === activeHighlightedNoteId)
    : -1;
  const activeResultOptionId = highlightedResultIndex >= 0
    ? `${searchResultsListboxId}-option-${highlightedResultIndex}`
    : undefined;

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
              aria-activedescendant={searchModeActive ? activeResultOptionId : undefined}
              aria-autocomplete={inlineCompletionVisible ? 'both' : 'list'}
              aria-controls={searchModeActive && flatResults.length > 0 ? searchResultsListboxId : undefined}
              aria-expanded={searchModeActive}
              aria-haspopup="listbox"
              className="document-header-search remdo-interaction-surface"
              leftSection={<IconSearch aria-hidden="true" size={14} />}
              onBlur={onSearchBlur}
              onChange={onSearchChange}
              onCompositionEnd={onSearchCompositionEnd}
              onCompositionStart={onSearchCompositionStart}
              onFocus={onSearchFocus}
              onKeyDown={onSearchKeyDown}
              onSelect={onSearchSelect}
              placeholder={searchModeActive ? '' : 'Search'}
              ref={searchInputRef}
              role="combobox"
              size="xs"
              value={searchQuery}
            />
            {inlineCompletionVisible ? (
              <div
                aria-hidden="true"
                className="document-header-search-inline-completion"
                data-inline-completion-hint={inlineCompletion.hint}
                data-inline-completion-text={inlineCompletion.text}
                data-testid="document-search-inline-completion"
              >
                <span className="document-header-search-inline-prefix">{searchQuery}</span>
                <span className="document-header-search-inline-suffix">{inlineCompletion.text}</span>
                <span className="document-header-search-inline-hint">{inlineCompletion.hint}</span>
              </div>
            ) : null}
          </div>
          <div className="document-header-status" ref={setStatusHost} />
        </div>
      </header>
      {searchModeActive ? (
        <section
          className="document-search-results"
          data-search-mode={isSlashMode ? 'slash' : 'text'}
          data-testid="document-search-results"
        >
          {flatResults.length > 0 ? (
            <ol
              aria-label="Search results"
              className="document-search-results-list"
              id={searchResultsListboxId}
              role="listbox"
            >
              {flatResults.map((result, index) => {
                const hasChildren = (searchSnapshot.childCandidateMap[result.noteId]?.length ?? 0) > 0;
                return (
                  <li
                    aria-selected={result.noteId === activeHighlightedNoteId}
                    className="document-search-results-item"
                    data-search-result-active={result.noteId === activeHighlightedNoteId ? 'true' : undefined}
                    data-search-result-has-children={hasChildren ? 'true' : undefined}
                    data-search-result-item
                    id={`${searchResultsListboxId}-option-${index}`}
                    key={result.noteId}
                    role="option"
                  >
                    {result.text.length > 0 ? result.text : '(empty note)'}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="document-search-results-empty">{searchQuery.length > 0 ? 'No matches' : 'No notes'}</p>
          )}
        </section>
      ) : null}
      <div className={searchModeActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
        <Editor
          key={docId}
          docId={docId}
          onSearchCandidatesChange={onSearchCandidatesChange}
          onZoomNoteIdChange={setZoomNoteId}
          onZoomPathChange={setZoomPath}
          statusPortalRoot={statusHost}
          zoomNoteId={zoomNoteId}
        />
      </div>
    </div>
  );
}
