// ============================================================
// battleshipsVM.tsx
// ViewModel layer: types, constants, game logic, AI, audio, storage
// No React imports here — pure logic consumed by the View (battleships.tsx)
// ============================================================

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type Screen = 'auth' | 'lobby' | 'setup' | 'game' | 'scoreboard' | 'result';
export type GameMode = 'solo' | 'multi';
export type AIDifficulty = 'easy' | 'medium' | 'hard'; // derived from board size — not chosen by user
export type Nation = 'usa' | 'russia' | 'china';
export type Orientation = 'H' | 'V';
export type Role = 'host' | 'guest';

export interface Coord {
  r: number;
  c: number;
}

export interface Cell {
  ship: string | null; // ship id or null
  hit: boolean;
}

export interface EnemyCell {
  hit: boolean;
  miss: boolean;
  sunk: boolean;
}

export interface ShipConfig {
  name: string;
  size: number;
  emoji: string;
  count: number;
}

export interface ShipListItem extends ShipConfig {
  id: string;
  placed: boolean;
  cells: Coord[] | null;
}

export interface PlacedShip {
  id: string;
  cells: Coord[];
  sunk: boolean;
  name: string;
  emoji: string;
  size: number;
}

export interface UserStats {
  username: string;
  wins: number;
  losses: number;
  totalShots: number;
  totalHits: number;
  gamesPlayed: number;
  winStreak: number;
  bestStreak: number;
  bestAccuracy: number;
  beatenHardAI: number; // won on 15×15 (hardest board = Admiral AI)
  dailyWins: Record<string, number>;
}

export interface UserRecord {
  username: string;
  passwordHash: string;
}

export interface CurrentUser {
  username: string;
  stats: UserStats;
  isGuest: boolean; // guests have no persistent storage — stats live in memory only
}

export interface GlobalLeaderEntry {
  username: string;
  dailyWins: number;
  totalWins: number;
  date: string;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  check: (stats: UserStats) => boolean;
}

export interface LogEntry {
  id: number;
  time: string;
  msg: string;
  cls: string;
}

// Multiplayer wire messages
export type PeerMessage =
  | { type: 'nation'; nation: Nation }
  | { type: 'ready'; nation: Nation }
  | { type: 'fire'; r: number; c: number }
  | { type: 'fireResult'; r: number; c: number; hit: boolean; sunk: boolean; sunkCells: Coord[] | null; sunkName: string | null; gameOver: boolean }
  | { type: 'gameOver' };

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

export const NATIONS: Record<Nation, { name: string; flag: string; color: string; accent: string }> = {
  usa:    { name: 'U.S. NAVY',    flag: '🇺🇸', color: '#3c5a8a', accent: '#4a90d9' },
  russia: { name: 'RUSSIAN NAVY', flag: '🇷🇺', color: '#8a2222', accent: '#d94a4a' },
  china:  { name: 'PLAN CHINA',   flag: '🇨🇳', color: '#8a3a00', accent: '#d97a00' },
};

export const AI_NATIONS: Nation[] = ['russia', 'china', 'usa'];

