import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorNoteSnapshot, NoteListType } from '#note-sdk';
import { SearchResultRow } from '#client/app/workspace/SearchResultRow';

function note(id: string, text: string, checked = false, body: string | null = null): EditorNoteSnapshot {
  return { id, text, body, checked, folded: false, children: null };
}

const ancestorPath = [
  note('root', 'Work'),
  note('mid', 'Q3 planning'),
  note('mid2', 'Roadmap'),
  note('mid3', 'Grooming'),
  note('mid4', 'Estimates'),
  note('parent', 'Sprint backlog'),
  note('match', 'TODO refine estimates'),
];

const childPreview = [
  note('c1', 'sub one'),
  note('c2', 'sub two', true),
];

function renderRow({
  path = ancestorPath,
  checked = false,
  children = childPreview,
  childCount = 3,
  listType = 'bullet',
  query = 'refine',
  text = 'TODO refine estimates',
  body = null,
}: {
  path?: readonly EditorNoteSnapshot[];
  checked?: boolean;
  children?: typeof childPreview;
  childCount?: number;
  listType?: NoteListType;
  query?: string;
  text?: string;
  body?: string | null;
} = {}) {
  const onSelectAncestor = vi.fn();
  const result = render(
    <SearchResultRow
      result={{
        note: note('match', text, checked, body),
        path,
        childPreview: { notes: children, totalCount: childCount, listType },
      }}
      onSelectAncestor={onSelectAncestor}
      query={query}
    />
  );
  return { ...result, onSelectAncestor };
}

