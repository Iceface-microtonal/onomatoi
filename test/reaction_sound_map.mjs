import assert from 'node:assert/strict';
import { soundMapClues } from '../reaction-worker/src/sound-map.mjs';

const notes = { ゆ: 'flow', う: 'hold', み: 'see', ん: 'rest', が: 'start' };
assert.deepEqual(soundMapClues('ゆーうー', notes).map(clue => clue.kana), ['ゆ', 'う']);
assert.deepEqual(soundMapClues('みってぃん', notes).map(clue => clue.kana), ['み', 'ん']);
assert.deepEqual(soundMapClues('ぎゃぎょーん', notes).map(clue => clue.kana), ['ん']);
assert.deepEqual(soundMapClues('ガーン', notes).map(clue => clue.kana), ['が', 'ん']);
assert.deepEqual(soundMapClues('ゆみがん', notes).map(clue => clue.kana), ['ゆ', 'ん']);
assert.deepEqual(soundMapClues('ぎゃぎょ', notes), []);
console.log('sound map selection: OK');
