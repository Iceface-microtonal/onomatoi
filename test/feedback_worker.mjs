import assert from 'node:assert/strict';
import { cleanFeedback, feedbackMail, FEEDBACK_MAX_RECORDS } from '../reaction-worker/src/feedback.mjs';

const record = {
  v: 4, id: 'murnfzyh-55', t: '2026-10-03T00:24:43.032Z', lang: 'ja', eng: 'v25', src: 'draw',
  word: 'niQ', mora: 2, redup: false, axes: { s: 0.5, sh: 0.667, t: 0.5, b: 0.25, r: 0.5, o: -0.5 },
  moras: ['ni', 'Q'], vote: -1, reason: 'これだけ描いたのに、なんだか短い にっ になる', tags: ['harder'],
  k: 0.5, cor: 4, cs: 0.608, lp: 0, stroke: [[0.495, 0.18], [0.488, 0.251]],
};
const payload = { app: 'onomatoi-web', fbVersion: 4, exported: '2026-10-03T11:30:03.811Z', records: [record] };

// 正しい送信はそのまま写る (既知の項目)
const clean = cleanFeedback(payload);
assert.equal(clean.records.length, 1);
assert.deepEqual(clean.records[0].stroke, record.stroke);
assert.equal(clean.records[0].reason, record.reason);

// 知らない項目・範囲外の値は捨てる / 丸める
const dirty = cleanFeedback({ ...payload, records: [{ ...record, html: '<script>', k: 9, cor: -3, reason: 'x'.repeat(900) }] });
assert.equal('html' in dirty.records[0], false);
assert.equal(dirty.records[0].k, 1);
assert.equal(dirty.records[0].cor, 0);
assert.equal(Array.from(dirty.records[0].reason).length, 500);

// 投票の無いレコードは落とし、全部落ちたら拒否
assert.equal(cleanFeedback({ ...payload, records: [record, { ...record, vote: 0 }] }).records.length, 1);
assert.throws(() => cleanFeedback({ ...payload, records: [{ ...record, vote: 0 }] }));
// 別アプリ・空・多すぎは拒否
assert.throws(() => cleanFeedback({ ...payload, app: 'other' }));
assert.throws(() => cleanFeedback({ ...payload, records: [] }));
assert.throws(() => cleanFeedback({ ...payload, records: Array(FEEDBACK_MAX_RECORDS + 1).fill(record) }));
assert.throws(() => cleanFeedback([payload]));

// メール: 件名に件数、本文の先頭に一覧、後ろに JSON 全体
const mail = feedbackMail(clean, '2026-10-03T12:00:00.000Z');
assert.equal(mail.subject, '[Onomatoi] フィードバック 1 件');
assert.ok(mail.text.includes('👎 niQ — これだけ描いたのに'));
assert.ok(mail.text.includes('[harder]'));
assert.deepEqual(JSON.parse(mail.text.split('---- JSON ----\n')[1]).records[0].id, 'murnfzyh-55');
console.log('feedback worker: OK');
