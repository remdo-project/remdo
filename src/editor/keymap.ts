import type { LexicalCommand } from 'lexical';
import { MOVE_SELECTION_DOWN_COMMAND, MOVE_SELECTION_UP_COMMAND } from '@/editor/commands';
import { IS_APPLE_PLATFORM } from '@/editor/platform';

export interface KeyBinding {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
}

interface MoveBindings {
  up: KeyBinding;
  down: KeyBinding;
}

const COMMAND_TO_ID = new Map<LexicalCommand<unknown>, keyof MoveBindings>([
  [MOVE_SELECTION_UP_COMMAND, 'up'],
  [MOVE_SELECTION_DOWN_COMMAND, 'down'],
]);

let overrides: Partial<MoveBindings> | null = null;

const defaultsForPlatform = (isApple: boolean): MoveBindings => ({
  up: {
    key: 'ArrowUp',
    shift: true,
    ctrl: isApple ? true : undefined,
    alt: isApple ? undefined : true,
  },
  down: {
    key: 'ArrowDown',
    shift: true,
    ctrl: isApple ? true : undefined,
    alt: isApple ? undefined : true,
  },
});

const applyOverrides = (base: MoveBindings): MoveBindings => ({
  up: overrides?.up ?? base.up,
  down: overrides?.down ?? base.down,
});

export function getDefaultMoveBindingsForPlatform(isApple: boolean): MoveBindings {
  return defaultsForPlatform(isApple);
}

export function getMoveBindings(): MoveBindings {
  const base = defaultsForPlatform(IS_APPLE_PLATFORM);
  return applyOverrides(base);
}

export function getKeyBinding(command: LexicalCommand<unknown>): KeyBinding | null {
  const id = COMMAND_TO_ID.get(command);
  if (!id) return null;
  const bindings = getMoveBindings();
  return bindings[id];
}

export function setMoveBindingsForTests(next: Partial<MoveBindings> | null): void {
  overrides = next;
}
