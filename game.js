/* Snake – Spiellogik, Darstellung und Menü. Die Parkour-Level stehen in levels.js. */
(() => {
  'use strict';

  /* ---------- Hilfsfunktionen ---------- */
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (n) => Math.floor(Math.random() * n);
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapNum = (v, m) => ((v % m) + m) % m;
  const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const sameDir = (a, b) => a.x === b.x && a.y === b.y;
  const backDir = (a, b) => a.x === -b.x && a.y === -b.y;
  const fmtTime = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('snake.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('snake.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- Spielregeln & Einstellungen ---------- */
  const MODES = [
    { id: 'classic',  icon: '🍎', name: 'Klassisch',   desc: 'Das Original: Wand oder eigener Schwanz – dann ist Schluss.' },
    { id: 'wrap',     icon: '♾️', name: 'Ohne Wände',  desc: 'Fahr durch den Rand und komm auf der anderen Seite wieder raus.', wrap: true },
    { id: 'walls',    icon: '🧱', name: 'Hindernisse', desc: 'Jeder Apfel lässt irgendwo einen Stein wachsen.', stones: true },
    { id: 'portal',   icon: '🌀', name: 'Portale',     desc: 'Zwei Portale verbinden das Feld – rein und woanders wieder raus.', portals: true },
    { id: 'poison',   icon: '☠️', name: 'Gift',        desc: 'Lila Äpfel sind giftig und springen bei jedem Bissen woanders hin.', poison: true },
    { id: 'turbo',    icon: '⚡', name: 'Turbo',       desc: 'Mit jedem Apfel wird die Schlange schneller.', turbo: true },
    { id: 'time',     icon: '⏱️', name: 'Zeitrennen',  desc: '60 Sekunden – friss so viele Äpfel wie möglich.', time: 60 },
    { id: 'peaceful', icon: '🕊️', name: 'Friedlich',   desc: 'Kein Game Over: keine Wände und du kannst durch dich selbst.', wrap: true, peaceful: true },
    { id: 'duo',      icon: '👥', name: '2 Spieler',   desc: 'WASD gegen Pfeiltasten an einer Tastatur. Wer crasht, verliert.', duo: true, versus: true },
    { id: 'ai',       icon: '🤖', name: 'Gegen KI',    desc: 'Eine Computer-Schlange frisst mit. Wer zuerst crasht, verliert.', ai: true, versus: true, fresh: true },
    { id: 'mirror',   icon: '🪞', name: 'Spiegel',     desc: 'Du lenkst zwei Schlangen gleichzeitig – die rechte spiegelverkehrt.', mirror: true, fresh: true },
    { id: 'dark',     icon: '🔦', name: 'Dunkel',      desc: 'Stockdunkel – nur rund um deinen Kopf ist es hell.', dark: true, fresh: true },
    { id: 'flee',     icon: '🏃', name: 'Fluchtäpfel', desc: 'Die Äpfel laufen vor dir weg. Treib sie in die Enge!', flee: true, fresh: true },
    { id: 'hunger',   icon: '🍗', name: 'Hunger',      desc: 'Ohne Futter schrumpfst du. Wirst du zu kurz, ist Schluss.', hunger: true, fresh: true },
    { id: 'zone',     icon: '🔥', name: 'Zone',        desc: 'Alle 15 Sekunden rückt die Feuerwand ein Feld näher.', zone: true, fresh: true },
    { id: 'chaos',    icon: '🎲', name: 'Chaos',       desc: 'Alle paar Sekunden passiert etwas Verrücktes.', chaos: true, fresh: true },
  ];
  const PARKOUR = { id: 'parkour', icon: '🏁', name: 'Parkour', desc: 'Lenk dich bis zur Zielflagge.' };
  const CHAOS = [
    { id: 'fast',   name: 'Turbo!', mul: 0.62 },
    { id: 'slow',   name: 'Zeitlupe', mul: 1.5 },
    { id: 'dark',   name: 'Licht aus!' },
    { id: 'invert', name: 'Steuerung verdreht!' },
    { id: 'ghost',  name: 'Geist: durch dich hindurch' },
    { id: 'double', name: 'Doppelte Punkte' },
    { id: 'rain',   name: 'Apfelregen!' },
    { id: 'grow',   name: 'Wachstumsschub!' },
  ];
  const SPEEDS = { slow: 165, normal: 125, fast: 88 };
  const SIZES = { s: [10, 9], m: [17, 15], l: [24, 21], xl: [30, 26] };
  const SIZE_NAMES = { s: 'Klein', m: 'Mittel', l: 'Groß', xl: 'Riesig' };
  const SPEED_NAMES = { slow: 'Langsam', normal: 'Normal', fast: 'Schnell' };
  const APPLE_COUNTS = [1, 3, 5, 10];
  const COLORS = {
    blue:   { hex: '#4e7cf6', name: 'Blau' },
    purple: { hex: '#9a5cf0', name: 'Lila' },
    pink:   { hex: '#ef4f8b', name: 'Pink' },
    orange: { hex: '#f58a1f', name: 'Orange' },
    yellow: { hex: '#f4c20d', name: 'Gelb' },
    teal:   { hex: '#14b8a6', name: 'Türkis' },
    black:  { hex: '#3d4451', name: 'Schwarz' },
  };
  const THEMES = {
    meadow: { name: 'Wiese', grass: ['#aad751', '#a2d149'], frame: '#578a34', hud: '#4a752c', page: ['#6fa344', '#3f6a24', '#294a15'],
      wall: '#4f7f2c', wallTop: '#6c9e40', wallSide: '#365d1d', deco: 'grass', decoColor: 'rgba(60, 110, 25, 0.13)', line: 'rgba(255,255,255,0.45)' },
    desert: { name: 'Wüste', grass: ['#f2d58e', '#eacb7e'], frame: '#c99a4b', hud: '#a87a33', page: ['#efcd84', '#c29445', '#8c6526'],
      wall: '#d49a4c', wallTop: '#ebbb6c', wallSide: '#a4702e', deco: 'pebbles', decoColor: 'rgba(150, 105, 45, 0.22)', line: 'rgba(255,255,255,0.6)' },
    snow:   { name: 'Schnee', grass: ['#f3f8fc', '#e5eff6'], frame: '#8fb6d1', hud: '#5d8db0', page: ['#d7ebf7', '#86afcd', '#557f9f'],
      wall: '#9fd0ea', wallTop: '#d2edfa', wallSide: '#6aa5c8', deco: 'sparkle', decoColor: 'rgba(120, 165, 200, 0.35)', line: 'rgba(80,130,170,0.5)' },
    night:  { name: 'Nacht', grass: ['#2f4b2b', '#2a4427'], frame: '#1d321a', hud: '#152613', page: ['#2a462c', '#132414', '#070f08'],
      wall: '#1f3a1a', wallTop: '#30562a', wallSide: '#112410', deco: 'grass', decoColor: 'rgba(140, 200, 120, 0.10)', line: 'rgba(200,255,180,0.35)' },
    lava:   { name: 'Vulkan', grass: ['#4a3935', '#423330'], frame: '#2a1c19', hud: '#3b2420', page: ['#5e2f1f', '#2b1611', '#140906'],
      wall: '#2e2522', wallTop: '#4d3e39', wallSide: '#181210', deco: 'cracks', decoColor: 'rgba(255, 110, 40, 0.28)', line: 'rgba(255,150,80,0.5)' },
    space:  { name: 'Weltraum', grass: ['#1f2248', '#1b1d40'], frame: '#121334', hud: '#1a1c4a', page: ['#2b2e70', '#11123a', '#06071a'],
      wall: '#4b4f86', wallTop: '#7176b3', wallSide: '#2c2f5e', deco: 'stars', decoColor: 'rgba(255,255,255,0.55)', line: 'rgba(170,180,255,0.5)' },
  };
  const MAPS = {
    open:    { name: 'Offen' },
    cross:   { name: 'Kreuz' },
    corners: { name: 'Ecken' },
    pillars: { name: 'Säulen' },
    rooms:   { name: 'Räume' },
    tunnel:  { name: 'Tunnel' },
    random:  { name: 'Zufall' },
  };
  const AI_LEVELS = {
    easy:   { name: 'Leicht', mistake: 0.12, safe: false },
    normal: { name: 'Mittel', mistake: 0.03, safe: true },
    hard:   { name: 'Schwer', mistake: 0, safe: true, dodge: true },
  };
  const TIERS = [
    { name: 'Leicht', color: '#43a047' }, { name: 'Mittel', color: '#f9a825' },
    { name: 'Schwer', color: '#ef6c00' }, { name: 'Profi', color: '#d32f2f' },
  ];
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const DIR_LIST = [DIRS.up, DIRS.right, DIRS.down, DIRS.left];
  // [Spieler im 2-Spieler-Modus, Richtung]
  // Tastenname -> Code, falls ein Gerät keinen Code mitschickt
  const KEY_NAMES = {
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    UIKeyInputUpArrow: 'ArrowUp', UIKeyInputDownArrow: 'ArrowDown', UIKeyInputLeftArrow: 'ArrowLeft', UIKeyInputRightArrow: 'ArrowRight',
    w: 'KeyW', a: 'KeyA', s: 'KeyS', d: 'KeyD', p: 'KeyP', m: 'KeyM', r: 'KeyR',
    ' ': 'Space', Enter: 'Enter', Escape: 'Escape', UIKeyInputEscape: 'Escape',
  };
  // alte Tastennummern (keyCode), falls weder Code noch Name kommen
  const KEY_NUMS = { 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 87: 'KeyW', 65: 'KeyA', 83: 'KeyS', 68: 'KeyD',
    32: 'Space', 13: 'Enter', 27: 'Escape', 80: 'KeyP', 77: 'KeyM', 82: 'KeyR' };
  const KEYS = {
    KeyW: [0, 'up'], KeyS: [0, 'down'], KeyA: [0, 'left'], KeyD: [0, 'right'],
    ArrowUp: [1, 'up'], ArrowDown: [1, 'down'], ArrowLeft: [1, 'left'], ArrowRight: [1, 'right'],
  };
  // Späte Eingaben (Anteil eines Schritts): Wer kurz nach dem Erreichen eines Feldes lenkt, biegt noch
  // auf diesem Feld ab. Vor einem Hindernis bleibt genauso lange Zeit zum Ausweichen.
  const GRACE = 0.35;
  const SWING_MS = 80;
  const HUNGER_MS = 6000, HUNGER_STEP = 2000, ZONE_MS = 15000, GOLD_MS = 7000;
  const LEVELS = window.SNAKE_LEVELS || [];

  const DEFAULTS = {
    mode: 'classic', speed: 'normal', size: 'm', apples: 1, bonus: 'on', theme: 'meadow', map: 'open', ai: 'normal',
    color: 'blue', pattern: 'plain', keydebug: false, tier: 0, level: 0, tab: 'modes',
  };
  const settings = Object.assign({}, DEFAULTS, store.get('settings', {}));
  const VALID = {
    mode: MODES.map((m) => m.id), speed: Object.keys(SPEEDS), size: Object.keys(SIZES), apples: APPLE_COUNTS, bonus: ['on', 'off'],
    theme: Object.keys(THEMES), map: Object.keys(MAPS), ai: Object.keys(AI_LEVELS), color: Object.keys(COLORS),
    pattern: ['plain', 'stripes', 'dots', 'rainbow'], keydebug: [true, false], tier: [0, 1, 2, 3], tab: ['modes', 'parkour', 'settings'],
  };
  for (const k in VALID) if (!VALID[k].includes(settings[k])) settings[k] = DEFAULTS[k];
  if (!(settings.level >= 0 && settings.level < LEVELS.length)) settings.level = 0;
  const saveSettings = () => store.set('settings', settings);

  /* ---------- Sound (Web Audio, ohne Dateien) ---------- */
  const Sound = {
    ac: null,
    on: store.get('sound', true),
    init() {
      if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
      if (this.ac.state === 'suspended') this.ac.resume();
    },
    tone(f, dur, type = 'sine', vol = 0.06, to = 0, delay = 0) {
      if (!this.on || !this.ac) return;
      const t0 = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t0);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.ac.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },
    eat()    { this.tone(587, 0.07, 'square', 0.035); this.tone(880, 0.09, 'square', 0.035, 0, 0.06); },
    gold()   { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.06, 0, i * 0.06)); },
    start()  { this.tone(440, 0.08, 'triangle', 0.07); this.tone(660, 0.1, 'triangle', 0.07, 0, 0.07); },
    crash()  { this.tone(220, 0.45, 'sawtooth', 0.05, 55); },
    poison() { this.tone(500, 0.5, 'sine', 0.07, 90); this.tone(510, 0.5, 'triangle', 0.04, 95, 0.05); },
    portal() { this.tone(260, 0.22, 'sine', 0.08, 1100); },
    stone()  { this.tone(140, 0.12, 'triangle', 0.09, 70, 0.12); },
    tick()   { this.tone(1200, 0.04, 'square', 0.025); },
    timeup() { [880, 660, 440].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.07, 0, i * 0.14)); },
    win()    { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, 0, i * 0.12)); },
    star()   { this.tone(988, 0.08, 'triangle', 0.06); this.tone(1480, 0.14, 'triangle', 0.06, 0, 0.07); },
    key()    { this.tone(660, 0.1, 'square', 0.04); this.tone(990, 0.16, 'square', 0.04, 0, 0.1); },
    check()  { this.tone(523, 0.1, 'triangle', 0.06); this.tone(784, 0.18, 'triangle', 0.06, 0, 0.09); },
    shrink() { this.tone(320, 0.18, 'sine', 0.07, 160); },
    zone()   { this.tone(160, 0.45, 'sawtooth', 0.05, 80); },
    warn()   { this.tone(880, 0.05, 'square', 0.025); },
    chaos()  { this.tone(220, 0.3, 'sine', 0.07, 880); },
  };

  /* ---------- Elemente ---------- */
  const el = {
    app: $('#app'), hud: $('#hud'), frame: $('#frame'), canvas: $('#board'), hint: $('#hint'), overlay: $('#overlay'), toast: $('#toast'),
    menu: $('#menu'), tabs: $('#tabs'), modes: $('#modes'), modeDesc: $('#mode-desc'), summary: $('#summary'),
    tiers: $('#tiers'), levels: $('#levels'), pkTotal: $('#pk-total'),
    themes: $('#themes'), maps: $('#maps'), swatches: $('#swatches'), close: $('#menu-close'), help: $('#help'), play: $('#play'),
    score: $('#score'), best: $('#best'), sScore: $('#s-score'), sBest: $('#s-best'),
    sP1: $('#s-p1'), sP2: $('#s-p2'), p1: $('#p1'), p2: $('#p2'), p1dot: $('#p1dot'), p2dot: $('#p2dot'),
    sTime: $('#s-time'), time: $('#time'), sStars: $('#s-stars'), stars: $('#stars'), sDeaths: $('#s-deaths'), deaths: $('#deaths'),
    sHunger: $('#s-hunger'), hungerBar: $('#hunger-bar'), sZone: $('#s-zone'), zone: $('#zone'), sFx: $('#s-fx'),
    modeLabel: $('#mode-label'), btnSound: $('#btn-sound'), btnPause: $('#btn-pause'), btnMenu: $('#btn-menu'),
  };
  const ctx = el.canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const darkCanvas = document.createElement('canvas');
  const ICON = {
    apple: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 9.5c-1.6-1.6-4.6-2.6-7.6-1.2C4.6 10 4 15 5.4 19.4 6.9 24 10 28 13 28c1.4 0 1.9-.6 3-.6s1.6.6 3 .6c3 0 6.1-4 7.6-8.6C28 15 27.4 10 23.6 8.3c-3-1.4-6-.4-7.6 1.2z" fill="#e7471d"/><ellipse cx="10.4" cy="14.5" rx="1.6" ry="3" fill="#fff" opacity=".5" transform="rotate(20 10.4 14.5)"/><path d="M16 9.6c0-2.6.6-4.4 2.2-5.8" stroke="#6b4226" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M18.4 5.6c1.8-2.2 5-2.6 6.6-1.4-1.4 2.4-4.6 3-6.6 1.4z" fill="#5aa63a"/></svg>',
    trophy: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 7H5v2.5a5 5 0 0 0 5 5M23 7h4v2.5a5 5 0 0 1-5 5" fill="none" stroke="#ffc83d" stroke-width="2.6" stroke-linecap="round"/><path d="M8 4h16v7a8 8 0 0 1-16 0z" fill="#ffc83d"/><path d="M13.5 18h5v5h-5z" fill="#ffc83d"/><rect x="9.5" y="23" width="13" height="5" rx="2" fill="#ffc83d"/><path d="M12 7v4a4 4 0 0 0 2 3.4" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="18" r="10" fill="#fff"/><path d="M16 18v-5.5M16 18l3.5 2.5" stroke="#4a752c" stroke-width="2.4" stroke-linecap="round"/><rect x="13" y="3" width="6" height="4" rx="1.5" fill="#fff"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.6"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.2-6.4a1 1 0 0 0 0-1.8L9.5 4.7A1 1 0 0 0 8 5.6z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9.2v5.6h3.6l4.9 4V5.2l-4.9 4z"/><path d="M15.5 8.8a4.6 4.6 0 0 1 0 6.4M18.3 6.2a8.4 8.4 0 0 1 0 11.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9.2v5.6h3.6l4.9 4V5.2l-4.9 4z"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M4.5 12h15M4.5 17h15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  };

  let lastKeydown = 0;
  let G = null;            // aktuelles Spiel
  let started = false;     // schon einmal aus dem Menü gestartet?
  let cell = 20, boardW = 0, boardH = 0, dpr = 1, toastTimer = 0;
  const wins = { duo: [0, 0], ai: [0, 0] };
  const inside = (x, y) => x >= 0 && y >= 0 && x < G.cols && y < G.rows;

  /* ---------- Spiel aufbauen ---------- */
  function baseGame(mode, cols, rows, interval) {
    return {
      mode, level: null, levelIndex: -1, cols, rows, base: interval, interval, mul: 1, turbo: 1, acc: 0, tick: 0, clock: 0, state: 'ready',
      snakes: [], apples: [], poison: [], stones: [], portals: [], eaten: [], particles: [], floaters: [],
      walls: new Set(), wallList: [], fire: new Set(), fireList: [], rails: new Set(),
      doors: [], locks: [], keys: [], stars: [], checkpoints: [], saws: [], goal: null, start: null, cp: null,
      hasKey: false, door: [10, 8], deaths: 0, elapsed: 0, starsGot: 0, starsTotal: 0, respawnAt: 0, record: false, oldBest: null,
      timeLeft: (mode.time || 0) * 1000, lastSec: null, shake: 0, overAt: 0, result: null, best: 0, prevBest: 0,
      hunger: HUNGER_MS, zone: null, chaos: null, fx: {}, full: false, live: {},
      ambient: makeAmbient(settings.theme, cols, rows),
    };
  }

  function addWall(x, y) {
    const g = G, k = y * g.cols + x;
    if (g.walls.has(k)) return;
    g.walls.add(k);
    g.wallList.push({ x, y });
  }

  // Hindernis-Karten für die normalen Modi (Einstellung „Karte“)
  function layoutWalls(id, cols, rows) {
    const out = [];
    const add = (x, y) => { if (x > 0 && y > 0 && x < cols - 1 && y < rows - 1) out.push({ x, y }); };
    const cx = Math.floor(cols / 2), cy = Math.floor(rows / 2);
    switch (id) {
      case 'cross': {
        const a = Math.max(2, Math.floor(cols / 5)), b = Math.max(2, Math.floor(rows / 5));
        for (let x = cx - a; x <= cx + a; x++) add(x, cy);
        for (let y = cy - b; y <= cy + b; y++) add(cx, y);
        break;
      }
      case 'corners': {
        const k = Math.max(2, Math.floor(Math.min(cols, rows) / 4));
        for (let i = 0; i < k; i++) {
          add(2 + i, 2); add(2, 2 + i);
          add(cols - 3 - i, 2); add(cols - 3, 2 + i);
          add(2 + i, rows - 3); add(2, rows - 3 - i);
          add(cols - 3 - i, rows - 3); add(cols - 3, rows - 3 - i);
        }
        break;
      }
      case 'pillars':
        for (let r = 0, y = 2; y < rows - 2; r++, y += 3) for (let x = 2 + (r % 2) * 2; x < cols - 2; x += 4) add(x, y);
        break;
      case 'rooms': {
        const g1 = Math.floor(rows / 4), g2 = rows - 1 - Math.floor(rows / 4);
        const h1 = Math.floor(cols / 4), h2 = cols - 1 - Math.floor(cols / 4);
        for (let y = 1; y < rows - 1; y++) if (Math.abs(y - g1) > 1 && Math.abs(y - g2) > 1) add(cx, y);
        for (let x = 1; x < cols - 1; x++) if (Math.abs(x - h1) > 1 && Math.abs(x - h2) > 1) add(x, cy);
        break;
      }
      case 'tunnel': {
        const y1 = Math.floor(rows / 3), y2 = rows - 1 - Math.floor(rows / 3);
        const d1 = Math.floor(cols / 3), d2 = cols - 1 - Math.floor(cols / 3);
        for (let x = 2; x < cols - 2; x++) {
          if (Math.abs(x - d1) <= 1 || Math.abs(x - d2) <= 1) continue;
          add(x, y1); add(x, y2);
        }
        break;
      }
      case 'random': {
        const n = Math.max(3, Math.round((cols * rows) / 45));
        for (let tries = 0, made = 0; tries < n * 20 && made < n; tries++) {
          const len = 2 + rand(3), horiz = Math.random() < 0.5;
          const x0 = 2 + rand(cols - 4), y0 = 2 + rand(rows - 4), cells = [];
          for (let k = 0; k < len; k++) cells.push(horiz ? { x: x0 + k, y: y0 } : { x: x0, y: y0 + k });
          if (cells.some((c) => c.x > cols - 3 || c.y > rows - 3)) continue;
          // kein Wandstück direkt neben einem anderen: so entstehen keine abgeschlossenen Taschen
          if (cells.some((c) => out.some((o) => Math.abs(o.x - c.x) <= 1 && Math.abs(o.y - c.y) <= 1))) continue;
          cells.forEach((c) => out.push(c));
          made++;
        }
        break;
      }
    }
    return out;
  }

  // Nur den größten zusammenhängenden Bereich offen lassen (keine unerreichbaren Taschen)
  function keepLargestRegion() {
    const g = G, N = g.cols * g.rows, comp = new Int32Array(N).fill(-1);
    let best = -1, bestSize = 0, id = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0 || g.walls.has(s)) continue;
      const q = [s];
      comp[s] = id;
      for (let i = 0; i < q.length; i++) {
        const k = q[i], x = k % g.cols, y = (k / g.cols) | 0;
        for (const d of DIR_LIST) {
          let nx = x + d.x, ny = y + d.y;
          if (g.mode.wrap) { nx = wrapNum(nx, g.cols); ny = wrapNum(ny, g.rows); }
          else if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const nk = ny * g.cols + nx;
          if (comp[nk] >= 0 || g.walls.has(nk)) continue;
          comp[nk] = id;
          q.push(nk);
        }
      }
      if (q.length > bestSize) { bestSize = q.length; best = id; }
      id++;
    }
    for (let k = 0; k < N; k++) if (comp[k] >= 0 && comp[k] !== best) addWall(k % g.cols, (k / g.cols) | 0);
  }

  function freeLine(x, y, d, back, ahead) {
    for (let k = -back; k <= ahead; k++) {
      const cx = x + d.x * k, cy = y + d.y * k;
      if (!inside(cx, cy) || G.walls.has(cy * G.cols + cx)) return false;
    }
    return true;
  }
  function findSpawn(px, py, d, avoid = []) {
    const g = G;
    let best = null, bd = Infinity;
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
      if (!freeLine(x, y, d, 2, 4)) continue;
      if (avoid.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) < 5)) continue;
      const dd = Math.abs(x - px) + Math.abs(y - py);
      if (dd < bd) { bd = dd; best = { x, y }; }
    }
    return best || { x: px, y: py };
  }

  function makeSnake(x, y, d, colorKey, now, opts = {}) {
    const len = opts.len || 3, body = [];
    for (let i = 0; i < len; i++) body.push(opts.stacked ? { x, y, d, j: null } : { x: x - d.x * i, y: y - d.y * i, d, j: null });
    return {
      body, prevTail: null, grew: true, moved: false, dir: d, queue: [], ate: false, picked: false,
      color: opts.hex || COLORS[colorKey].hex, name: opts.name || COLORS[colorKey].name, alive: true, deadAt: 0, score: 0,
      blinkAt: now + 1200 + Math.random() * 2000, turned: false, blocked: null, swing: null, pending: 0,
      ai: !!opts.ai, p1: !!opts.p1, twin: !!opts.twin, vis: null,
    };
  }

  function placeSnakes(now) {
    const g = G, m = g.mode, { cols, rows } = g;
    const hx = Math.max(3, Math.floor(cols / 4)), mid = Math.floor(rows / 2);
    const c1 = settings.color, c2 = c1 === 'orange' ? 'blue' : 'orange';
    if (m.versus) {
      const a = findSpawn(hx, Math.floor(rows / 3), DIRS.right);
      const b = findSpawn(cols - 1 - hx, rows - 1 - Math.floor(rows / 3), DIRS.left, [a]);
      g.snakes.push(makeSnake(a.x, a.y, DIRS.right, c1, now, { p1: true, name: m.ai ? 'Du' : undefined }));
      g.snakes.push(makeSnake(b.x, b.y, DIRS.left, c2, now, m.ai ? { ai: true, name: 'KI' } : {}));
    } else if (m.mirror) {
      let pair = null, bd = Infinity;
      const py = rows - 4;
      for (let y = 0; y < rows; y++) for (let x = 0; x < Math.floor(cols / 2) - 1; x++) {
        const mx = cols - 1 - x;
        if (!freeLine(x, y, DIRS.up, 2, 4) || !freeLine(mx, y, DIRS.up, 2, 4)) continue;
        const dd = Math.abs(x - hx) + Math.abs(y - py);
        if (dd < bd) { bd = dd; pair = [x, mx, y]; }
      }
      const [x1, x2, y] = pair || [hx, cols - 1 - hx, py];
      g.snakes.push(makeSnake(x1, y, DIRS.up, c1, now, { p1: true }));
      g.snakes.push(makeSnake(x2, y, DIRS.up, c1, now, { twin: true, hex: mix(COLORS[c1].hex, '#ffffff', 0.35) }));
    } else {
      const a = findSpawn(hx, mid, DIRS.right);
      g.snakes.push(makeSnake(a.x, a.y, DIRS.right, c1, now, { p1: true }));
    }
  }

  function newGame() {
    const mode = MODES.find((m) => m.id === settings.mode) || MODES[0];
    const [cols, rows] = SIZES[settings.size];
    G = baseGame(mode, cols, rows, SPEEDS[settings.speed]);
    const g = G, now = performance.now();
    g.best = g.prevBest = mode.versus ? 0 : store.get('best.' + mode.id, 0);
    for (const c of layoutWalls(settings.map, cols, rows)) addWall(c.x, c.y);
    keepLargestRegion();
    placeSnakes(now);
    // erster Apfel in Blickrichtung, wie beim Original
    const center = mode.versus || mode.mirror;
    const fx = center ? Math.floor(cols / 2) : cols - 1 - Math.max(3, Math.floor(cols / 4));
    const fy = center ? Math.floor(rows / 2) : g.snakes[0].body[0].y;
    if (!g.walls.has(fy * cols + fx) && !g.snakes.some((s) => s.body.some((c) => c.x === fx && c.y === fy))) {
      g.apples.push({ x: fx, y: fy, born: now, kind: 'apple' });
    }
    if (mode.portals) placePortals(now);
    const want = center ? Math.max(2, settings.apples) : settings.apples;
    while (g.apples.length < want && spawn('apples'));
    if (mode.poison) refreshPoison(0);
    if (mode.zone) g.zone = { ring: 0, next: ZONE_MS, warned: 0 };
    if (mode.chaos) g.chaos = { next: 8000, fx: null, left: 0, last: null };
    startGame();
  }

  function newParkour(index) {
    const lv = LEVELS[index];
    if (!lv) { newGame(); return; }
    const rows = lv.map.length, cols = lv.map[0].length;
    G = baseGame(PARKOUR, cols, rows, lv.speed || 140);
    const g = G, now = performance.now(), portals = [];
    g.level = lv;
    g.levelIndex = index;
    g.door = lv.door || [10, 8];
    lv.map.forEach((row, y) => [...row].forEach((ch, x) => {
      const k = y * cols + x;
      switch (ch) {
        case '#': addWall(x, y); break;
        case 'S': g.start = { x, y, d: DIRS[lv.dir || 'right'] }; break;
        case 'Z': g.goal = { x, y }; break;
        case '*': g.stars.push({ x, y, born: now }); break;
        case 'C': g.checkpoints.push({ x, y, on: false }); break;
        case '=': g.doors.push({ x, y, group: 0, closed: false, soon: false, vis: 0 }); break;
        case '-': g.doors.push({ x, y, group: 1, closed: false, soon: false, vis: 0 }); break;
        case 'k': g.keys.push({ x, y, born: now }); break;
        case 'L': g.locks.push({ x, y, vis: 1 }); break;
        case ':': g.rails.add(k); break;
        case 'h': g.rails.add(k); g.saws.push(makeSaw(x, y, 1, 0, lv)); break;
        case 'v': g.rails.add(k); g.saws.push(makeSaw(x, y, 0, 1, lv)); break;
        case '@': portals.push({ x, y, born: now }); break;
      }
    }));
    (lv.stars || []).forEach(([x, y]) => g.stars.push({ x, y, born: now }));
    if (portals.length === 2) g.portals = portals;
    g.starsTotal = g.stars.length;
    g.snakes = [makeSnake(g.start.x, g.start.y, g.start.d, settings.color, now, { p1: true, stacked: true, len: lv.len || 4 })];
    updateDoors();
    settings.level = index;
    settings.tier = lv.tier;
    saveSettings();
    startGame();
  }
  function makeSaw(x, y, dx, dy, lv) { return { x, y, px: x, py: y, dx, dy, every: lv.saw || 2, mt: -1, spin: Math.random() * 6 }; }

  function startGame() {
    hideOverlay();
    clearTimeout(toastTimer);
    el.toast.classList.add('hidden');
    applyTheme();
    updateHud();
    layout();
    showHint();
  }

  function occupied() {
    const g = G, set = new Set(), add = (c) => set.add(c.y * g.cols + c.x);
    for (const s of g.snakes) s.body.forEach(add);
    for (const list of [g.apples, g.poison, g.stones, g.portals, g.doors, g.locks, g.keys, g.stars, g.checkpoints]) list.forEach(add);
    if (g.goal) add(g.goal);
    if (g.start) add(g.start);
    return set;
  }

  // Legt ein Objekt auf ein freies Feld. safe > 0: Mindestabstand zu den Köpfen und nicht direkt vor die Schlange.
  function spawn(kind, safe = 0, extra = null) {
    const g = G, occ = occupied(), cells = [];
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        const k = y * g.cols + x;
        if (occ.has(k) || g.walls.has(k) || g.fire.has(k)) continue;
        if (safe && g.snakes.some((s) => {
          const h = s.body[0];
          if (Math.abs(h.x - x) + Math.abs(h.y - y) < safe) return true;
          for (let i = 1; i <= 5; i++) if (h.x + s.dir.x * i === x && h.y + s.dir.y * i === y) return true;
          return false;
        })) continue;
        cells.push({ x, y });
      }
    }
    if (!cells.length) return null;
    const c = cells[rand(cells.length)];
    const item = Object.assign({ x: c.x, y: c.y, born: performance.now(), kind: kind === 'apples' ? 'apple' : kind }, extra);
    g[kind].push(item);
    return item;
  }

  function spawnGold() {
    if (spawn('apples', 3, { kind: 'gold', expires: G.clock + GOLD_MS })) toast('Goldapfel – schnell, er verschwindet!');
  }

  function refreshPoison(score) {
    G.poison = [];
    const n = clamp(1 + Math.floor(score / 3), 1, 6);
    for (let i = 0; i < n; i++) spawn('poison', 3);
  }

  function placePortals(now) {
    const g = G, avoid = new Set(g.snakes.map((s) => s.body[0].y)), cand = [];
    for (let y = 2; y < g.rows - 2; y++) {
      if (avoid.has(y)) continue;
      for (let x = 2; x < g.cols - 2; x++) {
        // Portal mit freien Nachbarn, damit jeder Ausgang sicher ist
        if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => g.walls.has((y + b) * g.cols + x + a))) continue;
        if (g.apples.some((a) => a.x === x && a.y === y)) continue;
        cand.push({ x, y });
      }
    }
    const minD = Math.floor((g.cols + g.rows) / 3);
    for (let i = 0; i < 400 && cand.length > 1; i++) {
      const a = cand[rand(cand.length)], b = cand[rand(cand.length)];
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= minD) {
        g.portals = [{ x: a.x, y: a.y, born: now }, { x: b.x, y: b.y, born: now }];
        return;
      }
    }
    if (cand.length > 1) g.portals = [Object.assign({ born: now }, cand[0]), Object.assign({ born: now }, cand[cand.length - 1])];
  }

  function portalExit(x, y) {
    const p = G.portals;
    if (p.length !== 2) return null;
    if (p[0].x === x && p[0].y === y) return p[1];
    if (p[1].x === x && p[1].y === y) return p[0];
    return null;
  }

  /* ---------- Welt: Hindernisse, Türen, Sägen, fliehende Äpfel ---------- */
  function solidAt(x, y) {
    const g = G, k = y * g.cols + x;
    if (g.walls.has(k) || g.fire.has(k)) return true;
    if (g.stones.length && g.stones.some((c) => c.x === x && c.y === y)) return true;
    if (g.level) {
      if (g.doors.some((d) => d.closed && d.x === x && d.y === y)) return true;
      if (!g.hasKey && g.locks.some((l) => l.x === x && l.y === y)) return true;
    }
    return false;
  }

  function doorClosedAt(group, tick) {
    const [o, c] = G.door, aOpen = tick % (o + c) < o;
    return group === 0 ? !aOpen : aOpen;
  }
  // Türen gehen im Takt auf und zu – aber nie, solange die Schlange darin steckt
  function updateDoors() {
    const g = G;
    for (const d of g.doors) {
      const busy = g.snakes.some((s) => s.body.some((c) => c.x === d.x && c.y === d.y));
      d.closed = doorClosedAt(d.group, g.tick) && !busy;
      d.soon = !d.closed && doorClosedAt(d.group, g.tick + 2);
    }
  }

  function moveSaws() {
    const g = G;
    const blocked = (s, x, y) => !g.rails.has(y * g.cols + x) || g.saws.some((o) => o !== s && o.x === x && o.y === y);
    for (const s of g.saws) {
      if (g.tick % s.every) continue;
      s.px = s.x; s.py = s.y; s.mt = g.tick;
      if (blocked(s, s.x + s.dx, s.y + s.dy)) { s.dx = -s.dx; s.dy = -s.dy; }
      if (!blocked(s, s.x + s.dx, s.y + s.dy)) { s.x += s.dx; s.y += s.dy; }
    }
  }

  function moveFleeing() {
    const g = G, occ = occupied();
    for (const a of g.apples) {
      let h = null, hd = Infinity;
      for (const s of g.snakes) {
        if (!s.alive) continue;
        const b = s.body[0], d = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
        if (d < hd) { hd = d; h = b; }
      }
      if (!h || hd > 4) continue;
      let best = null, bd = hd;
      for (const d of DIR_LIST) {
        const x = a.x + d.x, y = a.y + d.y;
        if (!inside(x, y) || occ.has(y * g.cols + x) || solidAt(x, y)) continue;
        const nd = Math.abs(h.x - x) + Math.abs(h.y - y);
        if (nd > bd) { bd = nd; best = { x, y }; }
      }
      if (!best) continue;
      occ.delete(a.y * g.cols + a.x);
      a.px = a.x; a.py = a.y; a.mt = g.tick;
      a.x = best.x; a.y = best.y;
      occ.add(best.y * g.cols + best.x);
    }
  }

  /* ---------- Spiellogik ---------- */
  function input(idx, d) {
    const g = G;
    if (!g || !el.menu.classList.contains('hidden')) return;
    if (g.state !== 'ready' && g.state !== 'play') return;
    if (g.fx.invert) d = { x: -d.x, y: -d.y };
    if (g.mode.mirror) { steer(g.snakes[0], d); steer(g.snakes[1], { x: -d.x, y: d.y }); }
    else steer(g.snakes[idx], d);
    if (g.state === 'ready') begin();
  }

  function steer(s, d) {
    if (!s || !s.alive || s.ai) return;
    // Beim Start im Parkour liegt die Schlange zusammengerollt: jede Richtung ist erlaubt
    if (G.state === 'ready' && s.body.every((c) => c.x === s.body[0].x && c.y === s.body[0].y)) { s.dir = d; s.queue.length = 0; return; }
    if (G.state === 'play' && lateTurn(s, d)) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (s.queue.length < 3 && !sameDir(d, last) && !backDir(d, last)) s.queue.push(d);
  }

  function begin() {
    const g = G;
    if (g.state !== 'ready') return;
    g.state = 'play';
    g.acc = 0;
    el.hint.classList.add('hidden');
    Sound.start();
    step(performance.now());
    updateHud();
  }

  // Zielfeld, wenn Schlange s in Richtung d weiterkriecht (mit Portal und Rand-Durchgang)
  function plan(s, d) {
    const g = G, h = s.body[0];
    let x = h.x + d.x, y = h.y + d.y, j = null;
    const exit = portalExit(h.x, h.y);
    if (exit) { x = exit.x + d.x; y = exit.y + d.y; j = 'portal'; }
    if (g.mode.wrap && !inside(x, y)) { x = wrapNum(x, g.cols); y = wrapNum(y, g.rows); j = j || 'wrap'; }
    return { s, x, y, d, j, apple: g.apples.find((a) => a.x === x && a.y === y) || null, dead: null };
  }
  const grows = (p) => !!p.apple || p.s.pending > 0;

  function applyMove(s, p) {
    s.body.unshift({ x: p.x, y: p.y, d: p.d, j: p.j });
    if (grows(p)) { if (!p.apple) s.pending--; s.grew = true; s.prevTail = null; }
    else { s.grew = false; s.prevTail = s.body.pop(); }
    s.moved = true;
    s.ate = false;
    s.picked = false;
    if (p.j === 'portal') Sound.portal();
  }

  function kill(s, d, now) {
    const h = s.body[0];
    s.alive = false;
    s.moved = false;
    s.blocked = null;
    s.deadAt = now;
    burst(h.x + d.x * 0.45, h.y + d.y * 0.45, ['#ffffff', '#e4f1d2', '#a5a5a5'], 0, now, 10);
  }

  function step(now) {
    const g = G, m = g.mode;
    if (resolveBlocked(now)) return;
    g.tick++;
    g.eaten = [];
    if (g.level) { updateDoors(); moveSaws(); }
    if (m.flee && g.tick % 2 === 0) moveFleeing();
    const key = (x, y) => y * g.cols + x;
    const live = g.snakes.filter((s) => s.alive);
    for (const s of live) {
      s.turned = false;
      if (s.ai) { aiThink(s); continue; }
      while (s.queue.length) {
        const q = s.queue.shift();
        if (!sameDir(q, s.dir) && !backDir(q, s.dir)) { s.dir = q; s.turned = true; break; }
      }
    }
    const plans = live.map((s) => plan(s, s.dir));

    // Belegung nach dem Zug (der Schwanz rückt nach, außer beim Wachsen)
    const occ = new Set(), heads = new Map();
    for (const p of plans) {
      const keep = grows(p) ? p.s.body.length : p.s.body.length - 1;
      for (let i = 0; i < keep; i++) occ.add(key(p.s.body[i].x, p.s.body[i].y));
      if (inside(p.x, p.y)) heads.set(key(p.x, p.y), (heads.get(key(p.x, p.y)) || 0) + 1);
    }
    const ghost = m.peaceful || g.fx.ghost;
    for (const p of plans) {
      const at = (c) => c.x === p.x && c.y === p.y;
      if (!inside(p.x, p.y)) p.dead = 'wall';
      else if (solidAt(p.x, p.y)) p.dead = 'stone';
      else if (!ghost && occ.has(key(p.x, p.y))) p.dead = 'body';
      else if (heads.get(key(p.x, p.y)) > 1) p.dead = 'head';
      else if (g.saws.some(at)) p.dead = 'saw';
      else if (g.poison.some(at)) p.dead = 'poison';
    }

    let ended = null;
    for (const p of plans) {
      if (!p.dead) { applyMove(p.s, p); continue; }
      p.s.moved = false;
      // Allein wartet die Schlange kurz vor dem Hindernis: Ein später Tastendruck rettet sie noch (lateTurn)
      if (!m.versus && !p.s.ai) { p.s.blocked = p; continue; }
      kill(p.s, p.d, now);
      ended = 'crash';
    }
    // Sägen treffen auch den Körper
    if (g.saws.length) for (const s of live) {
      if (!s.alive) continue;
      const hit = s.body.find((c) => g.saws.some((w) => w.x === c.x && w.y === c.y));
      if (!hit) continue;
      s.alive = false;
      s.blocked = null;
      s.deadAt = now + g.interval * 0.5;
      burst(hit.x, hit.y, ['#ffffff', '#c9ced6', '#ff5252'], g.interval * 0.5, now, 14);
      ended = 'saw';
    }
    for (const p of plans) {
      if (p.dead || !p.s.alive) continue;
      if (p.apple) eat(p.s, p.apple, now);
      if (g.level) parkourItems(p.s, now);
    }
    if (!ended && g.full && !g.apples.length) ended = 'win';
    if (ended && g.state === 'play') endGame(ended);
    updateHud();
  }

  // Gnadenfrist abgelaufen: Die blockierte Schlange crasht oder beißt in den Giftapfel.
  function resolveBlocked(now) {
    const g = G, s = g.snakes.find((x) => x.blocked);
    if (!s) return false;
    const p = s.blocked;
    s.blocked = null;
    if (p.dead === 'poison') {
      const t = clamp(g.acc / g.interval, 0, 1), before = headPos(s, t);
      applyMove(s, p);
      startSwing(s, before, t, now);
      g.poison = g.poison.filter((c) => c.x !== p.x || c.y !== p.y);
      g.eaten.push({ x: p.x, y: p.y, kind: 'poison', tick: g.tick, from: t });
      burst(p.x, p.y, ['#8e3fc4', '#c58cf2', '#55197f'], g.interval * Math.max(0, 0.4 - t), now, 14);
      s.alive = false;
      s.deadAt = now + g.interval * Math.max(0, 0.5 - t);
      endGame('poison');
    } else {
      kill(s, p.d, now);
      endGame(p.dead === 'saw' ? 'saw' : 'crash');
    }
    return true;
  }

  // Später Tastendruck kurz nach einem Schritt: Der letzte Zug wird umgeschrieben, als wäre die Taste
  // rechtzeitig gekommen. Steht die Schlange vor einem Hindernis, weicht sie so noch aus.
  function lateTurn(s, d) {
    const g = G;
    if (g.acc > g.interval * GRACE) return false;
    const now = performance.now(), t = g.acc / g.interval, before = headPos(s, t);
    let undo = null;
    if (s.blocked) {
      if (backDir(d, s.body[0].d)) return false;
    } else {
      const D = s.dir;
      if (s.queue.length || s.turned || s.grew || s.picked || !s.moved) return false;
      if (sameDir(d, D) || backDir(d, D)) return false;
      undo = s.body.shift();
      s.body.push(s.prevTail);
    }
    const p = plan(s, d);
    if (isDeadly(s, p)) {
      if (undo) { s.prevTail = s.body.pop(); s.body.unshift(undo); }
      return false;
    }
    s.blocked = null;
    s.queue.length = 0;
    s.dir = d;
    s.turned = true;
    applyMove(s, p);
    startSwing(s, before, t, now);
    if (p.apple) {
      eat(s, p.apple, now, t);
      if (g.full && !g.apples.length) endGame('win');
    }
    if (g.level) parkourItems(s, now);
    updateHud();
    return true;
  }

  function isDeadly(s, p) {
    const g = G, at = (c) => c.x === p.x && c.y === p.y;
    if (!inside(p.x, p.y) || solidAt(p.x, p.y) || g.poison.some(at) || g.saws.some(at)) return true;
    const tail = s.body[s.body.length - 1];
    for (const o of g.snakes) {
      if (o !== s) {
        if (o.body.some(at)) return true;
        if (grows(p) && o.body.some((c) => c.x === tail.x && c.y === tail.y)) return true; // Schwanz bleibt liegen
      } else if (!(g.mode.peaceful || g.fx.ghost)) {
        const keep = grows(p) ? s.body.length : s.body.length - 1;
        for (let i = 0; i < keep; i++) if (at(s.body[i])) return true;
      }
    }
    return false;
  }

  function headPos(s, t) {
    const geo = snakeGeom(s, s.moved ? t : 1), pc = rangePieces(geo, geo.start, geo.end);
    return pc.length ? pc[0][0] : { x: s.body[0].x, y: s.body[0].y };
  }

  // Nach einem nachträglichen Abbiegen gleitet der Kopf kurz herüber, statt zu springen
  function startSwing(s, before, t, now) {
    const after = headPos(s, t), dx = before.x - after.x, dy = before.y - after.y;
    s.swing = Math.abs(dx) + Math.abs(dy) < 1.5 ? { dx, dy, at: now } : null;
  }

  function scoreOf() {
    const g = G;
    return g.mode.mirror ? g.snakes[0].score + g.snakes[1].score : g.snakes[0].score;
  }

  function eat(s, apple, now, t0 = 0) {
    const g = G, m = g.mode, gold = apple.kind === 'gold';
    g.apples.splice(g.apples.indexOf(apple), 1);
    g.eaten.push({ x: apple.x, y: apple.y, kind: apple.kind, tick: g.tick, from: t0 });
    const pts = (gold ? 3 : 1) * (g.fx.double ? 2 : 1);
    s.score += pts;
    if (gold) s.pending += 2;
    s.ate = true;
    if (m.hunger) g.hunger = HUNGER_MS;
    const delay = g.interval * Math.max(0, 0.45 - t0);
    burst(apple.x, apple.y, gold ? ['#ffd54f', '#fff59d', '#ffb300', '#ffffff'] : ['#e7471d', '#ff8559', '#ffd54f', '#7cc04a'], delay, now, gold ? 18 : 12);
    g.floaters.push({ x: apple.x + 0.5, y: apple.y - 0.1, text: '+' + pts, born: now + delay, life: 750, color: m.versus ? s.color : gold ? '#ffe066' : '#ffffff' });
    if (gold) Sound.gold(); else Sound.eat();
    const total = scoreOf();
    if (!m.versus && total > g.best) { g.best = total; store.set('best.' + m.id, g.best); }
    if (m.turbo) { g.turbo = Math.pow(0.97, total); retime(); }
    if (!gold && !apple.extra && !spawn('apples')) g.full = true;
    if (!gold && settings.bonus === 'on' && !g.apples.some((a) => a.kind === 'gold') && Math.random() < 0.16) spawnGold();
    if (m.stones && !gold && spawn('stones', 4)) {
      const st = g.stones[g.stones.length - 1];
      burst(st.x, st.y, ['#9e9e9e', '#d0d0d0', '#7a7a7a'], 0, now, 8);
      Sound.stone();
    }
    if (m.poison && !gold) refreshPoison(total);
    bump(m.versus ? (s === g.snakes[0] ? el.sP1 : el.sP2) : el.sScore);
  }

  function retime() {
    const g = G, old = g.interval;
    g.interval = Math.max(45, Math.round(g.base * g.mul * g.turbo));
    g.acc *= g.interval / old;
  }

  function burst(x, y, colors, delay, now, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 1.8;
      G.particles.push({
        x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        born: now + delay, life: 420 + Math.random() * 280, color: colors[i % colors.length], r: 0.05 + Math.random() * 0.07,
      });
    }
  }

  // Hunger: Der Schwanz schrumpft. Bei zwei Gliedern ist Schluss.
  function shrink(s, now) {
    if (s.body.length <= 2) { kill(s, s.dir, now); endGame('hunger'); return; }
    const tail = s.body.pop();
    s.prevTail = tail;
    s.grew = false;
    burst(tail.x, tail.y, ['#c8a27a', '#e9d5b5', '#a1887f'], 0, now, 7);
    Sound.shrink();
    toast('Hunger! Du schrumpfst.');
  }

  function zoneRing(r) {
    const g = G, out = [];
    for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (Math.min(x, y, g.cols - 1 - x, g.rows - 1 - y) === r) out.push({ x, y });
    return out;
  }
  function closeZone(now) {
    const g = G, z = g.zone, ring = zoneRing(z.ring);
    const inRing = (c) => Math.min(c.x, c.y, g.cols - 1 - c.x, g.rows - 1 - c.y) === z.ring;
    const victim = g.snakes.find((s) => s.alive && s.body.some(inRing));
    for (const c of ring) {
      const k = c.y * g.cols + c.x;
      if (!g.fire.has(k) && !g.walls.has(k)) { g.fire.add(k); g.fireList.push(c); }
    }
    for (const list of ['apples', 'poison', 'stones']) {
      const lost = g[list].filter(inRing);
      g[list] = g[list].filter((c) => !inRing(c));
      if (list === 'apples') lost.forEach((a) => { if (a.kind !== 'gold' && !spawn('apples')) g.full = true; });
    }
    ring.forEach((c, i) => { if (i % 3 === 0) burst(c.x, c.y, ['#ff7043', '#ffca28', '#e53935'], 0, now, 2); });
    z.ring++;
    z.next = g.cols - 2 * z.ring <= 6 || g.rows - 2 * z.ring <= 6 ? Infinity : ZONE_MS;
    z.warned = 0;
    Sound.zone();
    toast(z.next === Infinity ? 'Die Zone ist jetzt am kleinsten!' : 'Die Feuerwand rückt näher!');
    if (victim) { kill(victim, victim.dir, now); endGame('zone'); }
  }

  function updateChaos(dt) {
    const g = G, c = g.chaos;
    if (c.fx) {
      c.left -= dt;
      if (c.left <= 0) { endChaosFx(); c.next = 6000 + rand(4000); toast('Alles wieder normal'); }
      return;
    }
    c.next -= dt;
    if (c.next > 0) return;
    const pool = CHAOS.filter((e) => e.id !== c.last), e = pool[rand(pool.length)];
    c.last = e.id;
    Sound.chaos();
    toast(e.name);
    if (e.id === 'rain') { for (let i = 0; i < 6; i++) spawn('apples', 2, { extra: true }); c.next = 8000; return; }
    if (e.id === 'grow') { g.snakes[0].pending += 4; c.next = 8000; return; }
    c.fx = e;
    c.left = 8000;
    g.fx = { [e.id]: true };
    if (e.mul) { g.mul = e.mul; retime(); }
  }
  function endChaosFx() {
    const g = G;
    g.fx = {};
    if (g.chaos) g.chaos.fx = null;
    if (g.mul !== 1) { g.mul = 1; retime(); }
  }

  function expireGold(now) {
    const g = G;
    for (const a of g.apples.slice()) {
      if (a.kind !== 'gold' || g.clock < a.expires) continue;
      g.apples.splice(g.apples.indexOf(a), 1);
      burst(a.x, a.y, ['#ffd54f', '#fff59d'], 0, now, 8);
    }
  }

  /* ---------- Parkour ---------- */
  function parkourItems(s, now) {
    const g = G, h = s.body[0], at = (c) => c.x === h.x && c.y === h.y;
    const star = g.stars.find(at);
    if (star) {
      g.stars.splice(g.stars.indexOf(star), 1);
      g.starsGot++;
      s.picked = true;
      const delay = g.interval * 0.4;
      burst(h.x, h.y, ['#ffd54f', '#ffecb3', '#ffb300'], delay, now, 16);
      g.floaters.push({ x: h.x + 0.5, y: h.y - 0.1, text: '★', born: now + delay, life: 800, color: '#ffe082' });
      Sound.star();
      bump(el.sStars);
    }
    const key = g.keys.find(at);
    if (key) {
      g.keys.splice(g.keys.indexOf(key), 1);
      g.hasKey = true;
      s.picked = true;
      burst(h.x, h.y, ['#ffd54f', '#ffb300', '#ffffff'], g.interval * 0.4, now, 16);
      Sound.key();
      toast('Schlüssel! Die Schlösser sind offen.');
    }
    const cp = g.checkpoints.find(at);
    if (cp && !cp.on) {
      g.checkpoints.forEach((c) => (c.on = false));
      cp.on = true;
      g.cp = { x: cp.x, y: cp.y, d: h.d };
      s.picked = true;
      Sound.check();
      toast('Checkpoint!');
    }
    if (g.goal && at(g.goal)) finishParkour(now);
  }

  function finishParkour(now) {
    const g = G, lv = g.level;
    g.state = 'over';
    g.result = 'goal';
    g.overAt = now;
    const rec = store.get('park', {}), old = rec[lv.id];
    g.record = !!old && g.elapsed < old.t;
    g.oldBest = old ? old.t : null;
    rec[lv.id] = { t: old ? Math.min(old.t, g.elapsed) : g.elapsed, s: Math.max(old ? old.s : 0, g.starsGot) };
    store.set('park', rec);
    burst(g.goal.x, g.goal.y, ['#ff5252', '#ffd54f', '#69f0ae', '#40c4ff', '#e040fb'], g.interval * 0.5, now, 40);
    Sound.win();
    updateHud();
    setTimeout(() => { if (G === g && el.menu.classList.contains('hidden')) showLevelDone(); }, 900);
  }

  function crashParkour() {
    const g = G, now = performance.now();
    g.state = 'dead';
    g.deaths++;
    g.respawnAt = now + 1100;
    g.shake = 380;
    Sound.crash();
    toast(g.cp ? 'Autsch! Weiter am Checkpoint' : 'Autsch! Nochmal von vorn');
    updateHud();
  }

  function respawn(now) {
    const g = G, p = g.cp || g.start;
    g.snakes = [makeSnake(p.x, p.y, p.d, settings.color, now, { p1: true, stacked: true, len: g.level.len || 4 })];
    g.state = 'ready';
    g.acc = 0;
    g.eaten = [];
    updateDoors();
    showHint(true);
    updateHud();
  }

  function endGame(reason) {
    const g = G;
    if (g.state === 'over' || g.state === 'dead') return;
    if (g.level) { crashParkour(); return; }
    g.state = 'over';
    g.result = reason;
    g.overAt = performance.now();
    if (g.chaos) endChaosFx();
    if (reason === 'win') Sound.win();
    else if (reason === 'time') Sound.timeup();
    else if (reason === 'poison') Sound.poison();
    else { Sound.crash(); g.shake = 380; }
    if (g.mode.versus) {
      const [a, b] = g.snakes, w = wins[g.mode.id];
      if (a.alive && !b.alive) w[0]++;
      else if (b.alive && !a.alive) w[1]++;
    }
    updateHud();
    setTimeout(() => {
      if (G === g && el.menu.classList.contains('hidden')) showGameOver();
    }, reason === 'time' || reason === 'win' ? 500 : 950);
  }

  function update(dt, now) {
    const g = G;
    if (!g) return;
    if (g.state === 'play') {
      g.clock += dt;
      if (g.level) g.elapsed += dt;
      if (g.mode.time) {
        g.timeLeft = Math.max(0, g.timeLeft - dt);
        const sec = Math.ceil(g.timeLeft / 1000);
        if (sec !== g.lastSec) { g.lastSec = sec; updateTime(); if (sec > 0 && sec <= 5) Sound.tick(); }
        if (g.timeLeft <= 0) endGame('time');
      }
      if (g.mode.hunger && g.state === 'play') {
        g.hunger -= dt;
        if (g.hunger <= 0) { g.hunger = HUNGER_STEP; shrink(g.snakes[0], now); }
      }
      if (g.zone && g.state === 'play') {
        const z = g.zone;
        z.next -= dt;
        const sec = Math.ceil(z.next / 1000);
        if (sec <= 3 && sec > 0 && sec !== z.warned) { z.warned = sec; Sound.warn(); }
        if (z.next <= 0) closeZone(now);
      }
      if (g.chaos && g.state === 'play') updateChaos(dt);
      expireGold(now);
      g.acc += dt;
      while (g.state === 'play' && g.acc >= g.interval) { g.acc -= g.interval; step(now); }
      if (g.state === 'play' && g.acc > g.interval * GRACE) resolveBlocked(now);
    } else if (g.state === 'over' || g.state === 'dead') {
      g.acc = Math.min(g.interval, g.acc + dt);
      if (g.state === 'dead' && now >= g.respawnAt) respawn(now);
    }
    if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
    for (const s of g.snakes) if (now > s.blinkAt + 140) s.blinkAt = now + 2200 + Math.random() * 3800;
    updateLive();
  }

  /* ---------- Computer-Gegner ---------- */
  function aiThink(s) {
    const g = G, cfg = AI_LEVELS[settings.ai] || AI_LEVELS.normal, N = g.cols * g.rows;
    const block = new Uint8Array(N);
    const mark = (x, y) => { if (inside(x, y)) block[y * g.cols + x] = 1; };
    g.walls.forEach((k) => { block[k] = 1; });
    g.fire.forEach((k) => { block[k] = 1; });
    g.stones.forEach((c) => mark(c.x, c.y));
    g.poison.forEach((c) => mark(c.x, c.y));
    for (const o of g.snakes) if (o.alive) o.body.forEach((c, i) => { if (i < o.body.length - 1) mark(c.x, c.y); });
    const opts = DIR_LIST.filter((d) => !backDir(d, s.dir)).map((d) => ({ d, p: plan(s, d) }))
      .filter((o) => inside(o.p.x, o.p.y) && !block[o.p.y * g.cols + o.p.x]);
    if (!opts.length) return;
    if (Math.random() < cfg.mistake) { s.dir = opts[rand(opts.length)].d; return; }
    // Entfernung zum nächsten Apfel (Breitensuche von allen Äpfeln aus)
    const dist = new Int16Array(N).fill(-1), q = [];
    for (const a of g.apples) { const k = a.y * g.cols + a.x; if (!block[k]) { dist[k] = 0; q.push(k); } }
    for (let i = 0; i < q.length; i++) {
      const k = q[i], x = k % g.cols, y = (k / g.cols) | 0;
      for (const d of DIR_LIST) {
        const nx = x + d.x, ny = y + d.y;
        if (!inside(nx, ny)) continue;
        const nk = ny * g.cols + nx;
        if (block[nk] || dist[nk] >= 0) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
    const opp = g.snakes.find((o) => o !== s && o.alive), need = s.body.length + 2;
    for (const o of opts) {
      const k = o.p.y * g.cols + o.p.x;
      o.dist = dist[k] < 0 ? 999 : dist[k];
      o.space = cfg.safe ? floodArea(block, k, need * 3) : 99;
      o.risky = !!(cfg.dodge && opp && Math.abs(opp.body[0].x - o.p.x) + Math.abs(opp.body[0].y - o.p.y) === 1);
    }
    opts.sort((a, b) => (b.space >= need) - (a.space >= need) || a.risky - b.risky || a.dist - b.dist ||
      b.space - a.space || sameDir(b.d, s.dir) - sameDir(a.d, s.dir));
    s.dir = opts[0].d;
  }
  function floodArea(block, start, limit) {
    const g = G, seen = new Uint8Array(block.length), q = [start];
    seen[start] = 1;
    for (let i = 0; i < q.length && q.length < limit; i++) {
      const k = q[i], x = k % g.cols, y = (k / g.cols) | 0;
      for (const d of DIR_LIST) {
        const nx = x + d.x, ny = y + d.y;
        if (!inside(nx, ny)) continue;
        const nk = ny * g.cols + nx;
        if (block[nk] || seen[nk]) continue;
        seen[nk] = 1;
        q.push(nk);
      }
    }
    return q.length;
  }

  /* ---------- Zeichnen ---------- */
  function layout() {
    const g = G;
    if (!g) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pad = 10;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const hudH = el.hud.offsetHeight || 54;
    const dpadH = isTouch && vh >= vw ? 3 * 52 + 2 * 6 + 12 : 0;
    const availW = Math.min(vw - 16, 780) - pad * 2;
    const availH = vh - hudH - dpadH - 16 - pad * 2;
    cell = Math.max(8, Math.floor(Math.min(availW / g.cols, availH / g.rows)));
    boardW = cell * g.cols;
    boardH = cell * g.rows;
    el.canvas.style.width = boardW + 'px';
    el.canvas.style.height = boardH + 'px';
    el.canvas.width = Math.round(boardW * dpr);
    el.canvas.height = Math.round(boardH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    el.app.style.width = boardW + pad * 2 + 'px';
    renderBackground();
  }

  function applyTheme() {
    const th = THEMES[settings.theme], r = document.documentElement.style;
    r.setProperty('--hud', th.hud);
    r.setProperty('--frame', th.frame);
    r.setProperty('--page1', th.page[0]);
    r.setProperty('--page2', th.page[1]);
    r.setProperty('--page3', th.page[2]);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = th.hud;
  }

  function rrect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Boden, Deko, Schienen und Wände werden einmal vorgezeichnet
  function renderBackground() {
    const g = G, th = THEMES[settings.theme], c = cell;
    bg.width = Math.round(boardW * dpr);
    bg.height = Math.round(boardH * dpr);
    const b = bg.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        b.fillStyle = th.grass[(x + y) & 1];
        b.fillRect(x * c, y * c, c, c);
      }
    }
    const r = seeded(g.cols * 131 + g.rows);
    b.strokeStyle = b.fillStyle = th.decoColor;
    b.lineWidth = Math.max(1, c * 0.04);
    b.lineCap = 'round';
    for (let y = 0; y < g.rows; y++) {
      for (let x = 0; x < g.cols; x++) {
        if (r() > (th.deco === 'stars' ? 0.35 : 0.22)) continue;
        const bx = (x + 0.2 + r() * 0.6) * c, by = (y + 0.35 + r() * 0.5) * c;
        b.beginPath();
        if (th.deco === 'grass') {
          for (let k = -1; k <= 1; k++) { b.moveTo(bx + k * c * 0.06, by); b.lineTo(bx + k * c * 0.11, by - c * (0.1 + r() * 0.08)); }
          b.stroke();
        } else if (th.deco === 'pebbles') {
          b.ellipse(bx, by, c * (0.05 + r() * 0.05), c * 0.035, r() * 3, 0, Math.PI * 2);
          b.fill();
        } else if (th.deco === 'sparkle') {
          const s = c * 0.06;
          b.moveTo(bx - s, by); b.lineTo(bx + s, by); b.moveTo(bx, by - s); b.lineTo(bx, by + s);
          b.stroke();
        } else if (th.deco === 'cracks') {
          b.moveTo(bx, by); b.lineTo(bx + c * 0.12, by + c * 0.06); b.lineTo(bx + c * 0.2, by - c * 0.04);
          b.stroke();
        } else {
          b.arc(bx, by, Math.max(0.6, c * (0.015 + r() * 0.02)), 0, Math.PI * 2);
          b.fill();
        }
      }
    }
    if (g.rails.size) drawRails(b);
    if (g.start) {
      const sx = (g.start.x + 0.5) * c, sy = (g.start.y + 0.5) * c;
      b.fillStyle = 'rgba(40,25,10,0.35)';
      b.beginPath(); b.ellipse(sx, sy + c * 0.05, c * 0.4, c * 0.32, 0, 0, Math.PI * 2); b.fill();
      b.fillStyle = 'rgba(20,12,5,0.45)';
      b.beginPath(); b.ellipse(sx, sy + c * 0.07, c * 0.26, c * 0.2, 0, 0, Math.PI * 2); b.fill();
    }
    if (g.wallList.length) drawWalls(b, th);
  }

  function drawRails(b) {
    const g = G, c = cell;
    b.lineCap = 'round';
    const line = (w, style) => {
      b.strokeStyle = style;
      b.lineWidth = w;
      for (const k of g.rails) {
        const x = k % g.cols, y = (k / g.cols) | 0, cx = (x + 0.5) * c, cy = (y + 0.5) * c;
        b.beginPath();
        b.moveTo(cx, cy);
        b.lineTo(cx + 0.01, cy);
        if (x + 1 < g.cols && g.rails.has(k + 1)) { b.moveTo(cx, cy); b.lineTo(cx + c, cy); }
        if (g.rails.has(k + g.cols)) { b.moveTo(cx, cy); b.lineTo(cx, cy + c); }
        b.stroke();
      }
    };
    line(Math.max(3, c * 0.22), 'rgba(0,0,0,0.22)');
    line(Math.max(1, c * 0.06), 'rgba(255,255,255,0.4)');
  }

  function drawWalls(b, th) {
    const g = G, c = cell, pad = Math.max(1, c * 0.04), r = c * 0.24;
    const has = (x, y) => x >= 0 && y >= 0 && x < g.cols && y < g.rows && g.walls.has(y * g.cols + x);
    const shape = (ox, oy) => {
      for (const w of g.wallList) {
        const x = w.x * c + ox, y = w.y * c + oy;
        rrect(b, x + pad, y + pad, c - 2 * pad, c - 2 * pad, r);
        b.fill();
        if (has(w.x + 1, w.y)) b.fillRect(x + c / 2, y + pad, c, c - 2 * pad);
        if (has(w.x, w.y + 1)) b.fillRect(x + pad, y + c / 2, c - 2 * pad, c);
        if (has(w.x + 1, w.y) && has(w.x, w.y + 1) && has(w.x + 1, w.y + 1)) b.fillRect(x + c / 2, y + c / 2, c, c);
      }
    };
    b.fillStyle = 'rgba(0,0,0,0.2)';
    shape(c * 0.05, c * 0.13);
    b.fillStyle = th.wallSide;
    shape(0, c * 0.08);
    b.fillStyle = th.wall;
    shape(0, 0);
    b.fillStyle = th.wallTop;
    for (const w of g.wallList) {
      if (has(w.x, w.y - 1)) continue;
      rrect(b, w.x * c + pad + c * 0.12, w.y * c + pad + c * 0.08, c - 2 * pad - c * 0.24, c * 0.12, c * 0.06);
      b.fill();
    }
    // kleine Struktur je nach Welt
    const rnd = seeded(g.cols * 7 + g.rows * 13 + g.wallList.length);
    for (const w of g.wallList) {
      const x = w.x * c, y = w.y * c;
      if (th.deco === 'grass') {
        b.fillStyle = rnd() < 0.5 ? th.wallTop : th.wallSide;
        for (let i = 0; i < 3; i++) { b.beginPath(); b.arc(x + c * (0.2 + rnd() * 0.6), y + c * (0.3 + rnd() * 0.5), c * 0.06, 0, Math.PI * 2); b.fill(); }
      } else if (th.deco === 'pebbles') {
        b.strokeStyle = th.wallSide; b.lineWidth = Math.max(1, c * 0.04);
        b.beginPath(); b.moveTo(x + c * 0.15, y + c * 0.55); b.lineTo(x + c * 0.85, y + c * 0.55);
        b.moveTo(x + c * (rnd() < 0.5 ? 0.35 : 0.65), y + c * 0.55); b.lineTo(x + c * (rnd() < 0.5 ? 0.35 : 0.65), y + c * 0.85);
        b.stroke();
      } else if (th.deco === 'sparkle') {
        b.strokeStyle = 'rgba(255,255,255,0.7)'; b.lineWidth = Math.max(1, c * 0.05);
        b.beginPath(); b.moveTo(x + c * 0.3, y + c * 0.7); b.lineTo(x + c * 0.55, y + c * 0.35); b.stroke();
      } else if (th.deco === 'cracks') {
        if (rnd() < 0.45) {
          b.strokeStyle = 'rgba(255,120,40,0.75)'; b.lineWidth = Math.max(1, c * 0.05);
          b.beginPath(); b.moveTo(x + c * 0.2, y + c * 0.35); b.lineTo(x + c * 0.45, y + c * 0.55); b.lineTo(x + c * 0.4, y + c * 0.75); b.lineTo(x + c * 0.7, y + c * 0.8); b.stroke();
        }
      } else if (th.deco === 'stars') {
        b.fillStyle = 'rgba(255,255,255,0.35)';
        for (const [a, d] of [[0.22, 0.25], [0.78, 0.25], [0.22, 0.75], [0.78, 0.75]]) { b.beginPath(); b.arc(x + c * a, y + c * d, c * 0.045, 0, Math.PI * 2); b.fill(); }
      }
    }
  }

  function render(now) {
    const g = G;
    if (!g) return;
    const t = clamp(g.acc / g.interval, 0, 1);
    ctx.save();
    ctx.clearRect(0, 0, boardW, boardH);
    if (g.shake > 0 && !reduceMotion) {
      const k = (g.shake / 380) * cell * 0.16;
      ctx.translate((Math.random() * 2 - 1) * k, (Math.random() * 2 - 1) * k);
    }
    ctx.drawImage(bg, 0, 0, boardW, boardH);
    if (g.mode.wrap) {
      const lw = Math.max(2, cell * 0.07);
      ctx.save();
      ctx.setLineDash([cell * 0.28, cell * 0.22]);
      ctx.lineWidth = lw;
      ctx.strokeStyle = THEMES[settings.theme].line;
      ctx.strokeRect(lw / 2, lw / 2, boardW - lw, boardH - lw);
      ctx.restore();
    }
    if (g.fireList.length) drawFire(now);
    if (g.zone && g.zone.next <= 3000) drawZoneWarn(now);
    if (g.level) {
      for (const d of g.doors) drawDoor(d, now);
      for (const l of g.locks) drawLock(l);
      for (const cp of g.checkpoints) drawFlag(cp.x, cp.y, cp.on ? '#43a047' : '#9e9e9e', now, false);
      if (g.goal) drawFlag(g.goal.x, g.goal.y, null, now, true);
      for (const k of g.keys) drawKey(k, now);
      for (const s of g.stars) drawStar(s, now);
    }
    g.stones.forEach((s) => drawStone(s, now));
    g.poison.forEach((a) => drawApple(a, 'poison', now, t));
    g.apples.forEach((a) => drawApple(a, a.kind, now, t));
    for (const e of g.eaten) {
      const k = 1 - (t - e.from) / 0.5;
      if (e.tick === g.tick && k > 0) drawAppleShape((e.x + 0.5) * cell, (e.y + 0.5) * cell, cell * 0.36 * Math.min(1, k), e.kind);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, boardW, boardH);
    ctx.clip();
    for (const s of g.snakes) drawSnake(s, s.moved ? t : 1, now);
    ctx.restore();
    // Portale und Sägen über der Schlange
    g.portals.forEach((p, i) => drawPortal(p, i, now));
    for (const s of g.saws) drawSaw(s, now, t);
    drawFx(now);
    if (g.mode.dark || g.fx.dark) drawDarkness();
    drawAmbient(now);
    ctx.restore();
  }

  function drawApple(a, kind, now, t) {
    const g = G, age = now - a.born;
    let k = age < 280 ? easeOutBack(age / 280) : 1;
    k *= 1 + Math.sin(now / 280 + a.x * 1.3 + a.y * 0.7) * 0.035;
    const m = a.mt === g.tick ? t : 1;
    a.vx = a.mt === g.tick ? lerp(a.px, a.x, m) : a.x;
    a.vy = a.mt === g.tick ? lerp(a.py, a.y, m) : a.y;
    if (kind === 'gold' && a.expires - g.clock < 2000 && Math.floor(now / 120) % 2) return;
    drawAppleShape((a.vx + 0.5) * cell, (a.vy + 0.5) * cell, cell * (kind === 'gold' ? 0.39 : 0.36) * k, kind);
  }

  function drawAppleShape(x, y, r, kind) {
    if (r < 0.5) return;
    const pal = kind === 'poison'
      ? { base: '#8e3fc4', light: '#c58cf2', dark: '#55197f', leaf: '#3c6b22' }
      : kind === 'gold'
        ? { base: '#f5b301', light: '#fff07a', dark: '#b97500', leaf: '#5aa63a' }
        : { base: '#e7471d', light: '#ff8559', dark: '#b2290c', leaf: '#5aa63a' };
    ctx.fillStyle = 'rgba(0,0,0,0.17)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.08, y + r * 0.92, r * 0.8, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    const gr = ctx.createRadialGradient(x - r * 0.35, y - r * 0.3, r * 0.1, x, y, r * 1.15);
    gr.addColorStop(0, pal.light);
    gr.addColorStop(0.55, pal.base);
    gr.addColorStop(1, pal.dark);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.bezierCurveTo(x + r * 0.5, y - r * 1.05, x + r * 1.15, y - r * 0.45, x + r * 0.95, y + r * 0.2);
    ctx.bezierCurveTo(x + r * 0.8, y + r * 0.85, x + r * 0.35, y + r * 1.0, x, y + r * 0.85);
    ctx.bezierCurveTo(x - r * 0.35, y + r * 1.0, x - r * 0.8, y + r * 0.85, x - r * 0.95, y + r * 0.2);
    ctx.bezierCurveTo(x - r * 1.15, y - r * 0.45, x - r * 0.5, y - r * 1.05, x, y - r * 0.55);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.45, y - r * 0.12, r * 0.13, r * 0.27, 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'poison') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (const [sx, sy, sr] of [[0.35, 0.1, 0.13], [-0.05, 0.5, 0.1], [0.05, -0.2, 0.08], [0.55, 0.5, 0.07]]) {
        ctx.beginPath();
        ctx.arc(x + r * sx, y + r * sy, r * sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = Math.max(1, r * 0.17);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.5);
    ctx.quadraticCurveTo(x + r * 0.02, y - r * 0.85, x + r * 0.2, y - r * 1.05);
    ctx.stroke();
    ctx.fillStyle = pal.leaf;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.45, y - r * 0.88, r * 0.32, r * 0.14, -0.55, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'gold') drawSparkle(x + r * 0.75, y - r * 0.55, r * 0.35, performance.now());
  }

  function drawSparkle(x, y, s, now) {
    const k = 0.6 + 0.4 * Math.sin(now / 160);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(x, y - s * k); ctx.lineTo(x + s * 0.22, y - s * 0.22); ctx.lineTo(x + s * k, y); ctx.lineTo(x + s * 0.22, y + s * 0.22);
    ctx.lineTo(x, y + s * k); ctx.lineTo(x - s * 0.22, y + s * 0.22); ctx.lineTo(x - s * k, y); ctx.lineTo(x - s * 0.22, y - s * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  function drawStone(s, now) {
    const age = now - s.born, k = age < 320 ? easeOutBack(age / 320) : 1;
    const h = cell * 0.43 * k;
    if (h < 0.5) return;
    const cx = (s.x + 0.5) * cell, cy = (s.y + 0.5) * cell, r = h * 0.42;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    rrect(ctx, cx - h + cell * 0.04, cy - h + cell * 0.09, h * 2, h * 2, r);
    ctx.fill();
    const gr = ctx.createLinearGradient(cx - h, cy - h, cx + h, cy + h);
    gr.addColorStop(0, '#c4c4c4');
    gr.addColorStop(1, '#727272');
    ctx.fillStyle = gr;
    rrect(ctx, cx - h, cy - h, h * 2, h * 2, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rrect(ctx, cx - h * 0.68, cy - h * 0.72, h * 0.95, h * 0.34, h * 0.17);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + h * 0.15, cy - h * 0.1);
    ctx.lineTo(cx + h * 0.35, cy + h * 0.2);
    ctx.lineTo(cx + h * 0.2, cy + h * 0.5);
    ctx.stroke();
  }

  function drawPortal(p, i, now) {
    const age = now - p.born, k = age < 420 ? easeOutBack(age / 420) : 1;
    const r = cell * 0.52 * k;
    if (r < 0.5) return;
    const cx = (p.x + 0.5) * cell, cy = (p.y + 0.5) * cell;
    const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, '#0d0426');
    gr.addColorStop(0.5, '#3a1896');
    gr.addColorStop(0.78, '#7c4dff');
    gr.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((now / 450) * (i ? -1 : 1));
    ctx.strokeStyle = 'rgba(215,200,255,0.9)';
    ctx.lineWidth = Math.max(1.5, cell * 0.055);
    ctx.lineCap = 'round';
    for (let n = 0; n < 3; n++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.6, n * 2.094, n * 2.094 + 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSaw(s, now, t) {
    const g = G, k = g.tick === s.mt ? t : 1, e = k * k * (3 - 2 * k);
    const x = (lerp(s.px, s.x, e) + 0.5) * cell, y = (lerp(s.py, s.y, e) + 0.5) * cell, r = cell * 0.44;
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + cell * 0.05, y + cell * 0.12, r * 0.9, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now / 70 + s.spin);
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2, rr = i % 2 ? r * 0.76 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    const gr = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    gr.addColorStop(0, '#f6f8fb');
    gr.addColorStop(1, '#8d97a6');
    ctx.fillStyle = gr;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDoor(d, now) {
    const c = cell, x = d.x * c, y = d.y * c;
    d.vis += ((d.closed ? 1 : 0) - d.vis) * 0.3;
    const col = d.group ? '#c04bd6' : '#3d7be6';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.5 + 0.5 * d.vis;
    rrect(ctx, x + c * 0.1, y + c * 0.1, c * 0.8, c * 0.8, c * 0.16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (d.vis > 0.03) {
      const h = c * 0.8 * d.vis;
      ctx.fillStyle = col;
      rrect(ctx, x + c * 0.1, y + c * 0.1, c * 0.8, h, c * 0.14);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 1; i <= 3; i++) ctx.fillRect(x + c * (0.1 + 0.2 * i) - c * 0.025, y + c * 0.14, c * 0.05, Math.max(0, h - c * 0.08));
    }
    if (d.soon && Math.floor(now / 110) % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      rrect(ctx, x + c * 0.1, y + c * 0.1, c * 0.8, c * 0.8, c * 0.16);
      ctx.fill();
    }
  }

  function drawLock(l) {
    l.vis = G.hasKey ? Math.max(0, l.vis - 0.06) : 1;
    if (l.vis <= 0) return;
    const c = cell, s = c * 0.42 * l.vis, cx = (l.x + 0.5) * c, cy = (l.y + 0.5) * c;
    ctx.globalAlpha = l.vis;
    const gr = ctx.createLinearGradient(cx, cy - s, cx, cy + s);
    gr.addColorStop(0, '#ffe082');
    gr.addColorStop(1, '#e0a100');
    ctx.fillStyle = gr;
    rrect(ctx, cx - s, cy - s, s * 2, s * 2, s * 0.3);
    ctx.fill();
    ctx.strokeStyle = '#a46f00';
    ctx.lineWidth = Math.max(1, c * 0.04);
    ctx.stroke();
    ctx.fillStyle = '#5d4000';
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.15, s * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - s * 0.1, cy - s * 0.1, s * 0.2, s * 0.5);
    ctx.globalAlpha = 1;
  }

  function drawKey(k, now) {
    const c = cell, cx = (k.x + 0.5) * c, cy = (k.y + 0.5) * c + Math.sin(now / 300) * c * 0.06, s = c * 0.36;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.6);
    ctx.strokeStyle = '#c98a00';
    ctx.fillStyle = '#ffcf33';
    ctx.lineWidth = Math.max(1, c * 0.04);
    ctx.beginPath();
    ctx.arc(-s * 0.45, 0, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c98a00';
    ctx.beginPath();
    ctx.arc(-s * 0.45, 0, s * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf33';
    ctx.fillRect(-s * 0.05, -s * 0.12, s * 1.15, s * 0.24);
    ctx.fillRect(s * 0.75, s * 0.05, s * 0.18, s * 0.32);
    ctx.fillRect(s * 0.45, s * 0.05, s * 0.16, s * 0.24);
    ctx.restore();
    drawSparkle(cx + s * 0.8, cy - s * 0.7, s * 0.35, now);
  }

  function starPath(x, y, ro, ri, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? ri : ro;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function drawStar(s, now) {
    const age = now - s.born, k = (age < 300 ? easeOutBack(age / 300) : 1) * (1 + Math.sin(now / 250 + s.x) * 0.06);
    const x = (s.x + 0.5) * cell, y = (s.y + 0.5) * cell, ro = cell * 0.4 * k;
    if (ro < 0.5) return;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, ro * 1.4);
    glow.addColorStop(0, 'rgba(255,235,120,0.55)');
    glow.addColorStop(1, 'rgba(255,235,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, ro * 1.4, 0, Math.PI * 2);
    ctx.fill();
    starPath(x, y, ro, ro * 0.45, Math.sin(now / 600 + s.y) * 0.25);
    ctx.fillStyle = '#ffc83d';
    ctx.fill();
    ctx.strokeStyle = '#d08a00';
    ctx.lineWidth = Math.max(1, cell * 0.04);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function drawFlag(fx, fy, color, now, goal) {
    const c = cell, x = fx * c, y = fy * c;
    if (goal) {
      const p = 0.5 + 0.5 * Math.sin(now / 300);
      ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.2 * p})`;
      ctx.beginPath();
      ctx.arc(x + c / 2, y + c / 2, c * (0.42 + 0.06 * p), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x + c * 0.36, y + c * 0.86, c * 0.16, c * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + c * 0.34, y + c * 0.86);
    ctx.lineTo(x + c * 0.34, y + c * 0.12);
    ctx.stroke();
    const wave = Math.sin(now / 200 + fx) * c * 0.04, fw = c * 0.48, fh = c * 0.32, ox = x + c * 0.36, oy = y + c * 0.14;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(ox + fw * 0.5, oy + wave, ox + fw, oy + wave * 0.5);
    ctx.lineTo(ox + fw, oy + fh + wave * 0.5);
    ctx.quadraticCurveTo(ox + fw * 0.5, oy + fh + wave, ox, oy + fh);
    ctx.closePath();
    if (goal) {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#212121';
      const q = fw / 4;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) ctx.fillRect(ox + i * q, oy - c * 0.05 + j * (fh / 2.6), q, fh / 2.6 + 1);
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFire(now) {
    const c = cell;
    for (const f of G.fireList) {
      const x = f.x * c, y = f.y * c, p = 0.5 + 0.5 * Math.sin(now / 140 + f.x * 1.7 + f.y * 2.3);
      ctx.fillStyle = '#8e1a0e';
      ctx.fillRect(x, y, c, c);
      const gr = ctx.createLinearGradient(x, y + c, x, y);
      gr.addColorStop(0, '#ff6d00');
      gr.addColorStop(1, `rgba(255,214,0,${0.25 + 0.5 * p})`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x, y + c);
      ctx.quadraticCurveTo(x + c * 0.2, y + c * (0.35 - 0.2 * p), x + c * 0.5, y + c * (0.15 + 0.15 * p));
      ctx.quadraticCurveTo(x + c * 0.8, y + c * (0.35 + 0.1 * p), x + c, y + c);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawZoneWarn(now) {
    const g = G, c = cell, r = g.zone.ring, a = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(now / 90));
    ctx.fillStyle = `rgba(229,57,53,${a})`;
    for (const f of zoneRing(r)) ctx.fillRect(f.x * c, f.y * c, c, c);
  }

  // Sichtbarer Körper (Feld-Koordinaten). Die Darstellung läuft der Logik um einen Schritt hinterher:
  // t = 0 zeigt den alten Zustand, t = 1 den aktuellen. Rand- und Portalsprünge teilen den Körper in Stücke.
  function snakeGeom(s, t) {
    const pts = s.body.slice(), tail = !s.grew && s.prevTail;
    if (tail) pts.push(s.prevTail);
    const segs = [];
    let brk = false;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = a.d;
      if (a.j === 'wrap') {
        segs.push({ ax: a.x, ay: a.y, bx: a.x - d.x * 0.5, by: a.y - d.y * 0.5, len: 0.5, brk });
        segs.push({ ax: b.x + d.x * 0.5, ay: b.y + d.y * 0.5, bx: b.x, by: b.y, len: 0.5, brk: true });
        brk = false;
      } else if (a.j === 'portal') {
        segs.push({ ax: a.x, ay: a.y, bx: a.x - d.x, by: a.y - d.y, len: 1, brk });
        brk = true;
      } else {
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len: 1, brk });
        brk = false;
      }
    }
    return { segs, start: 1 - t, end: pts.length - 1 - (tail ? t : 0) };
  }

  function rangePieces(geo, a, b) {
    const pieces = [];
    let cur = null, u = 0;
    for (const sg of geo.segs) {
      const u0 = u, u1 = u + sg.len;
      u = u1;
      if (sg.brk) cur = null;
      if (u1 < a - 1e-9) continue;
      if (u0 > b + 1e-9) break;
      const f0 = clamp((a - u0) / sg.len, 0, 1), f1 = clamp((b - u0) / sg.len, 0, 1);
      const p0 = { x: sg.ax + (sg.bx - sg.ax) * f0, y: sg.ay + (sg.by - sg.ay) * f0 };
      const p1 = { x: sg.ax + (sg.bx - sg.ax) * f1, y: sg.ay + (sg.by - sg.ay) * f1 };
      if (!cur) { cur = [p0]; pieces.push(cur); }
      cur.push(p1);
    }
    if (!pieces.length && geo.segs.length === 0) return [];
    return pieces;
  }

  function samplePath(geo, u) {
    let acc = 0;
    for (const sg of geo.segs) {
      if (u <= acc + sg.len + 1e-9) {
        const f = clamp((u - acc) / sg.len, 0, 1);
        return { x: sg.ax + (sg.bx - sg.ax) * f, y: sg.ay + (sg.by - sg.ay) * f };
      }
      acc += sg.len;
    }
    return null;
  }

  function strokePieces(pieces, style, w, ox = 0, oy = 0) {
    const c = cell;
    ctx.strokeStyle = style;
    ctx.fillStyle = style;
    ctx.lineWidth = w;
    for (const pc of pieces) {
      const x0 = (pc[0].x + 0.5) * c + ox, y0 = (pc[0].y + 0.5) * c + oy;
      let len = 0;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let i = 1; i < pc.length; i++) {
        const x = (pc[i].x + 0.5) * c + ox, y = (pc[i].y + 0.5) * c + oy;
        len += Math.abs(x - x0) + Math.abs(y - y0);
        ctx.lineTo(x, y);
      }
      if (len > 0.01) ctx.stroke();
      else { ctx.beginPath(); ctx.arc(x0, y0, w / 2, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function snakeLook(s) {
    const own = s.p1 || s.twin;
    const base = s.p1 ? COLORS[settings.color].hex : s.twin ? mix(COLORS[settings.color].hex, '#ffffff', 0.35) : s.color;
    return { base, pattern: own ? settings.pattern : 'plain' };
  }

  function drawSnake(s, t, now) {
    const geo = snakeGeom(s, t), pieces = rangePieces(geo, geo.start, geo.end);
    if (!pieces.length) return;
    if (s.swing) {
      const k = 1 - (now - s.swing.at) / SWING_MS;
      if (k <= 0) s.swing = null;
      else {
        const h = pieces[0][0], e = k * k;
        pieces[0][0] = { x: h.x + s.swing.dx * e, y: h.y + s.swing.dy * e };
      }
    }
    s.vis = pieces[0][0];
    const c = cell, lw = c * 0.74, look = snakeLook(s), dead = !s.alive && now >= s.deadAt;
    let col = look.base;
    if (dead) {
      const since = now - s.deadAt;
      col = since < 800 && Math.floor(since / 100) % 2 === 0 ? mix(look.base, '#ffffff', 0.6) : mix(look.base, '#7d7d7d', 0.4);
    }
    const rainbow = (a) => `hsl(${Math.round((a * 32 + now / 18) % 360)}, 85%, 58%)`;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePieces(pieces, 'rgba(0,0,0,0.17)', lw, c * 0.04, c * 0.09);                // Schatten
    if (!dead && (look.pattern === 'stripes' || look.pattern === 'rainbow')) {
      strokePieces(pieces, look.pattern === 'rainbow' ? rainbow(0) : col, lw);   // durchgehender Körper
      ctx.lineCap = 'butt';                                                     // Musterstücke mit geraden Enden
      const n = Math.ceil(geo.end - geo.start - 1e-6);
      for (let a = n - 1; a >= 0; a--) {                                                 // vom Schwanz zum Kopf
        const u0 = geo.start + a, sc = look.pattern === 'rainbow' ? rainbow(a) : a % 2 ? mix(col, '#000000', 0.25) : col;
        const part = rangePieces(geo, u0, Math.min(geo.end, u0 + 1));
        if (a === 0 && s.swing && part.length) part[0][0] = pieces[0][0];
        ctx.lineCap = a === n - 1 ? 'round' : 'butt';                              // Schwanzende rund in eigener Farbe
        strokePieces(part, sc, lw);
      }
      ctx.lineCap = 'round';
    } else {
      strokePieces(pieces, col, lw);
    }
    if (!dead && look.pattern === 'dots') {
      ctx.fillStyle = mix(col, '#ffffff', 0.5);
      for (let a = 1; geo.start + a + 0.5 < geo.end; a++) {
        const p = samplePath(geo, geo.start + a + 0.5);
        if (!p) break;
        ctx.beginPath();
        ctx.arc((p.x + 0.5) * c, (p.y + 0.5) * c, lw * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    strokePieces(pieces, 'rgba(255,255,255,0.2)', lw * 0.3, -lw * 0.13, -lw * 0.15);   // Glanz
    const headCol = !dead && look.pattern === 'rainbow' ? rainbow(0) : col;
    drawHead(s, pieces[0][0], headCol, t, now);
  }

  function lookDir(s) {
    const h = s.body[0];
    let best = null, bd = Infinity;
    for (const a of G.apples) {
      const d = Math.abs(a.x - h.x) + Math.abs(a.y - h.y);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return h.d;
    const vx = best.x - h.x, vy = best.y - h.y, l = Math.hypot(vx, vy) || 1;
    return { x: vx / l, y: vy / l };
  }

  // Maul geht auf, wenn im nächsten Schritt ein Apfel kommt, und schließt sich beim Schlucken.
  function mouthOpen(s, t) {
    if (s.ate) return clamp(1 - t * 1.8, 0, 1);
    const g = G, h = s.body[0], d = s.queue[0] || s.dir;
    let x = h.x + d.x, y = h.y + d.y;
    const exit = portalExit(h.x, h.y);
    if (exit) { x = exit.x + d.x; y = exit.y + d.y; }
    if (g.mode.wrap) { x = wrapNum(x, g.cols); y = wrapNum(y, g.rows); }
    return g.apples.some((a) => a.x === x && a.y === y) ? clamp(t * 1.4, 0, 1) : 0;
  }

  function drawHead(s, p, col, t, now) {
    const c = cell, d = s.body[0].d;
    const cx = (p.x + 0.5) * c, cy = (p.y + 0.5) * c, r = c * 0.43;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const dead = !s.alive && now >= s.deadAt;
    const mouth = dead ? 0 : mouthOpen(s, t);
    if (mouth > 0.03) {
      const a = Math.atan2(d.y, d.x), m = mouth * 0.7;
      ctx.fillStyle = '#7a1f2e';
      ctx.beginPath();
      ctx.moveTo(cx + d.x * r * 0.15, cy + d.y * r * 0.15);
      ctx.arc(cx, cy, r * 0.92, a - m, a + m);
      ctx.closePath();
      ctx.fill();
    }
    drawEyes(s, cx, cy, d, c, col, dead, now);
    if (s.ai) {
      const blink = Math.floor(now / 400) % 2;
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = Math.max(1, c * 0.05);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.6);
      ctx.lineTo(cx + r * 0.15, cy - r * 1.25);
      ctx.stroke();
      ctx.fillStyle = blink ? '#ff1744' : '#ff8a80';
      ctx.beginPath();
      ctx.arc(cx + r * 0.15, cy - r * 1.3, c * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEyes(s, cx, cy, d, c, col, dead, now) {
    const px = -d.y, py = d.x, er = c * 0.135, pr = c * 0.07, look = lookDir(s);
    const blink = s.alive && now > s.blinkAt && now < s.blinkAt + 140;
    for (const side of [-1, 1]) {
      const ex = cx + px * side * c * 0.2 + d.x * c * 0.04;
      const ey = cy + py * side * c * 0.2 + d.y * c * 0.04;
      ctx.lineCap = 'round';
      if (dead) {
        const q = er * 0.75;
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = Math.max(1.5, c * 0.045);
        ctx.beginPath();
        ctx.moveTo(ex - q, ey - q); ctx.lineTo(ex + q, ey + q);
        ctx.moveTo(ex + q, ey - q); ctx.lineTo(ex - q, ey + q);
        ctx.stroke();
        continue;
      }
      if (blink) {
        ctx.strokeStyle = '#1f2a44';
        ctx.lineWidth = Math.max(1.2, c * 0.04);
        ctx.beginPath();
        ctx.moveTo(ex - d.x * er, ey - d.y * er);
        ctx.lineTo(ex + d.x * er, ey + d.y * er);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      const qx = ex + look.x * er * 0.42, qy = ey + look.y * er * 0.42;
      ctx.fillStyle = s.ai ? '#d50000' : '#1b1b1b';
      ctx.beginPath();
      ctx.arc(qx, qy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(qx - pr * 0.35, qy - pr * 0.35, pr * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFx(now) {
    const g = G, c = cell;
    g.particles = g.particles.filter((p) => now - p.born < p.life);
    for (const p of g.particles) {
      const ms = now - p.born;
      if (ms < 0) continue;
      const a = ms / 1000, k = 1 - ms / p.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc((p.x + p.vx * a) * c, (p.y + p.vy * a + 2.5 * a * a) * c, Math.max(0.5, p.r * c * (0.5 + 0.5 * k)), 0, Math.PI * 2);
      ctx.fill();
    }
    g.floaters = g.floaters.filter((f) => now - f.born < f.life);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(c * 0.55)}px Fredoka, system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    for (const f of g.floaters) {
      const ms = now - f.born;
      if (ms < 0) continue;
      const k = ms / f.life, x = f.x * c, y = (f.y - k * 0.9) * c;
      ctx.globalAlpha = 1 - k * k;
      ctx.lineWidth = Math.max(2, c * 0.1);
      ctx.strokeStyle = 'rgba(40,60,20,0.55)';
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawDarkness() {
    const g = G, c = cell;
    if (darkCanvas.width !== el.canvas.width || darkCanvas.height !== el.canvas.height) {
      darkCanvas.width = el.canvas.width;
      darkCanvas.height = el.canvas.height;
    }
    const d = darkCanvas.getContext('2d');
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, boardW, boardH);
    d.fillStyle = 'rgba(4, 7, 14, 0.94)';
    d.fillRect(0, 0, boardW, boardH);
    d.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      const gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.8})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr;
      d.beginPath();
      d.arc(x, y, r, 0, Math.PI * 2);
      d.fill();
    };
    for (const s of g.snakes) if (s.vis) hole((s.vis.x + 0.5) * c, (s.vis.y + 0.5) * c, c * 3.8, 1);
    for (const a of g.apples) hole(((a.vx ?? a.x) + 0.5) * c, ((a.vy ?? a.y) + 0.5) * c, c * 0.85, 0.55);
    d.globalCompositeOperation = 'source-over';
    ctx.drawImage(darkCanvas, 0, 0, boardW, boardH);
  }

  function makeAmbient(theme, cols, rows) {
    const r = seeded(cols * 31 + rows * 7), n = { night: 14, space: 26, lava: 16, snow: 22 }[theme] || 0;
    return Array.from({ length: n }, () => ({ x: r() * cols, y: r() * rows, p: r() * 10, s: 0.5 + r() }));
  }

  // Leben in der Welt: Glühwürmchen, Sterne, Funken, Schneeflocken
  function drawAmbient(now) {
    const g = G, th = settings.theme, c = cell, T = now / 1000;
    if (!g.ambient.length || reduceMotion) return;
    for (const a of g.ambient) {
      if (th === 'night') {
        const x = (a.x + Math.sin(T * 0.5 + a.p) * 1.2) * c, y = (a.y + Math.cos(T * 0.4 + a.p * 1.3) * 0.9) * c;
        const al = 0.35 + 0.35 * Math.sin(T * 2.5 + a.p);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, c * 0.35);
        gr.addColorStop(0, `rgba(230,255,140,${al})`);
        gr.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(x, y, c * 0.35, 0, Math.PI * 2); ctx.fill();
      } else if (th === 'space') {
        const al = 0.2 + 0.6 * Math.abs(Math.sin(T * 0.9 * a.s + a.p));
        ctx.fillStyle = `rgba(255,255,255,${al})`;
        ctx.beginPath(); ctx.arc(a.x * c, a.y * c, Math.max(0.7, c * 0.035 * a.s), 0, Math.PI * 2); ctx.fill();
      } else if (th === 'lava') {
        const y = wrapNum(a.y - T * a.s * 0.9, g.rows), x = a.x + Math.sin(T * 1.4 + a.p) * 0.3;
        const al = clamp(y / g.rows, 0, 1) * 0.8;
        ctx.fillStyle = `rgba(255,${120 + Math.round(80 * a.s)},40,${al})`;
        ctx.beginPath(); ctx.arc(x * c, y * c, Math.max(0.8, c * 0.05), 0, Math.PI * 2); ctx.fill();
      } else if (th === 'snow') {
        const y = wrapNum(a.y + T * a.s * 0.7, g.rows), x = a.x + Math.sin(T * 0.8 + a.p) * 0.4;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(x * c, y * c, Math.max(0.8, c * 0.045 * a.s), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* ---------- Anzeige: HUD, Hinweise, Overlays ---------- */
  function bump(node) {
    node.classList.remove('bump');
    void node.offsetWidth;
    node.classList.add('bump');
  }
  const show = (node, on) => node.classList.toggle('hidden', !on);

  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.remove('hidden', 'show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 1900);
  }

  function updateTime() {
    const g = G;
    if (g.level) { el.time.textContent = fmtTime(g.elapsed); return; }
    if (!g.mode.time) return;
    const s = Math.ceil(g.timeLeft / 1000);
    el.time.textContent = s;
    el.sTime.classList.toggle('warn', s <= 10 && g.state !== 'over');
  }

  function updateLive() {
    const g = G, L = g.live;
    if (g.level) {
      const txt = fmtTime(g.elapsed);
      if (txt !== L.t) { L.t = txt; el.time.textContent = txt; }
    }
    if (g.mode.hunger) {
      const f = clamp(g.hunger / HUNGER_MS, 0, 1), w = Math.round(f * 100);
      if (w !== L.h) { L.h = w; el.hungerBar.firstElementChild.style.width = w + '%'; el.hungerBar.classList.toggle('low', f < 0.34); }
    }
    if (g.zone) {
      const s = g.zone.next === Infinity ? '–' : String(Math.max(0, Math.ceil(g.zone.next / 1000)));
      if (s !== L.z) { L.z = s; el.zone.textContent = s; el.sZone.classList.toggle('warn', s !== '–' && +s <= 3); }
    }
    if (g.chaos) {
      const fx = g.chaos.fx, txt = fx ? fx.name.replace(/!$/, '') + ' · ' + Math.max(0, Math.ceil(g.chaos.left / 1000)) + ' s' : '';
      if (txt !== L.fx) { L.fx = txt; el.sFx.textContent = txt; show(el.sFx, !!fx); }
    }
  }

  function updateHud() {
    const g = G;
    if (!g) return;
    const m = g.mode, versus = !!m.versus, park = !!g.level;
    show(el.sScore, !versus && !park);
    show(el.sBest, !versus && !park);
    show(el.sP1, versus);
    show(el.sP2, versus);
    show(el.sTime, !!m.time || park);
    show(el.sStars, park);
    show(el.sDeaths, park);
    show(el.sHunger, !!m.hunger);
    show(el.sZone, !!m.zone);
    show(el.sFx, !!(g.chaos && g.chaos.fx));
    if (versus) {
      const [a, b] = g.snakes;
      el.p1.textContent = a.score; el.p1dot.style.background = snakeLook(a).base;
      el.p2.textContent = b.score; el.p2dot.style.background = b.color;
    } else if (!park) {
      el.score.textContent = scoreOf();
      el.best.textContent = g.best;
    }
    if (park) {
      el.stars.textContent = g.starsGot + '/' + g.starsTotal;
      el.deaths.textContent = g.deaths;
      el.sTime.title = 'Zeit';
    } else {
      el.sTime.title = 'Restzeit';
    }
    el.modeLabel.textContent = park ? `${TIERS[g.level.tier].name} · ${g.level.name}` : m.name;
    updateTime();
    const paused = g.state === 'pause';
    el.btnPause.innerHTML = paused ? ICON.play : ICON.pause;
    el.btnPause.setAttribute('aria-label', paused ? 'Weiter' : 'Pause');
  }

  function controlsHint() {
    if (isTouch) return 'Wische oder tippe auf die Pfeile zum Starten';
    return '<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> oder <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> zum Starten';
  }

  function showHint(again) {
    const g = G, m = g.mode;
    let title, desc, ctrl = controlsHint();
    if (g.level) {
      title = g.level.name;
      desc = again ? 'Weiter geht’s – drück eine Richtung!' : `${TIERS[g.level.tier].name} · Lenk dich bis zur Zielflagge und sammle alle Sterne`;
      if (again && !isTouch) ctrl = 'Pfeiltasten oder WASD';
    } else {
      title = m.name;
      desc = m.desc;
      if (m.ai) desc += ` (KI: ${AI_LEVELS[settings.ai].name})`;
      if (m.duo) {
        const [a, b] = g.snakes;
        ctrl = `<i class="dot" style="background:${snakeLook(a).base}"></i> ${a.name}: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
          &nbsp; <i class="dot" style="background:${b.color}"></i> ${b.name}: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd>`;
      }
    }
    el.hint.innerHTML = `<div class="ht">${title}</div><div class="hd">${desc}</div><div>${ctrl}</div>`;
    el.hint.classList.remove('hidden');
  }

  function showOverlay(html) {
    el.overlay.innerHTML = `<div class="card">${html}</div>`;
    el.overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    el.overlay.classList.add('hidden');
    el.overlay.innerHTML = '';
  }

  function showPause() {
    const g = G, title = g.level ? g.level.name : g.mode.name;
    showOverlay(`<h2>Pause</h2><div class="sub">${title}</div>
      <div class="btns">
        <button class="btn primary" type="button" data-act="resume">▶ Weiter</button>
        <button class="btn" type="button" data-act="restart">↻ ${g.level ? 'Level neu' : 'Neustart'}</button>
        <button class="btn" type="button" data-act="menu">☰ Menü</button>
      </div>
      ${isTouch ? '' : '<div class="keys-hint">Leertaste oder Esc = Weiter · R = Neustart</div>'}`);
  }

  function showGameOver() {
    const g = G, m = g.mode;
    let html;
    if (m.versus) {
      const [a, b] = g.snakes;
      let w = a.alive && !b.alive ? a : b.alive && !a.alive ? b : null;
      if (!w && g.result === 'win' && a.score !== b.score) w = a.score > b.score ? a : b;
      const ca = snakeLook(a).base, cb = b.color, tally = wins[m.id];
      const title = !w ? 'Unentschieden!' : m.ai ? (w === a ? 'Du gewinnst!' : 'Die KI gewinnt!')
        : `<i class="dot" style="background:${w === a ? ca : cb}"></i> ${w.name} gewinnt!`;
      html = `<h2>${title}</h2>
        <div class="scores">
          <div><i class="dot" style="background:${ca}"></i>${a.score}</div>
          <div><i class="dot" style="background:${cb}"></i>${b.score}</div>
        </div>
        <div class="sub" style="margin-top:10px">Siege: ${a.name} ${tally[0]} : ${tally[1]} ${b.name}</div>`;
    } else {
      const title = { win: 'Gewonnen!', time: 'Zeit um!', poison: 'Vergiftet!', zone: 'Verbrannt!', hunger: 'Verhungert!', saw: 'Zersägt!' }[g.result] || 'Game Over';
      const total = scoreOf(), record = total > g.prevBest && total > 0;
      html = `<h2>${title}</h2>
        <div class="scores"><div>${ICON.apple}${total}</div><div>${ICON.trophy}${g.best}</div></div>
        ${record ? '<div class="badge">Neuer Rekord!</div>' : ''}`;
    }
    html += `<div class="btns">
        <button class="btn primary" type="button" data-act="restart">↻ Nochmal</button>
        <button class="btn" type="button" data-act="menu">☰ Menü</button>
      </div>
      ${isTouch ? '' : '<div class="keys-hint">Leertaste = Nochmal · Esc = Menü</div>'}`;
    showOverlay(html);
  }

  function showLevelDone() {
    const g = G, lv = g.level, next = g.levelIndex + 1 < LEVELS.length;
    const stars = Array.from({ length: g.starsTotal }, (_, i) => (i < g.starsGot ? '<b>★</b>' : '☆')).join('');
    const best = store.get('park', {})[lv.id];
    let note = '';
    if (g.record) note = '<div class="badge">Neue Bestzeit!</div>';
    else if (g.oldBest === null) note = '<div class="badge">Level geschafft!</div>';
    else if (best) note = `<div class="sub" style="margin-top:6px">Bestzeit: ${fmtTime(best.t)} s</div>`;
    showOverlay(`<h2>Geschafft!</h2><div class="sub">${TIERS[lv.tier].name} · ${lv.name}</div>
      <div class="bigstars">${stars}</div>
      <div class="scores"><div>${fmtTime(g.elapsed)} s</div><div>${g.deaths} ${g.deaths === 1 ? 'Crash' : 'Crashs'}</div></div>
      ${note}
      <div class="btns">
        ${next ? '<button class="btn primary" type="button" data-act="next">▶ Nächstes Level</button>' : ''}
        <button class="btn${next ? '' : ' primary'}" type="button" data-act="restart">↻ Nochmal</button>
        <button class="btn" type="button" data-act="levels">☰ Levels</button>
      </div>
      ${isTouch ? '' : `<div class="keys-hint">Leertaste = ${next ? 'Nächstes Level' : 'Nochmal'} · R = Nochmal · Esc = Levels</div>`}`);
  }

  function pause() {
    if (G.state !== 'play') return;
    G.state = 'pause';
    showPause();
    updateHud();
  }
  function resume() {
    if (G.state !== 'pause') return;
    G.state = 'play';
    hideOverlay();
    updateHud();
  }
  function restart() {
    if (G.level) newParkour(G.levelIndex);
    else newGame();
  }
  function nextLevel() {
    if (G.level && G.levelIndex + 1 < LEVELS.length) newParkour(G.levelIndex + 1);
    else openMenu('parkour');
  }

  /* ---------- Menü ---------- */
  function parkStats() {
    const rec = store.get('park', {});
    let got = 0, total = 0;
    const tiers = TIERS.map(() => ({ got: 0, total: 0 }));
    LEVELS.forEach((lv) => {
      const n = (lv.map.join('').match(/\*/g) || []).length + (lv.stars ? lv.stars.length : 0), s = rec[lv.id] ? rec[lv.id].s : 0;
      got += s; total += n;
      tiers[lv.tier].got += s; tiers[lv.tier].total += n;
    });
    return { rec, got, total, tiers };
  }

  function buildMenu() {
    el.modes.innerHTML = MODES.map((m) => `<button type="button" class="mode" data-mode="${m.id}">
        <span class="mi">${m.icon}</span><span class="mn">${m.name}</span><span class="mb"></span>${m.fresh ? '<span class="new">NEU</span>' : ''}</button>`).join('');
    el.tiers.innerHTML = TIERS.map((t, i) => `<button type="button" data-tier="${i}"><i class="td" style="background:${t.color}"></i>${t.name} <small></small></button>`).join('');
    el.themes.innerHTML = Object.entries(THEMES).map(([k, t]) =>
      `<button type="button" data-theme="${k}"><i class="tw" style="background:linear-gradient(135deg, ${t.grass[0]} 50%, ${t.frame} 50%)"></i>${t.name}</button>`).join('');
    el.maps.innerHTML = Object.entries(MAPS).map(([k, mp]) => `<button type="button" data-map="${k}">${mp.name}</button>`).join('');
    el.swatches.innerHTML = Object.entries(COLORS).map(([k, c]) =>
      `<button type="button" class="sw" data-color="${k}" style="background:${c.hex}" title="${c.name}" aria-label="${c.name}"></button>`).join('');
  }

  function renderLevels() {
    const { rec } = parkStats();
    el.levels.innerHTML = LEVELS.map((lv, i) => {
      if (lv.tier !== settings.tier) return '';
      const n = (lv.map.join('').match(/\*/g) || []).length + (lv.stars ? lv.stars.length : 0), r = rec[lv.id];
      const stars = Array.from({ length: n }, (_, k) => (r && k < r.s ? '<b>★</b>' : '★')).join('');
      const num = LEVELS.filter((l, j) => l.tier === lv.tier && j <= i).length;
      return `<button type="button" class="lvl${r ? ' done' : ''}${i === settings.level ? ' on' : ''}" data-level="${i}">
          <span class="ln" style="background:${TIERS[lv.tier].color}">${num}</span>
          <span class="lt">${lv.name}</span><span class="ls">${stars}</span>
          <span class="lb">${r ? fmtTime(r.t) + ' s' : 'noch offen'}</span></button>`;
    }).join('');
  }

  function syncMenu() {
    const st = parkStats();
    el.modes.querySelectorAll('.mode').forEach((b) => {
      const m = MODES.find((x) => x.id === b.dataset.mode);
      b.classList.toggle('on', m.id === settings.mode);
      b.querySelector('.mb').textContent = m.duo ? 'Tastatur' : m.ai ? 'vs. Computer' : 'Rekord ' + store.get('best.' + m.id, 0);
    });
    const mode = MODES.find((m) => m.id === settings.mode);
    el.modeDesc.textContent = mode.desc;
    const th = THEMES[settings.theme], mp = MAPS[settings.map];
    el.summary.innerHTML = `Welt <b>${th.name}</b> · Karte <b>${mp.name}</b> · Feld <b>${SIZE_NAMES[settings.size]}</b> · Tempo <b>${SPEED_NAMES[settings.speed]}</b> · ändern`;
    document.querySelectorAll('.seg[data-setting]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(settings[seg.dataset.setting]) === b.dataset.v));
    });
    el.tiers.querySelectorAll('button').forEach((b) => {
      const i = +b.dataset.tier, t = st.tiers[i];
      b.classList.toggle('on', i === settings.tier);
      b.querySelector('small').textContent = `★${t.got}/${t.total}`;
    });
    renderLevels();
    el.pkTotal.innerHTML = `Gesammelt: <b>★ ${st.got}</b> von ${st.total} Sternen · ${Object.keys(st.rec).length} von ${LEVELS.length} Leveln geschafft`;
    el.themes.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.theme === settings.theme));
    el.maps.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.map === settings.map));
    el.swatches.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.color === settings.color));
    el.close.classList.toggle('hidden', !started);
    setTab(settings.tab);
  }

  function setTab(tab) {
    settings.tab = tab;
    el.tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll('.pane').forEach((p) => show(p, p.dataset.pane === tab));
    show(el.play, tab !== 'parkour');
    el.help.textContent = tab === 'parkour'
      ? (isTouch ? 'Tippe auf ein Level, um zu starten.' : 'Klick auf ein Level oder drück Enter für das markierte Level.')
      : isTouch ? 'Wischen oder die Pfeile unter dem Spielfeld tippen'
        : 'Pfeiltasten / WASD lenken · Leertaste = Pause · M = Ton an/aus · Enter = Spielen';
  }

  function openMenu(tab) {
    if (G && G.state === 'play') G.state = 'pause';
    hideOverlay();
    if (tab) settings.tab = tab;
    syncMenu();
    el.menu.classList.remove('hidden');
  }
  function closeMenu() {
    el.menu.classList.add('hidden');
    grabKeys();
    if (G.state === 'pause') showPause();
    else if (G.state === 'over') { if (G.result === 'goal') showLevelDone(); else showGameOver(); }
    updateHud();
  }
  function startFromMenu() {
    started = true;
    grabKeys();
    saveSettings();
    el.menu.classList.add('hidden');
    if (settings.tab === 'parkour') newParkour(settings.level);
    else newGame();
  }

  function toggleSound() {
    Sound.on = !Sound.on;
    store.set('sound', Sound.on);
    el.btnSound.innerHTML = Sound.on ? ICON.soundOn : ICON.soundOff;
    if (Sound.on) { Sound.init(); Sound.tone(660, 0.08, 'triangle', 0.06); }
  }

  /* ---------- Eingaben ---------- */
  window.addEventListener('keydown', (e) => {
    Sound.init();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = (KEYS[e.code] || ['Space', 'Enter', 'NumpadEnter', 'Escape', 'KeyP', 'KeyM', 'KeyR'].includes(e.code) ? e.code : '')
      || KEY_NAMES[e.key] || KEY_NAMES[(e.key || '').toLowerCase()] || KEY_NUMS[e.keyCode || e.which] || '';
    if (code) lastKeydown = performance.now();
    const g = G;
    if (!el.menu.classList.contains('hidden')) {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { e.preventDefault(); startFromMenu(); }
      else if (code === 'Escape' && started) { e.preventDefault(); closeMenu(); }
      return;
    }
    const k = KEYS[code];
    if (k) {
      e.preventDefault();
      input(g.mode.duo ? k[0] : 0, DIRS[k[1]]);
      return;
    }
    switch (code) {
      case 'Space': case 'Enter': case 'NumpadEnter':
        e.preventDefault();
        if (g.state === 'ready') begin();
        else if (g.state === 'play') { if (code === 'Space') pause(); }
        else if (g.state === 'pause') resume();
        else if (g.state === 'over' && performance.now() - g.overAt > 600) { if (g.result === 'goal') nextLevel(); else restart(); }
        break;
      case 'KeyR':
        if (g.state === 'pause' || g.state === 'over' || (g.level && g.state !== 'dead')) { e.preventDefault(); restart(); }
        break;
      case 'KeyP': case 'Escape':
        e.preventDefault();
        if (g.state === 'play') pause();
        else if (g.state === 'pause') resume();
        else if (g.state === 'over' && code === 'Escape') openMenu(g.level ? 'parkour' : null);
        break;
      case 'KeyM':
        toggleSound();
        break;
    }
  }, true);

  // Wischen auf dem Spielbereich
  let swipe = null;
  el.app.addEventListener('touchstart', (e) => {
    Sound.init();
    if (e.target.closest('button') || e.touches.length !== 1) { swipe = null; return; }
    swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  }, { passive: true });
  el.app.addEventListener('touchmove', (e) => {
    if (!swipe) return;
    e.preventDefault();
    const tp = e.touches[0], dx = tp.clientX - swipe.x, dy = tp.clientY - swipe.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
    input(0, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIRS.right : DIRS.left) : (dy > 0 ? DIRS.down : DIRS.up));
    swipe = { x: tp.clientX, y: tp.clientY, moved: true };
  }, { passive: false });
  el.app.addEventListener('touchend', () => {
    if (swipe && !swipe.moved && G.state === 'ready') begin();
    swipe = null;
  });

  document.querySelectorAll('#dpad button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.init();
      input(0, DIRS[b.dataset.dir]);
    });
  });

  el.canvas.addEventListener('click', () => { if (G.state === 'ready') begin(); });
  el.overlay.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = { resume, restart, next: nextLevel, menu: () => openMenu(G.level ? 'parkour' : null), levels: () => openMenu('parkour') }[b.dataset.act];
    if (act) act();
  });
  el.btnPause.addEventListener('click', () => {
    if (G.state === 'play') pause();
    else if (G.state === 'pause') resume();
    else if (G.state === 'ready') begin();
  });
  el.btnSound.addEventListener('click', toggleSound);
  el.btnMenu.addEventListener('click', () => openMenu(G.level ? 'parkour' : null));

  el.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    setTab(b.dataset.tab);
    saveSettings();
  });
  el.modes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    settings.mode = b.dataset.mode;
    saveSettings();
    syncMenu();
  });
  el.modes.addEventListener('dblclick', (e) => { if (e.target.closest('[data-mode]')) startFromMenu(); });
  el.summary.addEventListener('click', () => { setTab('settings'); saveSettings(); });
  el.tiers.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    settings.tier = +b.dataset.tier;
    const first = LEVELS.findIndex((lv) => lv.tier === settings.tier);
    if (LEVELS[settings.level].tier !== settings.tier && first >= 0) settings.level = first;
    saveSettings();
    syncMenu();
  });
  el.levels.addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]');
    if (!b) return;
    settings.level = +b.dataset.level;
    settings.tab = 'parkour';
    startFromMenu();
  });
  document.querySelectorAll('.seg[data-setting]').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const k = seg.dataset.setting;
    settings[k] = k === 'apples' ? Number(b.dataset.v) : k === 'keydebug' ? b.dataset.v === 'true' : b.dataset.v;
    saveSettings();
    syncMenu();
  }));
  el.themes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    settings.theme = b.dataset.theme;
    saveSettings();
    syncMenu();
    if (G) { G.ambient = makeAmbient(settings.theme, G.cols, G.rows); applyTheme(); renderBackground(); }
  });
  el.maps.addEventListener('click', (e) => {
    const b = e.target.closest('[data-map]');
    if (!b) return;
    settings.map = b.dataset.map;
    saveSettings();
    syncMenu();
  });
  el.swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    settings.color = b.dataset.color;
    saveSettings();
    syncMenu();
  });
  document.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', () => {
    const what = b.dataset.reset;
    if (what === 'keys') {
      resetControls();
      const old = b.textContent;
      b.textContent = '✓ Steuerung zurückgesetzt';
      b.classList.add('ok');
      setTimeout(() => { b.textContent = old; b.classList.remove('ok'); if (started) closeMenu(); else startFromMenu(); }, 700);
      return;
    }
    const ask = { settings: 'Alle Einstellungen auf Standard zurücksetzen?', best: 'Alle Rekorde löschen?',
      park: 'Alle Parkour-Sterne und Bestzeiten löschen?', all: 'Wirklich alles zurücksetzen (Einstellungen, Rekorde und Parkour)?' }[what];
    if (!confirm(ask)) return;
    const keep = settings.tab;
    if (what === 'settings' || what === 'all') { Object.assign(settings, DEFAULTS, { tab: keep }); saveSettings(); }
    if (what === 'best' || what === 'all') MODES.forEach((m) => { try { localStorage.removeItem('snake.best.' + m.id); } catch (e) {} });
    if (what === 'park' || what === 'all') { try { localStorage.removeItem('snake.park'); } catch (e) {} }
    if (G) { G.ambient = makeAmbient(settings.theme, G.cols, G.rows); G.best = G.prevBest = store.get('best.' + G.mode.id, 0); applyTheme(); renderBackground(); updateHud(); }
    syncMenu();
    const old = b.textContent;
    b.textContent = '✓ Erledigt';
    setTimeout(() => { b.textContent = old; }, 1200);
  }));
  // Steuerung neu starten: Fokus zurück aufs Spiel, hängende Eingaben verwerfen
  function resetControls() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.focus();
    grabKeys();
    swipe = null;
    if (G) G.snakes.forEach((s) => { s.queue.length = 0; });
    if (G && G.fx.invert) { delete G.fx.invert; if (G.chaos) G.chaos.fx = null; }
  }
  window.addEventListener('focus', () => { swipe = null; });
  el.play.addEventListener('click', startFromMenu);
  el.close.addEventListener('click', closeMenu);

  // Fokus nach Mausklick wieder abgeben, damit Leertaste/Enter nicht den Button erneut auslösen
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });
  // Tastatur-Fokus nach jedem Tippen/Klicken zurück aufs Spiel. Safari leitet in Homebildschirm-Apps
  // Tasten einer angeschlossenen Tastatur nur an ein Eingabefeld weiter – dafür gibt es ein unsichtbares.
  const keytrap = $('#keytrap');
  const grabKeys = () => { try { keytrap.focus({ preventScroll: true }); } catch (e) { keytrap.focus(); } };
  // Ausweichweg: Manche Geräte liefern Buchstaben nur als Texteingabe statt als Tastendruck
  const TEXT_DIRS = { w: 'up', a: 'left', s: 'down', d: 'right' };
  keytrap.addEventListener('input', (e) => {
    const ch = (e.data || keytrap.value || '').slice(-1).toLowerCase();
    keytrap.value = '';
    showKeyTest('Texteingabe „' + ch + '“');
    if (performance.now() - lastKeydown < 80 || !TEXT_DIRS[ch] || !G) return;
    if (el.menu.classList.contains('hidden')) input(0, DIRS[TEXT_DIRS[ch]]);
  });
  function showKeyTest(what) {
    const a = document.activeElement, f = a === keytrap ? 'Auffangfeld' : a === document.body ? 'Seite' : (a && (a.id || a.tagName)) || '–';
    $('#keytest').textContent = `Zuletzt: ${what} · Fokus: ${f} · Fenster aktiv: ${document.hasFocus() ? 'ja' : 'nein'}`;
    if (settings.keydebug) { el.toast.textContent = what + ' · Spiel: ' + (G ? G.state : '–'); el.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2500); }
  }
  window.addEventListener('keydown', (e) => showKeyTest(`Taste ${e.key} · Code ${e.code || '–'} · Nr. ${e.keyCode}`), true);
  document.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (el.menu.classList.contains('hidden') && !e.target.closest('button')) grabKeys();
  });
  document.addEventListener('click', (e) => {
    if (el.menu.classList.contains('hidden') && !e.target.closest('#overlay button')) grabKeys();
  });
  document.addEventListener('pointerup', () => {
    if (el.menu.classList.contains('hidden') && document.activeElement !== keytrap) grabKeys();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && G.state === 'play') pause(); });
  window.addEventListener('resize', layout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

  /* ---------- Start ---------- */
  document.body.classList.toggle('touch', isTouch);
  document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = ICON[n.dataset.icon]; });
  el.btnSound.innerHTML = Sound.on ? ICON.soundOn : ICON.soundOff;
  buildMenu();
  newGame();
  openMenu();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(100, Math.max(0, now - last));
    last = now;
    update(dt, now);
    render(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
