// A mousedown inside the picker should not dismiss it.
export function isInsideDatePicker(event: MouseEvent): boolean {
  const target = event.target;
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  return element?.closest('[data-date-picker]') != null;
}
