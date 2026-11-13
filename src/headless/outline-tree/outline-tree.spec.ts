import { readFileSync } from 'node:fs';
import { $createLinkNode } from '@lexical/link';
import { $isListItemNode } from '@lexical/list';
import type { ListItemNode } from '@lexical/list';
import { $getRoot, $isElementNode, $isTextNode, $setState, createEditor } from 'lexical';
import type { LexicalNode } from 'lexical';
import { describe, expect, it } from 'vitest';
import { $isNoteFolded, $setNoteFolded } from '#client/editor/outline/fold-state';
import { $getOrCreateChildList } from '#client/editor/outline/list-structure';
import { editorConfig } from '#client/editor/runtime/config';
import { $getNoteId, noteIdState } from '#client/editor/runtime/note-ids/note-id-state';
import { $applyTree } from './apply';
import { $readTree } from './read';
import { normalizeRuns, trimRuns } from './runs';
import * as Y from 'yjs';
import type { Document, OutlineNote, Run, TreeNote } from './tree';
import { applyTree, readTree, saveTree } from './yjs';

const text = (value: string, ...marks: Extract<Run, { kind: 'text' }>['marks']): Run => ({ kind: 'text', text: value, marks });

function note(runs: Run[] | string, fields: Partial<OutlineNote> = {}): OutlineNote {
  return {
    kind: 'outline',
    marker: { kind: 'bullet' },
    checkbox: null,
    name: null,
    runs: typeof runs === 'string' ? [text(runs)] : runs,
    id: null,
    cacheId: null,
    children: [],
    ...fields,
  };
}

const withoutCacheIds = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, entry: unknown) => (key === 'cacheId' ? undefined : entry)));

function opened(tree: Document): Y.Doc {
  const doc = new Y.Doc();
  applyTree(doc, tree);
  return doc;
}

function findNoteOrNull(notes: readonly TreeNote[], wanted: string): OutlineNote | null {
  for (const candidate of notes) {
    if (candidate.kind !== 'outline') continue;
    const first = candidate.runs[0];
    if (first?.kind === 'text' && first.text === wanted) return candidate;
    const nested = findNoteOrNull(candidate.children, wanted);
    if (nested) return nested;
  }
  return null;
}

function findNote(notes: readonly TreeNote[], wanted: string): OutlineNote {
  const found = findNoteOrNull(notes, wanted);
  if (!found) throw new Error(`No note reads ${wanted}`);
  return found;
}

function updatesDuring(doc: Y.Doc, run: () => void): number {
  let updates = 0;
  const count = () => { updates += 1; };
  doc.on('update', count);
  run();
  doc.off('update', count);
  return updates;
}

function retext(tree: Document, from: string, to: string): Document {
  const copy = structuredClone(tree);
  findNote(copy.children, from).runs = [text(to)];
  return copy;
}

describe('the outline tree', () => {
  // The same fixture checks Python's reader and writer against this tree (test_text_format.py).
  it('reads back the shared tree after applying it to an empty document', () => {
    const tree = JSON.parse(readFileSync('tests/fixtures/outline-tree/document.json', 'utf8')) as Document;

    expect(withoutCacheIds(readTree(opened(tree)))).toEqual(withoutCacheIds(tree));
  });

  it('gives each created note a cache ID, using the ID its text holds when it has one', () => {
    const read = readTree(opened({ id: null, children: [note('a', { id: 'k3x9' }), note('b')] }));
    const [first, second] = read.children as OutlineNote[];

    expect(first!.cacheId).toBe('k3x9');
    expect(second!.cacheId).toMatch(/^[a-z\d]{10}$/i);
  });

  it('writes nothing when applying the tree a document already holds', () => {
    const doc = opened({ id: null, children: [note('a', { children: [note([text('b', 'bold'), text(' c')])] }), note('d')] });
    const tree = readTree(doc);

    expect(updatesDuring(doc, () => applyTree(doc, tree))).toBe(0);
  });

  it('keeps whitespace typed at a note\'s edges when the tree differs from it only there', () => {
    const doc = opened({ id: null, children: [note('abc')] });
    const tree = readTree(doc);
    const typed = structuredClone(tree);
    (typed.children[0] as OutlineNote).runs = [text('abc ')];
    applyTree(doc, typed);
    const plain = Y.encodeStateAsUpdate(doc);

    expect(updatesDuring(doc, () => applyTree(doc, tree))).toBe(0);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(plain);
  });

  it('matches notes by cache ID, moving, updating, deleting and creating as the tree says', () => {
    const doc = opened({ id: null, children: [note('a', { children: [note('b')] }), note('c'), note('gone')] });
    const before = readTree(doc);
    const a = findNote(before.children, 'a');
    const b = findNote(before.children, 'b');
    const c = findNote(before.children, 'c');

    applyTree(doc, {
      id: null,
      children: [
        { ...c, runs: [text('c changed')] },
        { ...b, children: [{ ...a, children: [] }] },
        note('new'),
      ],
    });
    const after = readTree(doc);

    expect(withoutCacheIds(after)).toEqual(withoutCacheIds({
      id: null,
      children: [note('c changed'), note('b', { children: [note('a')] }), note('new')],
    }));
    const [first, second, third] = after.children as OutlineNote[];
    expect([first!.cacheId, second!.cacheId, second!.children[0]!.cacheId]).toEqual([c.cacheId, b.cacheId, a.cacheId]);
    expect([a.cacheId, b.cacheId, c.cacheId]).not.toContain(third!.cacheId);
  });

  it('returns the state it read from when saving', () => {
    const doc = opened({ id: null, children: [note('a')] });
    const { tree, state } = saveTree(doc);
    const copy = new Y.Doc();
    Y.applyUpdate(copy, state);

    expect(readTree(copy)).toEqual(tree);
  });
});

