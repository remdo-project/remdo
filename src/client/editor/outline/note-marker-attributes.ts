import type { NoteMarkerView } from '#note-sdk';

/** The attributes the outline stylesheet draws a note's marker from. */
export function noteMarkerAttributes(view: NoteMarkerView): Record<string, string | undefined> {
  return {
    'data-marker': view.kind,
    'data-number': view.number === null ? undefined : String(view.number),
    'data-heading-level': view.headingLevel === null ? undefined : String(view.headingLevel),
    'data-checkbox': view.checkbox ? 'true' : undefined,
  };
}