describe('search result row', () => {
  it('renders the match line and ancestor context without list markup', () => {
    const { container } = renderRow();
    const match = container.querySelector('[data-search-result-match]');
    expect(match?.tagName).toBe('DIV');
    expect(match?.textContent).toBe('TODO refine estimates');
    expect(match?.querySelector('.list-item, ul, ol')).toBeNull();
    expect(container.querySelector('.document-search-result-breadcrumb')).not.toBeNull();
  });

  it('marks a checked result label', () => {
    const { container } = renderRow({ checked: true });
    expect(container.querySelector('[data-search-result-match]'))
      .toHaveAttribute('data-note-checked', 'true');
  });

  it('collapses a deep ancestor chain and previews the first children', () => {
    const { container } = renderRow();
    const crumbs = Array.from(
      container.querySelectorAll('.document-search-result-crumb'),
      (crumb) => crumb.textContent,
    );
    expect(crumbs).toEqual(['Work', 'Q3 planning', '⋯', 'Estimates', 'Sprint backlog']);
    expect(container.querySelector('.document-search-result-crumb--ellipsis'))
      .toHaveAttribute('title', 'Roadmap / Grooming');
    expect(Array.from(
      container.querySelectorAll('.document-search-result-children .list-item'),
      (child) => child.textContent,
    )).toEqual(['sub one', 'sub two']);
    expect(container.querySelector('.document-search-result-children-more')).toHaveTextContent('+1 more');
  });

  it('separates ancestor crumbs with slashes', () => {
    const { container } = renderRow();
    const ancestors = container.querySelectorAll('[data-search-result-ancestor-crumb]');
    expect(ancestors[0]).toHaveTextContent('Work');
    const separators = container.querySelectorAll('.document-search-result-crumb-separator');
    expect(separators.length).toBeGreaterThan(0);
    separators.forEach((separator) => expect(separator).toHaveTextContent('/'));
  });

  it.each(['bullet', 'number', 'check'] as const)('uses editor markup for a %s child list', (listType) => {
    const { container } = renderRow({ listType });
    const list = container.querySelector('.document-search-result-children.remdo-outline > ul, .document-search-result-children.remdo-outline > ol');
    expect(list?.tagName).toBe(listType === 'number' ? 'OL' : 'UL');
    expect(list).toHaveClass(listType === 'number' ? 'list-ol' : 'list-ul');
    const children = list!.querySelectorAll('li');
    expect(children).toHaveLength(2);
    expect(children[0]).toHaveTextContent('sub one');
    expect(children[1]).toHaveAttribute('data-note-checked', 'true');
    if (listType === 'check') {
      expect(children[0]).toHaveClass('list-item-unchecked');
      expect(children[1]).toHaveClass('list-item-checked');
    }
  });

  it('highlights every matching label token in document order', () => {
    const { container } = renderRow({ query: '  estimates   todo ' });
    expect(Array.from(
      container.querySelectorAll('[data-search-result-match] .document-search-result-mark'),
      (mark) => mark.textContent,
    )).toEqual(['TODO', 'estimates']);
  });

  it('highlights a matching token inside an ancestor crumb', () => {
    const { container } = renderRow({ query: 'estimates todo' });
    expect(Array.from(
      container.querySelectorAll('[data-search-result-ancestor-crumb] .document-search-result-mark'),
      (mark) => mark.textContent,
    )).toEqual(['Estimates']);
  });

  it('keeps a long matching label intact', () => {
    const text = `${'x'.repeat(60)} needle tail`;
    const { container } = renderRow({ path: [note('long', text)], query: 'needle', text });
    expect(container.querySelector('.document-search-result-mark')).toHaveTextContent('needle');
  });

  it('keeps the full ancestor label in its text and tooltip', () => {
    const longAncestor = 'Engineering '.repeat(8).trim();
    renderRow({
      path: [
        note('parent', longAncestor),
        note('child', 'sprint task'),
      ],
      children: [],
      childCount: 0,
      query: 'sprint',
      text: 'sprint task',
    });
    const crumb = screen.getByRole('button', { name: longAncestor });
    expect(crumb).toHaveAttribute('title', longAncestor);
    expect(crumb.textContent).not.toContain('...');
  });

  it('reports the selected ancestor without bubbling the click', () => {
    const parentClick = vi.fn();
    const onSelectAncestor = vi.fn();
    render(
      <div onClick={parentClick}>
        <SearchResultRow
          result={{
            note: note('match', 'TODO refine estimates'),
            path: ancestorPath,
            childPreview: { notes: [], totalCount: 0, listType: 'bullet' },
          }}
          onSelectAncestor={onSelectAncestor}
          query="refine"
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Q3 planning' }));
    expect(onSelectAncestor).toHaveBeenCalledWith(expect.anything(), 'mid');
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('prevents ancestor mousedown from moving focus', () => {
    renderRow();
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Q3 planning' }))).toBe(false);
  });

  it('renders no body line for a note without a body', () => {
    const { container } = renderRow();
    expect(container.querySelector('[data-search-result-body]')).toBeNull();
  });

  it('previews the body beneath the label', () => {
    const { container } = renderRow({ body: 'finance needs the draft' });
    expect(container.querySelector('[data-search-result-body]')?.textContent)
      .toBe('finance needs the draft');
  });

  it('highlights a query match inside the body preview', () => {
    const { container } = renderRow({ body: 'finance needs the draft', query: 'draft' });
    const marks = Array.from(
      container.querySelectorAll('[data-search-result-body] .document-search-result-mark')
    ).map((mark) => mark.textContent);
    expect(marks).toEqual(['draft']);
  });

  it('windows a long body onto the match rather than showing its opening', () => {
    const body = `${'filler word '.repeat(20)}needle${' trailing word'.repeat(20)}`;
    const { container } = renderRow({ body, query: 'needle' });
    const preview = container.querySelector('[data-search-result-body]')?.textContent ?? '';

    expect(preview).toContain('needle');
    expect(preview.startsWith('…')).toBe(true);
  });

  it('collapses body line breaks so the preview stays on one line', () => {
    const { container } = renderRow({ body: 'first line\nsecond line' });
    expect(container.querySelector('[data-search-result-body]')?.textContent)
      .toBe('first line second line');
  });
});
