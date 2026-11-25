// Arcadia – Online-Bestenliste und Konten (Vercel-Funktion mit Upstash Redis über die REST-API)
// Konto = 12-stelliger Code. In der Datenbank liegt nur ein Hash davon, nie der Code selbst.
const crypto = require('crypto');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Bestenlisten: Name → { low: kleiner ist besser, max: höchster glaubwürdiger Wert }
const SNAKE_MODES = ['classic', 'wrap', 'walls', 'portal', 'poison', 'turbo', 'time', 'mirror', 'dark', 'flee', 'hunger', 'zone', 'chaos'];
const BOARDS = {
  'snake-park': { max: 48 },
  flug: { max: 5000 },
  dino: { max: 500000 },
  block: { max: 50000000 },
  vier: { max: 100000 },
  fruit: { max: 200000 },
  stack: { max: 20000 },
  up: { max: 500000 },
  sol1: { low: true, min: 30, max: 36000 },
  sol3: { low: true, min: 30, max: 36000 },
};
for (const m of SNAKE_MODES) BOARDS['snake-' + m] = { max: 5000 };

const BAD = ['arsch', 'fick', 'fuck', 'hure', 'nazi', 'hitler', 'nigg', 'neger', 'schwuchtel', 'fotze', 'wichs', 'bitch', 'cunt', 'dick', 'penis', 'vagina', 'sex', 'porn', 'kanake', 'spast', 'missgeburt', 'shit', 'scheiss', 'scheiß', 'hurensohn', 'whore', 'slut', 'faggot', 'retard', 'kkk', 'heil'];

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('db ' + r.status);
  const out = await r.json();
  return out.map((x) => (x.error ? null : x.result));
}
const uidOf = (code) => crypto.createHash('sha256').update('arcadia:' + code).digest('hex').slice(0, 20);
const cleanCode = (c) => String(c || '').replace(/\D/g, '');
function cleanName(n) {
  n = String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  if (n.length < 2) return null;
  const flat = n.toLowerCase().replace(/[^a-zäöüß]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a');
  if (BAD.some((w) => flat.includes(w))) return null;
  return n;
}
function ip(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x'; }
async function limited(key, max, sec) {
  const [n] = await redis([['INCR', key], ['EXPIRE', key, sec, 'NX']]);
  return n > max;
}
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return new Promise((ok) => { let s = ''; req.on('data', (d) => (s += d)); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } }); });
}

module.exports = async (req, res) => {
  const send = (code, data, cache) => {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', cache || 'no-store');
    res.end(JSON.stringify(data));
  };
  if (!URL_ || !TOKEN) return send(503, { error: 'Datenbank ist nicht verbunden.' });
  try {
    // ---------- Lesen: Top 10 (wird 60 s im Vercel-Cache gehalten, spart Datenbank-Befehle) ----------
    if (req.method === 'GET') {
      const q = new URL(req.url, 'http://x').searchParams;
      const boards = String(q.get('boards') || '').split(',').filter((b) => BOARDS[b]).slice(0, 20);
      if (!boards.length) return send(400, { error: 'Unbekannte Liste.' });
      const lists = await redis(boards.map((b) => BOARDS[b].low ? ['ZRANGE', 'lb:' + b, 0, 9, 'WITHSCORES'] : ['ZRANGE', 'lb:' + b, 0, 9, 'REV', 'WITHSCORES']));
      const uids = [...new Set(lists.flatMap((l) => (l || []).filter((_, i) => i % 2 === 0)))];
      const names = uids.length ? (await redis([['HMGET', 'names', ...uids]]))[0] : [];
      const nameOf = Object.fromEntries(uids.map((u, i) => [u, names[i] || '???']));
      const result = {};
      boards.forEach((b, i) => {
        const l = lists[i] || [], rows = [];
        for (let j = 0; j < l.length; j += 2) rows.push({ id: l[j].slice(0, 6), name: nameOf[l[j]], score: +l[j + 1] });
        result[b] = rows;
      });
      return send(200, result, 'public, s-maxage=60, stale-while-revalidate=120');
    }
    if (req.method !== 'POST') return send(405, { error: 'Nur GET oder POST.' });

    const b = await body(req), action = b.action;
    if (await limited('rl:' + ip(req), 60, 60)) return send(429, { error: 'Zu viele Anfragen, kurz warten.' });

    if (action === 'register') {
      const name = cleanName(b.name);
      if (!name) return send(400, { error: 'Dieser Name geht nicht.' });
      if (await limited('rlreg:' + ip(req), 5, 3600)) return send(429, { error: 'Zu viele neue Konten, später nochmal.' });
      let code = '';
      for (let i = 0; i < 12; i++) code += crypto.randomInt(10);
      const uid = uidOf(code);
      await redis([['HSET', 'u:' + uid, 'name', name, 'created', Date.now()], ['HSET', 'names', uid, name]]);
      return send(200, { code, name, id: uid.slice(0, 6) });
    }

    const code = cleanCode(b.code);
    if (code.length !== 12) return send(400, { error: 'Der Code hat 12 Ziffern.' });
    const uid = uidOf(code);
    const [name] = await redis([['HGET', 'u:' + uid, 'name']]);
    if (!name) {
      await limited('rlbad:' + ip(req), 1000, 3600);
      return send(404, { error: 'Diesen Code gibt es nicht.' });
    }

    if (action === 'login') {
      const keys = Object.keys(BOARDS);
      const scores = await redis(keys.map((k) => ['ZSCORE', 'lb:' + k, uid]));
      const mine = {}; keys.forEach((k, i) => { if (scores[i] !== null) mine[k] = +scores[i]; });
      return send(200, { name, id: uid.slice(0, 6), scores: mine });
    }
    if (action === 'rename') {
      const n = cleanName(b.name);
      if (!n) return send(400, { error: 'Dieser Name geht nicht.' });
      await redis([['HSET', 'u:' + uid, 'name', n], ['HSET', 'names', uid, n]]);
      return send(200, { name: n });
    }
    if (action === 'submit') {
      // mehrere Rekorde auf einmal: { scores: { board: wert } }
      const s = b.scores || {}, cmds = [], done = [];
      for (const [board, raw] of Object.entries(s).slice(0, 25)) {
        const cfg = BOARDS[board], v = Number(raw);
        if (!cfg || !Number.isFinite(v) || v <= 0 || v > cfg.max || (cfg.min && v < cfg.min)) continue;
        cmds.push(['ZADD', 'lb:' + board, cfg.low ? 'LT' : 'GT', Math.round(v * 10) / 10, uid]); done.push(board);
      }
      if (cmds.length) await redis(cmds);
      return send(200, { ok: done });
    }
    return send(400, { error: 'Unbekannte Aktion.' });
  } catch (e) {
    return send(500, { error: 'Server-Fehler.' });
  }
};
