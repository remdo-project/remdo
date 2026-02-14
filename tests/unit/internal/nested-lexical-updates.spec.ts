import { COMMAND_PRIORITY_CRITICAL, createCommand, $getRoot } from 'lexical';
import { describe, expect, it } from 'vitest';
import { meta } from '#tests';

const NESTED_UPDATE_COMMAND = createCommand('tests:nested-lexical-update');

function $mutateFirstNoteLabel(suffix: string) {
  const firstText = $getRoot().getAllTextNodes()[0]!;

  firstText.setTextContent(`${firstText.getTextContent()}${suffix}`);
}

describe('nested Lexical update guard', () => {
  it('throws when a command listener calls editor.update()', meta({ fixture: 'basic' }), async ({ remdo }) => {
        const { editor } = remdo;
    let caught: unknown = null;
    const unregister = editor.registerCommand(
      NESTED_UPDATE_COMMAND,
      () => {
        try {
          editor.update(() => {
            $mutateFirstNoteLabel('!');
          });
        } catch (error) {
          caught = error;
        }
        return true;
      },
      COMMAND_PRIORITY_CRITICAL
    );

    try {
      await remdo.mutate(() => {
        $mutateFirstNoteLabel('?');
        editor.dispatchCommand(NESTED_UPDATE_COMMAND, null);
      });
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/Nested Lexical editor\.update\(\) is prohibited/);
    } finally {
      unregister();
    }
  });

  it('throws when an update listener calls editor.update()', meta({ fixture: 'basic' }), async ({ remdo }) => {
        const { editor } = remdo;
    let caught: unknown = null;
    const unregister = editor.registerUpdateListener(() => {
      if (caught) return;
      try {
        editor.update(() => {
          $mutateFirstNoteLabel('!');
        });
      } catch (error) {
        caught = error;
      }
    });

    try {
      await remdo.mutate(() => {
        $mutateFirstNoteLabel('?');
      });
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/Nested Lexical editor\.update\(\) is prohibited/);
    } finally {
      unregister();
    }
  });
});
