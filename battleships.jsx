// Naval Warfare: Battleships
// TypeScript-style React app (JSX with full type annotations in comments)
// Uses Artifact Storage API for persistence, Web Audio for cannon sound, PeerJS for P2P multiplayer

import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/*
type Screen = 'auth' | 'lobby' | 'setup' | 'game' | 'scoreboard' | 'result'
type GameMode = 'solo' | 'multi' | null
type AIDifficulty = 'easy' | 'medium' | 'hard'
type Nation = 'usa' | 'russia' | 'china'
type Orientation = 'H' | 'V'

interface Cell { ship: string | null; hit: boolean }
interface EnemyCell { hit: boolean; miss: boolean; sunk: boolean }
interface PlacedShip { id: string; cells: {r:number,c:number}[]; sunk: boolean; name: string; emoji: string; size: number }
interface ShipConfig { name: string; size: number; emoji: string; count: number }
interface User { username: string; passwordHash: string; createdAt: number }
interface UserStats { username: string; wins: number; losses: number; totalShots: number; totalHits: number; gamesPlayed: number; winStreak: number; bestStreak: number; dailyWins: { [date: string]: number } }
interface GlobalLeaderEntry { username: string; dailyWins: number; totalWins: number; date: string }
*/

// ═══════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════

const NATIONS = {
  usa:    { name: 'U.S. NAVY',    flag: '🇺🇸', color: '#3c5a8a', accent: '#4a90d9' },
  russia: { name: 'RUSSIAN NAVY', flag: '🇷🇺', color: '#8a2222', accent: '#d94a4a' },
  china:  { name: 'PLAN CHINA',   flag: '🇨🇳', color: '#8a3a00', accent: '#d97a00' },
};
const AI_NATIONS = ['russia','china','usa'];

const SHIP_CONFIGS = {
  5:  [{ name:'Destroyer',   size:2, emoji:'🚢', count:1 },{ name:'Cruiser',     size:3, emoji:'⚓', count:1 },{ name:'Battleship',  size:4, emoji:'🛳', count:1 }],
  10: [{ name:'Patrol',      size:2, emoji:'🚤', count:1 },{ name:'Destroyer',   size:2, emoji:'🚢', count:1 },{ name:'Submarine',   size:3, emoji:'🐋', count:1 },
       { name:'Cruiser',     size:3, emoji:'⚓', count:1 },{ name:'Battleship',  size:4, emoji:'🛳', count:1 },{ name:'Carrier',     size:5, emoji:'✈', count:1 }],
  15: [{ name:'Patrol',      size:2, emoji:'🚤', count:2 },{ name:'Destroyer',   size:2, emoji:'🚢', count:2 },{ name:'Submarine',   size:3, emoji:'🐋', count:1 },
       { name:'Cruiser',     size:3, emoji:'⚓', count:1 },{ name:'Frigate',     size:3, emoji:'⚔', count:1 },{ name:'Battleship',  size:4, emoji:'🛳', count:1 },
       { name:'Carrier',     size:5, emoji:'✈', count:1 },{ name:'Supercarrier',size:6, emoji:'🛸', count:1 }],
};

const ACHIEVEMENTS = [
  { id:'first_win',   icon:'🏆', title:'First Blood',       desc:'Win your first battle',                  check: (s) => s.wins >= 1 },
  { id:'five_wins',   icon:'⭐', title:'Naval Veteran',      desc:'Win 5 battles',                          check: (s) => s.wins >= 5 },
  { id:'ten_wins',    icon:'🌟', title:'Fleet Admiral',      desc:'Win 10 battles',                         check: (s) => s.wins >= 10 },
  { id:'sharpshooter',icon:'🎯', title:'Sharpshooter',       desc:'Achieve 70%+ accuracy in a game',        check: (s) => s.bestAccuracy >= 70 },
  { id:'perfect',     icon:'💎', title:'Perfect Aim',        desc:'Achieve 90%+ accuracy in a game',        check: (s) => s.bestAccuracy >= 90 },
  { id:'streak3',     icon:'🔥', title:'On Fire',            desc:'Win 3 battles in a row',                 check: (s) => s.bestStreak >= 3 },
  { id:'streak5',     icon:'⚡', title:'Unstoppable',        desc:'Win 5 battles in a row',                 check: (s) => s.bestStreak >= 5 },
  { id:'played10',    icon:'🚢', title:'Sea Dog',            desc:'Play 10 games',                          check: (s) => s.gamesPlayed >= 10 },
  { id:'admiral',     icon:'👑', title:'The Admiral',        desc:'Beat the Admiral AI difficulty',         check: (s) => s.beatenAdmiral >= 1 },
];

// ═══════════════════════════════════════════════════════════
// AUDIO ENGINE — Web Audio API cannon synthesis
// ═══════════════════════════════════════════════════════════

const createAudioEngine = () => {
  let ctx = null;
  const getCtx = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  };

  const playCannonShot = () => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;

      // Low thud — body of cannon
      const osc1 = ac.createOscillator();
      const gain1 = ac.createGain();
      osc1.connect(gain1); gain1.connect(ac.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, t);
      osc1.frequency.exponentialRampToValueAtTime(20, t + 0.4);
      gain1.gain.setValueAtTime(1.2, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc1.start(t); osc1.stop(t + 0.5);

      // Noise burst — the "crack"
      const bufLen = ac.sampleRate * 0.3;
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ac.createGain();
      const noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 300;
      noiseFilter.Q.value = 0.5;
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ac.destination);
      noiseGain.gain.setValueAtTime(0.8, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      noise.start(t); noise.stop(t + 0.3);

      // High crack
      const osc2 = ac.createOscillator();
      const gain2 = ac.createGain();
      osc2.connect(gain2); gain2.connect(ac.destination);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(200, t);
      osc2.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      gain2.gain.setValueAtTime(0.6, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc2.start(t); osc2.stop(t + 0.2);
    } catch (e) { /* Audio not available */ }
  };

  const playExplosion = () => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      // Deep explosion rumble
      for (let i = 0; i < 3; i++) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain); gain.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60 - i * 15, t + i * 0.05);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.8);
        gain.gain.setValueAtTime(0.6 - i * 0.1, t + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.start(t + i * 0.05); osc.stop(t + 1.0);
      }
    } catch(e) {}
  };

  const playSplash = () => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      const bufLen = ac.sampleRate * 0.4;
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass'; filter.frequency.value = 800;
      const gain = ac.createGain();
      noise.connect(filter); filter.connect(gain); gain.connect(ac.destination);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      noise.start(t); noise.stop(t + 0.5);
    } catch(e) {}
  };

  return { playCannonShot, playExplosion, playSplash };
};

const audio = createAudioEngine();

// ═══════════════════════════════════════════════════════════
// STORAGE HELPERS
// ═══════════════════════════════════════════════════════════

const simpleHash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
  return h.toString(16);
};

const todayKey = () => new Date().toISOString().slice(0, 10);

// ═══════════════════════════════════════════════════════════
// GAME LOGIC HELPERS
// ═══════════════════════════════════════════════════════════

const colName = (c) => String.fromCharCode(65 + c);

const makeBoard = (size) => Array(size).fill(null).map(() => Array(size).fill(null).map(() => ({ ship: null, hit: false })));
const makeEnemyBoard = (size) => Array(size).fill(null).map(() => Array(size).fill(null).map(() => ({ hit: false, miss: false, sunk: false })));

const getCells = (r, c, size, orient) => {
  const cells = [];
  for (let i = 0; i < size; i++) cells.push(orient === 'H' ? { r, c: c + i } : { r: r + i, c });
  return cells;
};

const isValidPlacement = (cells, board, boardSize) =>
  cells.every(({ r, c }) => r >= 0 && r < boardSize && c >= 0 && c < boardSize && board[r][c].ship === null);

const autoPlaceShips = (shipList, boardSize) => {
  const board = makeBoard(boardSize);
  const placed = [];
  const updated = shipList.map(s => ({ ...s }));
  for (const ship of updated) {
    let ok = false, tries = 0;
    while (!ok && tries++ < 1000) {
      const orient = Math.random() < 0.5 ? 'H' : 'V';
      const r = Math.floor(Math.random() * boardSize);
      const c = Math.floor(Math.random() * boardSize);
      const cells = getCells(r, c, ship.size, orient);
      if (isValidPlacement(cells, board, boardSize)) {
        ship.placed = true; ship.cells = cells;
        cells.forEach(({ r, c }) => board[r][c].ship = ship.id);
        placed.push({ id: ship.id, cells, sunk: false, name: ship.name, emoji: ship.emoji, size: ship.size });
        ok = true;
      }
    }
  }
  return { board, placed, shipList: updated };
};

const buildShipList = (boardSize) => {
  const configs = SHIP_CONFIGS[boardSize];
  const list = [];
  configs.forEach((cfg, ci) => {
    for (let k = 0; k < cfg.count; k++) list.push({ ...cfg, id: `${ci}_${k}`, placed: false, cells: null });
  });
  return list;
};

// ═══════════════════════════════════════════════════════════
// AI ENGINE
// ═══════════════════════════════════════════════════════════

