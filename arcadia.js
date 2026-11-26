/* Arcadia – gemeinsames Skript für alle Seiten: faire Rekorde erkennen und an die Online-Bestenliste schicken.
   Ein Konto entsteht automatisch beim ersten fairen Rekord. Der 12-stellige Code bleibt im Browser gespeichert. */
(() => {
  'use strict';
  const LS = window.localStorage;
  const get = (k, d) => { try { const v = LS.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const SNAKE_MODES = [['classic', 'Klassisch'], ['wrap', 'Ohne Wände'], ['walls', 'Hindernisse'], ['portal', 'Portale'], ['poison', 'Gift'], ['turbo', 'Turbo'],
    ['time', 'Zeitrennen'], ['mirror', 'Spiegel'], ['dark', 'Dunkel'], ['flee', 'Fluchtäpfel'], ['hunger', 'Hunger'], ['zone', 'Zone'], ['chaos', 'Chaos']];

  // Rekorde entstehen nur im Rekord-Modus der Spiele (feste Einstellungen) und liegen unter '<spiel>.rec'
  function parkStars() {
    const park = get('snake.park', {}); let s = 0;
    for (const k in park) s += (park[k] && park[k].s) || 0;
    return s;
  }
  function localBest() {
    const out = {};
    for (const [id] of SNAKE_MODES) { const v = get('snake.rec.' + id, 0); if (v > 0) out['snake-' + id] = v; }
    const ps = parkStars(); if (ps) out['snake-park'] = ps;
    for (const g of ['flug', 'dino', 'block', 'fruit', 'stack', 'up', 'vier', 'ttt']) { const v = +get(g + '.rec', 0); if (v > 0) out[g] = v; }
    const sol = +get('sol.rec', 0); if (sol > 0) out.sol = Math.round(sol * 10) / 10;
    return out;
  }
  const LOW = { sol: true };

  const ADJ = ['Grüner', 'Flinker', 'Schlauer', 'Wilder', 'Leiser', 'Mutiger', 'Neon', 'Blauer', 'Goldener', 'Schneller', 'Pinker', 'Cooler'];
  const ANI = ['Gecko', 'Fuchs', 'Falke', 'Otter', 'Luchs', 'Panda', 'Igel', 'Rabe', 'Dachs', 'Hase', 'Wal', 'Koala'];
  const randomName = () => ADJ[Math.floor(Math.random() * ADJ.length)] + ' ' + ANI[Math.floor(Math.random() * ANI.length)] + ' ' + (10 + Math.floor(Math.random() * 90));

  async function api(data) {
    const r = await fetch('/api/arcadia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({ error: 'Keine Verbindung.' }));
    if (!r.ok) throw new Error(j.error || 'Fehler ' + r.status);
    return j;
  }

  const A = window.Arcadia = {
    SNAKE_MODES, localBest, LOW,
    get code() { return get('arcadia.code', ''); },
    get name() { return get('arcadia.name', ''); },
    get id() { return get('arcadia.id', ''); },
    async register(name) {
      const j = await api({ action: 'register', name: name || randomName(), xp: get('arcadia.xp', 0) });
      put('arcadia.code', j.code); put('arcadia.name', j.name); put('arcadia.id', j.id); put('arcadia.sent', {});
      put('arcadia.xp', j.xp || 0); put('arcadia.xpq', 0); showLevel();
      await A.cloud().catch(() => {});
      return j;
    },
    async login(code) {
      const j = await api({ action: 'login', code });
      put('arcadia.code', String(code).replace(/\D/g, '')); put('arcadia.name', j.name); put('arcadia.id', j.id); put('arcadia.sent', j.scores || {});
      put('arcadia.xp', j.xp || 0); put('arcadia.xpq', 0); showLevel();
      await A.cloud().catch(() => {});
      await A.sync(true);
      return j;
    },
    async rename(name) {
      const j = await api({ action: 'rename', code: A.code, name });
      put('arcadia.name', j.name); return j;
    },
    logout() { setTimeout(() => { dispatchEvent(new Event('arcadia:account')); showLevel(); }); try { LS.removeItem('arcadia.xp'); LS.removeItem('arcadia.xpq'); LS.removeItem('arcadia.id'); LS.removeItem('arcadia.code'); LS.removeItem('arcadia.name'); LS.removeItem('arcadia.sent'); } catch (e) {} },
    async top(boards) {
      const r = await fetch('/api/arcadia?boards=' + encodeURIComponent(boards.join(',')));
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Bestenliste nicht erreichbar.');
      return r.json();
    },
    // Neue faire Rekorde hochladen (nur was besser ist als das zuletzt Gesendete)
    async sync(force) {
      const best = localBest(), sent = get('arcadia.sent', {}), todo = {};
      for (const b in best) {
        const v = best[b], s = sent[b];
        if (s === undefined || (LOW[b] ? v < s : v > s)) todo[b] = v;
      }
      if (!Object.keys(todo).length) return {};
      if (!A.code) return {}; // ohne Konto bleiben Rekorde nur auf diesem Gerät
      const j = await api({ action: 'submit', code: A.code, scores: todo });
      const now = get('arcadia.sent', {});
      for (const b of j.ok || []) now[b] = todo[b];
      put('arcadia.sent', now);
      return todo;
    },
  };

  // ---------- Erfahrung und Level ----------
  // Level L braucht insgesamt 50·L·(L−1) XP: Level 2 ab 100, Level 3 ab 300, Level 10 ab 4500 …
  const xpFor = (L) => 50 * L * (L - 1);
  function levelOf(xp) { let L = 1; while (xpFor(L + 1) <= xp) L++; return L; }
  A.levelOf = levelOf; A.xpFor = xpFor;
  Object.defineProperty(A, 'xpTotal', { get: () => get('arcadia.xp', 0) });
  let xpTimer = 0;
  async function flushXp() {
    const q = get('arcadia.xpq', 0); if (!q || !A.code) return;
    try {
      const j = await api({ action: 'xp', code: A.code, n: Math.min(q, 150) });
      put('arcadia.xpq', Math.max(0, get('arcadia.xpq', 0) - Math.min(q, 150)));
      if (j.xp != null) put('arcadia.xp', Math.max(j.xp + get('arcadia.xpq', 0), get('arcadia.xp', 0)));
      if (get('arcadia.xpq', 0)) xpTimer = setTimeout(flushXp, 2000);
    } catch (e) {}
  }
  A.xp = function (n, game) {
    n = Math.max(0, Math.round(n || 0)); if (!n) return;
    const before = levelOf(get('arcadia.xp', 0)), total = get('arcadia.xp', 0) + n;
    put('arcadia.xp', total); put('arcadia.xpq', get('arcadia.xpq', 0) + n);
    const after = levelOf(total);
    toast(`+${n} XP`, after > before ? `Level ${after} erreicht!` : '');
    showLevel();
    clearTimeout(xpTimer); xpTimer = setTimeout(flushXp, 1200);
  };
  function toast(main, sub) {
    if (!document.body) return;
    if (!document.getElementById('arc-toast-css')) {
      const st = document.createElement('style'); st.id = 'arc-toast-css';
      st.textContent = `.arc-toast { position: fixed; left: 50%; bottom: 22px; z-index: 99998; transform: translate(-50%, 20px); opacity: 0; pointer-events: none;
        padding: 9px 18px; border-radius: 14px; background: rgba(16,26,10,.88); color: #fff; font: 600 16px 'Fredoka', system-ui, sans-serif; text-align: center;
        box-shadow: 0 8px 24px rgba(0,0,0,.3); transition: transform .3s, opacity .3s; }
        .arc-toast.on { transform: translate(-50%, 0); opacity: 1; } .arc-toast b { color: #ffd54f; } .arc-toast small { display: block; color: #a5f3a0; font-size: 15px; }`;
      document.head.appendChild(st);
    }
    const t = document.createElement('div'); t.className = 'arc-toast';
    t.innerHTML = `<b>${main}</b>${sub ? `<small>${sub}</small>` : ''}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('on'));
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, sub ? 2600 : 1600);
  }
  // Alle Elemente mit data-arc-level zeigen Level und Fortschritt
  function showLevel() {
    const xp = get('arcadia.xp', 0), L = levelOf(xp), a = xpFor(L), b = xpFor(L + 1), pct = Math.round(((xp - a) / (b - a)) * 100);
    document.querySelectorAll('[data-arc-level]').forEach((el) => {
      el.innerHTML = `<span class="lv">Level ${L}</span><span class="nm">${A.code ? esc(A.name) : 'Gast'}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="xp">${xp - a} / ${b - a} XP</span>`;
    });
  }
  A.showLevel = showLevel;
  addEventListener('DOMContentLoaded', () => { showLevel(); flushXp(); });

  // ---------- Als App: Offline-Speicher (Service Worker) ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

  // Wenn ein Spiel einen Rekord speichert, kurz danach automatisch hochladen
  // ---------- Cloud-Spielstand ----------
  // Fortschritt, Rekorde und Statistiken aller Spiele werden mit dem Konto gespeichert und zusammengeführt.
  // Einstellungen (Farbe, Welt, Steuerung …) bleiben bewusst pro Gerät.
  const SAVE_RX = /^(snake\.rec\.[a-z]+$|snake\.park$|(flug|dino|block|fruit|stack|up|vier|ttt|sol)\.rec$|(sol|vier|ttt)\.stats$)/;
  const origSet = Storage.prototype.setItem;
  function collect() {
    const out = {};
    try { for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k && SAVE_RX.test(k)) { try { out[k] = JSON.parse(LS.getItem(k)); } catch (e) {} } } } catch (e) {}
    return out;
  }
  // Gleiche Regeln wie auf dem Server: es gewinnt immer das Bessere
  function mergeVal(k, a, b) {
    if (a === undefined || a === null) return b; if (b === undefined || b === null) return a;
    if (k === 'snake.park') {
      const o = { ...a };
      for (const id in b) { const x = o[id], y = b[id]; o[id] = !x ? y : { t: Math.min(x.t, y.t), s: Math.max(x.s, y.s) }; }
      return o;
    }
    if (k === 'sol.stats') {
      const lo = (x, y) => (x && y ? Math.min(x, y) : x || y || 0);
      return { ...a, ...b, wins: Math.max(a.wins || 0, b.wins || 0), best1: lo(a.best1, b.best1), best3: lo(a.best3, b.best3) };
    }
    if (k === 'vier.stats' || k === 'ttt.stats') {
      const o = { ...a };
      for (const x in b) { const p = o[x] || {}, q = b[x]; o[x] = { w: Math.max(p.w || 0, q.w || 0), l: Math.max(p.l || 0, q.l || 0), d: Math.max(p.d || 0, q.d || 0) }; }
      return o;
    }
    if (k === 'sol.rec') return Math.min(+a || Infinity, +b || Infinity) === Infinity ? 0 : Math.min(+a || Infinity, +b || Infinity);
    return Math.max(+a || 0, +b || 0);
  }
  function apply(data) {
    let changed = false;
    for (const k in data) {
      if (!SAVE_RX.test(k)) continue;
      let cur; try { cur = JSON.parse(LS.getItem(k)); } catch (e) { cur = undefined; }
      const m = mergeVal(k, cur === null ? undefined : cur, data[k]);
      if (JSON.stringify(m) !== JSON.stringify(cur)) { try { origSet.call(LS, k, JSON.stringify(m)); changed = true; } catch (e) {} }
    }
    if (changed) dispatchEvent(new Event('arcadia:save'));
    return changed;
  }
  let cloudBusy = null;
  A.cloud = async function () {
    if (!A.code) return;
    if (cloudBusy) return cloudBusy;
    cloudBusy = (async () => {
      const j = await api({ action: 'save', code: A.code, data: collect() });
      if (j.data) apply(j.data);
      put('arcadia.cloudAt', Date.now());
    })().finally(() => { cloudBusy = null; });
    return cloudBusy;
  };

  // Wenn ein Spiel etwas speichert: kurz danach Rekorde hochladen und den Spielstand sichern
  let timer = 0, cloudTimer = 0;
  const RX = /^(snake\.rec\.|snake\.park$|(flug|dino|block|fruit|stack|up|vier|ttt|sol)\.rec$)/;
  const plan = () => { clearTimeout(timer); timer = setTimeout(() => A.sync().catch(() => {}), 1500); };
  const planCloud = () => { clearTimeout(cloudTimer); cloudTimer = setTimeout(() => A.cloud().catch(() => {}), 4000); };
  try {
    Storage.prototype.setItem = function (k, v) {
      origSet.call(this, k, v);
      if (this !== LS) return;
      if (RX.test(k)) plan();
      if (SAVE_RX.test(k)) planCloud();
    };
  } catch (e) {}
  addEventListener('load', () => { plan(); A.cloud().catch(() => {}); });

  // ---------- Begrüßung: Registrieren oder Anmelden ----------
  const CSS = `
  #arc-gate { position: fixed; inset: 0; z-index: 99999; display: grid; place-items: center; padding: 16px; overflow: auto;
    background: rgba(8,3,22,.82); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-family: 'Fredoka', system-ui, sans-serif; color: #fff; }
  #arc-gate .box { width: min(440px, 100%); background: #170a38; border: 2px solid rgba(139,92,255,.7); border-radius: 22px; padding: 24px 22px 20px;
    box-shadow: 0 0 40px rgba(139,92,255,.35); }
  #arc-gate h2 { margin: 0 0 4px; text-align: center; font-size: 28px; color: #ffe4f3; text-shadow: 0 0 14px #ff3ea5; }
  #arc-gate p { margin: 8px 0; color: #c9bdf2; font-size: 15px; line-height: 1.5; }
  #arc-gate .tabs { display: flex; gap: 4px; padding: 4px; background: rgba(255,255,255,.06); border-radius: 14px; margin: 14px 0; }
  #arc-gate .tabs button { flex: 1; border: 0; border-radius: 10px; padding: 10px; font-weight: 600; font-size: 16px; font-family: inherit; color: #c9bdf2; background: transparent; cursor: pointer; }
  #arc-gate .tabs button.on { background: #8b5cff; color: #fff; }
  #arc-gate input { width: 100%; box-sizing: border-box; padding: 13px 14px; border-radius: 12px; border: 2px solid rgba(139,92,255,.6); background: #0d0520;
    color: #fff; font-weight: 600; font-size: 18px; font-family: inherit; outline: none; }
  #arc-gate input:focus { border-color: #29f0ff; }
  #arc-gate .btn { width: 100%; margin-top: 12px; border: 0; border-radius: 14px; padding: 13px; font-weight: 700; font-size: 17px; font-family: inherit; letter-spacing: 1px;
    color: #fff; background: linear-gradient(90deg, #ff3ea5, #8b5cff); cursor: pointer; box-shadow: 0 0 18px rgba(255,62,165,.45); }
  #arc-gate .btn:disabled { opacity: .5; cursor: default; }
  #arc-gate .code { display: flex; gap: 8px; align-items: center; margin: 12px 0 4px; }
  #arc-gate .code b { flex: 1; text-align: center; font-size: 26px; letter-spacing: 3px; padding: 12px 6px; border-radius: 12px; background: #0d0520;
    border: 2px solid #29f0ff; color: #29f0ff; text-shadow: 0 0 10px rgba(41,240,255,.5); font-variant-numeric: tabular-nums; user-select: all; -webkit-user-select: all; }
  #arc-gate .copy { border: 2px solid #29f0ff; background: transparent; color: #29f0ff; border-radius: 12px; padding: 0 14px; height: 56px; font-weight: 700; font-size: 15px; font-family: inherit; cursor: pointer; }
  #arc-gate .err { color: #ff8a9a; min-height: 20px; font-size: 14px; margin-top: 8px; }
  #arc-gate ul { margin: 6px 0 0; padding-left: 20px; color: #c9bdf2; font-size: 14px; line-height: 1.55; }
  #arc-gate .skip { display: block; margin: 14px auto 0; background: none; border: 0; color: #8f80c2; font-weight: 500; font-size: 14px; font-family: inherit; cursor: pointer; text-decoration: underline; }
  #arc-gate label.chk { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; color: #c9bdf2; font-size: 14px; cursor: pointer; }
  #arc-gate label.chk input { width: 18px; height: 18px; flex: none; margin-top: 2px; }`;
  const fmtCode = (c) => String(c).replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (x) {} t.remove(); }
    const old = btn.textContent; btn.textContent = 'Kopiert!'; setTimeout(() => (btn.textContent = old), 1500);
  }
  A.copyCode = copy; A.fmtCode = fmtCode;

  A.showGate = function (tab = 'reg', onDone) {
    if (document.getElementById('arc-gate')) return;
    if (!document.getElementById('arc-gate-css')) { const st = document.createElement('style'); st.id = 'arc-gate-css'; st.textContent = CSS; document.head.appendChild(st); }
    const g = document.createElement('div'); g.id = 'arc-gate'; g.setAttribute('role', 'dialog');
    // Tastendrücke nicht an das Spiel dahinter weitergeben
    g.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.appendChild(g);
    const close = () => { g.remove(); onDone && onDone(); dispatchEvent(new Event('arcadia:account')); };
    const info = `<ul>
        <li>Mit Konto landen deine Rekorde in der <b>weltweiten Bestenliste</b>.</li>
        <li>Kein Passwort, keine E-Mail: dein <b>12-stelliger Code</b> ist dein Schlüssel.</li>
        <li>Mit dem Code meldest du dich auf jedem Gerät an, z.&nbsp;B. iPad und PC.</li>
        <li>Rekorde zählen nur im <b>Rekord-Modus</b> der Spiele, mit festen Einstellungen für alle.</li></ul>`;
    function render(t) {
      g.innerHTML = `<div class="box"><h2>Willkommen bei Arcadia</h2>
        <div class="tabs"><button data-t="reg" class="${t === 'reg' ? 'on' : ''}">Registrieren</button><button data-t="log" class="${t === 'log' ? 'on' : ''}">Anmelden</button></div>
        ${t === 'reg' ? `<p>Wähle einen Namen für die Bestenliste (2–16 Zeichen):</p>
          <input id="arc-name" maxlength="16" autocomplete="nickname" placeholder="z. B. ${randomName()}">
          <button class="btn" id="arc-go">Konto erstellen</button>`
        : `<p>Gib deinen 12-stelligen Code ein:</p>
          <input id="arc-code" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012" maxlength="16">
          <button class="btn" id="arc-go">Anmelden</button>`}
        <div class="err" id="arc-err"></div>${info}
        <button class="skip" id="arc-skip">Erstmal ohne Konto spielen</button></div>`;
      g.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => render(b.dataset.t)));
      g.querySelector('#arc-skip').onclick = () => { put('arcadia.skip', true); close(); };
      const inp = g.querySelector('input'), go = g.querySelector('#arc-go'), err = g.querySelector('#arc-err');
      setTimeout(() => inp.focus(), 50);
      if (t === 'log') inp.oninput = () => { const p = inp.selectionStart === inp.value.length; inp.value = fmtCode(inp.value).slice(0, 14); if (p) inp.selectionStart = inp.value.length; };
      inp.onkeydown = (e) => { if (e.key === 'Enter') go.click(); };
      go.onclick = async () => {
        err.textContent = ''; go.disabled = true;
        try {
          if (t === 'reg') {
            const n = inp.value.trim();
            if (n.length < 2) throw new Error('Der Name braucht mindestens 2 Zeichen.');
            const j = await A.register(n);
            showCode(j);
          } else {
            const c = inp.value.replace(/\D/g, '');
            if (c.length !== 12) throw new Error('Der Code hat 12 Ziffern.');
            const j = await A.login(c);
            g.innerHTML = `<div class="box"><h2>Hallo ${esc(j.name)}!</h2><p style="text-align:center">Du bist angemeldet. Deine Rekorde werden ab jetzt mit deinem Konto verbunden.</p><button class="btn" id="arc-ok">Los geht's</button></div>`;
            g.querySelector('#arc-ok').onclick = close;
          }
        } catch (e) { err.textContent = e.message; go.disabled = false; }
      };
    }
    function showCode(j) {
      g.innerHTML = `<div class="box"><h2>Dein Konto ist da!</h2>
        <p>Hallo <b>${esc(j.name)}</b>. Das ist dein Code. Schreib ihn auf oder speichere ihn:</p>
        <div class="code"><b>${fmtCode(j.code)}</b><button class="copy" id="arc-copy">Kopieren</button></div>
        <p style="font-size:14px">Wichtig: Es gibt keine Möglichkeit, einen verlorenen Code wiederherzustellen. Ohne Code kommst du auf einem neuen Gerät nicht mehr an dein Konto.</p>
        <label class="chk"><input type="checkbox" id="arc-saved"> Ich habe meinen Code gespeichert.</label>
        <button class="btn" id="arc-ok" disabled>Weiter</button></div>`;
      g.querySelector('#arc-copy').onclick = (e) => copy(j.code, e.currentTarget);
      const ok = g.querySelector('#arc-ok');
      g.querySelector('#arc-saved').onchange = (e) => (ok.disabled = !e.target.checked);
      ok.onclick = () => { A.sync().catch(() => {}); close(); };
    }
    render(tab);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Beim ersten Besuch automatisch zeigen
  addEventListener('DOMContentLoaded', () => { if (!A.code && !get('arcadia.skip', false)) A.showGate(); });
})();
