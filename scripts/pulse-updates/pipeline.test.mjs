import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateKey, enforceReleaseGate, git, parseRelease, prepareCandidate, readJson, withLock, writeJson } from './pipeline.mjs';

const input = { id: 12, tag_name: 'v0.40.0', draft: false, prerelease: false, published_at: '2026-09-12T00:00:00Z' };
const release = parseRelease(input);
test('accepts published stable release and discards untrusted extra fields', () => {
  assert.deepEqual(release, { id: 12, tag: 'v0.40.0', publishedAt: input.published_at });
});
for (const change of [{ draft: true }, { prerelease: true }, { tag_name: '--upload-pack=evil' }, { tag_name: '../escape' }, { tag_name: 'v0.40.0-beta.1' }, { id: null }, { published_at: 'invalid' }]) {
  test(`rejects invalid release ${JSON.stringify(change)}`, () => assert.throws(() => parseRelease({ ...input, ...change })));
}
test('candidate cache is tied to upstream release, Pulse revision and upstream base', () => {
  const key = candidateKey(release, 'a', 'b');
  assert.match(key, /^[a-f0-9]{64}$/);
  assert.equal(key, candidateKey(release, 'a', 'b'));
  assert.notEqual(key, candidateKey(release, 'c', 'b'));
  assert.notEqual(key, candidateKey(release, 'a', 'c'));
  assert.notEqual(key, candidateKey({ ...release, id: 13 }, 'a', 'b'));
});
test('never declares unimplemented acceptance checks successful', () => {
  assert.throws(enforceReleaseGate, /NOT verified or installable/);
});
test('atomic reports round-trip and missing report is distinguishable', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'pulse-update-test-')), 'result.json');
  assert.equal(readJson(path), null);
  writeJson(path, { state: 'blocked' });
  writeJson(path, { state: 'prepared-unverified' });
  assert.equal(readJson(path).state, 'prepared-unverified');
});
test('concurrent run is excluded and failure releases the lock', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-update-lock-'));
  await assert.rejects(withLock(directory, async () => {
    assert.match(readFileSync(join(directory, 'run.lock'), 'utf8'), /pid/);
    assert.throws(() => withLock(directory, () => {}), /EEXIST/);
    throw new Error('test failure');
  }), /test failure/);
  await withLock(directory, () => {});
});
test('preparation stops on ancestry failure without creating a worktree', () => {
  const calls = [];
  assert.throws(() => prepareCandidate('repo', 'sandbox', release, 'a'.repeat(40), 'b'.repeat(40), (_cwd, args) => {
    calls.push(args[0]);
    if (args[0] === 'rev-parse') return 'c'.repeat(40);
    if (args[0] === 'merge-base') throw new Error('older or unrelated release');
    return '';
  }), /older or unrelated/);
  assert.equal(calls.includes('worktree'), false);
});
test('preparation applies only the pinned delta and keeps exact patch whitespace', () => {
  const calls = [];
  const patch = 'patch with trailing context\n \n';
  const result = prepareCandidate('repo', 'sandbox', release, 'a'.repeat(40), 'b'.repeat(40), (cwd, args, input) => {
    calls.push({ cwd, args, input });
    if (args[0] === 'rev-parse') return 'c'.repeat(40);
    if (args[0] === 'diff') return patch;
    return '';
  });
  assert.equal(result.state, 'prepared-unverified');
  assert.equal(calls.at(-1).input, `${patch}\n`);
  assert.deepEqual(calls.find(call => call.args[0] === 'diff').args.slice(-2), ['b'.repeat(40), 'a'.repeat(40)]);
  assert.equal(calls.some(call => call.args.includes('install')), false);
});
test('merge conflict is retained as a failure, not repaired or retried', () => {
  assert.throws(() => prepareCandidate('repo', 'sandbox', release, 'a'.repeat(40), 'b'.repeat(40), (_cwd, args) => {
    if (args[0] === 'rev-parse') return 'c'.repeat(40);
    if (args[0] === 'diff') return 'patch';
    if (args[0] === 'apply') throw new Error('conflict');
    return '';
  }), /conflict/);
});
test('real git candidate contains upstream and Pulse changes without altering source checkout', () => {
  const root = mkdtempSync(join(tmpdir(), 'pulse-update-git-'));
  git(root, ['init']);
  git(root, ['config', 'user.name', 'Pipeline Test']);
  git(root, ['config', 'user.email', 'pipeline@example.invalid']);
  git(root, ['config', 'core.autocrlf', 'false']);
  writeFileSync(join(root, 'core.txt'), 'upstream base\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);
  writeFileSync(join(root, 'core.txt'), 'upstream release\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'upstream']);
  git(root, ['tag', release.tag]);
  git(root, ['checkout', '--detach', base]);
  writeFileSync(join(root, 'pulse.txt'), 'Pulse addition\n \n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'Pulse']);
  const pulse = git(root, ['rev-parse', 'HEAD']);
  const directory = join(root, 'evidence');
  mkdirSync(directory);
  const result = prepareCandidate(root, directory, release, pulse, base, (cwd, args, input) => {
    if (args[0] === 'fetch') return git(cwd, ['fetch', '--no-tags', root, `refs/tags/${release.tag}`]);
    return git(cwd, args, input);
  });
  assert.equal(readFileSync(join(result.source, 'core.txt'), 'utf8'), 'upstream release\n');
  assert.equal(readFileSync(join(result.source, 'pulse.txt'), 'utf8'), 'Pulse addition\n \n');
  assert.equal(git(root, ['rev-parse', 'HEAD']), pulse);
  assert.equal(readFileSync(join(root, 'core.txt'), 'utf8'), 'upstream base\n');
});
