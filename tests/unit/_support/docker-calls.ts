export function parseDockerCalls(log: string): string[][] {
  const fields = log.split('\0');
  const calls: string[][] = [];
  let offset = 0;

  while (offset < fields.length - 1) {
    const argumentCount = Number(fields[offset]);
    offset += 1;
    calls.push(fields.slice(offset, offset + argumentCount));
    offset += argumentCount;
  }

  return calls;
}

export function findDockerCall(calls: string[][], command: string): string[] {
  const call = calls.find(([actualCommand]) => actualCommand === command);
  if (call === undefined) throw new Error(`Expected docker ${command} to be called`);
  return call;
}

export function dockerOptionValues(args: string[], option: string): string[] {
  return args.flatMap((arg, index) => {
    const value = args[index + 1];
    return arg === option && value !== undefined ? [value] : [];
  });
}

export function dockerEnvironment(args: string[]): Record<string, string> {
  return Object.fromEntries(dockerOptionValues(args, '-e').map((entry) => {
    const separator = entry.indexOf('=');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}
