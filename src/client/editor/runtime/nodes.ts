import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';

import { ensureCheckedStateConfig } from '#client/editor/features/checklist/checked-state';
import { ensureFoldStateConfig } from './fold-state';
import { DateNode } from '../features/date/date-node';
import { BodyWrapperNode, NoteBodyNode } from '#client/editor/outline/note-body-node';
import { NoteLinkNode } from '#client/editor/features/links/note-link-node';
import { ensureNoteIdStateConfig } from './note-id-state';

ensureNoteIdStateConfig();
ensureFoldStateConfig();
ensureCheckedStateConfig();

export const editorNodes: InitialConfigType['nodes'] = [
  ListNode,
  ListItemNode,
  BodyWrapperNode,
  LinkNode,
  AutoLinkNode,
  NoteLinkNode,
  DateNode,
  NoteBodyNode,
];
