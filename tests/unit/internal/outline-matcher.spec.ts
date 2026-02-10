import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Outline } from '#tests';
import { selectStructuralNotes, meta } from '#tests';
import { stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';

interface OutlineCase {
  fixture: string;
  outline: Outline;
}

const CASES: OutlineCase[] = [
  {
    fixture: 'flat',
    outline: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ],
  },
  {
    fixture: 'edge-spaces',
    outline: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2-space-left', text: ' note2-space-left' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note4-space-right', text: 'note4-space-right ' },
      { noteId: 'note5', text: 'note5' },
    ],
  },
  {
    fixture: 'basic',
    outline: [
      { noteId: 'note1', text: 'note1', children: [ { noteId: 'note2', text: 'note2' } ] },
      { noteId: 'note3', text: 'note3' },
    ],
  },
  {
    fixture: 'duplicate-titles',
    outline: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'task-1', text: 'task' } ] },
      { noteId: 'note4', text: 'note4', children: [ { noteId: 'task-2', text: 'task' } ] },
      { noteId: 'note6', text: 'note6' },
    ],
  },
  {
    fixture: 'formatted',
    outline: [
      { noteId: 'bold', text: 'bold', children: [ { noteId: 'italic', text: 'italic', children: [ { noteId: 'target', text: 'target' } ] } ] },
      { noteId: 'underline', text: 'underline' },
      { noteId: 'mixed-formatting', text: 'plain bold italic underline plain' },
    ],
  },
  {
    fixture: 'links',
    outline: [
      { noteId: 'note1', text: 'same note2 cross /n/other-doc_remote-note' },
      { noteId: 'note2', text: 'note2' },
      { noteId: 'note3', text: 'note3' },
    ],
  },
  {
    fixture: 'main',
    outline: [
      { noteId: 'note1', text: 'note1', children: [ { noteId: 'note2', text: 'note2' } ] },
      { noteId: 'note3', text: 'note3' },
    ],
  },
  {
    fixture: 'tree',
    outline: [
      { noteId: 'note1', text: 'note1' },
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
    ],
  },
  {
    fixture: 'tree-complex',
    outline: [
      {
        noteId: 'note1',
        text: 'note1',
        children: [
          { noteId: 'note2', text: 'note2', children: [ { noteId: 'note3', text: 'note3' } ] },
          { noteId: 'note4', text: 'note4' },
        ],
      },
      { noteId: 'note5', text: 'note5' },
      { noteId: 'note6', text: 'note6', children: [ { noteId: 'note7', text: 'note7' } ] },
    ],
  },
  {
    fixture: 'tree-list-types',
    outline: [
      { noteId: 'note1', text: 'note1', children: [ { noteId: 'note2', text: 'note2' } ] },
      { noteId: 'note3', text: 'note3', children: [ { noteId: 'note4', text: 'note4' } ] },
      { noteId: 'note5', text: 'note5', children: [ { noteId: 'note6', text: 'note6' } ] },
    ],
  },
  {
    fixture: 'empty-labels',
    outline: [
      { noteId: 'alpha', text: 'alpha' },
      { noteId: 'space', text: ' ' },
      { noteId: 'beta', text: 'beta' },
      { noteId: 'parent', children: [ { noteId: 'nested-empty' }, { noteId: 'child', text: 'child-of-empty' }, { noteId: 'nested-after-child' } ] },
      { noteId: 'trailing' },
    ],
  },
];

describe('toMatchOutline smoke coverage', () => {
  for (const { fixture, outline } of CASES) {
    it(`reads ${fixture}`, meta({ fixture }), async ({ remdo }) => {
      expect(remdo).toMatchOutline(outline);

      const fixturePath = path.resolve('tests/fixtures', `${fixture}.json`);
      const raw = await fs.readFile(fixturePath, 'utf8');
      const minified = stripEditorStateDefaults(remdo.getEditorState());
      const minifiedRaw = `${JSON.stringify(minified, null, 2)}\n`;
      expect(minifiedRaw).toBe(raw);
    });
  }

  it('covers every fixture', async () => {
    const fixturesRoot = path.resolve('tests/fixtures');
    const entries = await fs.readdir(fixturesRoot);
    const fixtureNames = entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => entry.slice(0, -'.json'.length));

    const sortedFixtureNames = fixtureNames.toSorted();
    const covered = CASES.map(({ fixture }) => fixture).toSorted();

    expect(covered).toEqual(sortedFixtureNames);
  });

  it('surfaces expected vs received outline when the matcher fails', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let thrown: unknown;
    try {
      expect(remdo).toMatchOutline([{ noteId: 'wrong', text: 'wrong label' }]);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Error)) {
      throw new Error('Expected toMatchOutline mismatch to throw');
    }

    expect(thrown.message).toContain('Outlines differ.');
    expect(thrown.message).toContain('"text": "wrong label"');
    expect(thrown.message).toContain('"text": "note1"');
    expect(thrown.message).toContain('"text": "note2"');
    expect(thrown.message).toContain('"text": "note3"');
  });

  it('matches selection-only expectations', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('reports selection mismatches', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5'] });
    }).toThrowError(/Selections differ/);
  });
});
