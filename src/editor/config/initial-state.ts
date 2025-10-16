import type { LexicalEditor } from 'lexical';
import {
  $createListItemNode,
  $createListNode,
} from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
} from 'lexical';

export function seedInitialState(_editor: LexicalEditor) {
  const root = $getRoot();

  const makeListItem = (text: string) => {
    const listItem = $createListItemNode();
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(text));
    listItem.append(paragraph);
    return listItem;
  };

  const rootList = $createListNode('bullet');
  root.append(rootList);

  const note1 = makeListItem('note1');
  rootList.append(note1);

  const note2 = makeListItem('note2');
  rootList.append(note2);

  const note3 = makeListItem('note3');
  rootList.append(note3);
}
