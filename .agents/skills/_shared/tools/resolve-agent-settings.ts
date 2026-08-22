import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { parse, stringify } from 'yaml';

function isMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base: unknown, overlay: unknown): unknown {
  if (!isMap(base) || !isMap(overlay)) return overlay;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    merged[key] = merge(base[key], value);
  }
  return merged;
}

export function resolveAgentSettings(root: string, home: string): unknown {
  const committed = parse(
    readFileSync(path.join(root, '.agents', 'settings.yaml'), 'utf8'),
  );
  const overlayPath = path.join(home, '.remdo', 'agent.yaml');
  if (!existsSync(overlayPath)) return committed;
  const overlay = parse(readFileSync(overlayPath, 'utf8'));
  if (overlay == null) return committed;
  return merge(committed, overlay);
}

const invoked = process.argv[1];
if (
  invoked !== undefined
  && import.meta.url === pathToFileURL(path.resolve(invoked)).href
) {
  process.stdout.write(stringify(resolveAgentSettings(process.cwd(), os.homedir())));
}
