/** Consume a keyboard event: block the default and later handlers, and report it handled. */
export function stopKeyboardEvent(event: KeyboardEvent | null): true {
  event?.preventDefault();
  event?.stopPropagation();
  return true;
}
