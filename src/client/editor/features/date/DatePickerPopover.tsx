import { getLocalTimeZone, isToday, parseDate } from '@internationalized/date';
import { Button, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, CalendarMonthPicker, CalendarYearPicker, Dialog } from 'react-aria-components';
import { FocusScope } from 'react-aria';
import type { Key } from 'react-aria';

type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
  onCancel?: () => void;
}

// The month and year pickers supply option data and labels but render nothing,
// so this is the shared widget for both. A native select is already keyboard-
// and screen-reader-correct, and it stays one Tab stop like the grid.
function PickerSelect({ items, value, onPick, label }: {
  items: readonly { id: number; formatted: string }[];
  value: Key;
  onPick: (key: Key | null) => void;
  label: string;
}) {
  return (
    <select
      className="date-picker-select"
      aria-label={label}
      value={String(value)}
      onChange={(event) => onPick(Number(event.target.value))}
    >
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.formatted}</option>
      ))}
    </select>
  );
}

// A modal calendar dialog (docs/specs/outliner/dates.md). React Aria owns the
// keyboard contract; this file supplies markup, styling hooks, and cancel.
export function DatePickerPanel({ isoDate, mode, onChange, onCancel }: DatePickerPanelProps) {
  return (
    <FocusScope contain restoreFocus>
      {/* Dialog takes no onKeyDown, so Escape is handled on a wrapper. */}
      <div
        className="date-picker-panel"
        data-date-picker
        data-date-picker-mode={mode}
        onKeyDown={(event) => {
          // Focus is inside the calendar, so Lexical's key commands never fire.
          // Escape is the only cancel key: Tab cycles the dialog's own controls.
          // Enter and Space are the day cell's own press keys and commit there.
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }
        }}
      >
      <Dialog aria-label={mode === 'edit' ? 'Edit date' : 'Insert date'}>
        <Calendar
          // parseDate yields a zone-free CalendarDate, so a first-of-month value
          // cannot open the calendar on the previous month west of UTC, and
          // toString() gives back the padded YYYY-MM-DD the node stores.
          value={parseDate(isoDate)}
          onChange={(date) => onChange(date.toString())}
          autoFocus
          className="date-picker-calendar"
        >
          <div className="date-picker-header">
            <Button slot="previous" className="date-picker-nav">‹</Button>
            <CalendarMonthPicker>
              {({ items, value, onChange: onPick, 'aria-label': label }) => (
                <PickerSelect items={items} value={value} onPick={onPick} label={label} />
              )}
            </CalendarMonthPicker>
            <CalendarYearPicker>
              {({ items, value, onChange: onPick, 'aria-label': label }) => (
                <PickerSelect items={items} value={value} onPick={onPick} label={label} />
              )}
            </CalendarYearPicker>
            <Button slot="next" className="date-picker-nav">›</Button>
          </div>
          <CalendarGrid className="date-picker-grid">
            <CalendarGridHeader>
              {(day) => <CalendarHeaderCell className="date-picker-weekday">{day}</CalendarHeaderCell>}
            </CalendarGridHeader>
            <CalendarGridBody>
              {(date) => (
                <CalendarCell
                  date={date}
                  className="date-picker-day"
                  data-date-picker-day={date.toString()}
                  data-today={isToday(date, getLocalTimeZone()) || undefined}
                />
              )}
            </CalendarGridBody>
          </CalendarGrid>
        </Calendar>
        </Dialog>
      </div>
    </FocusScope>
  );
}
