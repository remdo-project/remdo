import type { AnyLexicalCommand, CommandPayloadType } from 'lexical';
import type { OutlineSelectionApi } from '#client/editor/outline/selection/store';

declare module 'lexical' {
  interface LexicalEditor {
    dispatchCommand: <TCommand extends AnyLexicalCommand>(
      type: TCommand,
      ...payload: [CommandPayloadType<TCommand>] extends [void] ? [] : [CommandPayloadType<TCommand>]
    ) => boolean;
    selection: OutlineSelectionApi;
  }
}