export const SHIP_CONFIGS: Record<number, ShipConfig[]> = {
  5: [
    { name: 'Destroyer',    size: 2, emoji: '🚢', count: 1 },
    { name: 'Cruiser',      size: 3, emoji: '⚓', count: 1 },
    { name: 'Battleship',   size: 4, emoji: '🛳', count: 1 },
  ],
  10: [
    { name: 'Patrol',       size: 2, emoji: '🚤', count: 1 },
    { name: 'Destroyer',    size: 2, emoji: '🚢', count: 1 },
    { name: 'Submarine',    size: 3, emoji: '🐋', count: 1 },
    { name: 'Cruiser',      size: 3, emoji: '⚓', count: 1 },
    { name: 'Battleship',   size: 4, emoji: '🛳', count: 1 },
    { name: 'Carrier',      size: 5, emoji: '✈',  count: 1 },
  ],
  15: [
    { name: 'Patrol',       size: 2, emoji: '🚤', count: 2 },
    { name: 'Destroyer',    size: 2, emoji: '🚢', count: 2 },
    { name: 'Submarine',    size: 3, emoji: '🐋', count: 1 },
    { name: 'Cruiser',      size: 3, emoji: '⚓', count: 1 },
    { name: 'Frigate',      size: 3, emoji: '⚔',  count: 1 },
    { name: 'Battleship',   size: 4, emoji: '🛳', count: 1 },
    { name: 'Carrier',      size: 5, emoji: '✈',  count: 1 },
    { name: 'Supercarrier', size: 6, emoji: '🛸', count: 1 },
  ],
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win',    icon: '🏆', title: 'First Blood',    desc: 'Win your first battle',                check: s => s.wins >= 1 },
  { id: 'five_wins',    icon: '⭐', title: 'Naval Veteran',  desc: 'Win 5 battles',                        check: s => s.wins >= 5 },
  { id: 'ten_wins',     icon: '🌟', title: 'Fleet Admiral',  desc: 'Win 10 battles',                       check: s => s.wins >= 10 },
  { id: 'sharpshooter', icon: '🎯', title: 'Sharpshooter',   desc: 'Achieve 70%+ accuracy in a game',      check: s => (s.bestAccuracy ?? 0) >= 70 },
  { id: 'perfect',      icon: '💎', title: 'Perfect Aim',    desc: 'Achieve 90%+ accuracy in a game',      check: s => (s.bestAccuracy ?? 0) >= 90 },
  { id: 'streak3',      icon: '🔥', title: 'On Fire',        desc: 'Win 3 battles in a row',               check: s => s.bestStreak >= 3 },
  { id: 'streak5',      icon: '⚡', title: 'Unstoppable',    desc: 'Win 5 battles in a row',               check: s => s.bestStreak >= 5 },
  { id: 'played10',     icon: '🚢', title: 'Sea Dog',        desc: 'Play 10 games',                        check: s => s.gamesPlayed >= 10 },
  { id: 'admiral',      icon: '👑', title: 'The Admiral',    desc: 'Beat the Admiral AI on a 15×15 board', check: s => (s.beatenHardAI ?? 0) >= 1 },
];

// ─────────────────────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────────────────────

export const colName = (c: number): string => String.fromCharCode(65 + c);

export const todayKey = (): string => new Date().toISOString().slice(0, 10);

export const simpleHash = (str: string): string => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
};

/**
 * Board size drives AI difficulty automatically.
 * 5×5   → easy   (random shots — Ensign)
 * 10×10 → medium (hunt & target — Captain)
 * 15×15 → hard   (probability density — Admiral)
 */
export const difficultyFromBoardSize = (boardSize: number): AIDifficulty => {
  if (boardSize <= 5)  return 'easy';
  if (boardSize <= 10) return 'medium';
  return 'hard';
};

export const difficultyLabel = (boardSize: number): { rank: string; badge: string } => {
  if (boardSize <= 5)  return { rank: 'ENSIGN',  badge: 'EASY' };
  if (boardSize <= 10) return { rank: 'CAPTAIN', badge: 'MEDIUM' };
  return                      { rank: 'ADMIRAL', badge: 'HARD' };
};

// ─────────────────────────────────────────────────────────────
// BOARD FACTORIES
// ─────────────────────────────────────────────────────────────

export const makeBoard = (size: number): Cell[][] =>
  Array(size).fill(null).map(() =>
    Array(size).fill(null).map(() => ({ ship: null, hit: false }))
  );

export const makeEnemyBoard = (size: number): EnemyCell[][] =>
  Array(size).fill(null).map(() =>
    Array(size).fill(null).map(() => ({ hit: false, miss: false, sunk: false }))
  );

// ─────────────────────────────────────────────────────────────
// SHIP PLACEMENT LOGIC
// ─────────────────────────────────────────────────────────────

export const getCells = (r: number, c: number, size: number, orient: Orientation): Coord[] => {
  const cells: Coord[] = [];
  for (let i = 0; i < size; i++) {
    cells.push(orient === 'H' ? { r, c: c + i } : { r: r + i, c });
  }
  return cells;
};

export const isValidPlacement = (cells: Coord[], board: Cell[][], boardSize: number): boolean =>
  cells.every(({ r, c }) =>
    r >= 0 && r < boardSize &&
    c >= 0 && c < boardSize &&
    board[r][c].ship === null
  );

