import { getLocalTimeZone, isToday, parseDate } from '@internationalized/date';
import { use } from 'react';
import { Button, Calendar, CalendarCell, CalendarGrid, CalendarGridBody, CalendarGridHeader, CalendarHeaderCell, CalendarStateContext, Dialog, Heading } from 'react-aria-components';
import { FocusScope } from 'react-aria';

type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
  onCancel?: () => void;
}

// Commit and cancel as pointer-reachable controls, per the APG date picker
// dialog. Keyboard users commit with Enter/Space on a day and cancel with
// Escape; without these, neither action is discoverable with a mouse.
// Rendered inside <Calendar> so it can read the focused day from context.
function DialogActions({ onCommit, onCancel }: {
  onCommit: (isoDate: string) => void;
  onCancel?: () => void;
}) {
  const state = use(CalendarStateContext);

  // Plain buttons, not RAC <Button>: inside <Calendar> that requires a `slot`
  // naming one of the calendar's own controls, and these need no press synthesis.
  return (
    <div className="date-picker-actions">
      <button type="button" className="date-picker-action" onClick={() => onCancel?.()}>
        Cancel
      </button>
      <button
        type="button"
        className="date-picker-action date-picker-action-primary"
        // Commits the focused day, matching what Enter/Space would commit.
        onClick={() => state && onCommit(state.focusedDate.toString())}
      >
        OK
      </button>
    </div>
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
            <Heading className="date-picker-title" />
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
          <DialogActions onCommit={onChange} onCancel={onCancel} />
        </Calendar>
        </Dialog>
      </div>
    </FocusScope>
  );
}
