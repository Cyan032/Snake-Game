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
  fruit: { max: 200000 },
  stack: { max: 20000 },
  up: { max: 500000 },
  vier: { max: 1000 },
  ttt: { max: 1000 },
  sol: { low: true, min: 30, max: 36000 },
};
// Bestenlisten der Version 2: nur noch Rekorde aus dem Rekord-Modus (die alten Listen bleiben unbenutzt liegen)
const LB = 'lb2:';
for (const m of SNAKE_MODES) BOARDS['snake-' + m] = { max: 5000 };

const BAD = ['arsch', 'fick', 'fuck', 'hure', 'nazi', 'hitler', 'nigg', 'neger', 'schwuchtel', 'fotze', 'wichs', 'bitch', 'cunt', 'dick', 'penis', 'vagina', 'sex', 'porn', 'kanake', 'spast', 'missgeburt', 'shit', 'scheiss', 'scheiß', 'hurensohn', 'whore', 'slut', 'faggot', 'retard', 'kkk', 'heil'];

// Cloud-Spielstand: erlaubte Schlüssel und Zusammenführen (es gewinnt immer das Bessere)
const SAVE_RX = /^(snake\.rec\.[a-z]+$|snake\.park$|(flug|dino|block|fruit|stack|up|vier|ttt|sol)\.rec$|(sol|vier|ttt)\.stats$)/;
const num = (x) => (Number.isFinite(+x) ? Math.max(0, +x) : 0);
function mergeVal(k, a, b) {
  if (a === undefined || a === null) return clean(k, b); if (b === undefined || b === null) return clean(k, a);
  a = clean(k, a); b = clean(k, b);
  if (k === 'snake.park') {
    const o = { ...a };
    for (const id in b) { const x = o[id], y = b[id]; o[id] = !x ? y : { t: Math.min(x.t, y.t), s: Math.max(x.s, y.s) }; }
    return o;
  }
  if (k === 'sol.stats') {
    const lo = (x, y) => (x && y ? Math.min(x, y) : x || y || 0);
    return { wins: Math.max(a.wins, b.wins), best1: lo(a.best1, b.best1), best3: lo(a.best3, b.best3) };
  }
  if (k === 'vier.stats' || k === 'ttt.stats') {
    const o = { ...a };
    for (const x in b) { const p = o[x] || { w: 0, l: 0, d: 0 }, q = b[x]; o[x] = { w: Math.max(p.w, q.w), l: Math.max(p.l, q.l), d: Math.max(p.d, q.d) }; }
    return o;
  }
  if (k === 'sol.rec') return a && b ? Math.min(a, b) : a || b;
  return Math.max(a, b);
}
// Nur erwartete Formen übernehmen, damit niemand Müll speichern kann
function clean(k, v) {
  if (k === 'snake.park') {
    const o = {}; if (v && typeof v === 'object') for (const id of Object.keys(v).slice(0, 100)) if (/^[a-z0-9]{1,8}$/.test(id) && v[id]) o[id] = { t: num(v[id].t), s: Math.min(5, num(v[id].s)) };
    return o;
  }
  if (k === 'sol.stats') return { wins: num(v && v.wins), best1: num(v && v.best1), best3: num(v && v.best3) };
  if (k === 'vier.stats' || k === 'ttt.stats') {
    const o = {}; if (v && typeof v === 'object') for (const x of Object.keys(v).slice(0, 30)) if (/^k\d(s\d)?$/.test(x) && v[x]) o[x] = { w: num(v[x].w), l: num(v[x].l), d: num(v[x].d) };
    return o;
  }
  return num(v);
}

