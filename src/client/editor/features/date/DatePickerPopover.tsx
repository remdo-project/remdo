import { DatePicker } from '@mantine/dates';
import '@mantine/dates/styles.css';
import { useEffect, useRef } from 'react';

type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
  onCancel?: () => void;
}

export function DatePickerPanel({ isoDate, mode, onChange, onCancel }: DatePickerPanelProps) {
  // Both modes are modal calendar dialogs: focus moves into the grid so Mantine's
  // built-in day/week/month keyboard navigation drives it, and Escape/Tab are
  // handled here (Lexical key commands don't fire while focus is in the calendar).
  // Insert opens from a trigger session; edit opens from a committed token, but the
  // in-calendar keyboard contract is identical.
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus onto the calendar's active day cell — Mantine puts the selected
    // day (or today) in tab order with tabIndex=0 — so arrow keys drive the grid
    // rather than the editor. Scope to day cells so the month-nav header button
    // (also tabbable) is not focused instead.
    const day = containerRef.current?.querySelector<HTMLElement>('[data-date-picker-day][tabindex="0"]');
    day?.focus();
  }, []);

  return (
    <div
      ref={containerRef}
      className="date-picker-panel"
      data-date-picker
      data-date-picker-mode={mode}
      onKeyDown={(event) => {
        // Focus is in the calendar, so Lexical's key commands never fire.
        // Escape cancels; Tab must not escape into browser focus traversal
        // (it would leave the popup open with focus outside it) — for now it
        // also cancels and returns focus to the editor. Both hand focus back.
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          onCancel?.();
        }
      }}
    >
      <DatePicker
        value={isoDate}
        // Pass the ISO string, not `new Date(isoDate)`: `new Date('YYYY-MM-DD')`
        // parses as UTC midnight, which is the previous local day west of UTC, so
        // a first-of-month date could open the calendar on the wrong month.
        defaultDate={isoDate || undefined}
        onChange={onChange}
        getDayProps={(date) => ({
          // Mantine passes a YYYY-MM-DD string; trim any time suffix defensively.
          'data-date-picker-day': date.slice(0, 10),
        })}
      />
    </div>
  );
}
