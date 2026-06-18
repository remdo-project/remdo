import { Fragment } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import type { NoteListType } from '#note-sdk';
import { formatNavigationLabel } from '#client/ui/navigation-label';

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
  expanded: boolean;
  listType: NoteListType;
  onSelectAncestor: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  onSelectAncestorPointerDown: (event: ReactPointerEvent<HTMLElement>, noteId: string) => void;
  query: string;
  text: string;
}

const BREADCRUMB_VISIBLE_LIMIT = 4;
const BREADCRUMB_EDGE_COUNT = 2;

type BreadcrumbCrumb =
  | { kind: 'note'; item: NotePathItem }
  | { kind: 'ellipsis'; hiddenLabels: string[] };

// Collapses a deep ancestor chain to the first/last edges joined by a single
// ellipsis crumb; shorter chains pass through unchanged. Width truncation of
// individual crumbs is handled in CSS, not here.
function buildBreadcrumbCrumbs(ancestorPath: NotePathItem[]): BreadcrumbCrumb[] {
  if (ancestorPath.length <= BREADCRUMB_VISIBLE_LIMIT) {
    return ancestorPath.map((item) => ({ kind: 'note', item }));
  }

  const head = ancestorPath.slice(0, BREADCRUMB_EDGE_COUNT);
  const tail = ancestorPath.slice(-BREADCRUMB_EDGE_COUNT);
  const hidden = ancestorPath.slice(BREADCRUMB_EDGE_COUNT, -BREADCRUMB_EDGE_COUNT);
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

// Splits text into alternating plain/match segments for a case-insensitive
// query so the matched term can be wrapped in <mark>. Empty query yields a
// single plain segment. The offset gives each segment a stable React key.
function highlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) {
    return [{ match: false, offset: 0, value: text }];
  }

  const segments: HighlightSegment[] = [];
  const haystack = text.toLocaleLowerCase();
  let cursor = 0;
  let matchIndex = haystack.indexOf(needle, cursor);
  while (matchIndex !== -1) {
    if (matchIndex > cursor) {
      segments.push({ match: false, offset: cursor, value: text.slice(cursor, matchIndex) });
    }
    segments.push({ match: true, offset: matchIndex, value: text.slice(matchIndex, matchIndex + needle.length) });
    cursor = matchIndex + needle.length;
    matchIndex = haystack.indexOf(needle, cursor);
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

function ResultBreadcrumb({
  ancestorPath,
  matchChecked,
  onSelectAncestor,
  onSelectAncestorPointerDown,
  query,
}: {
  ancestorPath: NotePathItem[];
  matchChecked: boolean;
  onSelectAncestor: (event: ReactMouseEvent<HTMLElement>, noteId: string) => void;
  onSelectAncestorPointerDown: (event: ReactPointerEvent<HTMLElement>, noteId: string) => void;
  query: string;
}) {
  const crumbs = buildBreadcrumbCrumbs(ancestorPath);
  const lastNoteIndex = crumbs.reduce(
    (last, crumb, index) => (crumb.kind === 'note' ? index : last),
    -1
  );

  return (
    <span className="document-search-result-breadcrumb" data-search-result-breadcrumb>
      {crumbs.map((crumb, index) => {
        const separator = index > 0
          ? <span aria-hidden="true" className="document-search-result-crumb-separator">›</span>
          : null;

        if (crumb.kind === 'ellipsis') {
          return (
            <Fragment key="ellipsis">
              {separator}
              <span
                className="document-search-result-crumb document-search-result-crumb--ellipsis"
                title={crumb.hiddenLabels.join(' › ')}
              >
                ⋯
              </span>
            </Fragment>
          );
        }

        const isMatchCrumb = index === lastNoteIndex;
        if (isMatchCrumb) {
          // Highlight against the raw note text (what the query filtered on),
          // not the length-capped navigation label, so a match past the label
          // cap is still highlighted. CSS clamps the visible width.
          const matchText = crumb.item.label.length > 0 ? crumb.item.label : '(empty note)';
          const matchClassName = matchChecked
            ? 'document-search-result-crumb document-search-result-crumb--match document-search-result-crumb--checked'
            : 'document-search-result-crumb document-search-result-crumb--match';
          return (
            <Fragment key={crumb.item.noteId}>
              {separator}
              <span
                className={matchClassName}
                data-note-checked={matchChecked ? 'true' : undefined}
                data-search-result-match-crumb
                title={matchText}
              >
                <HighlightedText query={query} text={matchText} />
              </span>
            </Fragment>
          );
        }

        const label = formatNavigationLabel(crumb.item.label);
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
              onPointerDown={(event) => {
                onSelectAncestorPointerDown(event, crumb.item.noteId);
              }}
              tabIndex={-1}
              title={label}
              type="button"
            >
              {label}
            </button>
          </Fragment>
        );
      })}
    </span>
  );
}

export function SearchResultRow({
  ancestorPath,
  checked,
  childPreview,
  childCount,
  expanded,
  listType,
  onSelectAncestor,
  onSelectAncestorPointerDown,
  query,
  text,
}: SearchResultRowProps) {
  const displayText = text.length > 0 ? text : '(empty note)';

  if (!expanded) {
    const parentLabel = ancestorPath.length >= 2
      ? formatNavigationLabel(ancestorPath[ancestorPath.length - 2]!.label)
      : null;
    const ListTag = listType === 'number' ? 'ol' : 'ul';
    const listClassName = listType === 'number' ? 'list-ol' : 'list-ul';
    return (
      <>
        {/* The row's own text renders as a single outline item so its marker and
            checked state match the editor, the same way the child preview does. */}
        <ListTag className={`document-search-result-text remdo-outline ${listClassName}`}>
          <li
            className={childItemClassName(listType, checked)}
            data-note-checked={checked ? 'true' : undefined}
          >
            <HighlightedText query={query} text={displayText} />
          </li>
        </ListTag>
        <span className="document-search-result-context">
          {parentLabel ? <>in <span className="document-search-result-parent">{parentLabel}</span> · </> : null}
          {childCount} {childCount === 1 ? 'child' : 'children'}
        </span>
      </>
    );
  }

  const remaining = childCount - childPreview.length;
  return (
    <>
      <ResultBreadcrumb
        ancestorPath={ancestorPath}
        matchChecked={checked}
        onSelectAncestor={onSelectAncestor}
        onSelectAncestorPointerDown={onSelectAncestorPointerDown}
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
