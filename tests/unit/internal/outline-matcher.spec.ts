import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { selectStructuralNotes, meta, setRawNoteCheckedState } from '#tests';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';
import { prepareEditorStateForPersistence } from '#tests-common/editor-state';

interface OutlineCase {
  fixture: string;
  outline: string;
}

// Fixtures intentionally excluded from outline-content coverage. `large` is a
// performance fixture (~600 notes seeded for dev/search profiling, not outline
// assertions); hand-authoring and maintaining its full expected outline here
// would add no value.
const COVERAGE_EXCLUDED_FIXTURES = new Set(['large']);

const CASES: OutlineCase[] = [
  {
    fixture: 'flat',
    outline: `
      - note1
      - note2
      - note3
    `,
  },
  {
    fixture: 'edge-spaces',
    outline: `
      - note1
      - &#32;note2SpaceLeft
          - id:: note2SpaceLeft
      - note3
      - note4SpaceRight&#32;
          - id:: note4SpaceRight
      - note5
    `,
  },
  {
    fixture: 'editor-showcase',
    outline: `
      - Editor showcase
          - id:: showcaseTitle
      - Plain bold italic underline strike code bold italic
          - id:: inlineFormatting
      - Due Jul 9, 2026 see done task and remote note
          - id:: dateAndLinks
      - [x] Note with body
          > Body has rich text and a note link
          > Second body line
          > Third body line
          - id:: bodyNote
      - Folded parent
          - id:: foldedParent
          - folded:: true
          - Hidden child
              - id:: foldedChild
      - Numbered steps
          - id:: numberedParent
          - First step
              - id:: stepOne
          - Second step
              > Second step body
              - id:: stepTwo
      - Checklist
          - id:: checklistParent
          - [x] Done task
              > Done task body
              - id:: checkDone
          - Open task
              - id:: checkOpen
    `,
  },
  {
    fixture: 'basic',
    outline: `
      - note1
          - note2
      - note3
    `,
  },
  {
    fixture: 'duplicate-titles',
    outline: `
      - note1
      - note2
          - task
              - id:: taskOne
      - note4
          - task
              - id:: taskTwo
      - note6
    `,
  },
  {
    fixture: 'formatted',
    outline: `
      - bold
          - italic
              - target
      - underline
      - plain bold italic underline plain
          - id:: mixedFormatting
    `,
  },
  {
    fixture: 'links',
    outline: `
      - same note2 cross /n/otherDoc_remoteNote
          - id:: note1
      - note2
      - note3
    `,
  },
  {
    fixture: 'tree',
    outline: `
      - note1
      - note2
          - note3
    `,
  },
  {
    fixture: 'tree-ordered-root',
    outline: `
      - note1
      - note2
          - note3
    `,
  },
  {
    fixture: 'tree-complex',
    outline: `
      - note1
          - note2
              - note3
          - note4
      - note5
      - note6
          - note7
    `,
  },
  {
    fixture: 'tree-list-types',
    outline: `
      - note1
          - note2
      - note3
          - note4
      - note5
          - note6
    `,
  },
  {
    fixture: 'empty-labels',
    outline: `
      - alpha
      - &#32;
          - id:: space
      - beta
      -
          - id:: parent

          -
              - id:: nestedEmpty
          - child-of-empty
              - id:: child
          -
              - id:: nestedAfterChild
      -
          - id:: trailing
    `,
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
      .map((entry) => entry.slice(0, -'.json'.length))
      .filter((fixture) => !COVERAGE_EXCLUDED_FIXTURES.has(fixture));

    const sortedFixtureNames = fixtureNames.toSorted();
    const covered = CASES.map(({ fixture }) => fixture).toSorted();

    expect(covered).toEqual(sortedFixtureNames);
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
