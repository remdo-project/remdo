import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { NotePathItem } from '#client/editor/outline/note-traversal';
import { SearchResultRow } from '#client/app/routes/SearchResultRow';

const ancestorPath: NotePathItem[] = [
  { noteId: 'root', label: 'Work' },
  { noteId: 'mid', label: 'Q3 planning' },
  { noteId: 'mid2', label: 'Roadmap' },
  { noteId: 'mid3', label: 'Grooming' },
  { noteId: 'mid4', label: 'Estimates' },
  { noteId: 'parent', label: 'Sprint backlog' },
  { noteId: 'match', label: 'TODO refine estimates' },
];

const childPreview = [
  { noteId: 'c1', text: 'sub one', listType: 'number' as const, checked: false },
  { noteId: 'c2', text: 'sub two', listType: 'check' as const, checked: true },
];

function renderRow({
  path = ancestorPath,
  checked = false,
  children = childPreview,
  childCount = 3,
  query = 'refine',
  text = 'TODO refine estimates',
}: {
  path?: NotePathItem[];
  checked?: boolean;
  children?: typeof childPreview;
  childCount?: number;
  query?: string;
  text?: string;
} = {}) {
  const onSelectAncestor = vi.fn();
  const result = render(
    <SearchResultRow
      ancestorPath={path}
      checked={checked}
      childCount={childCount}
      childPreview={children}
      onSelectAncestor={onSelectAncestor}
      query={query}
      text={text}
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

  it('uses editor list markup for each child list type', () => {
    const { container } = renderRow();
    expect(container.querySelector('.document-search-result-children.remdo-outline')).not.toBeNull();
    expect(container.querySelector('ol.list-ol > .list-item')).toHaveTextContent('sub one');
    expect(container.querySelector('.list-item.list-item-checked')).toHaveTextContent('sub two');
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
    const { container } = renderRow({ path: [{ noteId: 'long', label: text }], query: 'needle', text });
    expect(container.querySelector('.document-search-result-mark')).toHaveTextContent('needle');
  });

  it('keeps the full ancestor label in its text and tooltip', () => {
    const longAncestor = 'Engineering '.repeat(8).trim();
    renderRow({
      path: [
        { noteId: 'parent', label: longAncestor },
        { noteId: 'child', label: 'sprint task' },
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
          ancestorPath={ancestorPath}
          checked={false}
          childCount={0}
          childPreview={[]}
          onSelectAncestor={onSelectAncestor}
          query="refine"
          text="TODO refine estimates"
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
});
