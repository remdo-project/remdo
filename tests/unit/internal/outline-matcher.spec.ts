import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Outline } from '#tests';
import { selectStructuralNotes, meta, setRawNoteCheckedState } from '#tests';
import { stripEditorStateDefaults } from '#lib/editor/editor-state-defaults';
import { prepareEditorStateForPersistence } from '#lib/editor/editor-state-persistence';

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
      { noteId: 'note2SpaceLeft', text: ' note2SpaceLeft' },
      { noteId: 'note3', text: 'note3' },
      { noteId: 'note4SpaceRight', text: 'note4SpaceRight ' },
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
      { noteId: 'note2', text: 'note2', children: [ { noteId: 'taskOne', text: 'task' } ] },
      { noteId: 'note4', text: 'note4', children: [ { noteId: 'taskTwo', text: 'task' } ] },
      { noteId: 'note6', text: 'note6' },
    ],
  },
  {
    fixture: 'formatted',
    outline: [
      { noteId: 'bold', text: 'bold', children: [ { noteId: 'italic', text: 'italic', children: [ { noteId: 'target', text: 'target' } ] } ] },
      { noteId: 'underline', text: 'underline' },
      { noteId: 'mixedFormatting', text: 'plain bold italic underline plain' },
    ],
  },
  {
    fixture: 'links',
    outline: [
      { noteId: 'note1', text: 'same note2 cross /n/otherDoc_remoteNote' },
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
      { noteId: 'parent', children: [ { noteId: 'nestedEmpty' }, { noteId: 'child', text: 'child-of-empty' }, { noteId: 'nestedAfterChild' } ] },
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
      const persisted = prepareEditorStateForPersistence(remdo.getEditorState(), remdo.getCollabDocId());
      const minified = stripEditorStateDefaults(persisted);
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

    expect(thrown).toBeInstanceOf(Error);
    const thrownError = thrown as Error;
    expect(thrownError.message).toContain('Outlines differ.');
    expect(thrownError.message).toContain('"text": "wrong label"');
    expect(thrownError.message).toContain('"text": "note1"');
    expect(thrownError.message).toContain('"text": "note2"');
    expect(thrownError.message).toContain('"text": "note3"');
  });

  it('matches selection-only expectations', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('supports checked assertions in toMatchOutline', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setRawNoteCheckedState(remdo, 'note1', true);
    await setRawNoteCheckedState(remdo, 'note2', false);

    expect(remdo).toMatchOutline([
      { noteId: 'note1', text: 'note1', checked: true },
      { noteId: 'note2', text: 'note2', checked: false },
      { noteId: 'note3', text: 'note3' },
    ]);
  });

  it('fails checked assertions when expected checked state does not match', meta({ fixture: 'flat' }), async ({ remdo }) => {
    let thrown: unknown;
    try {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1', checked: true },
        { noteId: 'note2', text: 'note2', checked: true },
        { noteId: 'note3', text: 'note3' },
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const thrownError = thrown as Error;
    expect(thrownError.message).toContain('Outlines differ.');
    expect(thrownError.message).toContain('"checked": true');
  });

  it('treats omitted checked as unchecked expectation', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setRawNoteCheckedState(remdo, 'note1', true);

    let thrown: unknown;
    try {
      expect(remdo).toMatchOutline([
        { noteId: 'note1', text: 'note1' },
        { noteId: 'note2', text: 'note2' },
        { noteId: 'note3', text: 'note3' },
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const thrownError = thrown as Error;
    expect(thrownError.message).toContain('Outlines differ.');
    expect(thrownError.message).toContain('"checked": true');
  });

  it('reports selection mismatches', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5'] });
    }).toThrowError(/Selections differ/);
  });
});
