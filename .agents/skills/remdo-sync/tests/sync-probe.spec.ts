// sync-probe.sh (skill-local tools/): fetch and classify up-to-date / merge-needed /
// dirty-tree (the probe preceding remdo-sync's merge).
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  advanceOrigin,
  cleanupTempDirs,
  makeBareMain,
  makeNonRepoDir,
  makeScratchWithOrigin,
  runScript,
  writeFile,
} from '../../_shared/test-support/git-scratch';

const run = (cwd: string) => runScript(path.join(__dirname, '../tools/sync-probe.sh'), cwd);

afterEach(cleanupTempDirs);

describe('sync-probe.sh (skill-local tools/)', () => {
  it('reports up-to-date on a fresh clone at origin/main', () => {
    const { work } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    const result = run(work);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=up-to-date');
  });

  it('reports merge-needed when origin/main has advanced', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin);
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=merge-needed');
  });

  it('reports dirty-tree (exit 0) when the working tree is dirty', () => {
    const { work, origin } = makeScratchWithOrigin({ 'a.md': '# A\n' });
    advanceOrigin(origin); // even a real merge-needed state is masked by dirt
    writeFile(work, 'a.md', '# A dirty\n');
    const result = run(work);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('STATE=dirty-tree');
    expect(result.stdout).not.toContain('merge-needed');
  });

  it('fails loud when there is no origin remote', () => {
    const result = run(makeBareMain({ 'a.md': '# A\n' }));
    expect(result.status).not.toBe(0);
  });

  it('fails loud outside a git repository', () => {
    const result = run(makeNonRepoDir());
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('not a git repository');
  });
});
