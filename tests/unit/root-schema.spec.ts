import type { ListItemNode, ListNode } from '@lexical/list';
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { expect, it } from 'vitest';

it('clear', async ({ lexical }) => {
  await lexical.mutate(() => {
    $getRoot().clear();
  });

  lexical.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItemCount(list, 1); // placeholder paragraph
  });
});

it('normalizes root after list command dispatch', async ({ lexical }) => {
  const { editor, mutate, validate } = lexical;

  await mutate(() => {
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
  await mutate(() => { });

  validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['First', 'Second']);
  });
});

it('allows ordered list as the root list type when present', async ({ lexical }) => {
  await lexical.mutate(() => {
    const root = $getRoot();
    root.clear();

    const list = $createListNode('number');
    const item = $createListItemNode();
    item.append($createTextNode('ordered'));
    list.append(item);
    root.append(list);
  });

  lexical.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('number');
    expectListItems(list, ['ordered']);
  });
});

it('wraps non-list root children into list items', async ({ lexical }) => {
  await lexical.mutate(() => {
    const root = $getRoot();
    root.clear();

    const firstParagraph = $createParagraphNode();
    firstParagraph.append($createTextNode('alpha'));
    const secondParagraph = $createParagraphNode();
    secondParagraph.append($createTextNode('beta'));

    root.append(firstParagraph, secondParagraph);
  });

  lexical.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['alpha', 'beta']);
  });
});

it('merges multiple bullet lists under a single root list', async ({ lexical }) => {
  await lexical.mutate(() => {
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

  lexical.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['one', 'two']);
  });
});

it('leaves a canonical single list untouched', async ({ lexical }) => {
  let originalListKey: string;
  let originalItemKeys: string[] = [];

  await lexical.mutate(() => {
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

  lexical.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getKey()).toBe(originalListKey);
    const items = list.getChildren().map((child): ListItemNode => {
      if (!$isListItemNode(child)) {
        throw new Error('Expected root list child to remain a list item');
      }
      return child;
    });
    expect(items.map((child) => child.getKey())).toEqual(originalItemKeys);
  });
});

function $expectSingleListRoot(): ListNode {
  const root = $getRoot();
  expect(root.getChildrenSize()).toBe(1);

  const list = root.getFirstChild();
  expect($isListNode(list)).toBe(true);
  if (!$isListNode(list)) {
    throw new Error('Expected root child to be a list');
  }

  return list;
}

function expectListItemCount(list: ListNode, expectedCount: number) {
  const items = list.getChildren();
  expect(items).toHaveLength(expectedCount);
  items.forEach((child) => expect($isListItemNode(child)).toBe(true));
}

function expectListItems(list: ListNode, expectedTexts: string[]) {
  const items = list.getChildren();
  expect(items).toHaveLength(expectedTexts.length);

  items.forEach((child, index) => {
    expect($isListItemNode(child)).toBe(true);
    if ($isListItemNode(child)) {
      expect(child.getTextContent()).toBe(expectedTexts[index]);
    }
  });
}