export const buildShipList = (boardSize: number): ShipListItem[] => {
  const configs = SHIP_CONFIGS[boardSize];
  const list: ShipListItem[] = [];
  configs.forEach((cfg, ci) => {
    for (let k = 0; k < cfg.count; k++) {
      list.push({ ...cfg, id: `${ci}_${k}`, placed: false, cells: null });
    }
  });
  return list;
};

export const autoPlaceShips = (
  shipList: ShipListItem[],
  boardSize: number
): { board: Cell[][]; placed: PlacedShip[]; shipList: ShipListItem[] } => {
  const board = makeBoard(boardSize);
  const placed: PlacedShip[] = [];
  const updated = shipList.map(s => ({ ...s }));

  for (const ship of updated) {
    let ok = false;
    let tries = 0;
    while (!ok && tries++ < 1000) {
      const orient: Orientation = Math.random() < 0.5 ? 'H' : 'V';
      const r = Math.floor(Math.random() * boardSize);
      const c = Math.floor(Math.random() * boardSize);
      const cells = getCells(r, c, ship.size, orient);
      if (isValidPlacement(cells, board, boardSize)) {
        ship.placed = true;
        ship.cells = cells;
        cells.forEach(({ r, c }) => (board[r][c].ship = ship.id));
        placed.push({ id: ship.id, cells, sunk: false, name: ship.name, emoji: ship.emoji, size: ship.size });
        ok = true;
      }
    }
  }
  return { board, placed, shipList: updated };
};

// ─────────────────────────────────────────────────────────────
// AUDIO ENGINE
// ─────────────────────────────────────────────────────────────

export interface AudioEngine {
  playCannonShot: () => void;
  playExplosion: () => void;
  playSplash: () => void;
}

export const createAudioEngine = (): AudioEngine => {
  let ctx: AudioContext | null = null;

  const getCtx = (): AudioContext => {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctx;
  };

  const playCannonShot = (): void => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;

      // Low thud — body of the shot
      const osc1 = ac.createOscillator();
      const gain1 = ac.createGain();
      osc1.connect(gain1);
      gain1.connect(ac.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(80, t);
      osc1.frequency.exponentialRampToValueAtTime(20, t + 0.4);
      gain1.gain.setValueAtTime(1.2, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc1.start(t);
      osc1.stop(t + 0.5);

      // Noise burst — the "crack"
      const bufLen = ac.sampleRate * 0.3;
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ac.createGain();
      const noiseFilter = ac.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 300;
      noiseFilter.Q.value = 0.5;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ac.destination);
      noiseGain.gain.setValueAtTime(0.8, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      noise.start(t);
      noise.stop(t + 0.3);

      // High crack transient
      const osc2 = ac.createOscillator();
      const gain2 = ac.createGain();
      osc2.connect(gain2);
      gain2.connect(ac.destination);
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(200, t);
      osc2.frequency.exponentialRampToValueAtTime(50, t + 0.15);
      gain2.gain.setValueAtTime(0.6, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc2.start(t);
      osc2.stop(t + 0.2);
    } catch (_e) {
      // Audio context unavailable — silently ignore
    }
  };

  const playExplosion = (): void => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60 - i * 15, t + i * 0.05);
        osc.frequency.exponentialRampToValueAtTime(10, t + 0.8);
        gain.gain.setValueAtTime(0.6 - i * 0.1, t + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
        osc.start(t + i * 0.05);
        osc.stop(t + 1.0);
      }
    } catch (_e) {}
  };

  const playSplash = (): void => {
    try {
      const ac = getCtx();
      if (ac.state === 'suspended') ac.resume();
      const t = ac.currentTime;
      const bufLen = ac.sampleRate * 0.4;
      const buf = ac.createBuffer(1, bufLen, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
      }
      const noise = ac.createBufferSource();
      noise.buffer = buf;
      const filter = ac.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      const gain = ac.createGain();
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ac.destination);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      noise.start(t);
      noise.stop(t + 0.5);
    } catch (_e) {}
  };

  return { playCannonShot, playExplosion, playSplash };
};

