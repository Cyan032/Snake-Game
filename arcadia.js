/* Arcadia – gemeinsames Skript für alle Seiten: faire Rekorde erkennen und an die Online-Bestenliste schicken.
   Ein Konto entsteht automatisch beim ersten fairen Rekord. Der 12-stellige Code bleibt im Browser gespeichert. */
(() => {
  'use strict';
  const LS = window.localStorage;
  const get = (k, d) => { try { const v = LS.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (k, v) => { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const SNAKE_MODES = [['classic', 'Klassisch'], ['wrap', 'Ohne Wände'], ['walls', 'Hindernisse'], ['portal', 'Portale'], ['poison', 'Gift'], ['turbo', 'Turbo'],
    ['time', 'Zeitrennen'], ['mirror', 'Spiegel'], ['dark', 'Dunkel'], ['flee', 'Fluchtäpfel'], ['hunger', 'Hunger'], ['zone', 'Zone'], ['chaos', 'Chaos']];

  // Wann ein Ergebnis als fair gilt (Ziffern = Stufen der Einstellungen in der Reihenfolge des Speicher-Schlüssels)
  const FAIR = {
    flug: { prefix: 'flug.best.', n: 5, ok: ([sp, gap, spc, gr, ramp]) => sp >= 1 && gap <= 1 && spc <= 1 && gr >= 1 && ramp === 1 },
    dino: { prefix: 'dino.best.', n: 5, ok: ([sp, ramp, den, jump, bees]) => sp >= 1 && ramp >= 1 && den >= 1 && jump <= 1 && bees === 1 },
    block: { prefix: 'block.best.', n: 3, ok: ([, ramp, size]) => ramp === 1 && size === 1 },
    fruit: { prefix: 'fruit.best.', n: 2, ok: ([box]) => box >= 1 },
  };
  function bestCombo(cfg) {
    let best = 0;
    try {
      for (let i = 0; i < LS.length; i++) {
        const k = LS.key(i); if (!k || !k.startsWith(cfg.prefix)) continue;
        const d = k.slice(cfg.prefix.length).split('').map(Number);
        if (d.length !== cfg.n || d.some(isNaN) || !cfg.ok(d)) continue;
        best = Math.max(best, +LS.getItem(k) || 0);
      }
    } catch (e) {}
    return best;
  }
  function parkStars() {
    const park = get('snake.park', {}); let s = 0;
    for (const k in park) s += (park[k] && park[k].s) || 0;
    return s;
  }
  // Alle fairen Bestwerte dieses Geräts als { liste: wert }
  function localBest() {
    const out = {};
    for (const [id] of SNAKE_MODES) { const v = get('snake.fair.' + id, 0); if (v > 0) out['snake-' + id] = v; }
    const ps = parkStars(); if (ps) out['snake-park'] = ps;
    for (const g in FAIR) { const v = bestCombo(FAIR[g]); if (v) out[g] = v; }
    const sol = get('sol.stats', {});
    if (sol.best1) out.sol1 = Math.round(sol.best1 * 10) / 10;
    if (sol.best3) out.sol3 = Math.round(sol.best3 * 10) / 10;
    const vw = (get('vier.stats', {}).k4 || {}).w; if (vw) out.vier = vw;
    return out;
  }
  const LOW = { sol1: true, sol3: true };

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
      const j = await api({ action: 'register', name: name || randomName() });
      put('arcadia.code', j.code); put('arcadia.name', j.name); put('arcadia.id', j.id); put('arcadia.sent', {});
      return j;
    },
    async login(code) {
      const j = await api({ action: 'login', code });
      put('arcadia.code', String(code).replace(/\D/g, '')); put('arcadia.name', j.name); put('arcadia.id', j.id); put('arcadia.sent', j.scores || {});
      await A.sync(true);
      return j;
    },
    async rename(name) {
      const j = await api({ action: 'rename', code: A.code, name });
      put('arcadia.name', j.name); return j;
    },
    logout() { setTimeout(() => dispatchEvent(new Event('arcadia:account'))); try { LS.removeItem('arcadia.id'); LS.removeItem('arcadia.code'); LS.removeItem('arcadia.name'); LS.removeItem('arcadia.sent'); } catch (e) {} },
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

  // Wenn ein Spiel einen Rekord speichert, kurz danach automatisch hochladen
  let timer = 0;
  const RX = /^(snake\.fair\.|snake\.park$|flug\.best\.|dino\.best\.|block\.best\.|fruit\.best\.|sol\.stats$|vier\.stats$)/;
  const plan = () => { clearTimeout(timer); timer = setTimeout(() => A.sync().catch(() => {}), 1500); };
  try {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { orig.call(this, k, v); if (this === LS && RX.test(k)) plan(); };
  } catch (e) {}
  addEventListener('load', plan);

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
        <li>Es zählen nur faire Rekorde, also nicht mit erleichterten Einstellungen.</li></ul>`;
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
