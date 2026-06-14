import type { MouseEvent as ReactMouseEvent } from 'react';

// Keeps the editor selection while interacting with the picker.
export function preventPickerMouseDown(event: ReactMouseEvent<HTMLDivElement>): void {
  event.preventDefault();
}

// A mousedown inside the picker should not dismiss it.
export function isInsideDatePicker(event: MouseEvent): boolean {
  const target = event.target;
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return element?.closest('[data-date-picker]') != null;
}
