import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { ListItemNode, ListNode } from '@lexical/list';

import { ensureCheckedStateConfig } from '#client/editor/features/list-types/checked-state';
import { ensureFoldStateConfig } from '#client/editor/outline/fold-state';
import { DateNode } from '../features/date/date-node';
import { BodyWrapperNode, NoteBodyNode } from '#client/editor/outline/note-body-node';
import { NoteLinkNode } from '#client/editor/features/links/note-link-node';
import { ensureNoteIdStateConfig } from './note-ids/note-id-state';

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
