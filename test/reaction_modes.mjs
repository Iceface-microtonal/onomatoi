import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { responseStyle, reactionInstructions } from '../reaction-worker/src/response-style.mjs';
import { SOUND_MAP_INSTRUCTIONS, soundMapClues } from '../reaction-worker/src/sound-map.mjs';
import { requestAccess } from '../reaction-worker/src/native-client.mjs';
assert.equal(responseStyle(undefined), 'impression');
for (const bad of ['fortune', '', null, {}, 'constructor']) assert.throws(() => responseStyle(bad));
assert.match(reactionInstructions('conversation'), /exact displayed word, unchanged/);
assert.match(reactionInstructions('impression'), /subjective impression/);
for (const style of ['impression', 'conversation']) {
  assert.match(reactionInstructions(style), /desu\/masu/);
  assert.doesNotMatch(reactionInstructions(style), /fortune|lucky action/);
}
// Test the actual Worker handler; replace only storage and upstream HTTP.
const source = fs.readFileSync(new URL('../reaction-worker/src/index.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace('export class Quota', 'class Quota').replace('export default {', 'const handler = {');
let calls = [], reservations = 0;
const context = vm.createContext({
  DurableObject: class {}, responseStyle, reactionInstructions, SOUND_MAP_INSTRUCTIONS,
  soundMapClues, requestAccess, Request, Response, URL, TextEncoder, crypto: webcrypto, AbortSignal,
  fetch: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json({output: [{type: 'message', content: [{type: 'output_text', text: 'いてぃんな午後ですね。'}]}]});
  },
});
vm.runInContext(source + '\nglobalThis.handler = handler;', context);
const env = {
  OPENAI_API_KEY: 'test-only', ALLOWED_ORIGINS: 'https://onomatoi.com', SOUND_MAP_JSON: JSON.stringify({い: 'a path'}),
  QUOTA: { idFromName: () => 'test', get: () => ({ reserve: async () => { reservations++; return 'ok'; } }) },
};
async function send(style, native = false) {
  return context.handler.fetch(new Request('https://worker.example/api/reaction', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(native ? {'X-Onomatoi-Client': 'onomatoi-ios'} : {Origin: 'https://onomatoi.com'}) },
    body: JSON.stringify({word: 'いてぃん', axes: {}, lens: 'sound_map', ...(style === undefined ? {} : {responseStyle: style})}),
  }), env);
}
for (const style of ['impression', 'conversation']) {
  const result = await send(style);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).responseStyle, style);
  assert.equal(JSON.parse(calls.at(-1).input).responseStyle, style);
  assert.ok(calls.at(-1).instructions.startsWith(reactionInstructions(style)));
  assert.match(calls.at(-1).instructions, /Follow the requested response style/);
  assert.equal(calls.at(-1).store, false);
}
const native = await send(undefined, true);
assert.equal(native.status, 200);
assert.equal((await native.json()).responseStyle, 'impression');
const before = [calls.length, reservations];
assert.equal((await send('fortune')).status, 400);
assert.deepEqual([calls.length, reservations], before);
console.log('reaction modes, upstream prompts, native compatibility, removed mode: OK');
