import type { EditorUpdateOptions, LexicalEditor } from 'lexical';

export async function lexicalMutate(
  editor: LexicalEditor,
  fn: () => void,
  opts: EditorUpdateOptions = {}
): Promise<void> {
  const timeoutMs = 1500;
  const uniqueTag = `test:${Date.now()}:${Math.random()}`;
  const tags = [uniqueTag, ...([opts.tag ?? []].flat())];

  return new Promise<void>((resolve, reject) => {
    const off = editor.registerUpdateListener(({ tags }) => {
      if (tags.has(uniqueTag)) {
        cleanup(); resolve();
      }
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          `lexicalMutate timed out waiting for commit (tag: ${uniqueTag}), did you run editor.update() and made any changes in it?`
        )
      );
    }, timeoutMs);

    function cleanup() { clearTimeout(timer); off(); }

    try {
      editor.update(fn, { ...opts, tag: tags });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export function lexicalValidate<T>(editor: LexicalEditor, fn: () => T): T {
  return editor.getEditorState().read(fn);
}
