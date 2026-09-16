import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import process from 'node:process';
import openapiTS, { astToString, COMMENT_HEADER } from 'openapi-typescript';

const execute = promisify(execFile);
const check = process.argv.includes('--check');

for (const [kind, name] of [['application', 'api'], ['account', 'auth']] as const) {
  const { stdout } = await execute('./tools/django.sh', ['export_api_schema', '--kind', kind]);
  const schema = JSON.parse(stdout);
  const contents = COMMENT_HEADER + astToString(await openapiTS(schema));
  const path = `src/platform/http/${name}-schema.d.ts`;
  if (check) {
    if (await readFile(path, 'utf8') !== contents) {
      throw new Error(`${path} is out of date; run pnpm run api:generate.`);
    }
  } else {
    await writeFile(path, contents);
  }
}
