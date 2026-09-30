// Host-policy wiring tests; actual silent-switch behavior requires an iPhone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../iceface_onomatoi.html', import.meta.url), 'utf8');
const names = ['requestPlaybackAudioSession', 'ensureCtx', 'showStartButton', 'startApp', 'unlockAudio'];
const functions = names.map(name => {
  const match = html.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, name);
  return match[0];
}).join('\n');

function fixture({ supported = true, denied = false, state = 'suspended', rejects = false } = {}) {
  const calls = [], note = { style: {}, dataset: {} };
  let type = 'auto';
  const nav = supported ? { audioSession: {
    get type() { return type; },
    set type(value) { calls.push('playback'); if (denied) throw Error('denied'); type = value; }
  } } : {};
  const audio = { state, destination: {},
    resume() {
      calls.push('resume');
      if (rejects) return Promise.reject(Error('interrupted'));
      this.state = 'running'; return Promise.resolve();
    },
    createBuffer() { return {}; },
    createBufferSource() { return { connect() {}, start() { calls.push('start'); } }; }
  };
  const context = vm.createContext({ navigator: nav,
    window: { AudioContext: function () { calls.push('create'); return audio; } },
    document: { getElementById() { return note; }, removeEventListener() {} },
    T: { start: 'Turn sound on', voice: 'Voice' }, preloadAll() {}, UNLOCK_EVENTS: [] });
  vm.runInContext('let audioCtx = null; let audioPlaybackRequested = false;\n' + functions, context);
  return { calls, note, audio, run(code) { return vm.runInContext(code, context); } };
}

const normal = fixture();
assert.deepEqual(normal.calls, []); // Loading declarations must not activate audio.
normal.run('startApp()');
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(normal.calls.slice(0, 3), ['playback', 'create', 'resume']);
assert.equal(normal.note.dataset.started, 'true');
normal.run('ensureCtx()');
assert.equal(normal.calls.filter(c => c === 'playback').length, 1);

const generic = fixture();
generic.run('unlockAudio()');
assert.ok(!generic.calls.includes('playback'));
assert.notEqual(generic.note.dataset.started, 'true');
generic.run('ensureCtx()');
assert.ok(generic.calls.includes('playback'));

for (const options of [{ supported: false }, { denied: true }]) {
  const f = fixture(options);
  assert.doesNotThrow(() => f.run('ensureCtx()'));
  assert.equal(f.audio.state, 'running');
}
const interrupted = fixture({ state: 'interrupted' });
interrupted.run('ensureCtx()');
assert.equal(interrupted.audio.state, 'running');

const rejected = fixture({ rejects: true });
rejected.run('startApp()');
await new Promise(resolve => setImmediate(resolve));
assert.equal(rejected.note.textContent, 'Turn sound on');
assert.equal(typeof rejected.note.onclick, 'function');
assert.notEqual(rejected.note.dataset.started, 'true');
console.log('Audio session: activation, fallback, interruption and retry checks passed.');
