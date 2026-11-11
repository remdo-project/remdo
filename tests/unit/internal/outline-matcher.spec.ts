import { describe, expect, it } from 'vitest';
import { selectStructuralNotes, meta, setRawNoteCheckedState } from '#tests';
import { fixtureComparableState } from '#tests-common/editor-state';
import { buildFixtureState } from '#tests-common/markdown-fixture';
import { listFixtureNames, readFixtureMarkdown } from '#tools/fixtures';

describe('toMatchOutline smoke coverage', async () => {
  const fixtureNames = await listFixtureNames();
  const markdownFixtures = new Map<string, string>();
  for (const name of fixtureNames) {
    const markdown = await readFixtureMarkdown(name);
    if (markdown !== null) markdownFixtures.set(name, markdown);
  }

  for (const [fixture, markdown] of markdownFixtures) {
    it(`loads ${fixture} as its test document describes`, meta({ fixture }), async ({ remdo }) => {
      expect(remdo).toMatchOutline(markdown);
      const documentId = remdo.getCollabDocId();
      expect(fixtureComparableState(remdo.getEditorState(), documentId))
        .toEqual(fixtureComparableState(buildFixtureState(markdown), documentId));
    });
  }

  it('covers every fixture', async () => {
    expect([...markdownFixtures.keys()]).toEqual(fixtureNames);
  });

  it('surfaces expected vs received outline when the matcher fails', meta({ fixture: 'flat' }), async ({ remdo }) => {
    expect(() => {
      expect(remdo).toMatchOutline(`
        - wrong label
      `);
    }).toThrow(/differs from the expected Markdown[\s\S]*wrong label[\s\S]*note3/u);
  });

  it('matches selection-only expectations', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(remdo).toMatchSelection({ state: 'structural', notes: ['note2', 'note3'] });
  });

  it('matches checked state strictly', meta({ fixture: 'flat' }), async ({ remdo }) => {
    await setRawNoteCheckedState(remdo, 'note1', true);
    await setRawNoteCheckedState(remdo, 'note2', false);

    expect(remdo).toMatchOutline(`
      - [x] note1
      - [ ] note2
      - note3
    `);
    expect(() => {
      expect(remdo).toMatchOutline(`
        - note1
        - note2
        - note3
      `);
    }).toThrow(/differs from the expected Markdown/u);
    expect(() => {
      expect(remdo).toMatchOutline(`
        - [x] note1
        - [x] note2
        - note3
      `);
    }).toThrow(/differs from the expected Markdown/u);
  });

  it('compares the IDs an expectation declares', meta({ fixture: 'flat' }), async ({ remdo }) => {
    expect(remdo).toMatchOutline(`
      - note1
          - id:: note1
      - note2
      - note3
    `);
    expect(() => {
      expect(remdo).toMatchOutline(`
        - note1
            - id:: other
        - note2
        - note3
      `);
    }).toThrow(/differs from the expected Markdown/u);
  });

  it('reports selection mismatches', meta({ fixture: 'tree-complex' }), async ({ remdo }) => {
    await selectStructuralNotes(remdo, 'note2', 'note3');

    expect(() => {
      expect(remdo).toMatchSelection({ state: 'structural', notes: ['note5'] });
    }).toThrow(/Selections differ/);
  });
});
