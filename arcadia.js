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
  function localBest() {
    const out = {};
    const sn = +get('snake.rec.rekord', 0); if (sn > 0) out.snake = sn; // nur der Snake-Spielmodus „Rekord“
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
  // ---------- Easter Egg: Webswitch ----------
  // Ein Tastenkürzel oder eine Geste öffnet blitzschnell eine selbst gewählte Seite.
  // Einstellen: 5× auf „COIN“ unten auf der Startseite tippen oder Alt + Shift + W.
  const WS_KEYS = {
    altq: { name: 'Alt + Q', combo: { code: 'KeyQ', alt: true } },
    shiftesc: { name: 'Shift + Esc', combo: { code: 'Escape', shift: true } },
    backquote: { name: '^ (links neben der 1)', combo: { code: 'Backquote' } },
    custom: { name: 'Eigenes …' },
    none: { name: 'Keins' },
  };
  const WS_GESTURES = {
    three: 'Mit 3 Fingern tippen',
    twodbl: 'Mit 2 Fingern doppelt tippen',
    corner: 'Ecke oben rechts 3× tippen',
    shake: 'Gerät schütteln',
    none: 'Keine',
  };
  // Vorgaben für die Adresse
  const WS_URLS = ['https://online-schule.saarland/', 'https://meine.online-schule.saarland/', 'https://lms-wgr-sb.online-schule.saarland/my/'];
  const wsCfg = () => Object.assign({ url: '', mode: 'tab', key: 'altq', custom: null, gesture: 'three', on: true }, get('arcadia.webswitch', {}));
  const KEYLABEL = { Space: 'Leertaste', Escape: 'Esc', Backquote: '^', Enter: 'Enter', Backspace: '⌫', Tab: 'Tab', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  function comboName(c) {
    if (!c) return '–';
    const k = KEYLABEL[c.code] || c.code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
    return [c.ctrl && 'Strg', c.meta && 'Cmd', c.alt && 'Alt', c.shift && 'Shift', k].filter(Boolean).join(' + ');
  }
  const comboMatch = (c, e) => !!c && e.code === c.code && !!c.alt === e.altKey && !!c.shift === e.shiftKey && !!c.ctrl === e.ctrlKey && !!c.meta === e.metaKey;
  const activeCombo = (c) => (c.key === 'custom' ? c.custom : WS_KEYS[c.key] && WS_KEYS[c.key].combo);
  let wsLast = 0;
  function wsGo() {
    const now = Date.now(); if (now - wsLast < 800) return; wsLast = now;
    const c = wsCfg(); let url = (c.url || '').trim();
    if (!url) { A.webswitch(); return; }
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (c.mode === 'tab') { const w = window.open(url, '_blank', 'noopener'); if (!w) location.href = url; }
    else if (c.mode === 'same') location.href = url;
    else { document.documentElement.style.display = 'none'; location.replace(url); } // sofort, ohne Zurück
  }
  const wsReady = () => wsCfg().on && !document.getElementById('arc-ws');
  addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyW') { e.preventDefault(); e.stopPropagation(); A.webswitch(); return; }
    if (!wsReady() || (e.target && /input|textarea/i.test(e.target.tagName))) return;
    if (comboMatch(activeCombo(wsCfg()), e)) { e.preventDefault(); e.stopPropagation(); wsGo(); }
  }, true);

  // Gesten für iPad und Handy
  let twoTaps = 0, cornerTaps = [], shakes = [];
  addEventListener('touchstart', (e) => {
    if (!wsReady()) return;
    const g = wsCfg().gesture, n = e.touches.length, now = Date.now();
    if (g === 'three' && n === 3) { e.preventDefault(); wsGo(); }
    else if (g === 'twodbl' && n === 2) { if (now - twoTaps < 450) { twoTaps = 0; e.preventDefault(); wsGo(); } else twoTaps = now; }
  }, { capture: true, passive: false });
  addEventListener('pointerdown', (e) => {
    if (!wsReady() || wsCfg().gesture !== 'corner') return;
    if (e.clientX < innerWidth - 70 || e.clientY > 70) return;
    const now = Date.now(); cornerTaps = cornerTaps.filter((t) => now - t < 900); cornerTaps.push(now);
    if (cornerTaps.length >= 3) { cornerTaps = []; wsGo(); }
  }, true);
  addEventListener('devicemotion', (e) => {
    if (!wsReady() || wsCfg().gesture !== 'shake') return;
    const a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
    const m = Math.hypot(a.x || 0, a.y || 0, a.z || 0), now = Date.now();
    if (m < 24) return;
    shakes = shakes.filter((t) => now - t < 900); shakes.push(now);
    if (shakes.length >= 3) { shakes = []; wsGo(); }
  });
  function askMotion() { try { if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) {} }

  // Menü als Netz (wie eine Graph-Ansicht): Mitte = Webswitch, Striche zu den Bereichen, daran die Auswahl
  A.webswitch = function () {
    if (document.getElementById('arc-ws')) return;
    if (!document.getElementById('arc-ws-css')) {
      const st = document.createElement('style'); st.id = 'arc-ws-css';
      st.textContent = `#arc-ws { position: fixed; inset: 0; z-index: 99999; background: #0b0d0c; font-family: ui-monospace, Menlo, Consolas, monospace; color: #cfe9d6; touch-action: none; user-select: none; -webkit-user-select: none; }
        #arc-ws canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        #arc-ws .card { position: absolute; left: 14px; top: 14px; z-index: 2; width: 250px; padding: 12px 14px 10px; border-radius: 12px; pointer-events: none;
          background: rgba(6,14,9,.82); border: 1px solid rgba(61,220,132,.45); box-shadow: 0 0 24px rgba(61,220,132,.15), inset 0 0 18px rgba(61,220,132,.06);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); font-size: 12px; }
        #arc-ws .card::before { content: ''; position: absolute; left: -1px; top: -1px; width: 16px; height: 16px; border-left: 2px solid #3ddc84; border-top: 2px solid #3ddc84; border-radius: 12px 0 0 0; }
        #arc-ws .card::after { content: ''; position: absolute; right: -1px; bottom: -1px; width: 16px; height: 16px; border-right: 2px solid #3ddc84; border-bottom: 2px solid #3ddc84; border-radius: 0 0 12px 0; }
        #arc-ws .card h3 { margin: 0 0 2px; font-size: 15px; letter-spacing: 3px; color: #3ddc84; text-shadow: 0 0 10px rgba(61,220,132,.6); }
        #arc-ws .card .sub { color: #5fae7c; margin-bottom: 8px; min-height: 15px; }
        #arc-ws .card .r { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; border-top: 1px solid rgba(61,220,132,.12); }
        #arc-ws .card .r span:first-child { color: #5f8a6e; text-transform: uppercase; letter-spacing: 1px; }
        #arc-ws .card .r span:last-child { color: #d9ffe6; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
        #arc-ws .card .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; background: #3ddc84; box-shadow: 0 0 8px #3ddc84; animation: wsblink 1.4s steps(1) infinite; }
        #arc-ws .card .dot.off { background: #ff5d6c; box-shadow: 0 0 8px #ff5d6c; }
        #arc-ws .card .bars { display: inline-flex; gap: 2px; align-items: flex-end; height: 10px; }
        #arc-ws .card .bars i { width: 3px; background: #3ddc84; border-radius: 1px; }
        @keyframes wsblink { 50% { opacity: .35; } }
        @media (max-width: 520px) { #arc-ws .card { width: calc(100vw - 80px); font-size: 11px; } }
        #arc-ws .x { position: absolute; right: 14px; top: 12px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid #2c4f39; background: rgba(11,13,12,.8); color: #9fd8b0; font-size: 20px; cursor: pointer; }
        #arc-ws .x:hover { border-color: #3ddc84; color: #3ddc84; }
        #arc-ws .hint { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font-size: 12px; color: #4d7a5d; pointer-events: none; }
        #arc-ws .inp { position: absolute; transform: translate(-50%, 0); display: flex; gap: 6px; }
        #arc-ws .inp input { width: min(320px, 70vw); padding: 9px 11px; border-radius: 9px; border: 1px solid #3ddc84; background: #050706; color: #e8ffe8; font: 15px ui-monospace, Menlo, monospace; outline: none; box-shadow: 0 0 18px rgba(61,220,132,.3); }
        #arc-ws .inp button { padding: 0 12px; border-radius: 9px; border: 0; background: #3ddc84; color: #04140a; font: 700 14px ui-monospace, Menlo, monospace; cursor: pointer; }`;
      document.head.appendChild(st);
    }
    const c = wsCfg();
    const state = { url: c.url, mode: c.mode, key: c.key, custom: c.custom, gesture: c.gesture, on: c.on ? '1' : '0' };
    const short = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const URL_LBL = { 'https://online-schule.saarland/': 'online-schule', 'https://meine.online-schule.saarland/': 'meine.online-schule', 'https://lms-wgr-sb.online-schule.saarland/my/': 'lms-wgr-sb' };
    const GEST_LBL = { three: '3 Finger', twodbl: '2 Finger 2×', corner: 'Ecke 3×', shake: 'schütteln', none: 'keine' };
    const KEY_LBL = { altq: 'Alt+Q', shiftesc: 'Shift+Esc', backquote: '^ Taste', none: 'keins' };
    let recording = false;
    let save = (msg) => {
      const key = state.key === 'custom' && !state.custom ? 'none' : state.key;
      put('arcadia.webswitch', { url: state.url, mode: state.mode, key, custom: state.custom, gesture: state.gesture, on: state.on === '1' });
      if (msg) flash = { text: msg, t: 1.6 };
    };

    const g = document.createElement('div'); g.id = 'arc-ws';
    g.innerHTML = `<canvas></canvas><div class="card"><h3>&gt; WEBSWITCH</h3><div class="sub" id="ws-ln"></div><div id="ws-rows"></div></div><button class="x" type="button" title="Schließen (Esc)">✕</button>
      <div class="hint">Knoten antippen zum Auswählen · ziehen zum Verschieben · wird sofort gespeichert</div>`;
    document.body.appendChild(g);
    const cv = g.querySelector('canvas'), cx = cv.getContext('2d');
    const close = () => { g.remove(); removeEventListener('resize', size); };
    g.querySelector('.x').onclick = close;

    // ---------- Knoten und Verbindungen ----------
    const CATS = [
      { id: 'url', label: 'Adresse', opts: () => [...WS_URLS.map((u) => ({ v: u, label: URL_LBL[u] || short(u) })), { v: '__custom', label: WS_URLS.includes(state.url) || !state.url ? 'eigene …' : short(state.url).slice(0, 22) }] },
      { id: 'mode', label: 'Öffnen', opts: () => [{ v: 'tab', label: 'neuer Tab' }, { v: 'same', label: 'gleicher Tab' }, { v: 'fast', label: 'sofort weg' }] },
      { id: 'key', label: 'Kürzel', opts: () => Object.keys(WS_KEYS).map((k) => ({ v: k, label: k === 'custom' ? (recording ? 'Taste drücken …' : state.custom ? comboName(state.custom) : 'eigenes …') : KEY_LBL[k] })) },
      { id: 'gesture', label: 'Geste', opts: () => Object.keys(WS_GESTURES).map((k) => ({ v: k, label: GEST_LBL[k] })) },
      { id: 'on', label: 'Status', opts: () => [{ v: '1', label: 'an' }, { v: '0', label: 'aus' }] },
    ];
    const isOn = (cat, v) => (cat === 'url' ? (v === '__custom' ? !!state.url && !WS_URLS.includes(state.url) : state.url === v) : String(state[cat]) === String(v));
    let W = 0, H = 0, S = 1, SY = 1, dpr = 1;
    const nodes = [], links = [];
    const root = { kind: 'root', label: 'WEBSWITCH', x: 0, y: 0, vx: 0, vy: 0, r: 30 };
    nodes.push(root);
    CATS.forEach((cat, i) => {
      const a = (i / CATS.length) * Math.PI * 2 - Math.PI / 2;
      const cn = { kind: 'cat', cat: cat.id, label: cat.label, x: Math.cos(a) * 200, y: Math.sin(a) * 200, vx: 0, vy: 0, r: 12, a };
      nodes.push(cn); links.push([root, cn, 210]);
      cat.opts().forEach((o, j, arr) => {
        const b = a + (j - (arr.length - 1) / 2) * 0.55;
        const on = { kind: 'opt', cat: cat.id, v: o.v, x: cn.x + Math.cos(b) * 120, y: cn.y + Math.sin(b) * 120, vx: 0, vy: 0, r: 7, a };
        nodes.push(on); links.push([cn, on, 120]);
      });
    });
    const labelOf = (n) => {
      if (n.kind !== 'opt') return n.label;
      const o = CATS.find((c2) => c2.id === n.cat).opts().find((x) => x.v === n.v); return o ? o.label : '';
    };

    function size() {
      dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
      cv.width = W * dpr; cv.height = H * dpr; if (!S || S === 1) S = SY = Math.min(W, H) / 900;
    }
    size(); addEventListener('resize', size);
    // Zoom so wählen, dass das ganze Netz samt Beschriftung auf den Bildschirm passt
    function fit() {
      let mx = 1, my = 1;
      for (const n of nodes) { mx = Math.max(mx, Math.abs(n.x) + (n.kind === 'opt' ? 70 : 50)); my = Math.max(my, Math.abs(n.y) + 34); }
      const top = W < 600 ? 250 : 70, sx = Math.max(0.4, Math.min(1.3, (W / 2 - 14) / mx)), sy = Math.max(0.35, Math.min(1.3, (H / 2 - top / 2 - 40) / my));
      const tx = Math.min(sx, sy), ty = Math.min(sy, tx * 1.8); // im Hochformat die Höhe ausnutzen
      S += (tx - S) * 0.08; SY += (ty - SY) * 0.08;
    }

    // ---------- Physik: abstoßen, Federn, leichte Anziehung zur Mitte ----------
    let drag = null, hover = null, t = 0, flash = null;
    function physics() {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]; let dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
        const f = Math.min(5, 5200 / d2); dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
      for (const [a, b, len] of links) {
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, f = (d - len) * 0.012;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        if (n === drag) { n.vx = n.vy = 0; continue; }
        n.vx -= n.x * 0.0012; n.vy -= n.y * 0.0012;           // zur Mitte
        if (n.kind === 'opt') { const d = Math.hypot(n.x, n.y) || 1; n.vx += (n.x / d) * 0.25; n.vy += (n.y / d) * 0.25; } // nach außen
        n.vx += Math.sin(t * 0.6 + n.x * 0.01) * 0.02;          // leichtes Schweben
        n.vy += Math.cos(t * 0.5 + n.y * 0.01) * 0.02;
        n.vx *= 0.86; n.vy *= 0.86; n.x += n.vx; n.y += n.vy;
      }
      root.x *= 0.9; root.y *= 0.9; // Mitte bleibt in der Mitte
    }
    const toScreen = (n) => [W / 2 + n.x * S, H / 2 + (W < 600 ? 105 : 0) + n.y * SY];
    const neighbors = (n) => new Set(links.filter(([a, b]) => a === n || b === n).flatMap(([a, b]) => [a, b]));

    // Hintergrund-Netz: viele feine Punkte und Striche über den ganzen Bildschirm
    const amb = Array.from({ length: 150 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.00025, vy: (Math.random() - 0.5) * 0.00025, s: Math.random() }));
    const ACC = '#3ddc84';
    function hudCircle(x, y, r) {
      cx.save(); cx.translate(x, y);
      // äußere Skala mit Strichen, dreht langsam
      cx.rotate(t * 0.12);
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2, long = i % 6 === 0, r1 = r * 2.55, r2 = r1 + (long ? 9 : 4);
        cx.strokeStyle = long ? 'rgba(61,220,132,.75)' : 'rgba(61,220,132,.3)'; cx.lineWidth = long ? 2 : 1;
        cx.beginPath(); cx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); cx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); cx.stroke();
      }
      cx.rotate(-t * 0.12);
      // gestrichelter Ring, dreht gegenläufig
      cx.rotate(-t * 0.35); cx.setLineDash([6, 8]); cx.strokeStyle = 'rgba(61,220,132,.5)'; cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(0, 0, r * 2.15, 0, Math.PI * 2); cx.stroke(); cx.setLineDash([]); cx.rotate(t * 0.35);
      // drei dicke Bogen-Segmente
      cx.rotate(t * 0.6); cx.lineWidth = 4; cx.lineCap = 'round'; cx.strokeStyle = ACC; cx.shadowColor = ACC; cx.shadowBlur = 14;
      for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(0, 0, r * 1.75, (i * 2 * Math.PI) / 3, (i * 2 * Math.PI) / 3 + 1.1); cx.stroke(); }
      cx.rotate(-t * 0.6);
      // zwei dünne Gegenbögen
      cx.rotate(-t * 0.9); cx.lineWidth = 2; cx.shadowBlur = 6; cx.strokeStyle = 'rgba(61,220,132,.8)';
      for (let i = 0; i < 2; i++) { cx.beginPath(); cx.arc(0, 0, r * 1.4, i * Math.PI + 0.3, i * Math.PI + 1.4); cx.stroke(); }
      cx.rotate(t * 0.9); cx.shadowBlur = 0; cx.lineCap = 'butt';
      // Kern: Verlauf, Sechseck, Fadenkreuz
      const gr = cx.createRadialGradient(0, 0, 2, 0, 0, r * 1.15);
      gr.addColorStop(0, 'rgba(61,220,132,.95)'); gr.addColorStop(0.55, 'rgba(61,220,132,.45)'); gr.addColorStop(1, 'rgba(61,220,132,.05)');
      cx.fillStyle = gr; cx.beginPath(); cx.arc(0, 0, r * 1.15, 0, Math.PI * 2); cx.fill();
      cx.strokeStyle = 'rgba(220,255,230,.9)'; cx.lineWidth = 1.5; cx.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6 + t * 0.2; cx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); }
      cx.stroke();
      cx.strokeStyle = 'rgba(220,255,230,.55)'; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(-r * 2.0, 0); cx.lineTo(-r * 1.25, 0); cx.moveTo(r * 1.25, 0); cx.lineTo(r * 2.0, 0); cx.moveTo(0, -r * 2.0); cx.lineTo(0, -r * 1.25); cx.moveTo(0, r * 1.25); cx.lineTo(0, r * 2.0); cx.stroke();
      cx.fillStyle = '#04140a'; cx.font = `800 ${Math.round(r * 0.62)}px ui-monospace, Menlo, monospace`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('WS', 0, 1);
      cx.restore();
    }
    function draw() {
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.fillStyle = '#080a09'; cx.fillRect(0, 0, W, H);
      // feines Punktraster
      cx.fillStyle = 'rgba(61,220,132,.06)';
      for (let x = (W / 2) % 28; x < W; x += 28) for (let y = (H / 2) % 28; y < H; y += 28) cx.fillRect(x, y, 1.2, 1.2);
      // Hintergrund-Netz (dünn)
      for (const p of amb) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; }
      cx.lineWidth = 0.6;
      for (let i = 0; i < amb.length; i++) {
        const a = amb[i], ax = a.x * W, ay = a.y * H;
        for (let j = i + 1; j < amb.length; j++) {
          const b = amb[j], d = Math.hypot(ax - b.x * W, ay - b.y * H);
          if (d < 120) { cx.strokeStyle = `rgba(61,220,132,${(1 - d / 120) * 0.16})`; cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(b.x * W, b.y * H); cx.stroke(); }
        }
      }
      for (const p of amb) { cx.fillStyle = `rgba(61,220,132,${0.15 + p.s * 0.3})`; cx.beginPath(); cx.arc(p.x * W, p.y * H, 1 + p.s * 1.4, 0, Math.PI * 2); cx.fill(); }

      const hn = hover && hover.kind !== 'root' ? neighbors(hover) : null;
      // unsere Verbindungen: dick, ausgewählte leuchten, Datenpunkte laufen nach außen
      links.forEach(([a, b], k) => {
        const [x1, y1] = toScreen(a), [x2, y2] = toScreen(b);
        const lit = hn && hn.has(a) && hn.has(b), sel = b.kind === 'opt' ? isOn(b.cat, b.v) : true;
        const main = a.kind === 'root';
        cx.lineCap = 'round';
        cx.strokeStyle = lit || (sel && b.kind === 'opt') ? 'rgba(61,220,132,.95)' : main ? 'rgba(61,220,132,.7)' : hn ? 'rgba(120,150,130,.15)' : 'rgba(120,150,130,.45)';
        cx.lineWidth = main ? 4 : sel ? 3.2 : 2.4;
        cx.shadowColor = ACC; cx.shadowBlur = lit || main || (sel && b.kind === 'opt') ? 10 : 0;
        cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.stroke(); cx.shadowBlur = 0;
        if (main || (sel && b.kind === 'opt')) {
          const f = (t * (main ? 0.45 : 0.7) + k * 0.17) % 1;
          cx.fillStyle = '#d9ffe6'; cx.beginPath(); cx.arc(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, main ? 3 : 2.4, 0, Math.PI * 2); cx.fill();
        }
      });
      cx.lineCap = 'butt';
      cx.textAlign = 'center'; cx.textBaseline = 'top';
      for (const n of nodes) {
        const [x, y] = toScreen(n), dim = hn && !hn.has(n), sel = n.kind === 'opt' && isOn(n.cat, n.v);
        const r = n.r * Math.min(1.2, Math.max(0.75, S)) * (n === hover ? 1.25 : 1);
        if (n.kind === 'root') { hudCircle(x, y, r); cx.textAlign = 'center'; cx.textBaseline = 'top';
          cx.fillStyle = ACC; cx.font = '700 14px ui-monospace, Menlo, monospace'; cx.shadowColor = ACC; cx.shadowBlur = 10;
          cx.fillText('WEBSWITCH', x, y + r * 2.55 + 14); cx.shadowBlur = 0; continue; }
        cx.globalAlpha = dim ? 0.25 : 1;
        if (n.kind === 'cat') {
          cx.fillStyle = '#0c1a11'; cx.strokeStyle = ACC; cx.lineWidth = 2.5; cx.shadowColor = ACC; cx.shadowBlur = 12;
          cx.beginPath(); cx.arc(x, y, r + 3, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.shadowBlur = 0;
          cx.fillStyle = '#9fe8b8'; cx.beginPath(); cx.arc(x, y, r * 0.45, 0, Math.PI * 2); cx.fill();
          cx.strokeStyle = 'rgba(61,220,132,.35)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, r + 8, t % (Math.PI * 2), t % (Math.PI * 2) + 2); cx.stroke();
        } else {
          cx.shadowColor = ACC; cx.shadowBlur = sel || n === hover ? 14 : 0;
          cx.fillStyle = sel ? ACC : '#1a241e'; cx.strokeStyle = sel ? '#d9ffe6' : '#5e7a68'; cx.lineWidth = 2;
          cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill(); cx.stroke(); cx.shadowBlur = 0;
          if (sel) { cx.strokeStyle = 'rgba(61,220,132,.5)'; cx.lineWidth = 1; cx.beginPath(); cx.arc(x, y, r + 5 + Math.sin(t * 4) * 1.5, 0, Math.PI * 2); cx.stroke(); }
        }
        const fs = n.kind === 'cat' ? 14 : 12.5;
        cx.font = `${n.kind === 'opt' ? 500 : 700} ${Math.round(fs * Math.min(1.1, Math.max(0.8, S)))}px ui-monospace, Menlo, Consolas, monospace`;
        cx.fillStyle = sel || n === hover ? '#e8ffe8' : n.kind === 'cat' ? '#bff5d0' : '#86a493';
        const lbl = labelOf(n);
        if (n.kind === 'opt' && n.cat === 'key' && n.v === 'custom' && recording) cx.fillStyle = (t * 2) % 1 < 0.5 ? ACC : '#1f6b40';
        cx.fillText(n.kind === 'cat' ? lbl.toUpperCase() : lbl, x, y + r + 8);
        cx.globalAlpha = 1;
      }
      if (flash) {
        flash.t -= 1 / 60; cx.globalAlpha = Math.max(0, Math.min(1, flash.t));
        cx.fillStyle = ACC; cx.font = '600 14px ui-monospace, Menlo, monospace'; cx.fillText('[ok] ' + flash.text, W / 2, H - 62);
        cx.globalAlpha = 1; if (flash.t <= 0) flash = null;
      }
    }
    (function loop() { if (!document.body.contains(g)) return; t += 1 / 60; physics(); if (!drag) fit(); draw(); requestAnimationFrame(loop); })();

    // Statuszeile oben tippt sich
    // Status-Karte oben links
    const rowsEl = g.querySelector('#ws-rows'), opened = Date.now();
    function card() {
      if (!document.body.contains(g)) return clearInterval(cardTimer);
      const on = state.on === '1', key = state.key === 'custom' ? (state.custom ? comboName(state.custom) : '–') : WS_KEYS[state.key].name;
      const up = Math.floor((Date.now() - opened) / 1000), bars = [4, 6, 8, 10].map((h, i) => `<i style="height:${h}px;opacity:${on && i < 3 + (up % 2) ? 1 : 0.25}"></i>`).join('');
      const row = (k, v) => `<div class="r"><span>${k}</span><span>${v}</span></div>`;
      rowsEl.innerHTML = row('Status', `<span class="dot${on ? '' : ' off'}"></span>${on ? 'AKTIV' : 'AUS'}`)
        + row('Ziel', esc(state.url ? short(state.url) : 'nicht gesetzt'))
        + row('Öffnen', { tab: 'Neuer Tab', same: 'Gleicher Tab', fast: 'Sofort weg' }[state.mode])
        + row('Kürzel', esc(key)) + row('Geste', WS_GESTURES[state.gesture])
        + row('User', esc(A.code ? A.name : 'Gast')) + row('Signal', `<span class="bars">${bars}</span>`)
        + row('Sitzung', new Date().toLocaleTimeString('de-DE') + ' · ' + String(Math.floor(up / 60)).padStart(2, '0') + ':' + String(up % 60).padStart(2, '0'));
    }
    const cardTimer = setInterval(card, 1000); card();
    const _save = save; // Karte nach jeder Änderung sofort aktualisieren
    save = (m) => { _save(m); card(); };
    const ln = g.querySelector('#ws-ln'), msg = '[ok] verbindung sicher';
    let li = 0; const typer = setInterval(() => { if (!document.body.contains(g)) return clearInterval(typer); ln.textContent = msg.slice(0, ++li); if (li >= msg.length) clearInterval(typer); }, 30);

    // ---------- Eingabe ----------
    const pick = (px, py) => {
      let best = null, bd = 1e9;
      for (const n of nodes) { const [x, y] = toScreen(n), d = Math.hypot(px - x, py - y); if (d < Math.max(18, n.r * S + 10) && d < bd) { bd = d; best = n; } }
      return best;
    };
    let down = null;
    g.addEventListener('pointermove', (e) => {
      if (down && drag) { const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 4) down.moved = true; drag.x = (e.clientX - W / 2) / S; drag.y = (e.clientY - H / 2 - (W < 600 ? 105 : 0)) / SY; return; }
      hover = pick(e.clientX, e.clientY); g.style.cursor = hover ? 'pointer' : 'default';
    });
    cv.addEventListener('pointerdown', (e) => {
      const n = pick(e.clientX, e.clientY); if (!n) return;
      down = { x: e.clientX, y: e.clientY, moved: false }; drag = n; hover = n; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointerup', (e) => {
      const n = drag; drag = null; if (!down) return; const moved = down.moved; down = null;
      if (!n || moved) return;
      if (n.kind === 'root') { flash = { text: 'webswitch ' + (state.on === '1' ? 'aktiv' : 'aus'), t: 1.4 }; return; }
      if (n.kind !== 'opt') return;
      if (n.cat === 'url' && n.v === '__custom') return askUrl(n);
      if (n.cat === 'key' && n.v === 'custom') { state.key = 'custom'; recording = true; return; }
      state[n.cat] = n.v; recording = false;
      if (n.cat === 'gesture' && n.v === 'shake') askMotion();
      save(labelOf(n) + ' gewählt');
    });
    function askUrl(n) {
      g.querySelector('.inp')?.remove();
      const [x, y] = toScreen(n), box = document.createElement('div'); box.className = 'inp';
      box.style.left = Math.max(170, Math.min(W - 170, x)) + 'px'; box.style.top = Math.min(H - 60, y + 30) + 'px';
      box.innerHTML = `<input type="text" placeholder="adresse.de" spellcheck="false" autocomplete="off"><button type="button">OK</button>`;
      g.appendChild(box);
      const inp = box.querySelector('input'); inp.value = WS_URLS.includes(state.url) ? '' : state.url;
      const ok = () => { const v = inp.value.trim(); box.remove(); if (!v) return; state.url = v; save('adresse gespeichert'); };
      box.querySelector('button').onclick = ok;
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); if (e.key === 'Escape') box.remove(); });
      setTimeout(() => inp.focus(), 30);
    }
    g.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (recording) {
        e.preventDefault();
        if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(e.key)) return;
        state.custom = { code: e.code || e.key, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey };
        state.key = 'custom'; recording = false; save('kürzel: ' + comboName(state.custom));
        return;
      }
      if (e.key === 'Escape') close();
    }, true);
    g.tabIndex = -1; g.focus();
  };
  // Versteckter Knopf: 5× schnell auf „COIN“ im Footer der Startseite
  addEventListener('DOMContentLoaded', () => {
    const coin = document.getElementById('coin'); if (!coin) return;
    let n = 0, last = 0;
    coin.addEventListener('click', () => { const now = Date.now(); n = now - last < 700 ? n + 1 : 1; last = now; if (n >= 5) { n = 0; A.webswitch(); } });
  });
})();
