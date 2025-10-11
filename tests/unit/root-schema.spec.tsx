import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { expect, it } from 'vitest';

it('clear', async ({ lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    $getRoot().clear();
  });

  lexicalValidate(() => {
    //TODO check ul's child and use a structure check helper
    expect($getRoot().getChildrenSize()).toBe(1);
    expect($isListNode($getRoot().getFirstChild())).toBe(true);
  });
});

it('normalizes root after list command dispatch', async ({ editor, lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    const root = $getRoot();
    root.clear();

    const firstParagraph = $createParagraphNode();
    firstParagraph.append($createTextNode('First'));
    const secondParagraph = $createParagraphNode();
    secondParagraph.append($createTextNode('Second'));

    root.append(firstParagraph, secondParagraph);
    firstParagraph.select();
  });

  editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
  await lexicalMutate(() => { });

  lexicalValidate(() => {
    const root = $getRoot();
    expect(root.getChildrenSize()).toBe(1);

    const list = root.getFirstChild();
    expect($isListNode(list)).toBe(true);
    if (!$isListNode(list)) {
      throw new Error('Expected root child to be a list');
    }

    expect(list.getChildrenSize()).toBe(2);
    list.getChildren().forEach((child) => expect($isListItemNode(child)).toBe(true));
  });
});

it('allows ordered list as the root list type when present', async ({ lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    const root = $getRoot();
    root.clear();

    const list = $createListNode('number');
    const item = $createListItemNode();
    item.append($createTextNode('ordered'));
    list.append(item);
    root.append(list);
  });

  lexicalValidate(() => {
    const root = $getRoot();
    expect(root.getChildrenSize()).toBe(1);

    const list = root.getFirstChild();
    expect($isListNode(list)).toBe(true);
    if (!$isListNode(list)) {
      throw new Error('Expected root child to be a list');
    }

    expect(list.getListType()).toBe('number');
    expect(list.getChildrenSize()).toBe(1);

    const item = list.getFirstChild();
    expect($isListItemNode(item)).toBe(true);
    if (!$isListItemNode(item)) {
      throw new Error('Expected list child to be a list item');
    }

    expect(item.getTextContent()).toBe('ordered');
  });
});

it('wraps non-list root children into list items', async ({ lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    const root = $getRoot();
    root.clear();

    const firstParagraph = $createParagraphNode();
    firstParagraph.append($createTextNode('alpha'));
    const secondParagraph = $createParagraphNode();
    secondParagraph.append($createTextNode('beta'));

    root.append(firstParagraph, secondParagraph);
  });

  lexicalValidate(() => {
    const root = $getRoot();
    expect(root.getChildrenSize()).toBe(1);

    const list = root.getFirstChild();
    expect($isListNode(list)).toBe(true);
    if (!$isListNode(list)) {
      throw new Error('Expected root child to be a list');
    }

    expect(list.getChildrenSize()).toBe(2);
    list.getChildren().forEach((child) => expect($isListItemNode(child)).toBe(true));
  });
});

it('merges multiple bullet lists under a single root list', async ({ lexicalMutate, lexicalValidate }) => {
  await lexicalMutate(() => {
    const root = $getRoot();
    root.clear();

    const firstList = $createListNode('bullet');
    const firstItem = $createListItemNode();
    firstItem.append($createTextNode('one'));
    firstList.append(firstItem);

    const secondList = $createListNode('bullet');
    const secondItem = $createListItemNode();
    secondItem.append($createTextNode('two'));
    secondList.append(secondItem);

    root.append(firstList, secondList);
  });

  lexicalValidate(() => {
    const root = $getRoot();
    expect(root.getChildrenSize()).toBe(1);

    const list = root.getFirstChild();
    expect($isListNode(list)).toBe(true);
    if (!$isListNode(list)) {
      throw new Error('Expected root child to be a list');
    }

    expect(list.getChildrenSize()).toBe(2);
    list.getChildren().forEach((child) => expect($isListItemNode(child)).toBe(true));
  });
});

it('leaves a canonical single list untouched', async ({ lexicalMutate, lexicalValidate }) => {
  let originalListKey: string;
  let originalItemKeys: string[] = [];

  await lexicalMutate(() => {
    const root = $getRoot();
    root.clear();

    const list = $createListNode('bullet');
    const firstItem = $createListItemNode();
    firstItem.append($createTextNode('stay'));
    const secondItem = $createListItemNode();
    secondItem.append($createTextNode('here'));

    list.append(firstItem, secondItem);
    root.append(list);

    originalListKey = list.getKey();
    originalItemKeys = list.getChildren().map((child) => child.getKey());
  });

  lexicalValidate(() => {
    const root = $getRoot();
    expect(root.getChildrenSize()).toBe(1);

    const list = root.getFirstChild();
    expect($isListNode(list)).toBe(true);
    if (!$isListNode(list)) {
      throw new Error('Expected root child to be a list');
    }

    expect(list.getKey()).toBe(originalListKey);
    const itemKeys = list.getChildren().map((child) => child.getKey());
    expect(itemKeys).toEqual(originalItemKeys);
  });
});
