import { $createTextNode } from 'lexical';
import dayjs from 'dayjs';

import { useTriggerSession } from '#client/editor/triggers/useTriggerSession';
import type { TriggerSpec } from '#client/editor/triggers/types';
import { $createDateNode } from './date-node';
import { DatePickerPanel } from './DatePickerPopover';

function getTodayIsoDate(): string {
  return dayjs().format('YYYY-MM-DD');
}

// Dates are inserted through `!`, an inline trigger character. The shared
// trigger engine owns the open/dismiss/confirm lifecycle (see
// docs/outliner/triggers.md); this supplies only the date specifics. The option
// value is an ISO date string: the keyboard path (Enter/Tab) confirms today; a
// calendar day click commits the clicked date directly via `commitOption`.
export function DateInsertPlugin() {
  const spec: TriggerSpec<string> = {
    triggerChar: '!',
    // Query text is not interpreted in this phase; the only option is today.
    $resolveOptions: () => [getTodayIsoDate()],
    $commit: (isoDate, { range }) => {
      range.insertNodes([$createDateNode(isoDate), $createTextNode(' ')]);
    },
    renderPopup: (picker, handlers) => (
      <DatePickerPanel
        isoDate={picker.options[picker.activeIndex] ?? getTodayIsoDate()}
        mode="insert"
        onChange={(isoDate) => {
          if (isoDate) {
            handlers.commitOption(isoDate);
          }
        }}
      />
    ),
  };

  return useTriggerSession(spec);
}