const createAI = (difficulty, boardSize) => {
  const state = {
    difficulty,
    boardSize,
    hitStack: [],
    direction: null,
    board: null,
    ships: null,
  };

  const init = () => {
    const { board, placed } = autoPlaceShips(buildShipList(boardSize), boardSize);
    state.board = board;
    state.ships = placed;
    state.hitStack = []; state.direction = null;
  };

  const alreadyShot = (r, c, myBoard) => myBoard[r][c].hit;

  const randomUnshot = (myBoard) => {
    const cells = [];
    for (let r = 0; r < boardSize; r++)
      for (let c = 0; c < boardSize; c++)
        if (!alreadyShot(r, c, myBoard)) cells.push({ r, c });
    return cells[Math.floor(Math.random() * cells.length)];
  };

  const probabilityShot = (myBoard, placedShips) => {
    const prob = Array(boardSize).fill(null).map(() => Array(boardSize).fill(0));
    const alive = placedShips.filter(s => !s.sunk);
    const sizes = [...new Set(alive.map(s => s.size))];
    for (const sz of sizes) {
      for (let r = 0; r < boardSize; r++)
        for (let c = 0; c <= boardSize - sz; c++) {
          let valid = true;
          for (let i = 0; i < sz; i++) if (myBoard[r][c+i].hit && myBoard[r][c+i].ship === null) { valid = false; break; }
          if (valid) for (let i = 0; i < sz; i++) prob[r][c+i]++;
        }
      for (let r = 0; r <= boardSize - sz; r++)
        for (let c = 0; c < boardSize; c++) {
          let valid = true;
          for (let i = 0; i < sz; i++) if (myBoard[r+i][c].hit && myBoard[r+i][c].ship === null) { valid = false; break; }
          if (valid) for (let i = 0; i < sz; i++) prob[r+i][c]++;
        }
    }
    for (let r = 0; r < boardSize; r++) for (let c = 0; c < boardSize; c++) if (alreadyShot(r, c, myBoard)) prob[r][c] = 0;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    state.hitStack.forEach(h => dirs.forEach(([dr,dc]) => {
      const nr = h.r+dr, nc = h.c+dc;
      if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, myBoard)) prob[nr][nc] += 50;
    }));
    let best = -1, bests = [];
    for (let r = 0; r < boardSize; r++) for (let c = 0; c < boardSize; c++) {
      if (prob[r][c] > best) { best = prob[r][c]; bests = []; }
      if (prob[r][c] === best) bests.push({ r, c });
    }
    return bests.length ? bests[Math.floor(Math.random() * bests.length)] : randomUnshot(myBoard);
  };

  const chooseShot = (myBoard, placedShips) => {
    if (state.difficulty === 'easy') return randomUnshot(myBoard);
    if (state.difficulty === 'hard') return probabilityShot(myBoard, placedShips);
    // medium: hunt & target
    if (state.hitStack.length > 0) {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
      const hit = state.hitStack[state.hitStack.length - 1];
      if (state.direction) {
        const [dr, dc] = state.direction;
        const nr = hit.r + dr, nc = hit.c + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, myBoard)) return { r: nr, c: nc };
        const first = state.hitStack[0];
        const nr2 = first.r - dr, nc2 = first.c - dc;
        if (nr2 >= 0 && nr2 < boardSize && nc2 >= 0 && nc2 < boardSize && !alreadyShot(nr2, nc2, myBoard)) return { r: nr2, c: nc2 };
        state.direction = null;
      }
      for (let i = state.hitStack.length - 1; i >= 0; i--) {
        const h = state.hitStack[i];
        for (const [dr,dc] of dirs) {
          const nr = h.r+dr, nc = h.c+dc;
          if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, myBoard)) return { r: nr, c: nc };
        }
      }
    }
    return randomUnshot(myBoard);
  };

  const registerHit = (r, c, shipSunk) => {
    if (shipSunk) {
      state.hitStack = []; state.direction = null;
    } else {
      if (state.hitStack.length > 0 && !state.direction) {
        const prev = state.hitStack[state.hitStack.length - 1];
        state.direction = [r - prev.r, c - prev.c];
      }
      state.hitStack.push({ r, c });
    }
  };

  init();
  return { state, chooseShot, registerHit, init };
};

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const css = `
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;600;700;900&family=Exo+2:wght@300;400;600;700&display=swap');

:root {
  --bg: #050d14; --s1: #0a1929; --s2: #0d2137; --s3: #112740;
  --ac: #00d4ff; --ac2: #ff6b35; --ac3: #39ff14;
  --tx: #c8e6f5; --tx2: #7ab3d0; --tx3: #4a7a99;
  --danger: #ff3b3b; --hit: #ff6b35; --miss: #1a3d5a;
  --ship: #1e4f7a; --border: #1a3a55; --gold: #ffd700;
  --border-bright: #2a5a80;
}

* { margin:0; padding:0; box-sizing:border-box; }

body {
  background: var(--bg); color: var(--tx);
  font-family: 'Exo 2', sans-serif; min-height: 100vh;
  overflow-x: hidden;
  background-image:
    radial-gradient(ellipse at 15% 60%, rgba(0,80,160,.07) 0%, transparent 55%),
    radial-gradient(ellipse at 85% 15%, rgba(0,180,255,.05) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(0,40,80,.1) 0%, transparent 60%);
}

/* scanlines */
body::before {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:9999;
  background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.04) 3px, rgba(0,0,0,.04) 4px);
}

/* scrollbar */
::-webkit-scrollbar { width:6px; }
::-webkit-scrollbar-track { background: var(--s1); }
::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius:3px; }

/* LAYOUT */
.app { min-height:100vh; display:flex; flex-direction:column; }

/* HEADER */
.hdr {
  display:flex; align-items:center; justify-content:space-between;
  padding:14px 32px; border-bottom:1px solid var(--border);
  background:rgba(5,13,20,.85); backdrop-filter:blur(12px);
  position:sticky; top:0; z-index:200;
}
.logo { font-family:'Orbitron',monospace; font-size:20px; font-weight:900; color:var(--ac); letter-spacing:4px;
  text-shadow:0 0 18px rgba(0,212,255,.4); cursor:pointer; }
.logo em { color:var(--tx2); font-style:normal; font-size:10px; display:block; letter-spacing:8px; font-weight:400; }
.hdr-right { display:flex; align-items:center; gap:12px; }
.hdr-user { font-family:'Share Tech Mono',monospace; font-size:12px; color:var(--tx2);
  display:flex; align-items:center; gap:8px; }
.hdr-user-dot { width:7px; height:7px; border-radius:50%; background:var(--ac3); box-shadow:0 0 6px var(--ac3); animation:pulse-green 2s infinite; }
@keyframes pulse-green { 0%,100%{opacity:1} 50%{opacity:.5} }
.hdr-btn { font-family:'Orbitron',monospace; font-size:10px; padding:6px 14px; cursor:pointer;
  border:1px solid var(--border-bright); background:transparent; color:var(--tx2); letter-spacing:1px;
  transition:all .2s; clip-path:polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%); }
.hdr-btn:hover { border-color:var(--ac); color:var(--ac); }
.hdr-blink { animation:blink 1.2s infinite; color:var(--ac3); font-size:10px; }
@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

/* BUTTONS */
.btn {
  font-family:'Orbitron',monospace; font-size:12px; font-weight:700; letter-spacing:2px;
  padding:13px 28px; cursor:pointer; border:1px solid var(--ac); background:transparent; color:var(--ac);
  clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);
  transition:all .2s; text-transform:uppercase; position:relative; overflow:hidden; display:inline-block;
}
.btn::before { content:''; position:absolute; inset:0; background:var(--ac); opacity:0; transition:opacity .2s; }
.btn:hover { color:var(--bg); } .btn:hover::before { opacity:1; }
.btn > span { position:relative; z-index:1; }
.btn-gold { border-color:var(--gold); color:var(--gold); } .btn-gold::before { background:var(--gold); } .btn-gold:hover { color:var(--bg); }
.btn-danger { border-color:var(--danger); color:var(--danger); } .btn-danger::before { background:var(--danger); } .btn-danger:hover { color:#fff; }
.btn-green { border-color:var(--ac3); color:var(--ac3); } .btn-green::before { background:var(--ac3); } .btn-green:hover { color:var(--bg); }
.btn-sm { padding:8px 18px; font-size:10px; }
.btn:disabled { opacity:.3; cursor:not-allowed; pointer-events:none; }

/* PANELS */
.panel {
  background:var(--s1); border:1px solid var(--border); padding:20px;
  clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px));
}
.panel-title {
  font-family:'Orbitron',monospace; font-size:11px; font-weight:700; letter-spacing:3px;
  color:var(--ac); text-transform:uppercase; margin-bottom:14px; padding-bottom:8px; border-bottom:1px solid var(--border);
}

/* INPUTS */
.input-group { margin-bottom:16px; }
.input-label { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--tx2); margin-bottom:6px; display:block; letter-spacing:1px; }
.input {
  width:100%; background:var(--s2); border:1px solid var(--border); color:var(--tx);
  font-family:'Share Tech Mono',monospace; font-size:14px; padding:11px 14px;
  outline:none; transition:border-color .2s;
}
.input:focus { border-color:var(--ac); }
.input::placeholder { color:var(--tx3); }
.input-err { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--danger); margin-top:6px; }

/* AUTH SCREEN */
.auth-screen { display:flex; align-items:center; justify-content:center; min-height:calc(100vh - 60px); padding:40px 20px; }
.auth-box { width:100%; max-width:420px; }
.auth-title { font-family:'Orbitron',monospace; font-size:clamp(28px,5vw,48px); font-weight:900; line-height:1;
  margin-bottom:6px; background:linear-gradient(135deg,var(--ac),#006aff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.auth-sub { font-size:12px; color:var(--tx2); letter-spacing:5px; margin-bottom:36px; font-family:'Share Tech Mono',monospace; }
.auth-tabs { display:flex; gap:8px; margin-bottom:20px; }
.auth-tab { flex:1; font-family:'Orbitron',monospace; font-size:11px; padding:10px; cursor:pointer;
  border:1px solid var(--border); background:var(--s2); color:var(--tx2); letter-spacing:2px; transition:all .2s; text-align:center; }
.auth-tab.active { border-color:var(--ac); color:var(--ac); background:var(--s3); }

/* LOBBY */
.lobby-screen { display:flex; align-items:center; justify-content:center; min-height:calc(100vh - 60px); padding:40px 20px; }
.lobby-inner { width:100%; max-width:1000px; }
.lobby-title { font-family:'Orbitron',monospace; font-size:clamp(36px,7vw,72px); font-weight:900; line-height:.9;
  margin-bottom:8px; background:linear-gradient(135deg,var(--ac) 0%,#0066ff 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.lobby-sub { font-size:13px; color:var(--tx2); letter-spacing:6px; margin-bottom:44px; font-family:'Share Tech Mono',monospace; }
.lobby-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; margin-bottom:24px; }
.lobby-card {
  background:var(--s1); border:1px solid var(--border); padding:28px 20px; cursor:pointer;
  transition:all .25s; position:relative;
  clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));
}
.lobby-card:hover { border-color:var(--ac); background:var(--s2); transform:translateY(-3px); box-shadow:0 8px 32px rgba(0,212,255,.1); }
.lobby-card.solo:hover { border-color:var(--ac3); box-shadow:0 8px 32px rgba(57,255,20,.08); }
.lobby-card.score:hover { border-color:var(--gold); box-shadow:0 8px 32px rgba(255,215,0,.08); }
.lc-icon { font-size:36px; margin-bottom:12px; }
.lc-title { font-family:'Orbitron',monospace; font-size:16px; font-weight:700; color:var(--ac); margin-bottom:6px; }
.lobby-card.solo .lc-title { color:var(--ac3); }
.lobby-card.score .lc-title { color:var(--gold); }
.lc-desc { font-size:12px; color:var(--tx2); line-height:1.6; }

/* room panels */
.room-panel { background:var(--s1); border:1px solid var(--border); padding:22px; margin-top:16px; }
.room-panel-title { font-family:'Orbitron',monospace; font-size:12px; color:var(--ac); margin-bottom:14px; letter-spacing:2px; }
.room-code {
  font-family:'Share Tech Mono',monospace; font-size:32px; font-weight:700; color:var(--gold);
  letter-spacing:8px; text-align:center; padding:18px; background:var(--s2); border:1px solid var(--border);
  margin-bottom:14px; cursor:pointer; transition:all .2s; user-select:all;
}
.room-code:hover { border-color:var(--gold); }
.room-input { display:flex; gap:10px; }
.room-input .input { font-size:22px; letter-spacing:4px; }

/* AI difficulty */
.ai-diff-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin:14px 0; }
.ai-diff-card { padding:16px 12px; cursor:pointer; border:1px solid var(--border); background:var(--s2);
  text-align:center; transition:all .2s; }
.ai-diff-card:hover { background:var(--s3); }
.ai-diff-card.sel-easy { border-color:var(--ac3); background:rgba(57,255,20,.05); }
.ai-diff-card.sel-medium { border-color:var(--gold); background:rgba(255,215,0,.05); }
.ai-diff-card.sel-hard { border-color:var(--danger); background:rgba(255,59,59,.05); }
.adc-name { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; margin-bottom:6px; }
.adc-name.easy { color:var(--ac3); } .adc-name.medium { color:var(--gold); } .adc-name.hard { color:var(--danger); }
.adc-badge { display:inline-block; font-size:9px; padding:2px 8px; margin-bottom:8px; font-family:'Orbitron',monospace;
  letter-spacing:1px; border-radius:0; }
.badge-easy { background:rgba(57,255,20,.1); color:var(--ac3); border:1px solid var(--ac3); }
.badge-medium { background:rgba(255,215,0,.1); color:var(--gold); border:1px solid var(--gold); }
.badge-hard { background:rgba(255,59,59,.1); color:var(--danger); border:1px solid var(--danger); }
.adc-desc { font-size:10px; color:var(--tx2); line-height:1.5; }

/* SETUP SCREEN */
.setup-screen { padding:20px; }
.setup-layout { display:grid; grid-template-columns:260px 1fr 260px; gap:16px; max-width:1380px; margin:16px auto; }
.nation-btn { padding:12px; cursor:pointer; border:1px solid var(--border); background:var(--s2);
  transition:all .2s; display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.nation-btn:hover,.nation-btn.active { border-color:var(--ac); background:var(--s3); }
.nation-flag { font-size:24px; }
.nation-name { font-family:'Orbitron',monospace; font-size:12px; font-weight:700; color:var(--ac); }
.nation-desc { font-size:10px; color:var(--tx2); margin-top:2px; }
.size-btn { padding:11px 14px; cursor:pointer; border:1px solid var(--border); background:var(--s2);
  transition:all .2s; margin-bottom:8px; font-family:'Share Tech Mono',monospace; }
.size-btn:hover,.size-btn.active { border-color:var(--ac); background:var(--s3); }
.size-lbl { font-size:17px; font-weight:700; color:var(--ac); }
.size-meta { font-size:10px; color:var(--tx2); margin-top:3px; }
.diff-badge { display:inline-block; font-size:9px; padding:2px 7px; margin-top:4px;
  font-family:'Orbitron',monospace; letter-spacing:1px; }
.badge-e { background:rgba(57,255,20,.1); color:var(--ac3); border:1px solid var(--ac3); }
.badge-m { background:rgba(255,215,0,.1); color:var(--gold); border:1px solid var(--gold); }
.badge-h { background:rgba(255,59,59,.1); color:var(--danger); border:1px solid var(--danger); }

.grid-wrap { display:flex; flex-direction:column; align-items:center; gap:14px; }
.grid-controls { display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-bottom:8px; }
.ctrl-btn { font-family:'Orbitron',monospace; font-size:10px; padding:7px 14px; border:1px solid var(--border);
  background:var(--s2); color:var(--tx2); cursor:pointer; transition:all .2s; letter-spacing:1px; }
.ctrl-btn.active { border-color:var(--ac); color:var(--ac); background:rgba(0,212,255,.08); }
.ctrl-btn:hover { border-color:var(--ac); color:var(--ac); }

/* GRID */
.game-grid { display:grid; border:1px solid var(--border); background:rgba(0,30,60,.3); }
.cell {
  border:1px solid rgba(26,58,85,.5); cursor:pointer; transition:background .12s, border-color .12s;
  display:flex; align-items:center; justify-content:center;
  font-size:16px; position:relative; width:42px; height:42px;
}
.cell:hover { background:rgba(0,212,255,.1); border-color:var(--ac); }
.cell.sm { width:34px; height:34px; font-size:13px; }
.cell.xs { width:27px; height:27px; font-size:10px; }
.cell.preview { background:rgba(0,212,255,.15); border-color:rgba(0,212,255,.5); }
.cell.invalid { background:rgba(255,59,59,.15); border-color:var(--danger); }
.cell.placed { background:rgba(20,70,120,.5); border-color:var(--ship); }
.cell.hit { background:rgba(255,107,53,.35); border-color:var(--hit); }
.cell.miss { background:rgba(15,45,75,.5); border-color:var(--miss); }
.cell.sunk { background:rgba(255,59,59,.4); border-color:var(--danger); }
.cell.fired { animation:fire-flash .3s ease-out; }
@keyframes fire-flash { 0%{background:rgba(255,220,0,.6)} 100%{background:inherit} }

.col-axis { display:flex; margin-left:22px; }
.axis-lbl { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--tx3); display:flex; align-items:center; justify-content:center; }

/* ship list */
.ship-item { padding:9px; margin-bottom:7px; cursor:pointer; border:1px solid var(--border);
  background:var(--s2); display:flex; align-items:center; justify-content:space-between;
  transition:all .2s; user-select:none; }
.ship-item:hover { border-color:var(--ac); }
.ship-item.sel { border-color:var(--gold); background:rgba(255,215,0,.07); }
.ship-item.done { opacity:.4; cursor:default; }
.ship-visual { display:flex; gap:3px; margin-top:4px; }
.ship-blk { width:12px; height:12px; background:var(--ship); border:1px solid rgba(0,212,255,.3); border-radius:1px; }
.ship-nm { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--tx2); }
.ship-sz { font-family:'Orbitron',monospace; font-size:10px; color:var(--ac); }
.hint { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--tx2); margin-top:14px;
  padding-top:14px; border-top:1px solid var(--border); }

/* ready zone */
.ready-zone { text-align:center; margin-top:14px; }
.ready-row { display:flex; gap:10px; justify-content:center; margin-bottom:12px; }
.ready-ind { font-family:'Share Tech Mono',monospace; font-size:11px; padding:6px 12px;
  border:1px solid var(--border); display:inline-flex; align-items:center; gap:8px; }
.rdot { width:7px; height:7px; border-radius:50%; }
.rdot.on { background:var(--ac3); box-shadow:0 0 5px var(--ac3); }
.rdot.off { background:var(--tx3); }

/* GAME SCREEN */
.game-screen { padding:20px; }
.game-layout { display:grid; grid-template-columns:1fr 180px 1fr; gap:16px; max-width:1380px; margin:16px auto; align-items:start; }
.game-panel { background:var(--s1); border:1px solid var(--border); padding:14px; }
.board-lbl { font-family:'Orbitron',monospace; font-size:10px; letter-spacing:3px; color:var(--tx2);
  text-align:center; margin-bottom:10px; }
.board-lbl strong { color:var(--ac); }

.center-col { display:flex; flex-direction:column; align-items:center; gap:14px; }
.turn-box { font-family:'Orbitron',monospace; font-size:13px; font-weight:700; text-align:center;
  padding:14px; border:1px solid var(--border); background:var(--s1); width:100%; }
.turn-box.yours { border-color:var(--ac3); color:var(--ac3); animation:glow-green 1.8s infinite; }
.turn-box.theirs { border-color:var(--tx2); color:var(--tx2); }
@keyframes glow-green { 0%,100%{box-shadow:0 0 0 0 rgba(57,255,20,0)} 50%{box-shadow:0 0 10px 2px rgba(57,255,20,.25)} }
.score-box { font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--tx2); width:100%; }
.score-row { display:flex; justify-content:space-between; margin-bottom:5px; }
.score-val { color:var(--ac); }
.log-area { width:100%; }
.log-title { font-family:'Orbitron',monospace; font-size:9px; letter-spacing:2px; color:var(--ac); margin-bottom:5px; }
.event-log { background:var(--s2); border:1px solid var(--border); padding:10px; height:130px;
  overflow-y:auto; font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--tx2); }
.log-entry { margin-bottom:4px; line-height:1.4; }
.le-hit { color:var(--hit); } .le-miss { color:#2a6a8a; } .le-sunk { color:var(--danger); } .le-sys { color:var(--ac); }

.fire-hint { margin-top:10px; font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--tx2); text-align:center; }

.enemy-board .cell:hover { background:rgba(255,107,53,.15); border-color:var(--hit); cursor:crosshair; }
.enemy-board .cell.hit:hover { background:rgba(255,107,53,.35); cursor:not-allowed; }
.enemy-board .cell.miss:hover { background:rgba(15,45,75,.5); cursor:not-allowed; }
.enemy-board .cell.sunk:hover { background:rgba(255,59,59,.4); cursor:not-allowed; }

.ai-thinking { display:inline-flex; align-items:center; gap:6px; font-family:'Share Tech Mono',monospace; font-size:11px; color:var(--gold); }
.ai-dot { width:5px; height:5px; border-radius:50%; background:var(--gold); animation:ai-p .5s infinite alternate; }
.ai-dot:nth-child(2){animation-delay:.15s} .ai-dot:nth-child(3){animation-delay:.3s}
@keyframes ai-p { 0%{opacity:.2;transform:scale(.7)} 100%{opacity:1;transform:scale(1.2)} }

/* cannon flash overlay */
.cannon-flash { position:fixed; inset:0; background:rgba(255,200,50,.04); pointer-events:none; z-index:500; animation:cflash .25s ease-out forwards; }
@keyframes cflash { 0%{opacity:1} 100%{opacity:0} }

/* SCOREBOARD */
.score-screen { padding:24px 20px; max-width:1100px; margin:0 auto; width:100%; }
.sb-title { font-family:'Orbitron',monospace; font-size:32px; font-weight:900; color:var(--gold);
  margin-bottom:4px; text-shadow:0 0 20px rgba(255,215,0,.3); }
.sb-sub { font-size:12px; color:var(--tx2); letter-spacing:4px; font-family:'Share Tech Mono',monospace; margin-bottom:28px; }
.sb-layout { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
.sb-section { margin-bottom:20px; }
.sb-section-title { font-family:'Orbitron',monospace; font-size:12px; letter-spacing:3px; color:var(--ac); margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border); }

.stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:16px; }
.stat-card { background:var(--s2); border:1px solid var(--border); padding:14px; text-align:center; }
.stat-val { font-family:'Orbitron',monospace; font-size:24px; font-weight:700; color:var(--ac); }
.stat-lbl { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--tx2); margin-top:4px; }

.achieve-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.ach-card { background:var(--s2); border:1px solid var(--border); padding:12px; text-align:center; transition:all .2s; }
.ach-card.unlocked { border-color:var(--gold); background:rgba(255,215,0,.06); }
.ach-card.locked { opacity:.3; filter:grayscale(1); }
.ach-icon { font-size:24px; margin-bottom:6px; }
.ach-title { font-family:'Orbitron',monospace; font-size:10px; font-weight:700; color:var(--gold); margin-bottom:3px; }
.ach-desc { font-size:10px; color:var(--tx2); }

.leaderboard { background:var(--s1); border:1px solid var(--border); overflow:hidden; }
.lb-head { display:grid; grid-template-columns:40px 1fr 80px 80px; padding:10px 14px;
  background:var(--s2); font-family:'Orbitron',monospace; font-size:10px; letter-spacing:1px; color:var(--tx2); border-bottom:1px solid var(--border); }
.lb-row { display:grid; grid-template-columns:40px 1fr 80px 80px; padding:10px 14px;
  border-bottom:1px solid rgba(26,58,85,.4); font-family:'Share Tech Mono',monospace; font-size:12px; transition:background .15s; }
.lb-row:last-child { border-bottom:none; }
.lb-row:hover { background:var(--s2); }
.lb-row.me { background:rgba(0,212,255,.06); border-color:rgba(0,212,255,.2); }
.lb-rank { color:var(--tx2); font-family:'Orbitron',monospace; font-size:11px; }
.lb-rank.gold { color:var(--gold); } .lb-rank.silver { color:#aaa; } .lb-rank.bronze { color:#cd7f32; }
.lb-name { color:var(--tx); } .lb-name.me { color:var(--ac); }
.lb-wins { color:var(--ac3); text-align:right; } .lb-total { color:var(--tx2); text-align:right; }

/* RESULT */
.result-screen { display:flex; align-items:center; justify-content:center; min-height:calc(100vh - 60px); padding:40px 20px; text-align:center; flex-direction:column; }
.result-icon { font-size:72px; margin-bottom:16px; animation:bounce-in .5s cubic-bezier(.17,.67,.35,1.3); }
@keyframes bounce-in { 0%{transform:scale(0)} 100%{transform:scale(1)} }
.result-title { font-family:'Orbitron',monospace; font-size:clamp(32px,6vw,64px); font-weight:900; margin-bottom:8px; }
.result-win { color:var(--ac3); text-shadow:0 0 30px rgba(57,255,20,.4); }
.result-lose { color:var(--danger); text-shadow:0 0 30px rgba(255,59,59,.35); }
.result-sub { font-size:15px; color:var(--tx2); margin-bottom:28px; }
.result-stats { display:flex; gap:20px; justify-content:center; margin-bottom:32px; flex-wrap:wrap; }
.rs-card { background:var(--s1); border:1px solid var(--border); padding:14px 22px; }
.rs-val { font-family:'Orbitron',monospace; font-size:26px; font-weight:700; color:var(--ac); }
.rs-lbl { font-family:'Share Tech Mono',monospace; font-size:10px; color:var(--tx2); margin-top:3px; }
.result-ach { background:rgba(255,215,0,.08); border:1px solid var(--gold); padding:14px 22px; margin-bottom:24px; max-width:400px; }
.result-ach-title { font-family:'Orbitron',monospace; font-size:11px; color:var(--gold); margin-bottom:8px; letter-spacing:2px; }
.new-ach { display:flex; align-items:center; gap:10px; font-family:'Share Tech Mono',monospace; font-size:12px; color:var(--gold); margin-bottom:4px; }

/* SPINNER */
.spinner { width:52px; height:52px; border:3px solid var(--border); border-top-color:var(--ac); border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to{transform:rotate(360deg)} }

/* TOAST */
.toast-wrap { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:999; pointer-events:none; }
.toast { background:var(--s3); border:1px solid var(--ac); padding:11px 22px;
  font-family:'Share Tech Mono',monospace; font-size:13px; color:var(--ac); letter-spacing:1px;
  clip-path:polygon(8px 0%,100% 0%,calc(100% - 8px) 100%,0% 100%);
  transition:opacity .3s; white-space:nowrap; }
.toast.toast-danger { border-color:var(--danger); color:var(--danger); }

/* RESPONSIVE */
@media(max-width:900px) {
  .setup-layout { grid-template-columns:1fr; }
  .game-layout { grid-template-columns:1fr; }
  .lobby-grid { grid-template-columns:1fr; }
  .ai-diff-grid { grid-template-columns:1fr; }
  .sb-layout { grid-template-columns:1fr; }
  .stat-grid { grid-template-columns:repeat(2,1fr); }
  .achieve-grid { grid-template-columns:repeat(2,1fr); }
  .cell { width:34px; height:34px; font-size:14px; }
  .cell.sm { width:28px; height:28px; }
  .cell.xs { width:22px; height:22px; }
}
`;

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════

