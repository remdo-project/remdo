import type { LexicalEditor, RootNode } from 'lexical';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
} from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
} from 'lexical';

export function seedInitialState(_editor: LexicalEditor) {
  const root = $getRoot();
  if (!isPristineListRoot(root)) {
    return;
  }

  root.clear();

  const makeListItem = (text: string) => {
    const listItem = $createListItemNode();
    const paragraph = $createParagraphNode();
    paragraph.append($createTextNode(text));
    listItem.append(paragraph);
    return listItem;
  };

  const rootList = $createListNode('bullet');
  root.append(rootList);

  const topItem = makeListItem('note0');
  rootList.append(topItem);

  const nestedList = $createListNode('bullet');
  nestedList.append(makeListItem('subNote0'), makeListItem('subNote1'));
  topItem.append(nestedList);
}

function isPristineListRoot(root: RootNode): boolean {
  const firstChild = root.getFirstChild();
  if (firstChild === null) {
    return true;
  }

  if (!$isListNode(firstChild) || firstChild.getNextSibling() !== null) {
    return false;
  }

  const listNode = firstChild;
  const listChildren = listNode.getChildren();
  if (listChildren.length === 0) {
    return true;
  }

  if (listChildren.length > 1) {
    return false;
  }

  const soleListItem = listChildren[0];
  if (!$isListItemNode(soleListItem)) {
    return false;
  }

  const itemChildren = soleListItem.getChildren();
  if (itemChildren.length === 0) {
    return true;
  }

  if (itemChildren.length > 1) {
    return false;
  }

  const onlyChild = itemChildren[0];
  return $isParagraphNode(onlyChild) && onlyChild.getTextContent().trim().length === 0;
}
