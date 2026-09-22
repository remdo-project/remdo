import { Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { ChildPreview as SearchChildPreview, EditorNoteSnapshot, NoteListType, SearchResult } from '#note-sdk';
import { bodySnippet } from '#client/search/body-snippet';
import { queryMatchRanges } from '#client/search/query-match';
import { UNTITLED_LABEL, formatNavigationLabel, normalizeNavigationLabel } from '#client/ui/navigation-label';

interface SearchResultRowProps {
  result: SearchResult;
  onSelectAncestor: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  query: string;
}

const BREADCRUMB_VISIBLE_LIMIT = 4;
const BREADCRUMB_EDGE_COUNT = 2;

type BreadcrumbCrumb =
  | { kind: 'note'; item: EditorNoteSnapshot }
  | { kind: 'ellipsis'; hiddenLabels: string[] };

// Builds the ancestor subline crumbs for a match. The matched note (the last
// element of ancestorPath) is the row's primary line, so it is excluded here. The
// full ancestor chain (including the top-level note) is shown for context. A deep
// chain collapses to first/last edges joined by a single ellipsis crumb; width
// truncation of individual crumbs is handled in CSS, not here.
function buildBreadcrumbCrumbs(ancestorPath: readonly EditorNoteSnapshot[]): BreadcrumbCrumb[] {
  // Ancestors only — drop the matched note (the primary label), keep the rest.
  const path = ancestorPath.slice(0, -1);

  if (path.length <= BREADCRUMB_VISIBLE_LIMIT) {
    return path.map((item) => ({ kind: 'note', item }));
  }

  const head = path.slice(0, BREADCRUMB_EDGE_COUNT);
  const tail = path.slice(-BREADCRUMB_EDGE_COUNT);
  const hidden = path.slice(BREADCRUMB_EDGE_COUNT, -BREADCRUMB_EDGE_COUNT);
  return [
    ...head.map((item): BreadcrumbCrumb => ({ kind: 'note', item })),
    { kind: 'ellipsis', hiddenLabels: hidden.map((item) => formatNavigationLabel(item.text)) },
    ...tail.map((item): BreadcrumbCrumb => ({ kind: 'note', item })),
  ];
}

interface HighlightSegment {
  match: boolean;
  offset: number;
  value: string;
}

// Splits text into alternating plain/match segments so each query token's
// occurrences can be wrapped in <mark>. Matching mirrors the search filter
// (tokenized, case-insensitive); the offset gives each segment a stable key.
function highlightSegments(text: string, query: string): HighlightSegment[] {
  const ranges = queryMatchRanges(text, query);
  if (ranges.length === 0) {
    return [{ match: false, offset: 0, value: text }];
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ match: false, offset: cursor, value: text.slice(cursor, range.start) });
    }
    segments.push({ match: true, offset: range.start, value: text.slice(range.start, range.end) });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ match: false, offset: cursor, value: text.slice(cursor) });
  }
  return segments;
}

function HighlightedText({ query, text }: { query: string; text: string }) {
  return (
    <>
      {highlightSegments(text, query).map((segment) => (
        segment.match
          ? <mark className="document-search-result-mark" key={segment.offset}>{segment.value}</mark>
          : <Fragment key={segment.offset}>{segment.value}</Fragment>
      ))}
    </>
  );
}

