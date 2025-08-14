import { createCommand, LexicalCommand } from "lexical";

export const NOTES_TOGGLE_FOLD_COMMAND: LexicalCommand<{ noteKeys: string[] }> =
  createCommand("NOTES_TOGGLE_FOLD_COMMAND");

export const NOTES_FOLD_TO_LEVEL_COMMAND: LexicalCommand<void> = createCommand(
  "NOTES_FOLD_TO_LEVEL_COMMAND"
);

export const NOTES_START_MOVING_COMMAND: LexicalCommand<{ keys: string[] }> =
  createCommand("NOTES_START_MOVING_COMMAND");

export const NOTES_MOVE_COMMAND: LexicalCommand<{
  keys: string[];
  targetKey: string;
}> = createCommand("NOTES_MOVE_COMMAND");

export const NOTES_SEARCH_COMMAND: LexicalCommand<void> = createCommand(
  "NOTES_SEARCH_COMMAND"
);

export const NOTES_OPEN_QUICK_MENU_COMMAND: LexicalCommand<{
  left: number;
  top: number;
  noteKeys: string[];
}> = createCommand("NOTES_OPEN_QUICK_MENU_COMMAND");

export const NOTES_FOCUS_COMMAND: LexicalCommand<{ key: string }> =
  createCommand("NOTES_FOCUS_COMMAND");

export const NOTES_SET_FOLD_LEVEL_COMMAND: LexicalCommand<{ level: number }> =
  createCommand("NOTES_SET_FOLD_LEVEL_COMMAND");

export const SPACER_COMMAND: LexicalCommand<void> =
  createCommand("*** SPACER ***");

export const YJS_SYNCED_COMMAND: LexicalCommand<void> =
  createCommand("YJS_SYNCED_COMMAND");