// Singleton — one audio context for the whole app lifetime
export const audioEngine = createAudioEngine();

// ─────────────────────────────────────────────────────────────
// AI ENGINE
// ─────────────────────────────────────────────────────────────

export interface AIState {
  difficulty: AIDifficulty;
  boardSize: number;
  board: Cell[][];
  ships: PlacedShip[];
  hitStack: Coord[];
  direction: [number, number] | null;
}

export interface AIEngine {
  state: AIState;
  chooseShot: (myBoard: Cell[][], myShips: PlacedShip[]) => Coord;
  registerHit: (r: number, c: number, shipSunk: boolean) => void;
  reset: () => void;
}

export const createAI = (difficulty: AIDifficulty, boardSize: number): AIEngine => {
  const aiState: AIState = {
    difficulty,
    boardSize,
    board: [],
    ships: [],
    hitStack: [],
    direction: null,
  };

  const init = (): void => {
    const { board, placed } = autoPlaceShips(buildShipList(boardSize), boardSize);
    aiState.board = board;
    aiState.ships = placed;
    aiState.hitStack = [];
    aiState.direction = null;
  };

  init();

  const alreadyShot = (r: number, c: number, board: Cell[][]): boolean => board[r][c].hit;

  const randomUnshot = (board: Cell[][]): Coord => {
    const candidates: Coord[] = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (!alreadyShot(r, c, board)) candidates.push({ r, c });
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const probabilityShot = (board: Cell[][], myShips: PlacedShip[]): Coord => {
    const prob: number[][] = Array(boardSize).fill(null).map(() => Array(boardSize).fill(0));
    const alive = myShips.filter(s => !s.sunk);
    const sizes = [...new Set(alive.map(s => s.size))];

    for (const sz of sizes) {
      // Horizontal placements
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c <= boardSize - sz; c++) {
          let valid = true;
          for (let i = 0; i < sz; i++) {
            if (board[r][c + i].hit && board[r][c + i].ship === null) { valid = false; break; }
          }
          if (valid) for (let i = 0; i < sz; i++) prob[r][c + i]++;
        }
      }
      // Vertical placements
      for (let r = 0; r <= boardSize - sz; r++) {
        for (let c = 0; c < boardSize; c++) {
          let valid = true;
          for (let i = 0; i < sz; i++) {
            if (board[r + i][c].hit && board[r + i][c].ship === null) { valid = false; break; }
          }
          if (valid) for (let i = 0; i < sz; i++) prob[r + i][c]++;
        }
      }
    }

    // Zero out already-shot cells
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (alreadyShot(r, c, board)) prob[r][c] = 0;
      }
    }

    // Boost adjacents of unsunk hits
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    aiState.hitStack.forEach(h => {
      dirs.forEach(([dr, dc]) => {
        const nr = h.r + dr, nc = h.c + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, board)) {
          prob[nr][nc] += 50;
        }
      });
    });

    let best = -1;
    let bests: Coord[] = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (prob[r][c] > best) { best = prob[r][c]; bests = []; }
        if (prob[r][c] === best) bests.push({ r, c });
      }
    }
    return bests.length ? bests[Math.floor(Math.random() * bests.length)] : randomUnshot(board);
  };

  const chooseShot = (myBoard: Cell[][], myShips: PlacedShip[]): Coord => {
    if (aiState.difficulty === 'easy') return randomUnshot(myBoard);
    if (aiState.difficulty === 'hard') return probabilityShot(myBoard, myShips);

    // Medium: Hunt & Target
    if (aiState.hitStack.length > 0) {
      const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const hit = aiState.hitStack[aiState.hitStack.length - 1];

      if (aiState.direction) {
        const [dr, dc] = aiState.direction;
        const nr = hit.r + dr, nc = hit.c + dc;
        if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, myBoard)) {
          return { r: nr, c: nc };
        }
        const first = aiState.hitStack[0];
        const nr2 = first.r - dr, nc2 = first.c - dc;
        if (nr2 >= 0 && nr2 < boardSize && nc2 >= 0 && nc2 < boardSize && !alreadyShot(nr2, nc2, myBoard)) {
          return { r: nr2, c: nc2 };
        }
        aiState.direction = null;
      }

      for (let i = aiState.hitStack.length - 1; i >= 0; i--) {
        const h = aiState.hitStack[i];
        for (const [dr, dc] of dirs) {
          const nr = h.r + dr, nc = h.c + dc;
          if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && !alreadyShot(nr, nc, myBoard)) {
            return { r: nr, c: nc };
          }
        }
      }
    }
    return randomUnshot(myBoard);
  };

  const registerHit = (r: number, c: number, shipSunk: boolean): void => {
    if (shipSunk) {
      aiState.hitStack = [];
      aiState.direction = null;
    } else {
      if (aiState.hitStack.length > 0 && !aiState.direction) {
        const prev = aiState.hitStack[aiState.hitStack.length - 1];
        aiState.direction = [r - prev.r, c - prev.c];
      }
      aiState.hitStack.push({ r, c });
    }
  };

  return { state: aiState, chooseShot, registerHit, reset: init };
};

