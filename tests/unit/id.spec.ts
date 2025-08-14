import './common';
import { it } from 'vitest';
import { getNotes } from './common';
import { Note } from '@/components/Editor/plugins/remdo/utils/api';

it('get by ID', async ({ load, expect, lexicalUpdate }) => {
  const { note0, note00 } = load("basic");
  logger.preview();
  lexicalUpdate(() => {
    expect(note0.id).not.toEqual(note00.id);

    const { id: found0ID, text: found0Text } = Note.fromID(note0.id);
    expect(found0ID).toEqual(note0.id);
    expect(found0Text).toEqual(note0.text);

    const { id: found00ID, text: found00Text } = Note.fromID(note00.id);
    expect(found00ID).toEqual(note00.id);
    expect(found00Text).toEqual(note00.text);
  });

});

it('new notes', async ({ editor, expect, lexicalUpdate }) => {
  const { root } = getNotes(editor);

  lexicalUpdate(() => {
    expect(typeof root.id).toBe('string');
    expect(root.id.length).toBeGreaterThan(0);

    const note0 = root.createChild('note0');
    const note1 = root.createChild('note1');

    expect(typeof note0.id).toBe('string');
    expect(note0.id.length).toBeGreaterThan(0);

    expect(typeof note1.id).toBe('string');
    expect(note1.id.length).toBeGreaterThan(0);

    expect(note0.id).not.toEqual(note1.id);
  });
});

it('modify', async ({ load, expect, lexicalUpdate }) => {
  //modifying a note requires it to be cloned, let's check if it leaves id intact
  const { note0 } = load("basic");

  lexicalUpdate(() => {
    const note0ID = note0.id;
    note0.text = "note0 - modified";
    expect(note0.id).toEqual(note0ID);
  });
});

it('reorder', async ({ load, editor, expect, lexicalUpdate }) => {
  //the idea is to test if lexical doesn't make any optimizations that would break id/text relationship
  load("flat");
  let id0 = "", id1 = "", text0 = "", text1 = "";
  {
    const { note0, note1 } = getNotes(editor);
    lexicalUpdate(() => {
      ({ id: id0, text: text0 } = note0);
      ({ id: id1, text: text1 } = note1);
      note0.moveDown();
    });
  }
  {
    const { note0, note1 } = getNotes(editor);
    lexicalUpdate(() => {
      expect([note0.id, note0.text]).toEqual([id0, text0]);
      expect([note1.id, note1.text]).toEqual([id1, text1]);
    });
  }
});

