import { DatePicker } from '@mantine/dates';
import dayjs from 'dayjs';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';

import type { DatePickerState } from './types';

export type DatePickerMode = 'edit' | 'insert';

interface DatePickerPanelProps {
  isoDate: string;
  mode: DatePickerMode;
  onChange: (isoDate: string | null) => void;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

interface DatePickerPopoverProps {
  picker: DatePickerState;
  portalRoot: HTMLElement;
  onChange: (isoDate: string | null) => void;
  onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

function normalizePickerDate(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : dayjs(value).format('YYYY-MM-DD');
}

export function DatePickerPanel({ isoDate, mode, onChange, onMouseDown }: DatePickerPanelProps) {
  return (
    <div className="date-picker-panel" data-date-picker data-date-picker-mode={mode} onMouseDown={onMouseDown}>
      <DatePicker
        value={isoDate}
        onChange={onChange}
        getDayProps={(date) => ({
          'data-date-picker-day': normalizePickerDate(date),
        })}
      />
    </div>
  );
}

export function DatePickerPopover({ picker, portalRoot, onChange, onMouseDown }: DatePickerPopoverProps) {
  const anchorStyle: CSSProperties = {
    left: picker.anchor.left,
    top: picker.anchor.top,
  };

  return createPortal(
    <div className="date-picker-anchor" style={anchorStyle}>
      <DatePickerPanel isoDate={picker.isoDate} mode={picker.kind} onChange={onChange} onMouseDown={onMouseDown} />
    </div>,
    portalRoot
  );
}
