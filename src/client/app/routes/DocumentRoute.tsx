import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActionIcon, Alert, Combobox, TextInput, useCombobox } from '@mantine/core';
import { IconChevronDown, IconPlus, IconSearch } from '@tabler/icons-react';
import { useLoaderData, useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentSourcesLoading, useUserData } from '#client/app/documents/user-data';
import Editor from '#client/editor/Editor';
import { ZoomBreadcrumbs } from '#client/editor/zoom/ZoomBreadcrumbs';
import { EditorViewProvider, useEditorViewActions, useZoomPath } from '#client/editor/view/EditorViewProvider';
import { createDocumentPath, createDocumentSyncTokenApiPath, parseDocumentRef } from '#document-routes';
import type { ParsedDocumentRef } from '#document-routes';
import type { DocumentSourceNote } from '#note-sdk';
import {
  APP_TITLE,
  formatNavigationLabel,
} from '#client/ui/navigation-label';
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

const NEW_DOCUMENT_VALUE = '$new-document';

interface DocumentLocator {
  docId: string;
}

type LocalDocumentAccessProbe = 'idle' | 'checking' | 'authorized' | 'rejected';

function readOnlineState(): boolean {
  return globalThis.navigator.onLine;
}

function useOnlineState(): boolean {
  const [online, setOnline] = useState(readOnlineState);

  useEffect(() => {
    const handleOnlineStateChange = () => {
      setOnline(readOnlineState());
    };

    globalThis.addEventListener('online', handleOnlineStateChange);
    globalThis.addEventListener('offline', handleOnlineStateChange);
    return () => {
      globalThis.removeEventListener('online', handleOnlineStateChange);
      globalThis.removeEventListener('offline', handleOnlineStateChange);
    };
  }, []);

  return online;
}

