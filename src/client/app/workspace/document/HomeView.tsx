import { TextInput, VisuallyHidden } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DocumentNote } from '#note-sdk';
import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { tokenizeQuery } from '#client/search/query-match';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import { useDocumentSearchShortcut } from '../useDocumentSearchShortcut';
import { DocumentMenu } from './DocumentMenu';
import { useDocumentDialogs } from './useDocumentDialogs';
import { filterHomeSources } from './home-content';
import type { HomeDocumentEntry, HomeDocumentSource } from './home-content';

export interface HomeViewProps {
  focusSearchRequested?: boolean;
  sources: readonly HomeDocumentSource[];
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
}

function DocumentGroup({
  label,
  documents,
  activeId,
  onSelectDocument,
  onDelete,
  onRename,
  onShare,
  resolveDocument,
  menuTargetId,
  onMenuTarget,
}: {
  label: string;
  documents: readonly HomeDocumentEntry[];
  activeId: string | null;
  onSelectDocument: (docId: string) => void;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  resolveDocument: (docId: string) => DocumentNote | null;
  menuTargetId: string | null;
  onMenuTarget: (docId: string) => void;
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((document) => {
          const note = resolveDocument(document.id);
          const label = formatNavigationLabel(document.label);
          const shared = note !== null && !note.canShareWith();
          const sharedId = `home-doc-shared-${document.id}`;
          return (
            <li
              className="home-doc-row"
              data-menu-target={document.id === menuTargetId ? true : undefined}
              data-search-active={document.id === activeId ? true : undefined}
              key={document.id}
              onFocus={() => onMenuTarget(document.id)}
              onKeyDownCapture={() => onMenuTarget(document.id)}
              onPointerMove={(event) => {
                if (event.pointerType !== 'touch') onMenuTarget(document.id);
              }}
            >
              {note && (
                <DocumentMenu label={label} note={note} onDelete={onDelete} onRename={onRename} onShare={onShare} />
              )}
              <button
                aria-describedby={shared ? sharedId : undefined}
                className="home-doc remdo-interaction-surface"
                data-home-document-ref={document.id}
                id={`home-doc-link-${document.id}`}
                onClick={() => onSelectDocument(document.id)}
                type="button"
              >
                <span className="home-doc-label">{label}</span>
                {shared && <span aria-hidden="true" className="home-doc-shared">Shared</span>}
              </button>
              {shared && <span hidden id={sharedId}>Shared with you</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HomeView({
  focusSearchRequested = false,
  onCreateDocument,
  onSelectDocument,
  onUploadDocument,
  resolveDocument,
  sources,
}: HomeViewProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const homeRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const searchComposingRef = useRef(false);
  const arrivalFocusSettledRef = useRef(false);
  const listId = useId();
  const coarsePointer = useCoarsePointer();
  const { documentDialog, openDelete, openRename, openShare } = useDocumentDialogs(headingRef);
  const [query, setQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const hasDocuments = sources.some((source) => source.documents.length > 0);
  const visibleSources = filterHomeSources(sources, query);
  const matchIds = visibleSources.flatMap((source) => source.documents.map((document) => document.id));
  const hasQuery = tokenizeQuery(query).length > 0;
  const activeId = highlightedId !== null && matchIds.includes(highlightedId)
    ? highlightedId
    : hasQuery ? matchIds[0] ?? null : null;
  const menuDocumentIds = matchIds.filter((docId) => {
    const note = resolveDocument(docId);
    return note && (note.canRename() || note.canShareWith() || note.canDelete());
  });
  const [menuTarget, setMenuTarget] = useState<string | null>(null);
  const menuTargetId = menuTarget !== null && menuDocumentIds.includes(menuTarget)
    ? menuTarget
    : menuDocumentIds[0] ?? null;
  if (menuTarget !== menuTargetId) setMenuTarget(menuTargetId);

  const targetDocument = (docId: string) => {
    if (documentDialog || homeRef.current?.querySelector('.document-menu-button[aria-expanded="true"]')) return;
    if (menuDocumentIds.includes(docId)) setMenuTarget(docId);
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The field is absent until the listing arrives, so arrival focus waits for it
  // and takes focus only while nothing else has claimed it.
  useEffect(() => {
    const search = searchRef.current;
    if (!search || arrivalFocusSettledRef.current) return;
    arrivalFocusSettledRef.current = true;
    const focusIsFree = document.activeElement === document.body || document.activeElement === headingRef.current;
    if (focusSearchRequested || (!coarsePointer && focusIsFree)) search.focus();
  }, [coarsePointer, focusSearchRequested, hasDocuments]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);
  useDocumentSearchShortcut(hasDocuments ? focusSearch : null);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value);
    setHighlightedId(null);
  };

  const moveHighlight = (delta: 1 | -1) => {
    if (matchIds.length === 0) return;
    const index = activeId === null ? -1 : matchIds.indexOf(activeId);
    if (index === -1 && delta === -1) return;
    setHighlightedId(matchIds[Math.max(0, Math.min(matchIds.length - 1, index + delta))]!);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || searchComposingRef.current) return;
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeId !== null) onSelectDocument(activeId);
    } else if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
      setHighlightedId(null);
    }
  };

  useEffect(() => {
    homeRef.current?.querySelector('[data-search-active]')?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const handleUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = '';
    if (file) {
      onUploadDocument(file);
    }
  };

  return (
    <section aria-label="Home" className="document-home" data-testid="document-home" ref={homeRef}>
      <div className="home-header">
        <h1 className="document-home-title" ref={headingRef} tabIndex={-1}>Home</h1>
        <div className="home-actions">
          <button
            className="remdo-account-button"
            onClick={() => uploadInputRef.current?.click()}
            type="button"
          >
            Upload document
          </button>
          <button
            className="remdo-account-button remdo-account-button-primary"
            onClick={onCreateDocument}
            type="button"
          >
            New document
          </button>
          <input
            accept="application/json,.json"
            aria-label="Upload document"
            className="home-upload-input"
            onChange={handleUploadInputChange}
            ref={uploadInputRef}
            type="file"
          />
        </div>
      </div>

      {hasDocuments && (
        <>
          <TextInput
            aria-activedescendant={activeId === null ? undefined : `home-doc-link-${activeId}`}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded
            aria-label="Search documents"
            className="home-search remdo-interaction-surface"
            leftSection={<IconSearch aria-hidden="true" size={16} />}
            onChange={handleSearchChange}
            onCompositionEnd={() => { searchComposingRef.current = false; }}
            onCompositionStart={() => { searchComposingRef.current = true; }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search documents"
            ref={searchRef}
            role="combobox"
            value={query}
          />
          <VisuallyHidden role="status">
            {hasQuery ? `${matchIds.length} ${matchIds.length === 1 ? 'document' : 'documents'}` : ''}
          </VisuallyHidden>
        </>
      )}

      <div id={listId}>
        {hasQuery && hasDocuments && matchIds.length === 0 && (
          <p className="home-search-empty">No documents match</p>
        )}
        {visibleSources
          .filter((source) => source.documents.length > 0)
          .map((source) => (
            <DocumentGroup
              activeId={activeId}
              documents={source.documents}
              key={source.id}
              label={source.label}
              onDelete={openDelete}
              onRename={openRename}
              onSelectDocument={onSelectDocument}
              onShare={openShare}
              resolveDocument={resolveDocument}
              menuTargetId={menuTargetId}
              onMenuTarget={targetDocument}
            />
          ))}
      </div>

      {documentDialog}
    </section>
  );
}
