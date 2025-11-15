import type { CommandPayloadType, LexicalCommand } from 'lexical';

declare module 'lexical' {
  interface LexicalEditor {
    // eslint-disable-next-line ts/method-signature-style
    dispatchCommand<TCommand extends LexicalCommand<unknown>>(
      type: TCommand,
      ...payload: [CommandPayloadType<TCommand>] extends [void] ? [] : [CommandPayloadType<TCommand>]
    ): boolean;
  }
}
