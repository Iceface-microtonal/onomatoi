// 「送る」で届いた 👍👎 フィードバックを検査し、開発者宛てのメール本文にする。
// 宛先は Worker の secret FEEDBACK_TO だけが持つ (ページにも repo にも書かない)。
// 既知の項目だけを型・範囲つきで写し、それ以外は捨てる (公開の受け口なので中身は信用しない)。

export const FEEDBACK_MAX_BYTES = 262144;
export const FEEDBACK_MAX_RECORDS = 500;

const str = (v, max) => (typeof v === 'string' ? Array.from(v).slice(0, max).join('') : '');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const int = (v, lo, hi) => { const n = num(v, lo, hi); return n === null ? null : Math.trunc(n); };

function cleanRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  if (r.vote !== 1 && r.vote !== -1) return null;
  const id = str(r.id, 40);
  if (!id) return null;
  const out = {
    v: int(r.v, 1, 99), id, t: str(r.t, 40), lang: r.lang === 'en' ? 'en' : 'ja',
    eng: str(r.eng, 20), src: str(r.src, 20), word: str(r.word, 64), mora: int(r.mora, 0, 64),
    redup: r.redup === true, vote: r.vote, reason: str(r.reason, 500),
  };
  if (r.axes && typeof r.axes === 'object' && !Array.isArray(r.axes)) {
    out.axes = {};
    for (const key of ['s', 'sh', 't', 'b', 'r', 'o']) {
      const n = num(r.axes[key], -1, 1);
      if (n !== null) out.axes[key] = n;
    }
  }
  if (Array.isArray(r.moras)) out.moras = r.moras.slice(0, 64).map(m => str(m, 8));
  if (Array.isArray(r.tags)) out.tags = r.tags.slice(0, 12).map(tag => str(tag, 24)).filter(Boolean);
  for (const [key, lo, hi] of [['k', -1, 1], ['cs', 0, 1]]) {
    const n = num(r[key], lo, hi);
    if (n !== null) out[key] = n;
  }
  for (const key of ['cor', 'lp']) {
    const n = int(r[key], 0, 99);
    if (n !== null) out[key] = n;
  }
  if (Array.isArray(r.stroke)) {
    out.stroke = r.stroke.slice(0, 64)
      .filter(p => Array.isArray(p) && p.length === 2)
      .map(([x, y]) => [num(x, -1, 2) ?? 0, num(y, -1, 2) ?? 0]);
  }
  return out;
}

/** 受け取った JSON を検査して写す。中身が無ければ例外。 */
export function cleanFeedback(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid payload');
  if (value.app !== 'onomatoi-web') throw new Error('invalid app');
  if (!Array.isArray(value.records) || value.records.length < 1 || value.records.length > FEEDBACK_MAX_RECORDS) {
    throw new Error('invalid records');
  }
  const records = value.records.map(cleanRecord).filter(Boolean);
  if (!records.length) throw new Error('no valid records');
  return { app: 'onomatoi-web', fbVersion: int(value.fbVersion, 1, 99), exported: str(value.exported, 40), records };
}

/** メールの件名と本文 (先頭に一覧・後ろに JSON 全体)。 */
export function feedbackMail(clean, receivedAt) {
  const n = clean.records.length;
  const lines = clean.records.map(r =>
    `${r.vote === 1 ? '👍' : '👎'} ${r.word || '?'}${r.reason ? ' — ' + r.reason : ''}${r.tags?.length ? ' [' + r.tags.join(', ') + ']' : ''}`);
  return {
    subject: `[Onomatoi] フィードバック ${n} 件`,
    text: [`Onomatoi Web から ${n} 件 (受信 ${receivedAt})`, '', ...lines, '', '---- JSON ----',
      JSON.stringify({ ...clean, receivedAt }, null, 1)].join('\n'),
  };
}