// The same cases check Python's reader (test_text_format.py).
describe('normalizing runs', () => {
  const cases = JSON.parse(readFileSync('tests/fixtures/outline-tree/runs.json', 'utf8')) as Array<{ runs: Run[]; normalized: Run[] }>;

  it.each(cases)('normalizes $runs', ({ runs, normalized }) => {
    expect(trimRuns(normalizeRuns(runs))).toEqual(normalized);
  });
});

describe('applying to an editor', () => {
  function editorWith(tree: Document) {
    const editor = createEditor(editorConfig);
    editor.update(() => $applyTree(tree), { discrete: true });
    return editor;
  }
  function $item(cacheId: string): ListItemNode {
    const pending: LexicalNode[] = [$getRoot()];
    for (let node = pending.pop(); node; node = pending.pop()) {
      if ($isListItemNode(node) && $getNoteId(node) === cacheId) return node;
      if ($isElementNode(node)) pending.push(...node.getChildren());
    }
    throw new Error(`No note holds ${cacheId}`);
  }

  it('reads a note typed as a property line as its text', () => {
    const editor = editorWith({ id: null, children: [note('placeholder')] });
    const cacheId = (editor.getEditorState().read($readTree).children[0] as OutlineNote).cacheId!;
    editor.update(() => {
      const typed = $item(cacheId).getFirstChild();
      if ($isTextNode(typed)) typed.setTextContent('id:: x');
    }, { discrete: true });

    expect(withoutCacheIds(editor.getEditorState().read($readTree))).toEqual(withoutCacheIds({ id: null, children: [note('id:: x')] }));
  });

  it('deletes every note the tree doesn\'t hold, including a second holder of a cache ID', () => {
    const editor = editorWith({ id: null, children: [note('first'), note('second')] });
    const [first, second] = editor.getEditorState().read($readTree).children as OutlineNote[];
    editor.update(() => $setState($item(second!.cacheId!), noteIdState, first!.cacheId!), { discrete: true });

    editor.update(() => $applyTree({ id: null, children: [first!] }), { discrete: true });

    expect(editor.getEditorState().read($readTree)).toEqual({ id: null, children: [first] });
  });

  it('gives a note created twice from one cache ID a fresh one the second time', () => {
    const editor = editorWith({ id: null, children: [note('a', { cacheId: 'same' }), note('b', { cacheId: 'same' })] });
    const [a, b] = editor.getEditorState().read($readTree).children as OutlineNote[];

    expect(a!.cacheId).toBe('same');
    expect(b!.cacheId).not.toBe('same');
  });

  it('reads notes nested under a body as the notes after it', () => {
    const editor = editorWith({ id: null, children: [{ kind: 'body', source: ['text'], cacheId: null }, note('under')] });
    const [body, under] = editor.getEditorState().read($readTree).children;
    editor.update(() => {
      const nested = $getOrCreateChildList($item(body!.cacheId!));
      nested.append($item(under!.cacheId!));
    }, { discrete: true });

    expect(withoutCacheIds(editor.getEditorState().read($readTree))).toEqual(withoutCacheIds({
      id: null, children: [{ kind: 'body', source: ['text'], cacheId: null }, note('under')],
    }));
  });

  it('keeps the fold state of a note it moves and changes', () => {
    const editor = editorWith({ id: null, children: [note('a', { children: [note('x')] }), note('b')] });
    const before = editor.getEditorState().read($readTree);
    const [a, b] = before.children as OutlineNote[];
    editor.update(() => $setNoteFolded($item(a!.cacheId!), true), { discrete: true });

    editor.update(() => $applyTree({ id: null, children: [b!, { ...a!, runs: [text('a changed')] }] }), { discrete: true });

    expect(editor.getEditorState().read(() => $isNoteFolded($item(a!.cacheId!)))).toBe(true);
  });

  it('keeps whitespace typed at a note\'s edge while applying a change elsewhere in it', () => {
    const editor = editorWith({ id: null, children: [note('abc')] });
    const tree = editor.getEditorState().read($readTree);
    const cacheId = (tree.children[0] as OutlineNote).cacheId!;
    editor.update(() => {
      const typed = $item(cacheId).getFirstChild();
      if ($isTextNode(typed)) typed.setTextContent('abc ');
    }, { discrete: true });

    editor.update(() => $applyTree(retext(tree, 'abc', 'xbc')), { discrete: true });

    expect(editor.getEditorState().read(() => $item(cacheId).getTextContent())).toBe('xbc ');
  });

  it('replaces content that holds no text, such as an empty link', () => {
    const editor = editorWith({ id: null, children: [note('a')] });
    const tree = editor.getEditorState().read($readTree);
    const cacheId = (tree.children[0] as OutlineNote).cacheId!;
    editor.update(() => $item(cacheId).clear().append($createLinkNode('https://example.test')), { discrete: true });

    editor.update(() => $applyTree(tree), { discrete: true });

    expect(withoutCacheIds(editor.getEditorState().read($readTree))).toEqual(withoutCacheIds({ id: null, children: [note('a')] }));
  });
});

