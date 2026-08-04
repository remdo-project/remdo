import fs from 'node:fs';
import path from 'node:path';

/** Write an executable fake binary: shebang plus `set -eu` plus the given body. */
export function writeFakeBin(binDir: string, name: string, body: string): void {
  const binPath = path.join(binDir, name);
  fs.writeFileSync(binPath, `#!/usr/bin/env sh\nset -eu\n${body}`);
  fs.chmodSync(binPath, 0o755);
}
