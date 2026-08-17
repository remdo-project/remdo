import { createCalendar, getLocalTimeZone, isToday, parseDate } from '@internationalized/date';
import { useEffect, useRef } from 'react';
import { FocusScope, useButton, useCalendar, useCalendarCell, useCalendarGrid, useDialog, useLocale } from 'react-aria';
import { useCalendarState } from 'react-stately';
import type { CalendarDate } from '@internationalized/date';
import type { AriaButtonProps } from 'react-aria';
import type { CalendarState } from 'react-stately';

type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
  onCancel?: () => void;
}

// A modal calendar dialog (docs/specs/outliner/dates.md). React Aria's hooks own
// the keyboard contract; this file supplies markup, styling hooks, and cancel.

function CalendarCell({ state, date }: {
  state: CalendarState;
  date: CalendarDate;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { cellProps, buttonProps, isSelected, isDisabled, isOutsideVisibleRange, formattedDate }
    = useCalendarCell({ date }, state, ref);

  return (
    <td {...cellProps}>
      {/* A div, not a <button>: the grid is one Tab stop via useCalendarCell's
          roving tabindex, and disabled cells get no tabindex at all — which a
          native button would still leave tabbable. */}
      <div
        {...buttonProps}
        ref={ref}
        className="date-picker-day"
        data-date-picker-day={date.toString()}
        data-selected={isSelected || undefined}
        data-disabled={isDisabled || undefined}
        data-outside-month={isOutsideVisibleRange || undefined}
        data-today={isToday(date, getLocalTimeZone()) || undefined}
      >
        {formattedDate}
      </div>
    </td>
  );
}

function CalendarGrid({ state }: { state: CalendarState }) {
  const { gridProps, headerProps, weekDays, weeksInMonth } = useCalendarGrid({}, state);

  return (
    <table {...gridProps} className="date-picker-grid">
      <thead {...headerProps}>
        <tr>
          {weekDays.map((day, index) => (
            // Weekday abbreviations repeat across locales (e.g. "S" twice), so
            // the column position is the stable key.
            // eslint-disable-next-line react/no-array-index-key -- see above.
            <th key={index} className="date-picker-weekday">{day}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: weeksInMonth }, (_, weekIndex) => (
          <tr key={weekIndex}>
            {state.getDatesInWeek(weekIndex).map((date, dayIndex) => (
              date
                ? <CalendarCell key={date.toString()} state={state} date={date} />
                // eslint-disable-next-line react/no-array-index-key -- empty leading/trailing cells have no date to key on.
                : <td key={dayIndex} />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// useButton turns useCalendar's { onPress, isDisabled, aria-label } into DOM props;
// calling onPress directly would mean fabricating a press event to satisfy its type.
function NavButton({ props, children }: { props: AriaButtonProps; children: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const { buttonProps } = useButton(props, ref);

  return (
    <button {...buttonProps} ref={ref} className="date-picker-nav">
      {children}
    </button>
  );
}

export function DatePickerPanel({ isoDate, mode, onChange, onCancel }: DatePickerPanelProps) {
  const { locale } = useLocale();
  const state = useCalendarState({
    locale,
    createCalendar,
    // parseDate yields a zone-free CalendarDate, so a first-of-month value cannot
    // open the calendar on the previous month west of UTC.
    value: parseDate(isoDate),
    // The cell's press handler (click, and Enter/Space on the focused day) calls
    // state.selectDate, which surfaces here — so this is the single commit path
    // for every way a day can be chosen. In single-selection mode the value is
    // never null.
    onChange: (date) => onChange(date.toString()),
  });

  const ref = useRef<HTMLDivElement>(null);
  const { calendarProps, prevButtonProps, nextButtonProps, title } = useCalendar({}, state);
  const { dialogProps } = useDialog({ 'aria-label': mode === 'edit' ? 'Edit date' : 'Insert date' }, ref);

  // Opening moves focus onto the calendar's roving-focus day, not the first
  // tabbable control. FocusScope's own autoFocus would take the prev-month
  // button instead, leaving arrow keys with nothing to drive.
  useEffect(() => {
    state.setFocused(true);
    // Run once on open: re-running would steal focus back from the month
    // navigation while the user is tabbing through the dialog.
    // eslint-disable-next-line react/exhaustive-deps -- see above.
  }, []);

  return (
    <FocusScope contain restoreFocus>
      <div
        {...dialogProps}
        ref={ref}
        className="date-picker-panel"
        data-date-picker
        data-date-picker-mode={mode}
        onKeyDown={(event) => {
          // Focus is inside the calendar, so Lexical's key commands never fire.
          // Escape is the only cancel key: Tab is left to FocusScope, which
          // cycles the dialog's own controls (docs/specs/outliner/dates.md).
          // Enter and Space are the day cell's own press keys and commit there.
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onCancel?.();
          }
        }}
      >
        {/* The calendar's own group role lives on an inner element: spreading it
            onto the dialog would replace role="dialog". */}
        <div {...calendarProps} className="date-picker-calendar">
          <div className="date-picker-header">
            <NavButton props={prevButtonProps}>‹</NavButton>
            <h2 className="date-picker-title">{title}</h2>
            <NavButton props={nextButtonProps}>›</NavButton>
          </div>
          <CalendarGrid state={state} />
        </div>
      </div>
    </FocusScope>
  );
}