// The ancestor subline beneath the matched note: the location path, dim and
// small, with clickable ancestor crumbs. Renders nothing when the match has no
// shown ancestors (top-level or only-root parent).
function ResultBreadcrumb({
  ancestorPath,
  onSelectAncestor,
  query,
}: {
  ancestorPath: readonly EditorNoteSnapshot[];
  onSelectAncestor: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  query: string;
}) {
  const crumbs = buildBreadcrumbCrumbs(ancestorPath);
  if (crumbs.length === 0) {
    return null;
  }

  return (
    <span className="document-search-result-breadcrumb" data-search-result-breadcrumb>
      {crumbs.map((crumb, index) => {
        const separator = index > 0
          ? <span aria-hidden="true" className="document-search-result-crumb-separator">/</span>
          : null;

        if (crumb.kind === 'ellipsis') {
          return (
            <Fragment key="ellipsis">
              {separator}
              <span
                className="document-search-result-crumb document-search-result-crumb--ellipsis"
                title={crumb.hiddenLabels.join(' / ')}
              >
                ⋯
              </span>
            </Fragment>
          );
        }

        // Normalize whitespace but keep the full label: width clipping is the
        // CSS ellipsis's job (see .document-search-result-crumb), and the title
        // must expose the full text the spec promises on a width-truncated crumb.
        const label = normalizeNavigationLabel(crumb.item.text) || UNTITLED_LABEL;
        return (
          <Fragment key={crumb.item.id}>
            {separator}
            <button
              className="document-search-result-crumb document-search-result-crumb--ancestor"
              data-search-result-ancestor-crumb
              onClick={(event) => {
                event.stopPropagation();
                onSelectAncestor(event, crumb.item.id);
              }}
              onMouseDown={(event) => {
                // Keep focus on the search input: a focusable button would
                // otherwise steal it on press, blurring the input and dismissing
                // the results before this crumb's click can zoom.
                event.preventDefault();
              }}
              tabIndex={-1}
              title={label}
              type="button"
            >
              <HighlightedText query={query} text={label} />
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}

// Every result row renders the same two-line layout — the matched note as the
// primary label, the ancestor path as a dim subline beneath it, then the child
// preview — so moving the highlight only restyles the selected row and never
// re-lays-out the list.
export function SearchResultRow({
  result,
  onSelectAncestor,
  query,
}: SearchResultRowProps) {
  const { note, path, childPreview } = result;
  const matchText = note.text.length > 0 ? note.text : '(empty note)';
  return (
    <>
      {/* Primary line: the matched note's text. No list marker (bullet/number/
          checkbox), but text formatting is kept — e.g. checked notes are struck
          through via data-note-checked. */}
      <div
        className="document-search-result-match"
        data-note-checked={note.checked ? 'true' : undefined}
        data-search-result-match
      >
        <HighlightedText query={query} text={matchText} />
      </div>
      <BodySnippet body={note.body} query={query} />
      <ResultBreadcrumb
        ancestorPath={path}
        onSelectAncestor={onSelectAncestor}
        query={query}
      />
      {childPreview.notes.length > 0 ? (
        <ChildPreview preview={childPreview} />
      ) : null}
    </>
  );
}

// A one-line preview of the note's body, windowed onto the query match when the
// body is what matched — otherwise a row whose label lacks the query would look
// like a mistake. Rendered as plain text: unlike the label, inline formatting is
// dropped, since windowing rich content is not worth it for a preview.
function BodySnippet({ body, query }: { body: string | null; query: string }) {
  if (!body) {
    return null;
  }
  const snippet = bodySnippet(body, query);
  if (snippet.length === 0) {
    return null;
  }
  return (
    <div className="document-search-result-body" data-search-result-body>
      <HighlightedText query={query} text={snippet} />
    </div>
  );
}

// Mirrors the editor: check-type lists get the checkbox marker classes; the
// checked prop itself drives data-note-checked (line-through) for any list type.
function childItemClassName(listType: NoteListType, checked: boolean): string {
  if (listType !== 'check') {
    return 'list-item';
  }
  return `list-item ${checked ? 'list-item-checked' : 'list-item-unchecked'}`;
}

function ChildPreview({ preview }: { preview: SearchChildPreview }) {
  const { notes, listType, totalCount } = preview;
  const remaining = totalCount - notes.length;
  const ListTag = listType === 'number' ? 'ol' : 'ul';
  const listClassName = listType === 'number' ? 'list-ol' : 'list-ul';
  return (
    <div className="document-search-result-children remdo-outline">
      <ListTag className={listClassName}>
        {notes.map((child) => (
          <li
            className={childItemClassName(listType, child.checked)}
            data-note-checked={child.checked ? 'true' : undefined}
            key={child.id}
          >
            {child.text.length > 0 ? formatNavigationLabel(child.text) : '(empty note)'}
          </li>
        ))}
      </ListTag>
      {remaining > 0 ? (
        <div className="document-search-result-children-more">+{remaining} more</div>
      ) : null}
    </div>
  );
}