// ─────────────────────────────────────────────────────────────
// STORAGE / AUTH HELPERS
// ─────────────────────────────────────────────────────────────

// Typed wrapper around window.storage (Artifact Storage API)
declare const window: Window & {
  storage: {
    get: (key: string, shared?: boolean) => Promise<{ key: string; value: string } | null>;
    set: (key: string, value: string, shared?: boolean) => Promise<unknown>;
    list: (prefix?: string, shared?: boolean) => Promise<{ keys: string[] } | null>;
  };
};

export const defaultStats = (username: string): UserStats => ({
  username,
  wins: 0,
  losses: 0,
  totalShots: 0,
  totalHits: 0,
  gamesPlayed: 0,
  winStreak: 0,
  bestStreak: 0,
  bestAccuracy: 0,
  beatenHardAI: 0,
  dailyWins: {},
});

export const loadUserStats = async (username: string): Promise<UserStats> => {
  try {
    const res = await window.storage.get(`stats:${username}`);
    if (res) return JSON.parse(res.value) as UserStats;
  } catch (_e) {}
  return defaultStats(username);
};

export const saveUserStats = async (stats: UserStats): Promise<void> => {
  try {
    await window.storage.set(`stats:${stats.username}`, JSON.stringify(stats));
  } catch (_e) {}
};

// ─────────────────────────────────────────────────────────────
// AUTH HELPERS
// ─────────────────────────────────────────────────────────────

const validateUsername = (username: string): string | null => {
  const t = username.trim();
  if (t.length < 2)  return 'Username must be at least 2 characters.';
  if (t.length > 20) return 'Username must be 20 characters or less.';
  if (!/^[a-zA-Z0-9_\- ]+$/.test(t)) return 'Only letters, numbers, spaces, _ and - allowed.';
  return null;
};

export const tryRegister = async (username: string, password: string): Promise<string | null> => {
  const nameErr = validateUsername(username);
  if (nameErr) return nameErr;
  if (password.length < 4) return 'Password must be at least 4 characters.';

  const key = `user:${username.trim().toLowerCase()}`;
  const hash = simpleHash(password);
  try {
    try {
      const existing = await window.storage.get(key);
      if (existing) return 'Username already taken.';
    } catch (_e) {}
    await window.storage.set(key, JSON.stringify({ username: username.trim(), passwordHash: hash } as UserRecord));
    return null;
  } catch (_e) {
    return 'Storage error — try again.';
  }
};

export const tryLogin = async (username: string, password: string): Promise<string | null> => {
  const nameErr = validateUsername(username);
  if (nameErr) return nameErr;
  if (!password) return 'Password is required.';

  const key = `user:${username.trim().toLowerCase()}`;
  const hash = simpleHash(password);
  try {
    const res = await window.storage.get(key);
    if (!res) return 'User not found.';
    const user = JSON.parse(res.value) as UserRecord;
    if (user.passwordHash !== hash) return 'Wrong password.';
    return null;
  } catch (_e) {
    return 'Storage error — try again.';
  }
};