function Toast({ message, type, visible }) {
  if (!visible) return null;
  return (
    <div className="toast-wrap">
      <div className={`toast${type === 'danger' ? ' toast-danger' : ''}`}>{message}</div>
    </div>
  );
}

function Grid({ board, enemyView, onCellClick, onCellHover, onCellLeave, previewCells, invalidCells, boardSize, placedShips }) {
  const cellSize = boardSize === 15 ? 'xs' : boardSize === 10 ? 'sm' : '';
  const w = boardSize === 15 ? 27 : boardSize === 10 ? 34 : 42;

  const getCellClass = (r, c) => {
    let cls = `cell ${cellSize}`;
    if (!enemyView) {
      const cell = board[r][c];
      if (previewCells?.some(p => p.r === r && p.c === c)) cls += invalidCells ? ' invalid' : ' preview';
      else if (cell.ship) cls += ' placed';
      if (cell.hit) cls += cell.ship ? ' hit' : ' miss';
    } else {
      const cell = board[r][c];
      if (cell.sunk) cls += ' sunk';
      else if (cell.hit) cls += ' hit';
      else if (cell.miss) cls += ' miss';
    }
    return cls;
  };

  const getCellContent = (r, c) => {
    if (!enemyView) {
      const cell = board[r][c];
      if (cell.hit && cell.ship) return '🔥';
      if (cell.hit && !cell.ship) return '○';
      if (cell.ship) {
        const ship = placedShips?.find(s => s.id === cell.ship);
        if (ship && ship.cells[0].r === r && ship.cells[0].c === c) return ship.emoji;
      }
      return '';
    } else {
      const cell = board[r][c];
      if (cell.sunk) return '💥';
      if (cell.hit) return '🔥';
      if (cell.miss) return '○';
      return '';
    }
  };

  return (
    <div>
      <div className="col-axis">
        {Array(boardSize).fill(0).map((_, i) => (
          <div key={i} className="axis-lbl" style={{ width: w, height: 18, fontSize: 10 }}>{String.fromCharCode(65 + i)}</div>
        ))}
      </div>
      <div style={{ display: 'flex' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Array(boardSize).fill(0).map((_, i) => (
            <div key={i} className="axis-lbl" style={{ width: 20, height: w, fontSize: 10 }}>{i + 1}</div>
          ))}
        </div>
        <div className="game-grid" style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}>
          {Array(boardSize).fill(0).map((_, r) =>
            Array(boardSize).fill(0).map((_, c) => (
              <div
                key={`${r}-${c}`}
                className={getCellClass(r, c)}
                style={{ width: w, height: w }}
                onClick={() => onCellClick?.(r, c)}
                onMouseEnter={() => onCellHover?.(r, c)}
                onMouseLeave={() => onCellLeave?.()}
              >
                {getCellContent(r, c)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════

export default function App() {
  // ── AUTH STATE
  const [screen, setScreen] = useState('auth'); // auth|lobby|setup|game|scoreboard|result
  const [authTab, setAuthTab] = useState('login');
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [currentUser, setCurrentUser] = useState(null); // { username, stats }

  // ── TOAST
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, type = '', dur = 2500) => {
    setToastMsg(msg); setToastType(type); setToastVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), dur);
  }, []);

  // ── GAME SETUP STATE
  const [mode, setMode] = useState(null); // solo|multi
  const [aiDifficulty, setAiDifficulty] = useState('easy');
  const [nation, setNation] = useState('usa');
  const [boardSize, setBoardSize] = useState(5);
  const [orientation, setOrientation] = useState('H');
  const [shipList, setShipList] = useState([]);
  const [myBoard, setMyBoard] = useState([]);
  const [placedShips, setPlacedShips] = useState([]);
  const [selectedShip, setSelectedShip] = useState(null);
  const [previewCells, setPreviewCells] = useState(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);
  const [youReady, setYouReady] = useState(false);
  const [oppReady, setOppReady] = useState(false);

  // ── GAME PLAY STATE
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [enemyBoard, setEnemyBoard] = useState([]);
  const [myHits, setMyHits] = useState(0);
  const [myMisses, setMyMisses] = useState(0);
  const [enemyHits, setEnemyHits] = useState(0);
  const [opponentNation, setOpponentNation] = useState('russia');
  const [gameOver, setGameOver] = useState(false);
  const [logEntries, setLogEntries] = useState([]);
  const [aiThinking, setAiThinking] = useState(false);

  // ── CANNON FLASH
  const [cannonFlash, setCannonFlash] = useState(false);

  // ── RESULT
  const [resultWon, setResultWon] = useState(false);
  const [newAchievements, setNewAchievements] = useState([]);

  // ── MULTIPLAYER
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [peerStatus, setPeerStatus] = useState('');
  const [joinStatus, setJoinStatus] = useState('');
  const [lobbyPanel, setLobbyPanel] = useState(null); // null|solo|create|join
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // ── SCOREBOARD
  const [globalLeaders, setGlobalLeaders] = useState([]);
  const [sbLoading, setSbLoading] = useState(false);

  // ── REFS for game logic access
  const aiRef = useRef(null);
  const myBoardRef = useRef([]);
  const placedShipsRef = useRef([]);
  const gameOverRef = useRef(false);
  const isMyTurnRef = useRef(false);
  const myHitsRef = useRef(0);
  const myMissesRef = useRef(0);
  const enemyHitsRef = useRef(0);
  const modeRef = useRef(null);
  const aiDiffRef = useRef('easy');
  const roleRef = useRef(null);

  // sync refs
  useEffect(() => { myBoardRef.current = myBoard; }, [myBoard]);
  useEffect(() => { placedShipsRef.current = placedShips; }, [placedShips]);
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { isMyTurnRef.current = isMyTurn; }, [isMyTurn]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { aiDiffRef.current = aiDifficulty; }, [aiDifficulty]);

  const logRef = useRef([]);
  const addLog = useCallback((msg, cls = '') => {
    const time = new Date().toTimeString().slice(0, 5);
    const entry = { id: Date.now() + Math.random(), time, msg, cls };
    logRef.current = [...logRef.current.slice(-50), entry];
    setLogEntries([...logRef.current]);
  }, []);

  // ═══════════════════════════════════════════
  // STORAGE / AUTH
  // ═══════════════════════════════════════════

  const loadUserStats = async (username) => {
    try {
      const res = await window.storage.get(`stats:${username}`);
      if (res) return JSON.parse(res.value);
    } catch (e) {}
    return { username, wins: 0, losses: 0, totalShots: 0, totalHits: 0, gamesPlayed: 0, winStreak: 0, bestStreak: 0, bestAccuracy: 0, beatenAdmiral: 0, dailyWins: {} };
  };

  const saveUserStats = async (stats) => {
    try { await window.storage.set(`stats:${stats.username}`, JSON.stringify(stats)); } catch (e) {}
  };

  const saveGlobalEntry = async (username, wins, totalWins) => {
    const today = todayKey();
    try { await window.storage.set(`lb:${today}:${username}`, JSON.stringify({ username, dailyWins: wins, totalWins, date: today }), true); } catch (e) {}
  };

  const handleAuth = async (isRegister) => {
    setAuthErr('');
    if (!authUser.trim() || !authPass.trim()) { setAuthErr('Username and password required.'); return; }
    if (authUser.length < 3) { setAuthErr('Username must be at least 3 characters.'); return; }
    if (isRegister && authPass.length < 4) { setAuthErr('Password must be at least 4 characters.'); return; }

    const key = `user:${authUser.toLowerCase()}`;
    const hash = simpleHash(authPass);
    try {
      if (isRegister) {
        let existing = null;
        try { existing = await window.storage.get(key); } catch (e) {}
        if (existing) { setAuthErr('Username already taken.'); return; }
        await window.storage.set(key, JSON.stringify({ username: authUser, passwordHash: hash }));
      } else {
        let stored = null;
        try { stored = await window.storage.get(key); } catch (e) {}
        if (!stored) { setAuthErr('User not found.'); return; }
        const user = JSON.parse(stored.value);
        if (user.passwordHash !== hash) { setAuthErr('Wrong password.'); return; }
      }
      const stats = await loadUserStats(authUser);
      setCurrentUser({ username: authUser, stats });
      setScreen('lobby');
    } catch (e) {
      setAuthErr('Storage error — try again.');
    }
  };

  // ═══════════════════════════════════════════
  // SCOREBOARD
  // ═══════════════════════════════════════════

  const loadScoreboard = async () => {
    setSbLoading(true);
    try {
      const today = todayKey();
      const keysRes = await window.storage.list(`lb:${today}:`, true);
      const leaders = [];
      if (keysRes?.keys) {
        for (const k of keysRes.keys.slice(0, 30)) {
          try { const r = await window.storage.get(k, true); if (r) leaders.push(JSON.parse(r.value)); } catch (e) {}
        }
      }
      leaders.sort((a, b) => b.dailyWins - a.dailyWins || b.totalWins - a.totalWins);
      setGlobalLeaders(leaders);
    } catch (e) {}
    setSbLoading(false);
  };

  // ═══════════════════════════════════════════
  // GAME RESULT PROCESSING
  // ═══════════════════════════════════════════

  const processResult = async (won) => {
    if (!currentUser) return;
    const shots = myHitsRef.current + myMissesRef.current;
    const acc = shots > 0 ? Math.round(myHitsRef.current / shots * 100) : 0;
    const stats = await loadUserStats(currentUser.username);
    const prevAchs = ACHIEVEMENTS.filter(a => a.check(stats)).map(a => a.id);
    stats.gamesPlayed++;
    stats.totalShots += shots;
    stats.totalHits += myHitsRef.current;
    if (won) {
      stats.wins++;
      stats.winStreak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.winStreak);
      const today = todayKey();
      stats.dailyWins[today] = (stats.dailyWins[today] || 0) + 1;
      if (aiDiffRef.current === 'hard' && modeRef.current === 'solo') stats.beatenAdmiral = (stats.beatenAdmiral || 0) + 1;
    } else {
      stats.losses++;
      stats.winStreak = 0;
    }
    stats.bestAccuracy = Math.max(stats.bestAccuracy || 0, acc);
    await saveUserStats(stats);
    const today = todayKey();
    await saveGlobalEntry(currentUser.username, stats.dailyWins[today] || 0, stats.wins);
    setCurrentUser({ username: currentUser.username, stats });
    const newAchs = ACHIEVEMENTS.filter(a => a.check(stats) && !prevAchs.includes(a.id));
    setNewAchievements(newAchs);
  };

  // ═══════════════════════════════════════════
  // SETUP
  // ═══════════════════════════════════════════

  const enterSetup = (m) => {
    setMode(m);
    modeRef.current = m;
    const sl = buildShipList(boardSize);
    setShipList(sl);
    setMyBoard(makeBoard(boardSize));
    setPlacedShips([]);
    setSelectedShip(null);
    setYouReady(false); setOppReady(false);
    setLogEntries([]); logRef.current = [];
    setScreen('setup');
  };

  const handleSizeChange = (s) => {
    setBoardSize(s);
    const sl = buildShipList(s);
    setShipList(sl);
    setMyBoard(makeBoard(s));
    setPlacedShips([]);
    setSelectedShip(null);
  };

  const handlePlaceShip = (r, c) => {
    if (!selectedShip) { showToast('Select a ship first!'); return; }
    const ship = shipList.find(s => s.id === selectedShip);
    if (!ship || ship.placed) return;
    const cells = getCells(r, c, ship.size, orientation);
    if (!isValidPlacement(cells, myBoard, boardSize)) { showToast('Invalid placement!'); return; }
    const newBoard = myBoard.map(row => row.map(cell => ({ ...cell })));
    cells.forEach(({ r, c }) => newBoard[r][c].ship = ship.id);
    const newShip = { id: ship.id, cells, sunk: false, name: ship.name, emoji: ship.emoji, size: ship.size };
    const newPlaced = [...placedShips, newShip];
    const newList = shipList.map(s => s.id === ship.id ? { ...s, placed: true, cells } : s);
    setMyBoard(newBoard);
    setPlacedShips(newPlaced);
    setShipList(newList);
    const next = newList.find(s => !s.placed);
    setSelectedShip(next ? next.id : null);
    setPreviewCells(null);
  };

  const handlePreview = (r, c) => {
    if (!selectedShip) return;
    const ship = shipList.find(s => s.id === selectedShip);
    if (!ship || ship.placed) return;
    const cells = getCells(r, c, ship.size, orientation);
    setPreviewCells(cells);
    setPreviewInvalid(!isValidPlacement(cells, myBoard, boardSize));
  };

  const doAutoPlace = () => {
    const sl = buildShipList(boardSize);
    const { board, placed, shipList: newList } = autoPlaceShips(sl, boardSize);
    setMyBoard(board);
    setPlacedShips(placed);
    setShipList(newList);
    setSelectedShip(null);
    setPreviewCells(null);
  };

  const doClearShips = () => {
    const sl = buildShipList(boardSize);
    setShipList(sl);
    setMyBoard(makeBoard(boardSize));
    setPlacedShips([]);
    setSelectedShip(null);
    setPreviewCells(null);
    setYouReady(false);
  };

  const handleReady = () => {
    if (!shipList.every(s => s.placed)) { showToast('Place all ships first!'); return; }
    setYouReady(true);
    if (mode === 'multi') sendMsg({ type: 'ready', nation });
    else { setOppReady(true); }
  };

  useEffect(() => {
    if (youReady && oppReady) {
      const t = setTimeout(() => startGame(), 600);
      return () => clearTimeout(t);
    }
  }, [youReady, oppReady]);

  // ═══════════════════════════════════════════
  // MULTIPLAYER
  // ═══════════════════════════════════════════

  const sendMsg = (msg) => { if (connRef.current?.open) connRef.current.send(msg); };

  const handlePeerMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'nation': setOpponentNation(msg.nation); break;
      case 'ready': setOppReady(true); break;
      case 'fire': handleIncomingFire(msg.r, msg.c); break;
      case 'fireResult': handleFireResultMulti(msg); break;
      case 'gameOver': triggerResult(false); break;
    }
  }, []);

  const createRoom = () => {
    setLobbyPanel('create');
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    setRoomCode(code);
    roleRef.current = 'host';
    const peer = new Peer('nw-' + code);
    peerRef.current = peer;
    peer.on('open', () => setPeerStatus('Ready — share code with opponent'));
    peer.on('connection', conn => {
      connRef.current = conn;
      conn.on('data', handlePeerMessage);
      conn.on('close', () => { if (!gameOverRef.current) showToast('Opponent disconnected!', 'danger', 4000); });
      setPeerStatus('Opponent connected! Entering setup...');
      setTimeout(() => enterSetup('multi'), 1000);
    });
    peer.on('error', e => setPeerStatus('Error: ' + e.type));
  };

  const joinRoom = () => {
    if (joinCode.length < 4) { showToast('Enter a valid room code'); return; }
    roleRef.current = 'guest';
    setJoinStatus('Connecting...');
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', () => {
      const conn = peer.connect('nw-' + joinCode);
      connRef.current = conn;
      conn.on('open', () => { setJoinStatus('Connected!'); setTimeout(() => enterSetup('multi'), 800); });
      conn.on('data', handlePeerMessage);
      conn.on('error', e => setJoinStatus('Failed: ' + e));
    });
  };

  // ═══════════════════════════════════════════
  // GAME START
  // ═══════════════════════════════════════════

  const startGame = () => {
    const myTurn = modeRef.current === 'solo' ? true : roleRef.current === 'host';
    setIsMyTurn(myTurn); isMyTurnRef.current = myTurn;
    setGameOver(false); gameOverRef.current = false;
    setMyHits(0); setMyMisses(0); setEnemyHits(0);
    myHitsRef.current = 0; myMissesRef.current = 0; enemyHitsRef.current = 0;
    setEnemyBoard(makeEnemyBoard(boardSize));
    logRef.current = []; setLogEntries([]);
    setNewAchievements([]);
    if (modeRef.current === 'solo') {
      const ai = createAI(aiDiffRef.current, boardSize);
      aiRef.current = ai;
      const randNation = AI_NATIONS[Math.floor(Math.random() * 3)];
      setOpponentNation(randNation);
    }
    addLog('⚓ Battle started! ' + (myTurn ? 'You fire first.' : 'Enemy fires first.'), 'le-sys');
    setScreen('game');
    if (modeRef.current === 'solo' && !myTurn) setTimeout(() => triggerAITurn(), 1200);
  };

  // ═══════════════════════════════════════════
  // PLAYER FIRING
  // ═══════════════════════════════════════════

  const fireAt = (r, c) => {
    if (!isMyTurnRef.current || gameOverRef.current) return;
    const eb = enemyBoard;
    if (eb[r][c].hit || eb[r][c].miss || eb[r][c].sunk) { showToast('Already fired here!'); return; }

    // CANNON SOUND + FLASH
    audio.playCannonShot();
    setCannonFlash(true);
    setTimeout(() => setCannonFlash(false), 300);

    if (modeRef.current === 'solo') {
      const ai = aiRef.current;
      const aiCell = ai.state.board[r][c];
      const isHit = aiCell.ship !== null;

      setEnemyBoard(prev => {
        const nb = prev.map(row => row.map(c => ({ ...c })));
        nb[r][c] = { hit: isHit, miss: !isHit, sunk: false };
        return nb;
      });

      if (isHit) {
        aiCell.hit = true;
        const ship = ai.state.ships.find(s => s.id === aiCell.ship);
        if (ship) {
          const allSunk = ship.cells.every(({ r: sr, c: sc }) => sr === r && sc === c ? true : ai.state.board[sr][sc].hit);
          ai.state.board[r][c].hit = true;
          if (allSunk) {
            ship.sunk = true;
            ship.cells.forEach(({ r: sr, c: sc }) => { ai.state.board[sr][sc].hit = true; });
            setEnemyBoard(prev => {
              const nb = prev.map(row => row.map(c => ({ ...c })));
              ship.cells.forEach(({ r: sr, c: sc }) => nb[sr][sc] = { hit: false, miss: false, sunk: true });
              return nb;
            });
            audio.playExplosion();
            myHitsRef.current++;
            setMyHits(h => h + 1);
            addLog(`YOU SUNK enemy ${ship.name}! 💥`, 'le-sunk');
            showToast('ENEMY SHIP SUNK! 💥');
            if (ai.state.ships.every(s => s.sunk)) { triggerResult(true); return; }
            // fire again
          } else {
            myHitsRef.current++;
            setMyHits(h => h + 1);
            addLog(`HIT at ${colName(c)}${r + 1}! Fire again.`, 'le-hit');
            showToast('DIRECT HIT! Fire again.');
            // fire again (turn stays)
          }
        }
      } else {
        audio.playSplash();
        myMissesRef.current++;
        setMyMisses(m => m + 1);
        addLog(`Missed at ${colName(c)}${r + 1}.`, 'le-miss');
        setIsMyTurn(false); isMyTurnRef.current = false;
        setTimeout(() => triggerAITurn(), 900 + Math.random() * 600);
      }
    } else {
      // multiplayer
      sendMsg({ type: 'fire', r, c });
      setIsMyTurn(false); isMyTurnRef.current = false;
    }
  };

  // ═══════════════════════════════════════════
  // AI TURN
  // ═══════════════════════════════════════════

  const triggerAITurn = () => {
    if (gameOverRef.current || isMyTurnRef.current) return;
    setAiThinking(true);
    setTimeout(() => {
      if (gameOverRef.current) { setAiThinking(false); return; }
      const ai = aiRef.current;
      const board = myBoardRef.current;
      const ships = placedShipsRef.current;
      const { r, c } = ai.chooseShot(board, ships);
      doAIFire(r, c);
      setAiThinking(false);
    }, 600 + Math.random() * 500);
  };

  const doAIFire = (r, c) => {
    const board = myBoardRef.current;
    const boardCell = board[r][c];
    const isHit = boardCell.ship !== null;
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    newBoard[r][c] = { ...newBoard[r][c], hit: true };
    myBoardRef.current = newBoard;
    setMyBoard(newBoard);
    enemyHitsRef.current++;
    setEnemyHits(h => h + 1);

    if (isHit) {
      audio.playExplosion();
      const ships = placedShipsRef.current;
      const ship = ships.find(s => s.id === boardCell.ship);
      if (ship) {
        const allSunk = ship.cells.every(({ r: sr, c: sc }) => newBoard[sr][sc].hit);
        if (allSunk) {
          ship.sunk = true;
          const newShips = placedShipsRef.current.map(s => s.id === ship.id ? { ...s, sunk: true } : s);
          placedShipsRef.current = newShips;
          setPlacedShips(newShips);
          aiRef.current.registerHit(r, c, true);
          addLog(`AI SUNK your ${ship.name}! 💥`, 'le-sunk');
          showToast('YOUR SHIP WAS SUNK! 💥', 'danger', 3000);
          if (newShips.every(s => s.sunk)) { triggerResult(false); return; }
        } else {
          aiRef.current.registerHit(r, c, false);
          addLog(`AI HIT your ship at ${colName(c)}${r + 1}!`, 'le-sunk');
        }
        setTimeout(() => triggerAITurn(), 900 + Math.random() * 500);
      }
    } else {
      audio.playSplash();
      addLog(`AI missed at ${colName(c)}${r + 1}.`, 'le-miss');
      setIsMyTurn(true); isMyTurnRef.current = true;
    }
  };

  // ═══════════════════════════════════════════
  // MULTIPLAYER INCOMING
  // ═══════════════════════════════════════════

  const handleIncomingFire = (r, c) => {
    const board = myBoardRef.current;
    const boardCell = board[r][c];
    const isHit = boardCell.ship !== null;
    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    newBoard[r][c] = { ...newBoard[r][c], hit: true };
    myBoardRef.current = newBoard;
    setMyBoard(newBoard);
    enemyHitsRef.current++;
    setEnemyHits(h => h + 1);

    let sunkShip = null;
    if (isHit) {
      const ships = placedShipsRef.current;
      const ship = ships.find(s => s.id === boardCell.ship);
      if (ship) {
        const allSunk = ship.cells.every(({ r: sr, c: sc }) => newBoard[sr][sc].hit);
        if (allSunk) {
          sunkShip = ship;
          const newShips = ships.map(s => s.id === ship.id ? { ...s, sunk: true } : s);
          placedShipsRef.current = newShips;
          setPlacedShips(newShips);
        }
      }
    }
    const allSunk = placedShipsRef.current.every(s => s.sunk);
    sendMsg({ type: 'fireResult', r, c, hit: isHit, sunk: !!sunkShip, sunkCells: sunkShip?.cells, sunkName: sunkShip?.name, gameOver: allSunk });
    if (allSunk) { sendMsg({ type: 'gameOver' }); triggerResult(false); return; }
    if (!isHit) { setIsMyTurn(true); isMyTurnRef.current = true; addLog(`Enemy MISSED at ${colName(c)}${r + 1}`, 'le-miss'); }
    else addLog(`Enemy HIT your ${sunkShip ? sunkShip.name + ' (SUNK!)' : 'ship'} at ${colName(c)}${r + 1}`, 'le-sunk');
  };

  const handleFireResultMulti = (msg) => {
    const { r, c, hit, sunk, sunkCells, sunkName, gameOver: go } = msg;
    if (hit) {
      myHitsRef.current++;
      setMyHits(h => h + 1);
      if (sunk) {
        setEnemyBoard(prev => {
          const nb = prev.map(row => row.map(c => ({ ...c })));
          sunkCells.forEach(({ r: sr, c: sc }) => nb[sr][sc] = { hit: false, miss: false, sunk: true });
          return nb;
        });
        addLog(`YOU SUNK enemy ${sunkName}! 💥`, 'le-sunk');
        showToast('ENEMY SHIP SUNK! 💥');
      } else {
        setEnemyBoard(prev => { const nb = prev.map(r => r.map(c => ({...c}))); nb[r][c] = {hit:true,miss:false,sunk:false}; return nb; });
        addLog(`HIT at ${colName(c)}${r + 1}! Fire again.`, 'le-hit');
        showToast('DIRECT HIT! Fire again.');
      }
      if (go) { triggerResult(true); return; }
      setIsMyTurn(true); isMyTurnRef.current = true;
    } else {
      myMissesRef.current++;
      setMyMisses(m => m + 1);
      setEnemyBoard(prev => { const nb = prev.map(r => r.map(c => ({...c}))); nb[r][c] = {hit:false,miss:true,sunk:false}; return nb; });
      addLog(`Missed at ${colName(c)}${r + 1}.`, 'le-miss');
    }
  };

  // ═══════════════════════════════════════════
  // RESULT
  // ═══════════════════════════════════════════

  const triggerResult = async (won) => {
    setGameOver(true); gameOverRef.current = true;
    setResultWon(won);
    await processResult(won);
    setScreen('result');
  };

  const playAgain = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; connRef.current = null; }
    enterSetup(mode);
  };

  const goLobby = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; connRef.current = null; }
    setLobbyPanel(null); setScreen('lobby');
  };

  // ═══════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════

  return (
    <div className="app">
      <style>{css}</style>
      {cannonFlash && <div className="cannon-flash" />}
      <Toast message={toastMsg} type={toastType} visible={toastVisible} />

      {/* HEADER */}
      <header className="hdr">
        <div className="logo" onClick={() => { if (currentUser) goLobby(); }}>
          NAVAL WARFARE
          <em>BATTLESHIPS</em>
        </div>
        <div className="hdr-right">
          {currentUser ? (
            <>
              <div className="hdr-user">
                <div className="hdr-user-dot" />
                {currentUser.username}
              </div>
              <button className="hdr-btn" onClick={() => { loadScoreboard(); setScreen('scoreboard'); }}>📊 SCOREBOARD</button>
              <button className="hdr-btn" onClick={() => { setCurrentUser(null); setScreen('auth'); }}>LOGOUT</button>
            </>
          ) : (
            <span className="hdr-blink">● OFFLINE</span>
          )}
        </div>
      </header>

      {/* ─── AUTH ─── */}
      {screen === 'auth' && (
        <div className="auth-screen">
          <div className="auth-box">
            <div className="auth-title">NAVAL<br />WARFARE</div>
            <div className="auth-sub">▸ Strategic Combat ◂</div>
            <div className="auth-tabs">
              <div className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} onClick={() => { setAuthTab('login'); setAuthErr(''); }}>LOGIN</div>
              <div className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} onClick={() => { setAuthTab('register'); setAuthErr(''); }}>REGISTER</div>
            </div>
            <div className="panel">
              <div className="input-group">
                <label className="input-label">COMMANDER NAME</label>
                <input className="input" type="text" placeholder="username" value={authUser}
                  onChange={e => setAuthUser(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth(authTab === 'register')} />
              </div>
              <div className="input-group">
                <label className="input-label">ACCESS CODE</label>
                <input className="input" type="password" placeholder="password" value={authPass}
                  onChange={e => setAuthPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAuth(authTab === 'register')} />
              </div>
              {authErr && <div className="input-err">⚠ {authErr}</div>}
              <div style={{ marginTop: 20 }}>
                <button className="btn btn-gold" style={{ width: '100%' }} onClick={() => handleAuth(authTab === 'register')}>
                  <span>{authTab === 'login' ? '▸ ENTER COMMAND CENTER' : '▸ CREATE ACCOUNT'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── LOBBY ─── */}
      {screen === 'lobby' && (
        <div className="lobby-screen">
          <div className="lobby-inner">
            <div className="lobby-title">BATTLE<br />SHIPS</div>
            <div className="lobby-sub">▸ Strategic Naval Warfare ◂</div>
            <div className="lobby-grid">
              <div className="lobby-card solo" onClick={() => setLobbyPanel(lobbyPanel === 'solo' ? null : 'solo')}>
                <div className="lc-icon">🤖</div>
                <div className="lc-title">VS COMPUTER</div>
                <div className="lc-desc">Battle an AI opponent. Choose Easy, Medium, or Hard difficulty. No opponent needed.</div>
              </div>
              <div className="lobby-card" onClick={createRoom}>
                <div className="lc-icon">⚓</div>
                <div className="lc-title">CREATE BATTLE</div>
                <div className="lc-desc">Generate a room code and share it with your opponent. You'll be fleet commander.</div>
              </div>
              <div className="lobby-card" onClick={() => setLobbyPanel(lobbyPanel === 'join' ? null : 'join')}>
                <div className="lc-icon">🎯</div>
                <div className="lc-title">JOIN BATTLE</div>
                <div className="lc-desc">Enter your opponent's room code to join their fleet battle. Prepare for combat.</div>
              </div>
            </div>

            {lobbyPanel === 'solo' && (
              <div className="room-panel">
                <div className="room-panel-title">▸ VS COMPUTER — SELECT DIFFICULTY</div>
                <div className="ai-diff-grid">
                  {[
                    { id: 'easy', label: 'ENSIGN', badge: 'EASY', bdg: 'badge-easy', desc: 'Random targeting. No follow-up on hits. Great for beginners.' },
                    { id: 'medium', label: 'CAPTAIN', badge: 'MEDIUM', bdg: 'badge-medium', desc: 'Hunt & Target AI. Follows up on hits to sink ships methodically.' },
                    { id: 'hard', label: 'ADMIRAL', badge: 'HARD', bdg: 'badge-hard', desc: 'Probability density mapping. Calculates optimal shots. Very hard.' },
                  ].map(d => (
                    <div key={d.id} className={`ai-diff-card ${aiDifficulty === d.id ? 'sel-' + d.id : ''}`} onClick={() => setAiDifficulty(d.id)}>
                      <div className={`adc-name ${d.id}`}>{d.label}</div>
                      <div className={`adc-badge ${d.bdg}`}>{d.badge}</div>
                      <div className="adc-desc">{d.desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button className="btn btn-green" onClick={() => enterSetup('solo')}><span>▸ ENTER BATTLE</span></button>
                </div>
              </div>
            )}

            {lobbyPanel === 'create' && (
              <div className="room-panel">
                <div className="room-panel-title">▸ ROOM CREATED — SHARE CODE WITH OPPONENT</div>
                <div className="room-code" onClick={() => navigator.clipboard.writeText(roomCode).then(() => showToast('Room code copied!'))}>{roomCode}</div>
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--tx2)', fontFamily: 'Share Tech Mono, monospace', marginBottom: 14 }}>Click code to copy · Waiting for opponent...</div>
                <div style={{ textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'Share Tech Mono,monospace', fontSize: 12, color: 'var(--tx2)' }}>{peerStatus}</div>
              </div>
            )}

            {lobbyPanel === 'join' && (
              <div className="room-panel">
                <div className="room-panel-title">▸ ENTER ENEMY ROOM CODE</div>
                <div className="room-input">
                  <input className="input" type="text" maxLength={6} placeholder="XXXXXX" value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && joinRoom()} />
                  <button className="btn" onClick={joinRoom}><span>CONNECT</span></button>
                </div>
                {joinStatus && <div style={{ marginTop: 10, fontFamily: 'Share Tech Mono,monospace', fontSize: 12, color: 'var(--tx2)' }}>{joinStatus}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── SETUP ─── */}
      {screen === 'setup' && (
        <div className="setup-screen">
          <div className="setup-layout">
            {/* Left */}
            <div>
              <div className="panel" style={{ marginBottom: 14 }}>
                <div className="panel-title">▸ NATIONALITY</div>
                {Object.entries(NATIONS).map(([id, n]) => (
                  <div key={id} className={`nation-btn ${nation === id ? 'active' : ''}`} onClick={() => { setNation(id); if (mode === 'multi') sendMsg({ type: 'nation', nation: id }); }}>
                    <div className="nation-flag">{n.flag}</div>
                    <div><div className="nation-name">{n.name}</div><div className="nation-desc">{id === 'usa' ? 'Advanced guided missiles' : id === 'russia' ? 'Heavy cruisers · Nuclear submarines' : 'Carrier groups · Stealth corvettes'}</div></div>
                  </div>
                ))}
              </div>
              <div className="panel">
                <div className="panel-title">▸ BATTLE ZONE</div>
                {[
                  { s: 5, meta: '3 ships · Quick skirmish', badge: 'badge-e', diff: 'EASY' },
                  { s: 10, meta: '6 ships · Standard engagement', badge: 'badge-m', diff: 'MEDIUM' },
                  { s: 15, meta: '10 ships · Full naval war', badge: 'badge-h', diff: 'HARD' },
                ].map(({ s, meta, badge, diff }) => (
                  <div key={s} className={`size-btn ${boardSize === s ? 'active' : ''}`} onClick={() => handleSizeChange(s)}>
                    <div className="size-lbl">{s} × {s}</div>
                    <div className="size-meta">{meta}</div>
                    <div className={`diff-badge ${badge}`}>{diff}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Center */}
            <div className="grid-wrap">
              <div className="panel" style={{ textAlign: 'center' }}>
                <div className="panel-title">▸ PLACE YOUR FLEET</div>
                <div className="grid-controls">
                  {['H', 'V'].map(o => (
                    <div key={o} className={`ctrl-btn ${orientation === o ? 'active' : ''}`} onClick={() => setOrientation(o)}>
                      {o === 'H' ? '↔ HORIZONTAL' : '↕ VERTICAL'}
                    </div>
                  ))}
                  <div className="ctrl-btn" onClick={doClearShips}>⟳ RESET</div>
                  <div className="ctrl-btn" onClick={doAutoPlace}>⚡ AUTO PLACE</div>
                </div>
                <Grid board={myBoard} boardSize={boardSize} placedShips={placedShips}
                  previewCells={previewCells} invalidCells={previewInvalid}
                  onCellClick={handlePlaceShip} onCellHover={handlePreview} onCellLeave={() => setPreviewCells(null)} />
              </div>
              <div className="ready-zone">
                <div className="ready-row">
                  <div className="ready-ind">
                    <div className={`rdot ${youReady ? 'on' : 'off'}`} />
                    <span>YOU: {youReady ? 'READY' : 'NOT READY'}</span>
                  </div>
                  {mode === 'multi' && (
                    <div className="ready-ind">
                      <div className={`rdot ${oppReady ? 'on' : 'off'}`} />
                      <span>OPPONENT: {oppReady ? 'READY' : 'WAITING'}</span>
                    </div>
                  )}
                </div>
                {shipList.every(s => s.placed) && !youReady && (
                  <button className="btn btn-gold" onClick={handleReady}><span>▸ READY FOR BATTLE</span></button>
                )}
              </div>
            </div>

            {/* Right */}
            <div className="panel">
              <div className="panel-title">▸ FLEET ROSTER</div>
              {shipList.map(ship => (
                <div key={ship.id} className={`ship-item ${ship.placed ? 'done' : ''} ${selectedShip === ship.id ? 'sel' : ''}`}
                  onClick={() => { if (!ship.placed) setSelectedShip(ship.id); }}>
                  <div>
                    <div className="ship-nm">{ship.emoji} {ship.name}</div>
                    <div className="ship-visual">{Array(ship.size).fill(0).map((_, i) => <div key={i} className="ship-blk" />)}</div>
                  </div>
                  <div className="ship-sz">×{ship.size}</div>
                </div>
              ))}
              <div className="hint">
                {!selectedShip && !shipList.every(s => s.placed) ? 'SELECT A SHIP TO PLACE' :
                  selectedShip ? `CLICK GRID TO PLACE ${shipList.find(s => s.id === selectedShip)?.name?.toUpperCase()}` :
                    'ALL SHIPS PLACED — READY!'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── GAME ─── */}
      {screen === 'game' && (
        <div className="game-screen">
          <div className="game-layout">
            {/* My board */}
            <div className="game-panel">
              <div className="board-lbl">YOUR WATERS — <strong>{NATIONS[nation].name}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Grid board={myBoard} boardSize={boardSize} placedShips={placedShips} />
              </div>
            </div>

            {/* Center */}
            <div className="center-col">
              <div className={`turn-box ${isMyTurn ? 'yours' : 'theirs'}`}>
                <div style={{ fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>STATUS</div>
                <div>{isMyTurn ? 'FIRE!' : mode === 'solo' ? 'AI TURN' : 'ENEMY TURN'}</div>
              </div>
              <div className="score-box">
                <div className="score-row"><span>YOUR HITS</span><span className="score-val">{myHits}</span></div>
                <div className="score-row"><span>ENEMY HITS</span><span className="score-val">{enemyHits}</span></div>
                <div className="score-row"><span>YOUR SHIPS</span><span className="score-val">{placedShips.filter(s => !s.sunk).length}</span></div>
                {mode === 'solo' && <div className="score-row"><span>AI SHIPS</span><span className="score-val">{aiRef.current?.state.ships.filter(s => !s.sunk).length ?? '?'}</span></div>}
              </div>
              {aiThinking && (
                <div className="ai-thinking">
                  <div className="ai-dot" /><div className="ai-dot" /><div className="ai-dot" />
                  <span style={{ fontSize: 9, marginLeft: 4 }}>TARGETING...</span>
                </div>
              )}
              <div className="log-area">
                <div className="log-title">BATTLE LOG</div>
                <div className="event-log" id="event-log">
                  {logEntries.map(e => (
                    <div key={e.id} className={`log-entry ${e.cls}`}>[{e.time}] {e.msg}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Enemy board */}
            <div className={`game-panel ${isMyTurn ? 'enemy-board' : ''}`}>
              <div className="board-lbl">ENEMY WATERS — <strong>{NATIONS[opponentNation]?.name}{mode === 'solo' ? ' [AI]' : ''}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Grid board={enemyBoard} enemyView boardSize={boardSize}
                  onCellClick={(r, c) => fireAt(r, c)} />
              </div>
              <div className="fire-hint">
                {isMyTurn ? '▸ Click enemy grid to fire' : mode === 'solo' ? 'AI is targeting your fleet...' : 'Waiting for enemy attack...'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── SCOREBOARD ─── */}
      {screen === 'scoreboard' && currentUser && (
        <div className="score-screen">
          <div className="sb-title">📊 SCOREBOARD</div>
          <div className="sb-sub">▸ FLEET RECORDS & GLOBAL RANKINGS ◂</div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-sm" onClick={goLobby}><span>◂ BACK TO LOBBY</span></button>
          </div>
          <div className="sb-layout">
            {/* Personal */}
            <div>
              <div className="sb-section">
                <div className="sb-section-title">▸ COMMANDER: {currentUser.username.toUpperCase()}</div>
                <div className="stat-grid">
                  {[
                    { val: currentUser.stats.wins, lbl: 'TOTAL WINS' },
                    { val: currentUser.stats.losses, lbl: 'LOSSES' },
                    { val: currentUser.stats.gamesPlayed, lbl: 'GAMES PLAYED' },
                    { val: currentUser.stats.bestStreak, lbl: 'BEST STREAK' },
                    { val: currentUser.stats.winStreak, lbl: 'CURRENT STREAK' },
                    { val: `${currentUser.stats.totalShots > 0 ? Math.round(currentUser.stats.totalHits / currentUser.stats.totalShots * 100) : 0}%`, lbl: 'LIFETIME ACCURACY' },
                  ].map((s, i) => (
                    <div key={i} className="stat-card">
                      <div className="stat-val">{s.val}</div>
                      <div className="stat-lbl">{s.lbl}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="sb-section">
                <div className="sb-section-title">▸ ACHIEVEMENTS</div>
                <div className="achieve-grid">
                  {ACHIEVEMENTS.map(ach => {
                    const unlocked = ach.check(currentUser.stats);
                    return (
                      <div key={ach.id} className={`ach-card ${unlocked ? 'unlocked' : 'locked'}`}>
                        <div className="ach-icon">{ach.icon}</div>
                        <div className="ach-title">{ach.title}</div>
                        <div className="ach-desc">{ach.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Global */}
            <div>
              <div className="sb-section">
                <div className="sb-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>▸ GLOBAL DAILY LEADERS ({todayKey()})</span>
                  <button className="btn btn-sm" onClick={loadScoreboard}><span>⟳ REFRESH</span></button>
                </div>
                {sbLoading ? (
                  <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                ) : (
                  <div className="leaderboard">
                    <div className="lb-head"><span>#</span><span>COMMANDER</span><span style={{ textAlign: 'right' }}>TODAY</span><span style={{ textAlign: 'right' }}>TOTAL</span></div>
                    {globalLeaders.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'Share Tech Mono,monospace', fontSize: 12, color: 'var(--tx3)' }}>No battles recorded today.</div>
                    ) : globalLeaders.map((entry, i) => {
                      const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                      const isMe = entry.username.toLowerCase() === currentUser.username.toLowerCase();
                      return (
                        <div key={entry.username} className={`lb-row ${isMe ? 'me' : ''}`}>
                          <span className={`lb-rank ${rankCls}`}>{i === 0 ? '👑' : i + 1}</span>
                          <span className={`lb-name ${isMe ? 'me' : ''}`}>{entry.username}{isMe ? ' (you)' : ''}</span>
                          <span className="lb-wins">{entry.dailyWins}</span>
                          <span className="lb-total">{entry.totalWins}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── RESULT ─── */}
      {screen === 'result' && (
        <div className="result-screen">
          <div className="result-icon">{resultWon ? '🏆' : '💀'}</div>
          <div className={`result-title ${resultWon ? 'result-win' : 'result-lose'}`}>{resultWon ? 'VICTORY!' : 'DEFEATED'}</div>
          <div className="result-sub">
            {resultWon
              ? `${NATIONS[nation].flag} ${NATIONS[nation].name} dominates the seas!`
              : `${NATIONS[opponentNation].flag} ${NATIONS[opponentNation].name} wins — your fleet is destroyed.`}
          </div>
          <div className="result-stats">
            {[
              { val: myHits, lbl: 'HITS' },
              { val: myMisses, lbl: 'MISSES' },
              { val: `${myHits + myMisses > 0 ? Math.round(myHits / (myHits + myMisses) * 100) : 0}%`, lbl: 'ACCURACY' },
              { val: currentUser?.stats.wins ?? 0, lbl: 'TOTAL WINS' },
            ].map((s, i) => (
              <div key={i} className="rs-card">
                <div className="rs-val">{s.val}</div>
                <div className="rs-lbl">{s.lbl}</div>
              </div>
            ))}
          </div>
          {newAchievements.length > 0 && (
            <div className="result-ach">
              <div className="result-ach-title">🎖 ACHIEVEMENTS UNLOCKED</div>
              {newAchievements.map(a => (
                <div key={a.id} className="new-ach"><span>{a.icon}</span><span>{a.title} — {a.desc}</span></div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-gold" onClick={playAgain}><span>▸ NEW BATTLE</span></button>
            <button className="btn" onClick={() => { loadScoreboard(); setScreen('scoreboard'); }}><span>📊 SCOREBOARD</span></button>
            <button className="btn" onClick={goLobby}><span>◂ MAIN MENU</span></button>
          </div>
        </div>
      )}
    </div>
  );
}
