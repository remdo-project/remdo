import { describe, expect, it } from 'vitest';
import { buildFixtureState } from '#tests-common/markdown-fixture';
import { stripEditorStateDefaults } from '#tools/editor-state-defaults';

interface Node { type: string; noteId?: string; children?: Node[]; [key: string]: unknown }

function noteIds(source: string): string[] {
  const ids: string[] = [];
  const walk = (node: Node) => {
    if (node.noteId !== undefined) ids.push(node.noteId);
    node.children?.forEach(walk);
  };
  walk(buildFixtureState(source).root);
  return ids;
}

describe('building fixture state from a test document', () => {
  it('builds nested bullet, numbered and check lists', () => {
    expect(stripEditorStateDefaults(buildFixtureState(`
      - note1
          1. note2
          2. note3
              - [x] done
                  - kid
              - [ ] open
      -
          - id:: empty
          - folded:: true
          - child
    `))).toEqual({
      root: {
        type: 'root',
        children: [{
          type: 'list',
          children: [
            { type: 'listitem', noteId: 'note1', value: 1, children: [{ type: 'text', text: 'note1' }] },
            {
              type: 'listitem',
              value: 2,
              children: [{
                type: 'list',
                listType: 'number',
                tag: 'ol',
                children: [
                  { type: 'listitem', noteId: 'note2', value: 1, indent: 1, children: [{ type: 'text', text: 'note2' }] },
                  { type: 'listitem', noteId: 'note3', value: 2, indent: 1, children: [{ type: 'text', text: 'note3' }] },
                  {
                    type: 'listitem',
                    value: 3,
                    indent: 1,
                    children: [{
                      type: 'list',
                      listType: 'check',
                      children: [
                        { type: 'listitem', noteId: 'done', value: 1, indent: 2, checked: true, checkState: true, children: [{ type: 'text', text: 'done' }] },
                        {
                          type: 'listitem',
                          value: 2,
                          indent: 2,
                          checked: false,
                          children: [{
                            type: 'list',
                            children: [{ type: 'listitem', noteId: 'kid', value: 1, indent: 3, children: [{ type: 'text', text: 'kid' }] }],
                          }],
                        },
                        { type: 'listitem', noteId: 'open', value: 2, indent: 2, checked: false, children: [{ type: 'text', text: 'open' }] },
                      ],
                    }],
                  },
                ],
              }],
            },
            { type: 'listitem', noteId: 'empty', value: 2, folded: true, children: [] },
            {
              type: 'listitem',
              value: 3,
              children: [{
                type: 'list',
                children: [{ type: 'listitem', noteId: 'child', value: 1, indent: 1, children: [{ type: 'text', text: 'child' }] }],
              }],
            },
          ],
        }],
      },
    });
  });

  it('identifies a note by its text unless an id:: line, an invalid text or a taken ID says otherwise', () => {
    const [first, declared, duplicate, spaced, empty] = noteIds(`
      - same
      - other
          - id:: same2
      - same
      - two words
      -
    `);
    expect([first, declared]).toEqual(['same', 'same2']);
    for (const generated of [duplicate, spaced, empty]) expect(generated).toMatch(/^[A-Za-z1-9]{10}$/u);
    expect(noteIds('- taken\n- note\n    - id:: taken')).toEqual([expect.stringMatching(/^\w{10}$/u), 'taken']);
  });

  it.each([
    ['a selection', '- note<selection />', /no selection/u],
    ['a list mixing numbered and bulleted notes', '1. one\n- two', /either numbered or not/u],
    ['a check list missing a checkbox', '- [ ] one\n- two', /every note a checkbox/u],
    ['a numbered check list', '1. [ ] one', /not both/u],
    ['inline Markdown', '- **bold**', /inline Markdown/u],
    ['a body', '- note\n    > body', /no body/u],
    ['a folded note without children', '- note\n    - folded:: true', /has none/u],
    ['a numbered list starting past 1', '3. three\n4. four', /starts at 1, not 3/u],
    ['an invalid id:: value', '- note\n    - id:: a_b', /isn't a valid note ID/u],
    ['one ID on two notes', '- one\n    - id:: x\n- two\n    - id:: x', /declare id:: x/u],
  ])('refuses %s', (_case, source, message) => {
    expect(() => buildFixtureState(source)).toThrow(message);
  });
});
