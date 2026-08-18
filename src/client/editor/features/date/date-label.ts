// Formatters are expensive to construct and the label is rendered per node, so
// cache one per locale. Resolved from the runtime locale rather than hardcoded
// to English; note this text is also what exportDOM/getTextContent puts on the
// clipboard, so it follows the reader's locale by design.
const labelFormatters = new Map<string, Intl.DateTimeFormat>();

function labelFormatter(): Intl.DateTimeFormat {
  const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
  let formatter = labelFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });
    labelFormatters.set(locale, formatter);
  }
  return formatter;
}

// isoDate is validated at every mutation boundary (setIsoDate / importJSON /
// $createDateNode), so the stored value is always a valid YYYY-MM-DD here.
export function formatDateNodeLabel(isoDate: string): string {
  // Split rather than `new Date(isoDate)`: the latter parses as UTC midnight,
  // which formats as the previous local day west of UTC.
  const [year, month, day] = isoDate.split('-').map(Number);
  return labelFormatter().format(new Date(year!, month! - 1, day));
}
