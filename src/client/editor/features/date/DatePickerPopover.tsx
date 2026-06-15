import { DatePicker } from '@mantine/dates';
import '@mantine/dates/styles.css';

import { preventPickerMouseDown } from './picker-dom';

type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
}

export function DatePickerPanel({ isoDate, mode, onChange }: DatePickerPanelProps) {
  return (
    <div
      className="date-picker-panel"
      data-date-picker
      data-date-picker-mode={mode}
      onMouseDown={preventPickerMouseDown}
    >
      <DatePicker
        value={isoDate}
        onChange={onChange}
        getDayProps={(date) => ({
          // Mantine passes a YYYY-MM-DD string; trim any time suffix defensively.
          'data-date-picker-day': date.slice(0, 10),
        })}
      />
    </div>
  );
}
