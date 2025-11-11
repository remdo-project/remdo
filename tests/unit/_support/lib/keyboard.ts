import type { LexicalEditor } from 'lexical';
import { act } from '@testing-library/react';

interface NavigatorWithUAData extends Navigator {
  userAgentData?: { platform?: string };
}

const APPLE_PATTERN = /Mac(?:intosh)?|iPhone|iPad|iPod/i;
const navigatorRef =
  typeof navigator === 'undefined' ? null : (navigator as NavigatorWithUAData);
const platformSource = navigatorRef?.userAgentData?.platform ?? navigatorRef?.userAgent ?? '';
const IS_APPLE = APPLE_PATTERN.test(platformSource);

interface PressKeyOptions {
  key: string;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  ctrl?: boolean;
  ctrlOrMeta?: boolean;
}

export async function pressKey(
  editor: LexicalEditor,
  { key, shift = false, alt = false, meta = false, ctrl = false, ctrlOrMeta }: PressKeyOptions
) {
  const root = editor.getRootElement();
  if (!root) {
    throw new Error('Lexical root element is not mounted');
  }

  let nextMeta = meta;
  let nextCtrl = ctrl;

  if (typeof ctrlOrMeta === 'boolean') {
    if (ctrlOrMeta) {
      nextMeta = IS_APPLE;
      nextCtrl = !IS_APPLE;
    } else {
      nextMeta = false;
      nextCtrl = false;
    }
  }

  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
    altKey: alt,
    metaKey: nextMeta,
    ctrlKey: nextCtrl,
  });

  await act(async () => {
    root.dispatchEvent(event);
  });
}
