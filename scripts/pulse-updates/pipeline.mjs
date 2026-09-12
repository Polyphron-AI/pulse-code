import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const repository = 'pingdotgg/t3code';
export const upstreamUrl = `https://github.com/${repository}.git`;

export function parseRelease(value) {
  if (!Number.isSafeInteger(value?.id) || value.id <= 0 || value.draft !== false || value.prerelease !== false ||
      typeof value.tag_name !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(value.tag_name) ||
      typeof value.published_at !== 'string' || !Number.isFinite(Date.parse(value.published_at))) {
    throw new Error('Expected a published stable semver T3 release');
  }
  return { id: value.id, tag: value.tag_name, publishedAt: value.published_at };
}

export function candidateKey(release, pulseSha, baseSha) {
  return createHash('sha256').update(JSON.stringify([release.id, release.tag, pulseSha, baseSha])).digest('hex');
}

export function git(cwd, args, input) {
  const result = spawnSync('git', ['-c', `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, ...args], {
    cwd, input, encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' },
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.error?.message ?? result.stderr}`);
  return args[0] === 'diff' ? result.stdout : result.stdout.trim();
}

export function writeJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  renameSync(temporary, path);
}

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function withLock(directory, action) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'run.lock');
  const fd = openSync(path, 'wx');
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  return Promise.resolve().then(action).finally(() => { closeSync(fd); unlinkSync(path); });
}

// There is no success escape hatch until real packaged-app verification exists.
// These are missing implementations, not switches an operator can mark true.
export const releaseBlockers = [
  'Pulse launch features and their focused acceptance tests are not integrated',
  'Pulse Next application identity, signing and update feed are not configured',
  'Disposable installer runner and packaged-app acceptance suite are not implemented',
  'Upgrade-data compatibility and safe recovery have not been verified',
];

export function enforceReleaseGate() {
  throw new Error(`Candidate is NOT verified or installable: ${releaseBlockers.join('; ')}`);
}

export function prepareCandidate(root, directory, release, pulseSha, baseSha, runGit = git) {
  // Never run upstream lifecycle scripts on the contributor's host.
  runGit(root, ['fetch', '--no-tags', upstreamUrl, `refs/tags/${release.tag}`]);
  const upstreamSha = runGit(root, ['rev-parse', 'FETCH_HEAD^{commit}']);
  if (!/^[a-f0-9]{40}$/.test(upstreamSha)) throw new Error('Invalid upstream commit');
  runGit(root, ['merge-base', '--is-ancestor', baseSha, upstreamSha]);
  runGit(root, ['merge-base', '--is-ancestor', baseSha, pulseSha]);
  const path = join(directory, 'source');
  runGit(root, ['worktree', 'add', '--detach', path, upstreamSha]);
  // Exact tree delta from the pinned upstream base, not every historical Pulse commit.
  const patch = runGit(root, ['diff', '--binary', '--full-index', baseSha, pulseSha]);
  if (patch) runGit(path, ['apply', '--3way', '--index', '--whitespace=nowarn', '-'], `${patch}\n`);
  return { upstreamSha, source: path, state: 'prepared-unverified', blockers: releaseBlockers };
}
