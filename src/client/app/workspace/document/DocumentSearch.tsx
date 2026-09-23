import { TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { EditorNoteSnapshot } from '#note-sdk';
import {
  UNTITLED_LABEL,
  normalizeNavigationLabel,
} from '#client/ui/navigation-label';
import { SearchResultRow } from '../SearchResultRow';
import { bodySnippet } from '#client/search/body-snippet';
import type { DocumentSearchModel } from '../useDocumentSearchModel';

function buildSearchResultAccessibleName(
  text: string,
  path: readonly EditorNoteSnapshot[],
  body: string | null,
  query: string,
): string {
  const name = normalizeNavigationLabel(text) || UNTITLED_LABEL;
  const ancestors = path.slice(0, -1);
  // The visible body preview is inside this option, whose aria-label replaces
  // its contents for assistive tech — so a note matched only on its body would
  // otherwise be announced with no sign of why it matched.
  const preview = body ? bodySnippet(body, query) : '';
  const withBody = preview.length > 0 ? `${name}, ${preview}` : name;
  if (ancestors.length === 0) {
    return withBody;
  }
  const context = ancestors
    .map((item) => normalizeNavigationLabel(item.text) || UNTITLED_LABEL)
    .join(' / ');
  return `${withBody}, in ${context}`;
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
  if (!model.searchModeActive) {
    return null;
  }

  return (
    <section
      aria-busy={model.searchResultsPending || undefined}
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
          const hasChildren = result.childPreview.totalCount > 0;
          const isActive = result.note.id === model.highlightedResultNoteId;
          return (
            <li
              aria-label={buildSearchResultAccessibleName(result.note.text, result.path, result.note.body, model.searchQuery)}
              aria-selected={isActive}
              className="document-search-results-item"
              data-search-result-active={isActive ? 'true' : undefined}
              data-search-result-has-children={hasChildren ? 'true' : undefined}
              data-search-result-item
              data-search-result-label={result.note.text}
              id={`${model.searchResultsListboxId}-option-${index}`}
              key={result.note.id}
              onClick={(event) => model.handleSearchResultClick(event, result.note.id)}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onMouseEnter={() => model.handleSearchResultPointerEnter(result.note.id)}
              role="option"
            >
              <SearchResultRow
                result={result}
                onSelectAncestor={model.handleSearchResultClick}
                query={model.searchQuery}
              />
            </li>
          );
        }) : model.searchResultsPending ? null : (
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