function useDocumentRouteNavigation(docId: string) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const navigateToDocument = useCallback((nextDocument: DocumentLocator) => {
    if (nextDocument.docId === docId) {
      return;
    }
    const nextSearch = searchParams.toString();
    void navigate({
      pathname: createDocumentPath(nextDocument.docId),
      search: nextSearch ? `?${nextSearch}` : '',
    });
  }, [docId, navigate, searchParams]);

  const navigateToZoomNote = useCallback((noteId: string | null) => {
    const nextSearch = searchParams.toString();
    void navigate(
      {
        pathname: createDocumentPath(docId, noteId),
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [docId, navigate, searchParams]);

  return { navigateToDocument, navigateToZoomNote };
}

function findDocumentSourceByDocumentId(
  documentSources: readonly DocumentSourceNote[],
  docId: string
): DocumentSourceNote | null {
  return documentSources.find((source) => source.documents().byId(docId)) ?? null;
}

function useLocalDocumentAccessProbe(docId: string, enabled: boolean): LocalDocumentAccessProbe {
  const [result, setResult] = useState<{ docId: string; status: LocalDocumentAccessProbe }>({
    docId: '',
    status: 'checking',
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const abortController = new AbortController();
    void fetch(createDocumentSyncTokenApiPath(docId), {
      body: JSON.stringify({ docId }),
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: abortController.signal,
    })
      .then((response) => {
        setResult({ docId, status: response.ok ? 'authorized' : 'rejected' });
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          setResult({ docId, status: 'rejected' });
        }
      });

    return () => {
      abortController.abort();
    };
  }, [docId, enabled]);

  if (!enabled) {
    return 'idle';
  }
  if (result.docId !== docId) {
    return 'checking';
  }
  return result.status;
}

export default function DocumentRoute() {
  const parsedRef = useLoaderData<ParsedDocumentRef>();
  const docId = parsedRef.docId;
  const [statusHost, setStatusHost] = useState<HTMLDivElement | null>(null);
  const zoomNoteId = parsedRef.noteId;
  const { navigateToDocument, navigateToZoomNote } = useDocumentRouteNavigation(docId);

  return (
    <EditorViewProvider
      docId={docId}
      onZoomNoteIdChange={navigateToZoomNote}
      zoomNoteId={zoomNoteId}
    >
      <DocumentRouteContent
        docId={docId}
        onSelectDocument={navigateToDocument}
        setStatusHost={setStatusHost}
        statusHost={statusHost}
      />
    </EditorViewProvider>
  );
}

function DocumentRouteContent({
  docId,
  onSelectDocument,
  statusHost,
  setStatusHost,
}: {
  docId: string;
  onSelectDocument: (document: DocumentLocator) => void;
  statusHost: HTMLDivElement | null;
  setStatusHost: (value: HTMLDivElement | null) => void;
}) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultsRef = useRef<HTMLElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchResultsListboxId = useId();
  const zoomPath = useZoomPath();
  const { requestZoomNoteId } = useEditorViewActions();
  const userData = useUserData();
  const documentSourcesLoading = useDocumentSourcesLoading();
  const online = useOnlineState();
  const [createDocumentError, setCreateDocumentError] = useState<string | null>(null);
  const documentSources = userData.documentSources().children();
  const currentDocumentSource = findDocumentSourceByDocumentId(documentSources, docId);
  const localDocumentSource = documentSources.find((source) => source.local()) ?? null;
  const localDocumentExists = Boolean(localDocumentSource?.documents().byId(docId));
  const sourceResolutionAmbiguous = online && documentSourcesLoading && !localDocumentExists && !currentDocumentSource;
  const localDocumentAccessProbe = useLocalDocumentAccessProbe(docId, sourceResolutionAmbiguous);
  const documentSourceResolutionPending = sourceResolutionAmbiguous && localDocumentAccessProbe !== 'authorized';
  const currentDocument = currentDocumentSource?.documents().children()
    .find((document) => document.id() === docId) ?? null;
  const currentDocumentSourceOrigin = currentDocumentSource?.baseUrl() ?? null;
  const currentDocumentSourceId = currentDocumentSource?.local() === false ? currentDocumentSource.id() : null;
  const documentLabelRaw = currentDocument?.text() ?? docId;
  const documentLabel = formatNavigationLabel(documentLabelRaw);
  const titleItem = zoomPath.at(-1) ?? null;
  const pageTitle = titleItem
    ? `${formatNavigationLabel(titleItem.label)} · ${documentLabel} · ${APP_TITLE}`
    : `${documentLabel} · ${APP_TITLE}`;
  const documentPicker = useCombobox({
    onDropdownClose: () => documentPicker.resetSelectedOption(),
  });

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
    setZoomNoteId: requestZoomNoteId,
  });

  useEffect(() => {
    document.title = pageTitle;
    return () => {
      document.title = APP_TITLE;
    };
  }, [pageTitle]);

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

  const createDocument = async () => {
    try {
      const nextDocument = await userData.documents().create('New Document');
      setCreateDocumentError(null);
      onSelectDocument({ docId: nextDocument.id() });
    } catch (error) {
      setCreateDocumentError(error instanceof Error ? error.message : 'Failed to create document.');
    }
  };

  const documentGroups = useMemo(() => documentSources.map((source) => ({
    id: source.id(),
    label: source.text(),
    options: source.documents().children().map((document) => ({
      active: document.id() === docId && source.id() === currentDocumentSource?.id(),
      label: formatNavigationLabel(document.text()),
      value: document.id(),
    })),
  })).filter((source) => source.options.length > 0), [currentDocumentSource, docId, documentSources]);
  const documentOptionsCount = documentGroups.reduce((count, group) => count + group.options.length, 0);

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
            docLabel={documentLabelRaw}
            documentControl={(
              <Combobox
                offset={{ mainAxis: 4, crossAxis: -44 }}
                onOptionSubmit={(value) => {
                  documentPicker.closeDropdown();
                  if (value === NEW_DOCUMENT_VALUE) {
                    void createDocument();
                    return;
                  }
                  const selected = parseDocumentRef(value);
                  if (selected) {
                    onSelectDocument({ docId: selected.docId });
                  }
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
                    disabled={documentOptionsCount === 0}
                    onClick={() => documentPicker.toggleDropdown()}
                    size="sm"
                    variant="subtle"
                  >
                    <IconChevronDown aria-hidden="true" size={14} />
                  </ActionIcon>
                </Combobox.Target>
                <Combobox.Dropdown className="document-header-doc-dropdown">
                  <Combobox.Options>
                    {documentGroups.map((group) => (
                      <Combobox.Group
                        data-document-source-id={group.id}
                        key={group.id}
                        label={group.label}
                      >
                        {group.options.map((document) => (
                          <Combobox.Option
                            active={document.active}
                            data-document-ref={document.value}
                            key={`${group.id}:${document.value}`}
                            value={document.value}
                          >
                            {document.label}
                          </Combobox.Option>
                        ))}
                      </Combobox.Group>
                    ))}
                    <div aria-hidden="true" className="document-header-doc-divider document-header-doc-divider--dark-5" />
                    <Combobox.Option value={NEW_DOCUMENT_VALUE}>
                      <span className="document-header-doc-action">
                        <IconPlus aria-hidden="true" size={14} />
                        <span>New</span>
                      </span>
                    </Combobox.Option>
                  </Combobox.Options>
                </Combobox.Dropdown>
              </Combobox>
            )}
            path={zoomPath}
            onSelectNoteId={requestZoomNoteId}
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
      {createDocumentError && (
        <Alert
          closeButtonLabel="Dismiss"
          color="red"
          onClose={() => setCreateDocumentError(null)}
          title="Could not create document"
          withCloseButton
        >
          {createDocumentError}
        </Alert>
      )}
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
      {documentSourceResolutionPending ? (
        <div className={searchModeActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
          <section className="document-editor-loading" role="status">
            Loading document
          </section>
        </div>
      ) : (
        <div className={searchModeActive ? 'document-editor-pane document-editor-pane--hidden' : 'document-editor-pane'}>
          <Editor
            key={`${currentDocumentSourceId ?? 'local'}:${docId}`}
            docId={docId}
            sourceOrigin={currentDocumentSourceOrigin}
            sourceId={currentDocumentSourceId}
            onSearchCandidatesChange={handleSearchCandidatesChange}
            searchModeRequested={searchModeRequested}
            statusPortalRoot={statusHost}
          />
        </div>
      )}
    </div>
  );
}