describe('applying changed text', () => {
  function peers(tree: Document): [Y.Doc, Y.Doc] {
    const a = opened(tree);
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    return [a, b];
  }
  const exchange = (a: Y.Doc, b: Y.Doc) => {
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
  };
  const runsOf = (doc: Y.Doc) => (readTree(doc).children[0] as OutlineNote).runs;

  it('writes only the characters that changed', () => {
    const doc = opened({ id: null, children: [note('a long note whose text mostly stays')] });
    const changes: unknown[] = [];
    doc.get('root-v2', Y.XmlElement).observeDeep((events) => {
      for (const event of events) changes.push(event.delta);
    });
    applyTree(doc, retext(readTree(doc), 'a long note whose text mostly stays', 'a long note whose text still mostly stays'));

    expect(changes).toEqual([[{ retain: 23 }, { insert: 'still ' }]]);
  });

  // Bindings other than V2 rewrite a replaced text node whole, so Apply edits the nodes in place.
  it('edits the existing text node in place, leaving untouched nodes as they are', () => {
    const editor = createEditor(editorConfig);
    const textKeys = () => editor.getEditorState().read(() => {
      const keys: string[] = [];
      const visit = (node: LexicalNode) => {
        if (node.getType() === 'text') keys.push(`${node.getKey()}:${node.getTextContent()}`);
        if ($isElementNode(node)) node.getChildren().forEach(visit);
      };
      visit($getRoot());
      return keys;
    });
    editor.update(() => $applyTree({ id: null, children: [note([text('one '), text('two', 'bold'), text(' three')])] }), { discrete: true });
    const [one, two, three] = textKeys().map((entry) => entry.split(':')[0]);
    const tree = editor.getEditorState().read($readTree);
    (tree.children[0] as OutlineNote).runs = [text('one '), text('two', 'bold'), text(' three and four')];
    editor.update(() => $applyTree(tree), { discrete: true });

    expect(textKeys()).toEqual([`${one}:one `, `${two}:two`, `${three}: three and four`]);
  });

  it('keeps a peer\'s concurrent typing elsewhere in the note', () => {
    const [a, b] = peers({ id: null, children: [note('start middle end')] });
    const tree = readTree(a);
    applyTree(a, retext(tree, 'start middle end', 'START middle end'));
    applyTree(b, retext(tree, 'start middle end', 'start middle end!'));
    exchange(a, b);

    expect(runsOf(a)).toEqual([text('START middle end!')]);
  });

  it('changes formatting without touching the note\'s other text', () => {
    const [a, b] = peers({ id: null, children: [note('one two three')] });
    const tree = readTree(a);
    const bolded = structuredClone(tree);
    (bolded.children[0] as OutlineNote).runs = [text('one '), text('two', 'bold'), text(' three')];
    applyTree(a, bolded);
    applyTree(b, retext(tree, 'one two three', 'one two three four'));
    exchange(a, b);

    expect(runsOf(a)).toEqual([text('one '), text('two', 'bold'), text(' three four')]);
  });
});
