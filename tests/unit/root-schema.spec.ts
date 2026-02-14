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

it('clear', async ({ remdo }) => {
  await remdo.mutate(() => {
    $getRoot().clear();
  });

  remdo.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItemCount(list, 1); // placeholder paragraph
  });
});

it('normalizes root after list command dispatch', async ({ remdo }) => {
  const { mutate, validate } = remdo;

  await mutate(() => {
    const root = $getRoot();
    root.clear();

    const note1Paragraph = $createParagraphNode();
    note1Paragraph.append($createTextNode('note1'));
    const note2Paragraph = $createParagraphNode();
    note2Paragraph.append($createTextNode('note2'));

    root.append(note1Paragraph, note2Paragraph);
    note1Paragraph.select();
  });

  await remdo.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND);

  validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['note1', 'note2']);
  });
});

it('allows ordered list as the root list type when present', async ({ remdo }) => {
  await remdo.mutate(() => {
    const root = $getRoot();
    root.clear();

    const list = $createListNode('number');
    const item = $createListItemNode();
    item.append($createTextNode('note1'));
    list.append(item);
    root.append(list);
  });

  remdo.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('number');
    expectListItems(list, ['note1']);
  });
});

it('wraps non-list root children into list items', async ({ remdo }) => {
  await remdo.mutate(() => {
    const root = $getRoot();
    root.clear();

    const note1Paragraph = $createParagraphNode();
    note1Paragraph.append($createTextNode('note1'));
    const note2Paragraph = $createParagraphNode();
    note2Paragraph.append($createTextNode('note2'));

    root.append(note1Paragraph, note2Paragraph);
  });

  remdo.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['note1', 'note2']);
  });
});

it('merges multiple bullet lists under a single root list', async ({ remdo }) => {
  await remdo.mutate(() => {
    const root = $getRoot();
    root.clear();

    const note1List = $createListNode('bullet');
    const note1Item = $createListItemNode();
    note1Item.append($createTextNode('note1'));
    note1List.append(note1Item);

    const note2List = $createListNode('bullet');
    const note2Item = $createListItemNode();
    note2Item.append($createTextNode('note2'));
    note2List.append(note2Item);

    root.append(note1List, note2List);
  });

  remdo.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getListType()).toBe('bullet');
    expectListItems(list, ['note1', 'note2']);
  });
});

it('leaves a canonical single list untouched', async ({ remdo }) => {
  let originalListKey: string;
  let originalItemKeys: string[] = [];

  await remdo.mutate(() => {
    const root = $getRoot();
    root.clear();

    const list = $createListNode('bullet');
    const note1Item = $createListItemNode();
    note1Item.append($createTextNode('note1'));
    const note2Item = $createListItemNode();
    note2Item.append($createTextNode('note2'));

    list.append(note1Item, note2Item);
    root.append(list);

    originalListKey = list.getKey();
    originalItemKeys = list.getChildren().map((child) => child.getKey());
  });

  remdo.validate(() => {
    const list = $expectSingleListRoot();
    expect(list.getKey()).toBe(originalListKey);
    const items = list.getChildren().map((child): ListItemNode => {
      expect($isListItemNode(child)).toBe(true);
      return child as ListItemNode;
    });
    expect(items.map((child) => child.getKey())).toEqual(originalItemKeys);
  });
});

function $expectSingleListRoot(): ListNode {
  const root = $getRoot();
  expect(root.getChildrenSize()).toBe(1);

  const list = root.getFirstChild();
  expect($isListNode(list)).toBe(true);
  return list as ListNode;
}

function expectListItemCount(list: ListNode, expectedCount: number) {
  const items = list.getChildren();
  expect(items).toHaveLength(expectedCount);
  for (const child of items) expect($isListItemNode(child)).toBe(true);
}

function expectListItems(list: ListNode, expectedTexts: string[]) {
  const items = list.getChildren();
  expect(items).toHaveLength(expectedTexts.length);

  for (const [index, child] of items.entries()) {
    expect($isListItemNode(child)).toBe(true);
    if ($isListItemNode(child)) {
      expect(child.getTextContent()).toBe(expectedTexts[index]);
    }
  }
}
