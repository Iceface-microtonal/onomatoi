import { DurableObject } from 'cloudflare:workers';
import { SOUND_MAP_INSTRUCTIONS, soundMapClues } from './sound-map.mjs';
import { responseStyle, reactionInstructions } from './response-style.mjs';
import { requestAccess } from './native-client.mjs';

const OPENAI_URL = 'https://api.openai.com/v1/responses';
const MODEL = 'gpt-6-luna';
const AXES = ['size', 'sharp', 'tex', 'bright', 'round', 'open'];
const WORD = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・A-Za-z'-]+$/u;

function cleanPayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid payload');
  const word = value.word;
  if (typeof word !== 'string' || word.length < 1 || word.length > 40 || !WORD.test(word)) {
    throw new Error('invalid word');
  }
  if (!value.axes || typeof value.axes !== 'object' || Array.isArray(value.axes)) {
    throw new Error('invalid axes');
  }
  const axis = key => {
    const n = value.axes[key];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  };
  const shape = value.shape && typeof value.shape === 'object' && !Array.isArray(value.shape) ? value.shape : {};
  const count = key => {
    const n = shape[key];
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(20, Math.trunc(n))) : 0;
  };
  return {
    word,
    responseStyle: responseStyle(value.responseStyle),
    lang: value.lang === 'en' ? 'en' : 'ja',
    axes: Object.fromEntries(AXES.map(key => [key, axis(key)])),
    shape: { corners: count('corners'), loops: count('loops'), isClosed: shape.isClosed === true },
  };
}

async function actorFor(day, request) {
  const ip = request.headers.get('CF-Connecting-IP') || '?';
  const bytes = new TextEncoder().encode(`${day}:${ip}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class Quota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, actor TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, actor))'
    );
  }

  reserve(day, actor, perIpLimit, globalLimit) {
    return this.ctx.storage.transactionSync(() => {
      const sql = this.ctx.storage.sql;
      sql.exec('DELETE FROM counts WHERE day < ?', day);
      const total = sql.exec("SELECT n FROM counts WHERE day = ? AND actor = 'all'", day).toArray()[0]?.n || 0;
      if (total >= globalLimit) return 'global';
      const used = sql.exec('SELECT n FROM counts WHERE day = ? AND actor = ?', day, actor).toArray()[0]?.n || 0;
      if (used >= perIpLimit) return 'ip';
      sql.exec("INSERT INTO counts (day, actor, n) VALUES (?, 'all', 1) ON CONFLICT (day, actor) DO UPDATE SET n = n + 1", day);
      sql.exec('INSERT INTO counts (day, actor, n) VALUES (?, ?, 1) ON CONFLICT (day, actor) DO UPDATE SET n = n + 1', day, actor);
      return 'ok';
    });
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const access = requestAccess(origin, request.headers.get('X-Onomatoi-Client') || '', env.ALLOWED_ORIGINS || '');
    const cors = access.webAllowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const json = (status, body) => new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
    });
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: access.webAllowed ? 204 : 403, headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      } });
    }
    if (!access.allowed) return json(403, { error: 'forbidden' });
    if (url.pathname === '/api/reaction/status' && request.method === 'GET') {
      return json(200, { mode: env.OPENAI_API_KEY ? 'configured' : 'unavailable' });
    }
    if (url.pathname !== '/api/reaction' || request.method !== 'POST') {
      return json(404, { error: 'not found' });
    }
    if (!env.OPENAI_API_KEY) return json(503, { error: 'unavailable' });
    if (Number(request.headers.get('Content-Length') || 0) > 2048) {
      return json(413, { error: 'too large' });
    }

    let payload;
    let raw;
    try {
      const text = await request.text();
      if (text.length > 2048) return json(413, { error: 'too large' });
      raw = JSON.parse(text);
      payload = cleanPayload(raw);
    } catch {
      return json(400, { error: 'invalid drawing data' });
    }

    let clues = [];
    if (raw.lens === 'sound_map') {
      try {
        const notes = JSON.parse(env.SOUND_MAP_JSON);
        if (!notes || typeof notes !== 'object' || Array.isArray(notes)) throw new Error('invalid sound map');
        clues = soundMapClues(payload.word, notes);
      } catch {
        return json(503, { error: 'sound map unavailable', code: 'sound_map_unavailable' });
      }
    }

    const day = new Date().toISOString().slice(0, 10);
    const actor = await actorFor(day, request);
    try {
      const quota = env.QUOTA.get(env.QUOTA.idFromName('all'));
      const reserved = await quota.reserve(day, actor, Number(env.DAILY_IP_LIMIT) || 20, Number(env.DAILY_GLOBAL_LIMIT) || 300);
      if (reserved !== 'ok') return json(429, { error: 'daily limit reached', code: reserved });
    } catch {
      return json(503, { error: 'unavailable' });
    }

    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          reasoning: { effort: 'none' },
          max_output_tokens: 120,
          store: false,
          instructions: reactionInstructions(payload.responseStyle) + (clues.length ? SOUND_MAP_INSTRUCTIONS : ''),
          input: JSON.stringify(clues.length ? { ...payload, soundMapClues: clues } : payload),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) return json(502, { error: 'reaction unavailable' });
      const data = await response.json();
      const text = (data.output || []).flatMap(item => item.type === 'message' ? item.content || [] : [])
        .filter(part => part.type === 'output_text').map(part => part.text || '').join(' ').trim();
      if (!text) return json(502, { error: 'reaction unavailable' });
      return json(200, { mode: 'luna', responseStyle: payload.responseStyle, text: Array.from(text).slice(0, 240).join(''),
        lens: clues.length ? 'sound_map' : 'simple', soundMapClues: clues });
    } catch {
      return json(502, { error: 'reaction unavailable' });
    }
  },
};
