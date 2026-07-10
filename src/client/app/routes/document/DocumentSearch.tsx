import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useSearchNotes } from '#client/editor/view/EditorViewProvider';
import type { EditorNote } from '#note-sdk';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type { ChildPreview } from '#client/editor/search/search-candidates';
import {
  UNTITLED_LABEL,
  normalizeNavigationLabel,
} from '#client/ui/navigation-label';
import { SearchResultRow } from '../SearchResultRow';
import type { DocumentSearchModel } from '../useDocumentSearchModel';

const EMPTY_CHILD_PREVIEW: ChildPreview = { items: [], totalCount: 0 };
const EMPTY_ANCESTOR_PATH: NotePathItem[] = [];

function buildSearchResultAccessibleName(text: string, path: NotePathItem[]): string {
  const name = normalizeNavigationLabel(text) || UNTITLED_LABEL;
  const ancestors = path.slice(0, -1);
  if (ancestors.length === 0) {
    return name;
  }
  const context = ancestors
    .map((item) => normalizeNavigationLabel(item.label) || UNTITLED_LABEL)
    .join(' / ');
  return `${name}, in ${context}`;
}

export function DocumentSearchInput({ model }: { model: DocumentSearchModel }) {
  return (
    <TextInput
      aria-label="Search document"
      aria-activedescendant={model.searchModeActive ? model.activeResultOptionId : undefined}
      aria-autocomplete="list"
      aria-controls={model.searchModeActive ? model.searchResultsListboxId : undefined}
      aria-expanded={model.searchModeActive}
      aria-haspopup="listbox"
      className="document-header-search remdo-interaction-surface"
      leftSection={<IconSearch aria-hidden="true" size={14} />}
      onBlur={model.handleSearchBlur}
      onChange={model.handleSearchChange}
      onCompositionEnd={model.handleSearchCompositionEnd}
      onCompositionStart={model.handleSearchCompositionStart}
      onFocus={model.handleSearchFocus}
      onKeyDown={model.handleSearchKeyDown}
      placeholder={model.searchModeActive ? '' : 'Search'}
      ref={model.searchInputRef}
      role="combobox"
      size="xs"
      value={model.searchQuery}
    />
  );
}

export function DocumentSearchResults({ model }: { model: DocumentSearchModel }) {
  const searchNotes = useSearchNotes();
  const ancestorPathByNoteId = useMemo(() => {
    const paths: Record<string, NotePathItem[]> = {};
    searchNotes((notes) => {
      for (const result of model.flatResults) {
        const path: NotePathItem[] = [];
        let note: EditorNote | null = notes.note(result.noteId);
        while (note) {
          path.push({ noteId: note.id(), label: note.text() });
          note = note.parent();
        }
        paths[result.noteId] = path.reverse();
      }
    });
    return paths;
  }, [model.flatResults, searchNotes]);

  if (!model.searchModeActive) {
    return null;
  }

  return (
    <section
      className="document-search-results"
      data-testid="document-search-results"
      ref={model.searchResultsRef}
    >
      <ol
        aria-label="Search results"
        className="document-search-results-list"
        id={model.searchResultsListboxId}
        role="listbox"
      >
        {model.flatResults.length > 0 ? model.flatResults.map((result, index) => {
          const childPreview = model.childPreviewByNoteId[result.noteId] ?? EMPTY_CHILD_PREVIEW;
          const hasChildren = childPreview.totalCount > 0;
          const isActive = result.noteId === model.highlightedResultNoteId;
          const resultPath = ancestorPathByNoteId[result.noteId] ?? EMPTY_ANCESTOR_PATH;
          return (
            <li
              aria-label={buildSearchResultAccessibleName(result.text, resultPath)}
              aria-selected={isActive}
              className="document-search-results-item"
              data-search-result-active={isActive ? 'true' : undefined}
              data-search-result-has-children={hasChildren ? 'true' : undefined}
              data-search-result-item
              data-search-result-label={result.text}
              id={`${model.searchResultsListboxId}-option-${index}`}
              key={result.noteId}
              onClick={(event) => model.handleSearchResultClick(event, result.noteId)}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => model.handleSearchResultPointerEnter(result.noteId)}
              role="option"
            >
              <SearchResultRow
                ancestorPath={resultPath}
                checked={result.checked}
                childCount={childPreview.totalCount}
                childPreview={childPreview.items}
                onSelectAncestor={model.handleSearchResultClick}
                query={model.searchQuery}
                text={result.text}
              />
            </li>
          );
        }) : (
          <li
            aria-disabled="true"
            aria-selected="false"
            className="document-search-results-empty"
            role="option"
          >
            {model.searchQuery.length > 0 ? 'No matches' : 'No notes'}
          </li>
        )}
        {model.hasMoreResults ? (
          <li
            className="document-search-results-truncation"
            data-search-result-truncation
            role="presentation"
          >
            {`Showing the first ${model.flatResults.length} — refine your search`}
          </li>
        ) : null}
      </ol>
    </section>
  );
}
