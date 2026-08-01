import { readFileSync } from 'node:fs';
import process from 'node:process';

import { parse } from 'yaml';
import { z } from 'zod';

const configPath = 'config/ast-grep/sgconfig.yml';
const result = z.strictObject({
  ruleDirs: z.array(z.string()),
}).safeParse(parse(readFileSync(configPath, 'utf8')));

if (!result.success) {
  process.stderr.write(`${configPath}:\n${z.prettifyError(result.error)}\n`);
  process.exitCode = 1;
}
