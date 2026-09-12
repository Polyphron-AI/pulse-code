import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { candidateKey, enforceReleaseGate, git, parseRelease, prepareCandidate, readJson, repository, withLock, writeJson } from './pipeline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const stateDirectory = join(root, '.t3', 'upstream-updates');
const statusPath = join(stateDirectory, 'status.json');
const mode = process.argv[2];
if (!['check', 'prepare', 'candidate', 'status'].includes(mode)) throw new Error('Use check, prepare, candidate or status');

if (mode === 'status') {
  console.log(JSON.stringify(readJson(statusPath) ?? { state: 'never-checked' }, null, 2));
} else {
  await withLock(stateDirectory, async () => {
    const report = { checkedAt: new Date().toISOString(), mode, state: 'checking' };
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Pulse-Next-release-check' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`GitHub release check returned HTTP ${response.status}`);
      const release = parseRelease(await response.json());
      const pulseSha = git(root, ['rev-parse', 'HEAD']);
      const ledger = readJson(join(root, 'docs/internals/pulse-next-migration.json'));
      const baseSha = ledger?.upstreamBase;
      if (!/^[a-f0-9]{40}$/.test(baseSha ?? '')) throw new Error('Ledger must pin a full upstream commit');
      const key = candidateKey(release, pulseSha, baseSha);
      Object.assign(report, { release, pulseSha, baseSha, key, state: 'release-detected' });
      if (mode !== 'check') {
        if (git(root, ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Commit or isolate working changes before preparing a candidate');
        const directory = join(stateDirectory, key);
        mkdirSync(directory, { recursive: true });
        const resultPath = join(directory, 'result.json');
        let result = readJson(resultPath);
        if (!result) {
          try { result = prepareCandidate(root, directory, release, pulseSha, baseSha); }
          catch (error) { result = { state: 'blocked', error: error.message }; }
          writeJson(resultPath, result);
        }
        Object.assign(report, result);
        if (result.state === 'blocked') throw new Error(result.error);
        if (mode === 'candidate') enforceReleaseGate();
      }
    } catch (error) {
      Object.assign(report, { state: 'blocked', error: error.message });
      process.exitCode = 1;
    }
    writeJson(statusPath, report);
    console.log(JSON.stringify(report, null, 2));
  });
}
