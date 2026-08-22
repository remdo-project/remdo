#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { parse, stringify } from 'yaml';
import { z } from 'zod';

const providerSchema = z.strictObject({
  model: z.string().min(1),
  effort: z.string().min(1),
});

const verifySchema = z.strictObject({
  reviewers: z.array(z.string().min(1)).min(1),
  providers: z.record(z.string().min(1), providerSchema),
}).superRefine((value, context) => {
  const seen = new Set();
  for (const [index, id] of value.reviewers.entries()) {
    if (seen.has(id)) {
      context.addIssue({
        code: 'custom',
        message: `duplicate reviewer '${id}'`,
        path: ['reviewers', index],
      });
    }
    seen.add(id);
    if (!Object.hasOwn(value.providers, id)) {
      context.addIssue({
        code: 'custom',
        message: `reviewer '${id}' is not a known provider`,
        path: ['reviewers', index],
      });
    }
  }
});

const documentSchema = z.strictObject({
  'remdo-verify-change': verifySchema,
});

function fail(message) {
  process.stderr.write(`agent-settings: ${message}\n`);
  process.exit(1);
}

function isMapping(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describePath(parts) {
  return parts.length === 0 ? '(root)' : parts.join('.');
}

function assertOverlayPaths(base, overlay, parts) {
  if (isMapping(base) && isMapping(overlay)) {
    for (const key of Object.keys(overlay)) {
      if (!Object.hasOwn(base, key)) {
        fail(`unknown setting ${describePath([...parts, key])}`);
      }
      assertOverlayPaths(base[key], overlay[key], [...parts, key]);
    }
    return;
  }
  if (Array.isArray(base) && Array.isArray(overlay)) return;
  if (
    !isMapping(base)
    && !Array.isArray(base)
    && !isMapping(overlay)
    && !Array.isArray(overlay)
    && overlay !== null
  ) {
    return;
  }
  fail(`type mismatch at ${describePath(parts)}`);
}

function merge(base, overlay) {
  if (Array.isArray(base)) return structuredClone(overlay);
  if (isMapping(base) && isMapping(overlay)) {
    const result = structuredClone(base);
    for (const key of Object.keys(overlay)) {
      result[key] = merge(base[key], overlay[key]);
    }
    return result;
  }
  return structuredClone(overlay);
}

function readYaml(file, label) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { missing: true };
    fail(`${label} is unreadable`);
  }
  let value;
  try {
    value = parse(text);
  } catch {
    fail(`${label} is not valid YAML`);
  }
  if (!isMapping(value)) fail(`${label} is not a mapping`);
  return { value };
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    fail('requires an accessible Git repository');
  }
}

function formatZod(error) {
  return error.issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.join('.') : 'document';
      return `${where}: ${issue.message}`;
    })
    .join('; ');
}

if (process.argv.length > 2) fail('unexpected arguments');

const root = repoRoot();
const committedPath = path.join(root, '.agents', 'settings.yaml');
const overlayPath = path.join(os.homedir(), '.remdo', 'agent.yaml');

const committed = readYaml(committedPath, 'committed settings');
if (committed.missing) fail('committed settings are missing');

const overlay = readYaml(overlayPath, 'overlay');
let resolved = committed.value;
if (!overlay.missing) {
  assertOverlayPaths(committed.value, overlay.value, []);
  resolved = merge(committed.value, overlay.value);
}

const parsed = documentSchema.safeParse(resolved);
if (!parsed.success) fail(formatZod(parsed.error));

process.stdout.write(stringify(parsed.data));
