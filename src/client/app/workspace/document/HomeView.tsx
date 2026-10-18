import { TextInput, VisuallyHidden } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DocumentNote, DocumentSourceNote } from '#note-sdk';
import { useCoarsePointer } from '#client/browser/useCoarsePointer';
import { matchesPathQuery, tokenizeQuery } from '#client/search/query-match';
import { formatNavigationLabel } from '#client/ui/navigation-label';
import { useDocumentSearchShortcut } from '../useDocumentSearchShortcut';
import { DocumentMenu } from './DocumentMenu';
import { useDocumentDialogs } from './useDocumentDialogs';

export interface HomeViewProps {
  focusSearchRequested?: boolean;
  sources: readonly DocumentSourceNote[];
  onSelectDocument: (docId: string) => void;
  onCreateDocument: () => void;
  onUploadDocument: (file: File) => void;
}

type ActiveInput = 'pointer' | 'keyboard';
type ActivationSource = ActiveInput | 'focus';
type LastInput = ActiveInput | 'touch';

const hasOpenMenu = (root: HTMLElement | null) => root?.querySelector('.document-menu-button[aria-expanded="true"]') != null;

const documentIdOf = (element: Element | null) => (
  element?.closest('.home-doc-row')?.querySelector<HTMLElement>('[data-home-document-ref]')?.dataset.homeDocumentRef
);

function filterHomeDocuments(documents: readonly DocumentNote[], query: string): DocumentNote[] {
  return documents.filter((document) => (
    matchesPathQuery([formatNavigationLabel(document.getText(), Number.POSITIVE_INFINITY)], query)
  ));
}