/**
 * Guest sign-in — username only, no password, no registration.
 * Stats live in memory for the session only.
 * Refreshing the page clears the session; the player must re-enter a name.
 * Guest wins appear on the global leaderboard (tagged [G]) but personal
 * achievement progress is NOT persisted to storage.
 */
export const enterAsGuest = (username: string): { error: string | null } => {
  const nameErr = validateUsername(username);
  if (nameErr) return { error: nameErr };
  return { error: null };
};

export const saveGlobalLeaderEntry = async (
  username: string,
  dailyWins: number,
  totalWins: number
): Promise<void> => {
  const today = todayKey();
  try {
    await window.storage.set(
      `lb:${today}:${username}`,
      JSON.stringify({ username, dailyWins, totalWins, date: today } as GlobalLeaderEntry),
      true // shared = visible to all users
    );
  } catch (_e) {}
};

export const loadGlobalLeaders = async (): Promise<GlobalLeaderEntry[]> => {
  const today = todayKey();
  const leaders: GlobalLeaderEntry[] = [];
  try {
    const keysRes = await window.storage.list(`lb:${today}:`, true);
    if (keysRes?.keys) {
      for (const k of keysRes.keys.slice(0, 50)) {
        try {
          const r = await window.storage.get(k, true);
          if (r) leaders.push(JSON.parse(r.value) as GlobalLeaderEntry);
        } catch (_e) {}
      }
    }
  } catch (_e) {}
  leaders.sort((a, b) => b.dailyWins - a.dailyWins || b.totalWins - a.totalWins);
  return leaders;
};

// ─────────────────────────────────────────────────────────────
// GAME RESULT PROCESSOR
// ─────────────────────────────────────────────────────────────

export interface GameResultInput {
  username: string;
  isGuest: boolean;  // guests: update in-memory stats only, no storage writes
  won: boolean;
  hits: number;
  misses: number;
  boardSize: number; // difficulty is derived from board size
  mode: GameMode;
  // For guests we pass the current in-memory stats so we can update them
  currentStats?: UserStats;
}

export interface GameResultOutput {
  updatedStats: UserStats;
  newAchievements: Achievement[];
}

export const processGameResult = async (input: GameResultInput): Promise<GameResultOutput> => {
  const { username, isGuest, won, hits, misses, boardSize, mode, currentStats } = input;
  const difficulty = difficultyFromBoardSize(boardSize);
  const shots = hits + misses;
  const acc   = shots > 0 ? Math.round((hits / shots) * 100) : 0;

  // Guests start from their in-memory stats; registered users load from storage
  const stats: UserStats = isGuest
    ? { ...(currentStats ?? defaultStats(username)) }
    : await loadUserStats(username);

  // Snapshot unlocked achievements before update
  const prevUnlocked = new Set(ACHIEVEMENTS.filter(a => a.check(stats)).map(a => a.id));

  // Update stats
  stats.gamesPlayed++;
  stats.totalShots   += shots;
  stats.totalHits    += hits;
  stats.bestAccuracy  = Math.max(stats.bestAccuracy ?? 0, acc);

  if (won) {
    stats.wins++;
    stats.winStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.winStreak);
    const today = todayKey();
    stats.dailyWins[today] = (stats.dailyWins[today] ?? 0) + 1;
    if (difficulty === 'hard' && mode === 'solo') {
      stats.beatenHardAI = (stats.beatenHardAI ?? 0) + 1;
    }
  } else {
    stats.losses++;
    stats.winStreak = 0;
  }

  if (!isGuest) {
    // Registered users: persist stats and contribute to the global leaderboard
    await saveUserStats(stats);
    await saveGlobalLeaderEntry(
      username,
      stats.dailyWins[todayKey()] ?? 0,
      stats.wins
    );
  } else if (won) {
    // Guests who win still appear on the leaderboard (tagged with [G])
    // but we never write to their personal stats key in storage
    const displayName = `${username} [G]`;
    const today = todayKey();
    await saveGlobalLeaderEntry(
      displayName,
      stats.dailyWins[today] ?? 0,
      stats.wins
    );
  }

  const newAchievements = ACHIEVEMENTS.filter(a => a.check(stats) && !prevUnlocked.has(a.id));
  return { updatedStats: stats, newAchievements };
};
