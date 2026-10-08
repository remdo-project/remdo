import type { LexicalEditor } from 'lexical';
import type { UndoManager } from 'yjs';

// Lexical publishes its active collaboration history here. Local history uses
// HISTORY_PUSH_TAG; this boundary gives an explicit action the same isolation
// in the Yjs capture window, without creating another history owner.
export function stopHistoryCapture(editor: LexicalEditor): void {
  const withHistory = editor as LexicalEditor & Record<symbol, UndoManager | undefined>;
  withHistory[Symbol.for('@lexical/yjs/UndoManager')]?.stopCapturing();
}
