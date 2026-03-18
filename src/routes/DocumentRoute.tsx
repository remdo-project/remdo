import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActionIcon, Combobox, TextInput, useCombobox } from '@mantine/core';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getUserConfig } from '@/documents';
import Editor from '@/editor/Editor';
import type { NotePathItem } from '@/editor/outline/note-traversal';
import { ZoomBreadcrumbs } from '@/editor/zoom/ZoomBreadcrumbs';
import { createDocumentPathForPathname, DEFAULT_DOC_ID, parseDocumentRef } from '@/routing';
import { useDocumentSearchModel } from './useDocumentSearchModel';
import './DocumentRoute.css';

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
  const searchResultsRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchResultsListboxId = useId();
  const zoomNoteId = parsedRef?.noteId ?? null;
  const userConfigRoot = useMemo(() => getUserConfig(), []);
  const documentOptions = useMemo(
    () => userConfigRoot.documentList().children().map((document) => ({ value: document.id(), label: document.text() })),
    [userConfigRoot]
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

  const {
    childCandidateMap,
    flatResults,
    handleSearchBlur,
    handleSearchCandidatesChange,
    handleSearchChange,
    handleSearchCompositionEnd,
    handleSearchCompositionStart,
    handleSearchDismiss,
    handleSearchFocus,
    handleSearchKeyDown,
    handleSearchResultClick,
    handleSearchResultPointerDown,
    handleSearchSelect,
    highlightedResultNoteId,
    inlineCompletionHint,
    inlineCompletionText,
    inlineCompletionVisible,
    isSlashMode,
    searchModeActive,
    searchModeRequested,
    searchQuery,
  } = useDocumentSearchModel({
    docId,
    focusEditorInput,
    setZoomNoteId,
  });

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
    if (!searchModeActive) {
      return;
    }

    const handlePointerDownOutsideSearch = (event: PointerEvent) => {
      if (!event.isPrimary) {
        return;
      }
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (searchInputRef.current?.contains(target) || searchResultsRef.current?.contains(target)) {
        return;
      }

      handleSearchDismiss();
    };

    document.addEventListener('pointerdown', handlePointerDownOutsideSearch, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutsideSearch, true);
    };
  }, [handleSearchDismiss, searchModeActive]);

  const highlightedResultIndex = highlightedResultNoteId
    ? flatResults.findIndex((result) => result.noteId === highlightedResultNoteId)
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
              aria-controls={searchModeActive ? searchResultsListboxId : undefined}
              aria-expanded={searchModeActive}
              aria-haspopup="listbox"
              className="document-header-search remdo-interaction-surface"
              leftSection={<IconSearch aria-hidden="true" size={14} />}
              onBlur={handleSearchBlur}
              onChange={handleSearchChange}
              onCompositionEnd={handleSearchCompositionEnd}
              onCompositionStart={handleSearchCompositionStart}
              onFocus={handleSearchFocus}
              onKeyDown={handleSearchKeyDown}
              onSelect={handleSearchSelect}
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
      {searchModeActive ? (
        <section
          className="document-search-results"
          data-search-mode={isSlashMode ? 'slash' : 'text'}
          data-testid="document-search-results"
          ref={searchResultsRef}
        >
          <ol
            aria-label="Search results"
            className="document-search-results-list"
            id={searchResultsListboxId}
            role="listbox"
          >
            {flatResults.length > 0 ? flatResults.map((result, index) => {
              const hasChildren = (childCandidateMap[result.noteId]?.length ?? 0) > 0;
              return (
                <li
                  aria-selected={result.noteId === highlightedResultNoteId}
                  className="document-search-results-item"
                  data-search-result-active={result.noteId === highlightedResultNoteId ? 'true' : undefined}
                  data-search-result-has-children={hasChildren ? 'true' : undefined}
                  data-search-result-item
                  id={`${searchResultsListboxId}-option-${index}`}
                  key={result.noteId}
                  onClick={(event) => {
                    handleSearchResultClick(event, result.noteId);
                  }}
                  onPointerDown={(event) => {
                    handleSearchResultPointerDown(event, result.noteId);
                  }}
                  role="option"
                >
                  {result.text.length > 0 ? result.text : '(empty note)'}
                </li>
              );
            }) : (
              <li
                aria-disabled="true"
                aria-selected="false"
                className="document-search-results-empty"
                role="option"
              >
                {searchQuery.length > 0 ? 'No matches' : 'No notes'}
              </li>
            )}
          </ol>
        </section>
      ) : null}
      <div className={searchModeActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
        <Editor
          key={docId}
          docId={docId}
          onSearchCandidatesChange={handleSearchCandidatesChange}
          onZoomNoteIdChange={setZoomNoteId}
          onZoomPathChange={setZoomPath}
          searchModeRequested={searchModeRequested}
          statusPortalRoot={statusHost}
          zoomNoteId={zoomNoteId}
        />
      </div>
    </div>
  );
}