async function redis(cmds) {
  const r = await fetch(URL_ + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('db ' + r.status);
  const out = await r.json();
  return out.map((x) => (x.error ? null : x.result));
}
const xpFor = (L) => 50 * L * (L - 1);
function levelOf(xp) { let L = 1; while (xpFor(L + 1) <= xp) L++; return L; }
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
      const lists = await redis(boards.map((b) => BOARDS[b].low ? ['ZRANGE', LB + b, 0, 9, 'WITHSCORES'] : ['ZRANGE', LB + b, 0, 9, 'REV', 'WITHSCORES']));
      const uids = [...new Set(lists.flatMap((l) => (l || []).filter((_, i) => i % 2 === 0)))];
      const [names, lvs] = uids.length ? await redis([['HMGET', 'names', ...uids], ['HMGET', 'lv', ...uids]]) : [[], []];
      const nameOf = Object.fromEntries(uids.map((u, i) => [u, names[i] || '???']));
      const lvOf = Object.fromEntries(uids.map((u, i) => [u, +lvs[i] || 1]));
      const result = {};
      boards.forEach((b, i) => {
        const l = lists[i] || [], rows = [];
        for (let j = 0; j < l.length; j += 2) rows.push({ id: l[j].slice(0, 6), name: nameOf[l[j]], lv: lvOf[l[j]], score: +l[j + 1] });
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
      // Erfahrung, die vorher ohne Konto gesammelt wurde, darf mit (begrenzt)
      const xp = Math.max(0, Math.min(3000, Math.floor(Number(b.xp) || 0)));
      await redis([['HSET', 'u:' + uid, 'name', name, 'created', Date.now(), 'xp', xp], ['HSET', 'names', uid, name], ['HSET', 'lv', uid, levelOf(xp)]]);
      return send(200, { code, name, id: uid.slice(0, 6), xp });
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
      const scores = await redis([...keys.map((k) => ['ZSCORE', LB + k, uid]), ['HGET', 'u:' + uid, 'xp']]);
      const mine = {}; keys.forEach((k, i) => { if (scores[i] !== null) mine[k] = +scores[i]; });
      return send(200, { name, id: uid.slice(0, 6), scores: mine, xp: +scores[keys.length] || 0 });
    }
    if (action === 'rename') {
      const n = cleanName(b.name);
      if (!n) return send(400, { error: 'Dieser Name geht nicht.' });
      await redis([['HSET', 'u:' + uid, 'name', n], ['HSET', 'names', uid, n]]);
      return send(200, { name: n });
    }
    if (action === 'save') {
      const incoming = b.data && typeof b.data === 'object' ? b.data : {};
      if (JSON.stringify(incoming).length > 60000) return send(413, { error: 'Spielstand zu groß.' });
      if (await limited('rlsave:' + uid, 20, 60)) return send(429, { error: 'Zu oft gespeichert.' });
      const [raw] = await redis([['HGET', 'u:' + uid, 'save']]);
      let stored = {}; try { stored = JSON.parse(raw || '{}'); } catch (e) {}
      const merged = {};
      for (const k of new Set([...Object.keys(stored), ...Object.keys(incoming)])) if (SAVE_RX.test(k)) merged[k] = mergeVal(k, stored[k], incoming[k]);
      const out = JSON.stringify(merged);
      if (out !== raw) await redis([['HSET', 'u:' + uid, 'save', out]]);
      return send(200, { data: merged });
    }
    if (action === 'xp') {
      const n = Math.floor(Number(b.n) || 0);
      if (n < 1 || n > 150) return send(400, { error: 'Ungültige XP.' });
      if (await limited('rlxp:' + uid, 30, 60)) return send(429, { error: 'Zu viele XP auf einmal.' });
      const [xp] = await redis([['HINCRBY', 'u:' + uid, 'xp', n]]);
      await redis([['HSET', 'lv', uid, levelOf(+xp)]]);
      return send(200, { xp: +xp, level: levelOf(+xp) });
    }
    if (action === 'submit') {
      // mehrere Rekorde auf einmal: { scores: { board: wert } }
      const s = b.scores || {}, cmds = [], done = [];
      for (const [board, raw] of Object.entries(s).slice(0, 25)) {
        const cfg = BOARDS[board], v = Number(raw);
        if (!cfg || !Number.isFinite(v) || v <= 0 || v > cfg.max || (cfg.min && v < cfg.min)) continue;
        cmds.push(['ZADD', LB + board, cfg.low ? 'LT' : 'GT', Math.round(v * 10) / 10, uid]); done.push(board);
      }
      if (cmds.length) await redis(cmds);
      return send(200, { ok: done });
    }
    return send(400, { error: 'Unbekannte Aktion.' });
  } catch (e) {
    return send(500, { error: 'Server-Fehler.' });
  }
};
