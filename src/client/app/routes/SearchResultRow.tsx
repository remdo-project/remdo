import { Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type { NoteListType } from '#note-sdk';
import { queryMatchRanges } from '#client/search/query-match';
import { UNTITLED_LABEL, formatNavigationLabel, normalizeNavigationLabel } from '#client/ui/navigation-label';

interface ChildPreviewItem {
  noteId: string;
  text: string;
  listType: NoteListType;
  checked: boolean;
}

interface SearchResultRowProps {
  ancestorPath: NotePathItem[];
  checked: boolean;
  childPreview: ChildPreviewItem[];
  childCount: number;
  onSelectAncestor: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  query: string;
  text: string;
}

const BREADCRUMB_VISIBLE_LIMIT = 4;
const BREADCRUMB_EDGE_COUNT = 2;

type BreadcrumbCrumb =
  | { kind: 'note'; item: NotePathItem }
  | { kind: 'ellipsis'; hiddenLabels: string[] };

// Builds the ancestor subline crumbs for a match. The matched note (the last
// element of ancestorPath) is the row's primary line, so it is excluded here. The
// full ancestor chain (including the top-level note) is shown for context. A deep
// chain collapses to first/last edges joined by a single ellipsis crumb; width
// truncation of individual crumbs is handled in CSS, not here.
function buildBreadcrumbCrumbs(ancestorPath: NotePathItem[]): BreadcrumbCrumb[] {
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
    { kind: 'ellipsis', hiddenLabels: hidden.map((item) => formatNavigationLabel(item.label)) },
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
  ancestorPath: NotePathItem[];
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
        const label = normalizeNavigationLabel(crumb.item.label) || UNTITLED_LABEL;
        return (
          <Fragment key={crumb.item.noteId}>
            {separator}
            <button
              className="document-search-result-crumb document-search-result-crumb--ancestor"
              data-search-result-ancestor-crumb
              onClick={(event) => {
                event.stopPropagation();
                onSelectAncestor(event, crumb.item.noteId);
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
  ancestorPath,
  checked,
  childPreview,
  childCount,
  onSelectAncestor,
  query,
  text,
}: SearchResultRowProps) {
  const remaining = childCount - childPreview.length;
  const matchText = text.length > 0 ? text : '(empty note)';
  return (
    <>
      {/* Primary line: the matched note's text. No list marker (bullet/number/
          checkbox), but text formatting is kept — e.g. checked notes are struck
          through via data-note-checked. */}
      <div
        className="document-search-result-match"
        data-note-checked={checked ? 'true' : undefined}
        data-search-result-match
      >
        <HighlightedText query={query} text={matchText} />
      </div>
      <ResultBreadcrumb
        ancestorPath={ancestorPath}
        onSelectAncestor={onSelectAncestor}
        query={query}
      />
      {childPreview.length > 0 ? (
        <ChildPreview childPreview={childPreview} remaining={remaining} />
      ) : null}
    </>
  );
}

interface ChildPreviewGroup {
  listType: NoteListType;
  items: ChildPreviewItem[];
}

// Groups consecutive children by list type so each group renders as the editor's
// own list element (ul.list-ul / ol.list-ol), giving real bullets, checkboxes,
// and ordered counters via the shared editor list CSS.
function groupChildrenByListType(childPreview: ChildPreviewItem[]): ChildPreviewGroup[] {
  const groups: ChildPreviewGroup[] = [];
  for (const item of childPreview) {
    const lastGroup = groups.at(-1);
    if (lastGroup && lastGroup.listType === item.listType) {
      lastGroup.items.push(item);
    } else {
      groups.push({ listType: item.listType, items: [item] });
    }
  }
  return groups;
}

// Mirrors the editor: check-type lists get the checkbox marker classes; the
// checked prop itself drives data-note-checked (line-through) for any list type.
function childItemClassName(listType: NoteListType, checked: boolean): string {
  if (listType !== 'check') {
    return 'list-item';
  }
  return `list-item ${checked ? 'list-item-checked' : 'list-item-unchecked'}`;
}

function ChildPreview({
  childPreview,
  remaining,
}: {
  childPreview: ChildPreviewItem[];
  remaining: number;
}) {
  const groups = groupChildrenByListType(childPreview);
  return (
    <div className="document-search-result-children remdo-outline">
      {groups.map((group) => {
        const ListTag = group.listType === 'number' ? 'ol' : 'ul';
        const listClassName = group.listType === 'number' ? 'list-ol' : 'list-ul';
        return (
          <ListTag className={listClassName} key={group.items[0]!.noteId}>
            {group.items.map((child) => (
              <li
                className={childItemClassName(group.listType, child.checked)}
                data-note-checked={child.checked ? 'true' : undefined}
                key={child.noteId}
              >
                {child.text.length > 0 ? formatNavigationLabel(child.text) : '(empty note)'}
              </li>
            ))}
          </ListTag>
        );
      })}
      {remaining > 0 ? (
        <div className="document-search-result-children-more">+{remaining} more</div>
      ) : null}
    </div>
  );
}
