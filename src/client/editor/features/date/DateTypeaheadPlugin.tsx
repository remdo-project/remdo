import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import dayjs from 'dayjs';
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  KEY_BACKSPACE_COMMAND,
  KEY_ESCAPE_COMMAND,
} from 'lexical';
import type { LexicalNode, TextNode } from 'lexical';
import type {
  MenuRenderFn,
  MenuTextMatch,
  TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { $createDateNode } from './date-node';
import { DatePickerPanel } from './DatePickerPopover';

const OPENING_BOUNDARY_CHARS = new Set(['(', '[', '{']);
const WHITESPACE_PATTERN = /\s/u;

// The typeahead always shows a single "today" option, so query text is ignored.
const noopQueryChange = (): void => {};

class DateTypeaheadOption extends MenuOption {
  isoDate: string;

  constructor(isoDate: string) {
    super(isoDate);
    this.isoDate = isoDate;
  }
}

function getTodayIsoDate(): string {
  return dayjs().format('YYYY-MM-DD');
}

function isBoundaryCharacter(character: string): boolean {
  return WHITESPACE_PATTERN.test(character) || OPENING_BOUNDARY_CHARS.has(character);
}

function $getPreviousTextCharacter(node: TextNode): string | null {
  let previousSibling: LexicalNode | null = node.getPreviousSibling();
  while (previousSibling) {
    const previousText = previousSibling.getTextContent();
    if (previousText.length > 0) {
      return previousText.at(-1) ?? null;
    }
    previousSibling = previousSibling.getPreviousSibling();
  }

  return null;
}

function $hasTriggerBoundary(triggerOffset: number, text: string): boolean {
  if (triggerOffset > 0) {
    return isBoundaryCharacter(text[triggerOffset - 1] ?? '');
  }

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.anchor.type !== 'text') {
    return false;
  }

  const previousCharacter = $getPreviousTextCharacter(selection.anchor.getNode());
  return previousCharacter === null || isBoundaryCharacter(previousCharacter);
}

function $matchDateTrigger(text: string): MenuTextMatch | null {
  const triggerOffset = text.length - 1;
  if (triggerOffset < 0 || text[triggerOffset] !== '!') {
    return null;
  }

  if (!$hasTriggerBoundary(triggerOffset, text)) {
    return null;
  }

  return {
    leadOffset: triggerOffset,
    matchingString: '',
    replaceableString: '!',
  };
}

function $deleteOpenTrigger(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') {
    return false;
  }

  const anchorNode = selection.anchor.getNode();
  const offset = selection.anchor.offset;
  if (offset <= 0 || anchorNode.getTextContent()[offset - 1] !== '!') {
    return false;
  }

  selection.setTextNodeRange(anchorNode, offset - 1, anchorNode, offset);
  selection.removeText();
  return true;
}

export function DateTypeaheadPlugin() {
  const [editor] = useLexicalComposerContext();
  const typeaheadOpenRef = useRef(false);
  const [defaultOption, setDefaultOption] = useState(() => new DateTypeaheadOption(getTodayIsoDate()));

  const options = useMemo(() => [defaultOption], [defaultOption]);
  const $triggerFn = useCallback<TriggerFn>((text) => $matchDateTrigger(text), []);

  const closeTypeahead = useCallback(() => {
    if (!typeaheadOpenRef.current) {
      return;
    }

    editor.dispatchCommand(
      KEY_ESCAPE_COMMAND,
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    );
  }, [editor]);

  const handlePickerMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleTypeaheadOpen = useCallback(() => {
    typeaheadOpenRef.current = true;
    setDefaultOption(new DateTypeaheadOption(getTodayIsoDate()));
  }, []);

  const $handleSelectOption = useCallback(
    (option: DateTypeaheadOption, textNodeContainingQuery: TextNode | null, closeMenu: () => void) => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !textNodeContainingQuery) {
        return;
      }

      textNodeContainingQuery.remove();
      selection.insertNodes([$createDateNode(option.isoDate), $createTextNode(' ')]);
      closeMenu();
    },
    []
  );

  const $handleBackspace = useCallback(
    (event: KeyboardEvent) => {
      if (!typeaheadOpenRef.current || !$deleteOpenTrigger()) {
        return false;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      closeTypeahead();
      return true;
    },
    [closeTypeahead]
  );

  const renderMenu = useCallback<MenuRenderFn<DateTypeaheadOption>>(
    (anchorElementRef, { selectOptionAndCleanUp }) => {
      if (!anchorElementRef.current) {
        return null;
      }

      return createPortal(
        <DatePickerPanel
          isoDate={defaultOption.isoDate}
          mode="insert"
          onChange={(isoDate) => {
            if (isoDate) {
              selectOptionAndCleanUp(new DateTypeaheadOption(isoDate));
            }
          }}
          onMouseDown={handlePickerMouseDown}
        />,
        anchorElementRef.current
      );
    },
    [defaultOption, handlePickerMouseDown]
  );

  useEffect(() => {
    return editor.registerCommand(KEY_BACKSPACE_COMMAND, $handleBackspace, COMMAND_PRIORITY_CRITICAL);
  }, [$handleBackspace, editor]);

  useEffect(() => {
    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (!typeaheadOpenRef.current) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const targetElement = target instanceof Element ? target : target.parentElement;
      if (targetElement?.closest('[data-date-picker]')) {
        return;
      }

      closeTypeahead();
    };

    document.addEventListener('mousedown', handleDocumentMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
    };
  }, [closeTypeahead]);

  return (
    <LexicalTypeaheadMenuPlugin<DateTypeaheadOption>
      commandPriority={COMMAND_PRIORITY_CRITICAL}
      menuRenderFn={renderMenu}
      onClose={() => {
        typeaheadOpenRef.current = false;
      }}
      onOpen={handleTypeaheadOpen}
      onQueryChange={noopQueryChange}
      onSelectOption={$handleSelectOption}
      options={options}
      preselectFirstItem={true}
      triggerFn={$triggerFn}
    />
  );
}
