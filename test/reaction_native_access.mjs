import assert from 'node:assert/strict';
import { requestAccess } from '../reaction-worker/src/native-client.mjs';

const origins = 'https://onomatoi.com,https://www.onomatoi.com';
assert.deepEqual(requestAccess('https://onomatoi.com', '', origins), { webAllowed: true, allowed: true });
assert.deepEqual(requestAccess('', 'onomatoi-ios', origins), { webAllowed: false, allowed: true });
assert.deepEqual(requestAccess('', 'onomatoi-play-ios', origins), { webAllowed: false, allowed: true });
assert.deepEqual(requestAccess('', '', origins), { webAllowed: false, allowed: false });
assert.deepEqual(requestAccess('', '', ''), { webAllowed: false, allowed: false });
assert.deepEqual(requestAccess('https://other.example', 'onomatoi-ios', origins), { webAllowed: false, allowed: false });
console.log('native reaction access: OK');