function DocumentGroup({
  label,
  documents,
  highlightId,
  highlightInput,
  onSelectDocument,
  onDelete,
  onRename,
  onShare,
  menuTargetId,
  onActivate,
}: {
  label: string;
  documents: readonly DocumentNote[];
  highlightId: string | null;
  highlightInput: ActiveInput | null;
  onSelectDocument: (docId: string) => void;
  onDelete: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onRename: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  onShare: (note: DocumentNote, trigger: HTMLButtonElement | null) => void;
  menuTargetId: string | null;
  onActivate: (docId: string, source: ActivationSource) => void;
}) {
  return (
    <section aria-label={label} className="home-group" role="group">
      <h2 className="home-group-label">{label}</h2>
      <ul className="home-doc-list">
        {documents.map((note) => {
          const id = note.getId();
          const label = formatNavigationLabel(note.getText());
          const shareable = note.canShareWith();
          const sharedNote = !shareable
            ? 'Shared with you'
            : note.access.getChildren().length > 0 ? 'Shared by you' : null;
          const sharedId = `home-doc-shared-${id}`;
          return (
            <li
              className="home-doc-row"
              data-highlighted={id === highlightId ? highlightInput : undefined}
              data-menu-target={id === menuTargetId ? true : undefined}
              key={id}
              onFocus={() => onActivate(id, 'focus')}
              onKeyDownCapture={() => onActivate(id, 'keyboard')}
            >
              <DocumentMenu label={label} note={note} onDelete={onDelete} onRename={onRename} onShare={onShare} />
              <button
                aria-describedby={sharedNote ? sharedId : undefined}
                className="home-doc remdo-interaction-surface"
                data-home-document-ref={id}
                id={`home-doc-link-${id}`}
                onClick={() => onSelectDocument(id)}
                type="button"
              >
                <span className="home-doc-label">{label}</span>
                {sharedNote && !shareable && (
                  <span aria-hidden="true" className="home-doc-shared" title={sharedNote}>Shared</span>
                )}
              </button>
              {sharedNote && <span hidden id={sharedId}>{sharedNote}</span>}
              {shareable && sharedNote && (
                <button
                  aria-label={`${sharedNote}, manage sharing for ${label}`}
                  className="home-doc-shared home-doc-shared-action remdo-interaction-surface"
                  onClick={(event) => onShare(note, event.currentTarget)}
                  title={sharedNote}
                  type="button"
                >
                  Shared
                </button>
              )}
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
  const [active, setActive] = useState<{ id: string | null; input: ActiveInput | null }>({ id: null, input: null });
  const lastInputRef = useRef<LastInput>('keyboard');
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRowRef = useRef<string | null>(null);
  const groups = sources.map((source) => {
    const documents = source.documents.getChildren();
    return { source, documents, visibleDocuments: filterHomeDocuments(documents, query) };
  });
  const hasDocuments = groups.some(({ documents }) => documents.length > 0);
  const visibleDocuments = groups.flatMap((group) => group.visibleDocuments);
  const matchIds = visibleDocuments.map((note) => note.getId());
  const hasQuery = tokenizeQuery(query).length > 0;
  const activeRowId = active.id !== null && matchIds.includes(active.id) ? active.id : null;
  const chosenInput = activeRowId === null ? null : active.input;
  const highlightId = chosenInput === null ? hasQuery ? matchIds[0] ?? null : null : activeRowId;
  const highlightInput = chosenInput ?? (highlightId === null ? null : 'keyboard');
  const menuDocumentIds = visibleDocuments
    .filter((note) => note.canRename() || note.canShareWith() || note.canDelete())
    .map((note) => note.getId());
  const restingId = activeRowId !== null && menuDocumentIds.includes(activeRowId)
    ? activeRowId
    : menuDocumentIds[0] ?? null;
  const menuTargetId = highlightId ?? restingId;

  const holdsActiveRow = () => Boolean(documentDialog) || hasOpenMenu(homeRef.current);
  const choose = (docId: string, input: ActiveInput) => setActive((current) => (
    current.id === docId && current.input === input ? current : { id: docId, input }
  ));
  const rest = (only?: ActiveInput) => setActive((current) => (
    current.input === null || (only && current.input !== only) ? current : { ...current, input: null }
  ));
  const activate = (docId: string, source: ActivationSource) => {
    const input = source === 'focus' ? lastInputRef.current : source;
    if (input === 'touch') return;
    if (source === 'focus' && input === 'pointer' && pointerRowRef.current !== docId) {
      if (!holdsActiveRow()) rest('pointer');
      return;
    }
    if ((active.id === docId && active.input === input) || holdsActiveRow()) return;
    choose(docId, input);
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
    rest();
  };

  const moveHighlight = (delta: 1 | -1) => {
    if (matchIds.length === 0) return;
    const index = highlightId === null ? -1 : matchIds.indexOf(highlightId);
    if (index === -1 && delta === -1) return;
    setActive({ id: matchIds[Math.max(0, Math.min(matchIds.length - 1, index + delta))]!, input: 'keyboard' });
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || searchComposingRef.current) return;
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightId !== null) onSelectDocument(highlightId);
    } else if (event.key === 'Escape' && query !== '') {
      event.preventDefault();
      setQuery('');
      rest();
    }
  };

  useEffect(() => {
    if (chosenInput === 'keyboard') homeRef.current?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' });
  }, [highlightId, chosenInput]);

  useEffect(() => {
    const keyboard = () => { lastInputRef.current = 'keyboard'; };
    const pointer = (event: PointerEvent) => { lastInputRef.current = event.pointerType === 'touch' ? 'touch' : 'pointer'; };
    document.addEventListener('keydown', keyboard, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', keyboard, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, []);

  // Scrolling moves rows under a stationary pointer without a pointermove.
  useEffect(() => {
    if (documentDialog) return;
    let frame = 0;
    const followPointer = () => {
      frame = 0;
      const point = pointerRef.current;
      if (!point || lastInputRef.current !== 'pointer' || hasOpenMenu(homeRef.current)) return;
      const docId = documentIdOf(document.elementFromPoint(point.x, point.y)) ?? null;
      pointerRowRef.current = docId;
      if (docId) choose(docId, 'pointer');
      else rest('pointer');
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(followPointer);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [documentDialog]);

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
            aria-activedescendant={highlightId === null ? undefined : `home-doc-link-${highlightId}`}
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

      <div
        id={listId}
        onPointerLeave={() => {
          pointerRef.current = null;
          pointerRowRef.current = null;
          if (!holdsActiveRow()) rest('pointer');
        }}
        onPointerMove={(event) => {
          if (event.pointerType === 'touch') return;
          lastInputRef.current = 'pointer';
          const inList = event.target instanceof Node && event.currentTarget.contains(event.target);
          pointerRef.current = inList ? { x: event.clientX, y: event.clientY } : null;
          const docId = inList ? documentIdOf(event.target as Element) ?? null : null;
          pointerRowRef.current = docId;
          if (docId) activate(docId, 'pointer');
          else if (!holdsActiveRow()) rest('pointer');
        }}
      >
        {hasQuery && hasDocuments && matchIds.length === 0 && (
          <p className="home-search-empty">No documents match</p>
        )}
        {groups.filter((group) => group.visibleDocuments.length > 0).map(({ source, visibleDocuments: documents }) => (
          <DocumentGroup
            highlightId={highlightId}
            highlightInput={highlightInput}
            key={source.getId()}
            label={source.getText()}
            documents={documents}
            onDelete={openDelete}
            onRename={openRename}
            onSelectDocument={onSelectDocument}
            onShare={openShare}
            menuTargetId={menuTargetId}
            onActivate={activate}
          />
        ))}
      </div>

      {documentDialog}
    </section>
  );
}
