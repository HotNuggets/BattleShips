// ============================================================
// battleships.tsx
// View layer: React component tree
// Imports all logic from battleshipsVM.tsx
// Imports all styles from battleships.module.scss
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './battleships.module.scss';

import {
  // Types
  Screen, GameMode, AIDifficulty, Nation, Orientation, Role,
  Coord, Cell, EnemyCell, ShipListItem, PlacedShip,
  CurrentUser, UserStats, GlobalLeaderEntry, LogEntry, PeerMessage,
  // Constants
  NATIONS, AI_NATIONS, SHIP_CONFIGS, ACHIEVEMENTS,
  // Utils
  colName, todayKey, difficultyFromBoardSize, difficultyLabel,
  // Board helpers
  makeBoard, makeEnemyBoard, getCells, isValidPlacement,
  buildShipList, autoPlaceShips,
  // Audio
  audioEngine,
  // AI
  createAI, AIEngine,
  // Storage / auth
  loadUserStats, defaultStats,
  tryLogin, tryRegister, enterAsGuest,
  loadGlobalLeaders,
  processGameResult,
} from './battleshipsVM';

// ─────────────────────────────────────────────────────────────
// TOAST COMPONENT
// ─────────────────────────────────────────────────────────────

interface ToastProps {
  message: string;
  type: string;
  visible: boolean;
}

const Toast: React.FC<ToastProps> = ({ message, type, visible }) => {
  if (!visible) return null;
  return (
    <div className={styles.toastWrap}>
      <div className={`${styles.toast} ${type === 'danger' ? styles.toastDanger : ''}`}>
        {message}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// GRID COMPONENT
// ─────────────────────────────────────────────────────────────

interface GridProps {
  board: Cell[][] | EnemyCell[][];
  boardSize: number;
  enemyView?: boolean;
  placedShips?: PlacedShip[];
  previewCells?: Coord[] | null;
  invalidPreview?: boolean;
  onCellClick?: (r: number, c: number) => void;
  onCellHover?: (r: number, c: number) => void;
  onCellLeave?: () => void;
}

const Grid: React.FC<GridProps> = ({
  board,
  boardSize,
  enemyView = false,
  placedShips,
  previewCells,
  invalidPreview,
  onCellClick,
  onCellHover,
  onCellLeave,
}) => {
  const cellSize = boardSize === 15 ? styles.xs : boardSize === 10 ? styles.sm : '';
  const w = boardSize === 15 ? 27 : boardSize === 10 ? 34 : 42;

  const getCellClass = (r: number, c: number): string => {
    const classes = [styles.cell, cellSize];
    if (!enemyView) {
      const cell = board[r][c] as Cell;
      if (previewCells?.some(p => p.r === r && p.c === c)) {
        classes.push(invalidPreview ? styles.invalid : styles.preview);
      } else if (cell.ship) {
        classes.push(styles.placed);
      }
      if (cell.hit) classes.push(cell.ship ? styles.hit : styles.miss);
    } else {
      const cell = board[r][c] as EnemyCell;
      if (cell.sunk)      classes.push(styles.sunk);
      else if (cell.hit)  classes.push(styles.hit);
      else if (cell.miss) classes.push(styles.miss);
    }
    return classes.filter(Boolean).join(' ');
  };

  const getCellContent = (r: number, c: number): string => {
    if (!enemyView) {
      const cell = board[r][c] as Cell;
      if (cell.hit && cell.ship)  return '🔥';
      if (cell.hit && !cell.ship) return '○';
      if (cell.ship) {
        const ship = placedShips?.find(s => s.id === cell.ship);
        if (ship && ship.cells[0].r === r && ship.cells[0].c === c) return ship.emoji;
      }
      return '';
    } else {
      const cell = board[r][c] as EnemyCell;
      if (cell.sunk) return '💥';
      if (cell.hit)  return '🔥';
      if (cell.miss) return '○';
      return '';
    }
  };

  return (
    <div>
      {/* Column axis labels */}
      <div className={styles.colAxis}>
        {Array(boardSize).fill(0).map((_, i) => (
          <div key={i} className={styles.axisLbl} style={{ width: w, height: 18 }}>
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex' }}>
        {/* Row axis labels */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {Array(boardSize).fill(0).map((_, i) => (
            <div key={i} className={styles.axisLbl} style={{ width: 20, height: w }}>
              {i + 1}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div
          className={styles.gameGrid}
          style={{ gridTemplateColumns: `repeat(${boardSize}, 1fr)` }}
        >
          {Array(boardSize).fill(0).map((_, r) =>
            Array(boardSize).fill(0).map((__, c) => (
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
};

// ─────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────

const App: React.FC = () => {

  // ── Auth
  const [screen, setScreen]          = useState<Screen>('auth');
  const [authTab, setAuthTab]         = useState<'login' | 'register' | 'guest'>('login');
  const [authUser, setAuthUser]       = useState('');
  const [authPass, setAuthPass]       = useState('');
  const [authErr, setAuthErr]         = useState('');
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  // ── Toast
  const [toastMsg, setToastMsg]       = useState('');
  const [toastType, setToastType]     = useState('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string, type = '', dur = 2500) => {
    setToastMsg(msg);
    setToastType(type);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), dur);
  }, []);

  // ── Game setup
  const [mode, setMode]               = useState<GameMode | null>(null);
  const [nation, setNation]           = useState<Nation>('usa');
  const [boardSize, setBoardSize]     = useState<number>(5);
  const [orientation, setOrientation] = useState<Orientation>('H');
  const [shipList, setShipList]       = useState<ShipListItem[]>([]);
  const [myBoard, setMyBoard]         = useState<Cell[][]>([]);
  const [placedShips, setPlacedShips] = useState<PlacedShip[]>([]);
  const [selectedShip, setSelectedShip] = useState<string | null>(null);
  const [previewCells, setPreviewCells] = useState<Coord[] | null>(null);
  const [previewInvalid, setPreviewInvalid] = useState(false);
  const [youReady, setYouReady]       = useState(false);
  const [oppReady, setOppReady]       = useState(false);

  // ── Game play
  const [isMyTurn, setIsMyTurn]       = useState(false);
  const [enemyBoard, setEnemyBoard]   = useState<EnemyCell[][]>([]);
  const [myHits, setMyHits]           = useState(0);
  const [myMisses, setMyMisses]       = useState(0);
  const [enemyHits, setEnemyHits]     = useState(0);
  const [opponentNation, setOpponentNation] = useState<Nation>('russia');
  const [gameOver, setGameOver]       = useState(false);
  const [logEntries, setLogEntries]   = useState<LogEntry[]>([]);
  const [aiThinking, setAiThinking]   = useState(false);
  const [cannonFlash, setCannonFlash] = useState(false);

  // ── Result
  const [resultWon, setResultWon]         = useState(false);
  const [newAchievements, setNewAchievements] = useState<typeof ACHIEVEMENTS>([]);

  // ── Multiplayer
  const [roomCode, setRoomCode]       = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [peerStatus, setPeerStatus]   = useState('');
  const [joinStatus, setJoinStatus]   = useState('');
  const [lobbyPanel, setLobbyPanel]   = useState<'solo' | 'create' | 'join' | null>(null);
  const peerRef  = useRef<any>(null);
  const connRef  = useRef<any>(null);

  // ── Scoreboard
  const [globalLeaders, setGlobalLeaders] = useState<GlobalLeaderEntry[]>([]);
  const [sbLoading, setSbLoading]     = useState(false);

  // ── Mutable refs (avoid stale closures in async / timer callbacks)
  const aiRef            = useRef<AIEngine | null>(null);
  const myBoardRef       = useRef<Cell[][]>([]);
  const placedShipsRef   = useRef<PlacedShip[]>([]);
  const gameOverRef      = useRef(false);
  const isMyTurnRef      = useRef(false);
  const myHitsRef        = useRef(0);
  const myMissesRef      = useRef(0);
  const enemyHitsRef     = useRef(0);
  const modeRef          = useRef<GameMode | null>(null);
  const roleRef          = useRef<Role | null>(null);
  const logRef           = useRef<LogEntry[]>([]);

  // Keep refs in sync with state
  useEffect(() => { myBoardRef.current     = myBoard;     }, [myBoard]);
  useEffect(() => { placedShipsRef.current = placedShips; }, [placedShips]);
  useEffect(() => { gameOverRef.current    = gameOver;    }, [gameOver]);
  useEffect(() => { isMyTurnRef.current    = isMyTurn;    }, [isMyTurn]);
  useEffect(() => { modeRef.current        = mode;        }, [mode]);

  // Auto-scroll battle log
  useEffect(() => {
    const el = document.getElementById('battleLog');
    if (el) el.scrollTop = el.scrollHeight;
  }, [logEntries]);

  const addLog = useCallback((msg: string, cls = '') => {
    const time = new Date().toTimeString().slice(0, 5);
    const entry: LogEntry = { id: Date.now() + Math.random(), time, msg, cls };
    logRef.current = [...logRef.current.slice(-50), entry];
    setLogEntries([...logRef.current]);
  }, []);

  // ─────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────

  const handleAuth = async () => {
    setAuthErr('');

    if (authTab === 'guest') {
      const { error } = enterAsGuest(authUser);
      if (error) { setAuthErr(error); return; }
      // Guests get fresh in-memory stats — nothing loaded from or saved to storage
      setCurrentUser({ username: authUser.trim(), stats: defaultStats(authUser.trim()), isGuest: true });
      setScreen('lobby');
      return;
    }

    if (authTab === 'register') {
      const err = await tryRegister(authUser, authPass);
      if (err) { setAuthErr(err); return; }
      const stats = await loadUserStats(authUser.trim());
      setCurrentUser({ username: authUser.trim(), stats, isGuest: false });
      setScreen('lobby');
      return;
    }

    // login
    const err = await tryLogin(authUser, authPass);
    if (err) { setAuthErr(err); return; }
    const stats = await loadUserStats(authUser.trim());
    setCurrentUser({ username: authUser.trim(), stats, isGuest: false });
    setScreen('lobby');
  };

  // ─────────────────────────────────────────
  // SCOREBOARD
  // ─────────────────────────────────────────

  const openScoreboard = async () => {
    setSbLoading(true);
    setScreen('scoreboard');
    const leaders = await loadGlobalLeaders();
    setGlobalLeaders(leaders);
    setSbLoading(false);
  };

  // ─────────────────────────────────────────
  // SETUP
  // ─────────────────────────────────────────

  const enterSetup = (m: GameMode) => {
    setMode(m);
    modeRef.current = m;
    const sl = buildShipList(boardSize);
    setShipList(sl);
    setMyBoard(makeBoard(boardSize));
    setPlacedShips([]);
    setSelectedShip(null);
    setYouReady(false);
    setOppReady(false);
    logRef.current = [];
    setLogEntries([]);
    setScreen('setup');
  };

  const handleSizeChange = (s: number) => {
    setBoardSize(s);
    setShipList(buildShipList(s));
    setMyBoard(makeBoard(s));
    setPlacedShips([]);
    setSelectedShip(null);
    setPreviewCells(null);
  };

  const handlePlaceShip = (r: number, c: number) => {
    if (!selectedShip) { showToast('Select a ship first!'); return; }
    const ship = shipList.find(s => s.id === selectedShip);
    if (!ship || ship.placed) return;
    const cells = getCells(r, c, ship.size, orientation);
    if (!isValidPlacement(cells, myBoard, boardSize)) { showToast('Invalid placement!'); return; }

    const newBoard = myBoard.map(row => row.map(cell => ({ ...cell })));
    cells.forEach(({ r, c }) => (newBoard[r][c].ship = ship.id));

    const newShip: PlacedShip = { id: ship.id, cells, sunk: false, name: ship.name, emoji: ship.emoji, size: ship.size };
    const newPlaced = [...placedShips, newShip];
    const newList   = shipList.map(s => s.id === ship.id ? { ...s, placed: true, cells } : s);

    setMyBoard(newBoard);
    setPlacedShips(newPlaced);
    setShipList(newList);

    const next = newList.find(s => !s.placed);
    setSelectedShip(next?.id ?? null);
    setPreviewCells(null);
  };

  const handlePreview = (r: number, c: number) => {
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
    setShipList(buildShipList(boardSize));
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
    else setOppReady(true); // solo: opponent is always immediately "ready"
  };

  useEffect(() => {
    if (youReady && oppReady) {
      const t = setTimeout(() => startGame(), 600);
      return () => clearTimeout(t);
    }
  }, [youReady, oppReady]);

  // ─────────────────────────────────────────
  // MULTIPLAYER (PeerJS)
  // ─────────────────────────────────────────

  const sendMsg = (msg: PeerMessage) => {
    if (connRef.current?.open) connRef.current.send(msg);
  };

  const handlePeerMessage = useCallback((msg: PeerMessage) => {
    switch (msg.type) {
      case 'nation': setOpponentNation(msg.nation); break;
      case 'ready':  setOppReady(true); break;
      case 'fire':   handleIncomingFire(msg.r, msg.c); break;
      case 'fireResult': handleFireResultMulti(msg); break;
      case 'gameOver':   triggerResult(false); break;
    }
  }, []);

  const createRoom = () => {
    setLobbyPanel('create');
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    setRoomCode(code);
    roleRef.current = 'host';
    const peer = new (window as any).Peer('nw-' + code);
    peerRef.current = peer;
    peer.on('open', () => setPeerStatus('Ready — share code with opponent'));
    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      conn.on('data', handlePeerMessage);
      conn.on('close', () => { if (!gameOverRef.current) showToast('Opponent disconnected!', 'danger', 4000); });
      setPeerStatus('Opponent connected!');
      setTimeout(() => enterSetup('multi'), 1000);
    });
    peer.on('error', (e: any) => setPeerStatus('Error: ' + e.type));
  };

  const joinRoom = () => {
    if (joinCode.length < 4) { showToast('Enter a valid room code'); return; }
    roleRef.current = 'guest';
    setJoinStatus('Connecting...');
    const peer = new (window as any).Peer();
    peerRef.current = peer;
    peer.on('open', () => {
      const conn = peer.connect('nw-' + joinCode);
      connRef.current = conn;
      conn.on('open', () => { setJoinStatus('Connected!'); setTimeout(() => enterSetup('multi'), 800); });
      conn.on('data', handlePeerMessage);
      conn.on('error', (e: any) => setJoinStatus('Failed: ' + e));
    });
  };

  // ─────────────────────────────────────────
  // GAME START
  // ─────────────────────────────────────────

  const startGame = () => {
    const myTurn = modeRef.current === 'solo' ? true : roleRef.current === 'host';
    setIsMyTurn(myTurn);
    isMyTurnRef.current = myTurn;
    setGameOver(false);
    gameOverRef.current = false;
    setMyHits(0);    myHitsRef.current = 0;
    setMyMisses(0);  myMissesRef.current = 0;
    setEnemyHits(0); enemyHitsRef.current = 0;
    setEnemyBoard(makeEnemyBoard(boardSize));
    logRef.current = [];
    setLogEntries([]);
    setNewAchievements([]);

    if (modeRef.current === 'solo') {
      // Difficulty scales with board size — no manual selection needed
      const difficulty = difficultyFromBoardSize(boardSize);
      const ai = createAI(difficulty, boardSize);
      aiRef.current = ai;
      const randNation = AI_NATIONS[Math.floor(Math.random() * AI_NATIONS.length)];
      setOpponentNation(randNation);
    }

    addLog('⚓ Battle started! ' + (myTurn ? 'You fire first.' : 'Enemy fires first.'), styles.leSys);
    setScreen('game');
    if (modeRef.current === 'solo' && !myTurn) setTimeout(() => triggerAITurn(), 1200);
  };

  // ─────────────────────────────────────────
  // PLAYER FIRES AT ENEMY
  // ─────────────────────────────────────────

  const fireAt = (r: number, c: number) => {
    if (!isMyTurnRef.current || gameOverRef.current) return;
    const eb = enemyBoard;
    if (eb[r][c].hit || eb[r][c].miss || eb[r][c].sunk) { showToast('Already fired here!'); return; }

    // Sound + screen flash
    audioEngine.playCannonShot();
    setCannonFlash(true);
    setTimeout(() => setCannonFlash(false), 300);

    if (modeRef.current === 'solo') {
      const ai = aiRef.current!;
      const aiCell = ai.state.board[r][c];
      const isHit = aiCell.ship !== null;

      if (isHit) {
        ai.state.board[r][c].hit = true;
        const ship = ai.state.ships.find(s => s.id === aiCell.ship)!;
        const allSunk = ship.cells.every(({ r: sr, c: sc }) =>
          (sr === r && sc === c) || ai.state.board[sr][sc].hit
        );
        ai.state.board[r][c].hit = true;

        if (allSunk) {
          ship.sunk = true;
          ship.cells.forEach(({ r: sr, c: sc }) => (ai.state.board[sr][sc].hit = true));
          setEnemyBoard(prev => {
            const nb = prev.map(row => row.map(c => ({ ...c })));
            ship.cells.forEach(({ r: sr, c: sc }) => (nb[sr][sc] = { hit: false, miss: false, sunk: true }));
            return nb;
          });
          audioEngine.playExplosion();
          myHitsRef.current++;
          setMyHits(h => h + 1);
          addLog(`YOU SUNK enemy ${ship.name}! 💥`, styles.leSunk);
          showToast('ENEMY SHIP SUNK! 💥');
          if (ai.state.ships.every(s => s.sunk)) { triggerResult(true); return; }
          // Hit → fire again (turn stays)
        } else {
          setEnemyBoard(prev => {
            const nb = prev.map(row => row.map(c => ({ ...c })));
            nb[r][c] = { hit: true, miss: false, sunk: false };
            return nb;
          });
          myHitsRef.current++;
          setMyHits(h => h + 1);
          addLog(`HIT at ${colName(c)}${r + 1}! Fire again.`, styles.leHit);
          showToast('DIRECT HIT! Fire again.');
          // turn stays
        }
      } else {
        // Miss
        setEnemyBoard(prev => {
          const nb = prev.map(row => row.map(c => ({ ...c })));
          nb[r][c] = { hit: false, miss: true, sunk: false };
          return nb;
        });
        audioEngine.playSplash();
        myMissesRef.current++;
        setMyMisses(m => m + 1);
        addLog(`Missed at ${colName(c)}${r + 1}.`, styles.leMiss);
        setIsMyTurn(false);
        isMyTurnRef.current = false;
        setTimeout(() => triggerAITurn(), 900 + Math.random() * 600);
      }
    } else {
      // Multiplayer — send to opponent and wait for result
      sendMsg({ type: 'fire', r, c });
      setIsMyTurn(false);
      isMyTurnRef.current = false;
    }
  };

  // ─────────────────────────────────────────
  // AI TURN
  // ─────────────────────────────────────────

  const triggerAITurn = () => {
    if (gameOverRef.current || isMyTurnRef.current) return;
    setAiThinking(true);
    setTimeout(() => {
      if (gameOverRef.current) { setAiThinking(false); return; }
      const ai      = aiRef.current!;
      const board   = myBoardRef.current;
      const ships   = placedShipsRef.current;
      const { r, c } = ai.chooseShot(board, ships);
      doAIFire(r, c);
      setAiThinking(false);
    }, 600 + Math.random() * 500);
  };

  const doAIFire = (r: number, c: number) => {
    const board     = myBoardRef.current;
    const boardCell = board[r][c];
    const isHit     = boardCell.ship !== null;

    const newBoard = board.map(row => row.map(cell => ({ ...cell })));
    newBoard[r][c] = { ...newBoard[r][c], hit: true };
    myBoardRef.current = newBoard;
    setMyBoard(newBoard);
    enemyHitsRef.current++;
    setEnemyHits(h => h + 1);

    if (isHit) {
      audioEngine.playExplosion();
      const ships = placedShipsRef.current;
      const ship  = ships.find(s => s.id === boardCell.ship)!;
      const allSunk = ship.cells.every(({ r: sr, c: sc }) => newBoard[sr][sc].hit);

      if (allSunk) {
        const newShips = placedShipsRef.current.map(s => s.id === ship.id ? { ...s, sunk: true } : s);
        placedShipsRef.current = newShips;
        setPlacedShips(newShips);
        aiRef.current!.registerHit(r, c, true);
        addLog(`AI SUNK your ${ship.name}! 💥`, styles.leSunk);
        showToast('YOUR SHIP WAS SUNK! 💥', 'danger', 3000);
        if (newShips.every(s => s.sunk)) { triggerResult(false); return; }
      } else {
        aiRef.current!.registerHit(r, c, false);
        addLog(`AI HIT your ship at ${colName(c)}${r + 1}!`, styles.leSunk);
      }
      setTimeout(() => triggerAITurn(), 900 + Math.random() * 500);
    } else {
      audioEngine.playSplash();
      addLog(`AI missed at ${colName(c)}${r + 1}.`, styles.leMiss);
      setIsMyTurn(true);
      isMyTurnRef.current = true;
    }
  };

  // ─────────────────────────────────────────
  // MULTIPLAYER INCOMING FIRE
  // ─────────────────────────────────────────

  const handleIncomingFire = (r: number, c: number) => {
    const board     = myBoardRef.current;
    const boardCell = board[r][c];
    const isHit     = boardCell.ship !== null;
    const newBoard  = board.map(row => row.map(cell => ({ ...cell })));
    newBoard[r][c]  = { ...newBoard[r][c], hit: true };
    myBoardRef.current = newBoard;
    setMyBoard(newBoard);
    enemyHitsRef.current++;
    setEnemyHits(h => h + 1);

    let sunkShip: PlacedShip | null = null;
    if (isHit) {
      const ships = placedShipsRef.current;
      const ship  = ships.find(s => s.id === boardCell.ship)!;
      if (ship.cells.every(({ r: sr, c: sc }) => newBoard[sr][sc].hit)) {
        sunkShip = ship;
        const newShips = ships.map(s => s.id === ship.id ? { ...s, sunk: true } : s);
        placedShipsRef.current = newShips;
        setPlacedShips(newShips);
      }
    }

    const allSunk = placedShipsRef.current.every(s => s.sunk);
    sendMsg({
      type: 'fireResult', r, c, hit: isHit,
      sunk: !!sunkShip, sunkCells: sunkShip?.cells ?? null,
      sunkName: sunkShip?.name ?? null, gameOver: allSunk,
    });
    if (allSunk) { sendMsg({ type: 'gameOver' }); triggerResult(false); return; }
    if (!isHit) {
      setIsMyTurn(true);
      isMyTurnRef.current = true;
      addLog(`Enemy MISSED at ${colName(c)}${r + 1}`, styles.leMiss);
    } else {
      addLog(`Enemy HIT your ${sunkShip ? sunkShip.name + ' (SUNK!)' : 'ship'} at ${colName(c)}${r + 1}`, styles.leSunk);
    }
  };

  const handleFireResultMulti = (msg: Extract<PeerMessage, { type: 'fireResult' }>) => {
    const { r, c, hit, sunk, sunkCells, sunkName, gameOver: go } = msg;
    if (hit) {
      myHitsRef.current++;
      setMyHits(h => h + 1);
      if (sunk && sunkCells) {
        setEnemyBoard(prev => {
          const nb = prev.map(row => row.map(c => ({ ...c })));
          sunkCells.forEach(({ r: sr, c: sc }) => (nb[sr][sc] = { hit: false, miss: false, sunk: true }));
          return nb;
        });
        addLog(`YOU SUNK enemy ${sunkName}! 💥`, styles.leSunk);
        showToast('ENEMY SHIP SUNK! 💥');
      } else {
        setEnemyBoard(prev => {
          const nb = prev.map(row => row.map(c => ({ ...c })));
          nb[r][c] = { hit: true, miss: false, sunk: false };
          return nb;
        });
        addLog(`HIT at ${colName(c)}${r + 1}! Fire again.`, styles.leHit);
        showToast('DIRECT HIT! Fire again.');
      }
      if (go) { triggerResult(true); return; }
      setIsMyTurn(true);
      isMyTurnRef.current = true;
    } else {
      myMissesRef.current++;
      setMyMisses(m => m + 1);
      setEnemyBoard(prev => {
        const nb = prev.map(row => row.map(c => ({ ...c })));
        nb[r][c] = { hit: false, miss: true, sunk: false };
        return nb;
      });
      addLog(`Missed at ${colName(c)}${r + 1}.`, styles.leMiss);
    }
  };

  // ─────────────────────────────────────────
  // RESULT
  // ─────────────────────────────────────────

  const triggerResult = async (won: boolean) => {
    setGameOver(true);
    gameOverRef.current = true;
    setResultWon(won);

    if (currentUser) {
      const { updatedStats, newAchievements: achs } = await processGameResult({
        username:     currentUser.username,
        isGuest:      currentUser.isGuest,
        won,
        hits:         myHitsRef.current,
        misses:       myMissesRef.current,
        boardSize,
        mode:         modeRef.current!,
        currentStats: currentUser.stats, // used by guests to update in-memory stats
      });
      setCurrentUser({ ...currentUser, stats: updatedStats });
      setNewAchievements(achs);
    }
    setScreen('result');
  };

  const playAgain = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; connRef.current = null; }
    enterSetup(mode!);
  };

  const goLobby = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; connRef.current = null; }
    setLobbyPanel(null);
    setScreen('lobby');
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.app}>
      {cannonFlash && <div className={styles.cannonFlash} />}
      <Toast message={toastMsg} type={toastType} visible={toastVisible} />

      {/* ══ HEADER ══ */}
      <header className={styles.hdr}>
        <div className={styles.logo} onClick={() => { if (currentUser) goLobby(); }}>
          NAVAL WARFARE
          <em>BATTLESHIPS</em>
        </div>
        <div className={styles.hdrRight}>
          {currentUser ? (
            <>
              <div className={styles.hdrUser}>
                <div className={styles.hdrUserDot} />
                {currentUser.username}
                {currentUser.isGuest && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-hud)', color: 'var(--tx3)', letterSpacing: 1, border: '1px solid var(--border)', padding: '1px 5px' }}>
                    GUEST
                  </span>
                )}
              </div>
              {!currentUser.isGuest && (
                <button className={styles.hdrBtn} onClick={openScoreboard}>📊 SCOREBOARD</button>
              )}
              <button className={styles.hdrBtn} onClick={() => { setCurrentUser(null); setAuthUser(''); setAuthPass(''); setAuthErr(''); setScreen('auth'); }}>
                {currentUser.isGuest ? 'EXIT' : 'LOGOUT'}
              </button>
            </>
          ) : (
            <span className={styles.hdrBlink}>● OFFLINE</span>
          )}
        </div>
      </header>

      {/* ══ AUTH SCREEN ══ */}
      {screen === 'auth' && (
        <div className={styles.authScreen}>
          <div className={styles.authBox}>
            <div className={styles.authTitle}>NAVAL<br />WARFARE</div>
            <div className={styles.authSub}>▸ Strategic Combat ◂</div>

            {/* Three tabs */}
            <div className={styles.authTabs}>
              {(['login', 'register', 'guest'] as const).map(tab => (
                <div
                  key={tab}
                  className={`${styles.authTab} ${authTab === tab ? styles.active : ''}`}
                  onClick={() => { setAuthTab(tab); setAuthErr(''); }}
                >
                  {tab === 'login' ? 'LOGIN' : tab === 'register' ? 'REGISTER' : 'PLAY AS GUEST'}
                </div>
              ))}
            </div>

            <div className={styles.panel}>
              {/* Username — always shown */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                  {authTab === 'guest' ? 'CHOOSE A CALLSIGN' : 'COMMANDER NAME'}
                </label>
                <input
                  className={styles.input}
                  type="text"
                  placeholder={authTab === 'guest' ? 'any name, no password needed' : 'username'}
                  value={authUser}
                  onChange={e => setAuthUser(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  autoFocus
                />
              </div>

              {/* Password — only for login/register */}
              {authTab !== 'guest' && (
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>ACCESS CODE</label>
                  <input
                    className={styles.input}
                    type="password"
                    placeholder="password"
                    value={authPass}
                    onChange={e => setAuthPass(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAuth()}
                  />
                </div>
              )}

              {/* Guest info blurb */}
              {authTab === 'guest' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--s2)' }}>
                  ℹ Guest sessions are temporary. Your wins will appear on the global leaderboard for today, but stats and achievements are not saved. Refreshing the page ends your session.
                </div>
              )}

              {authErr && <div className={styles.inputErr}>⚠ {authErr}</div>}

              <div style={{ marginTop: 20 }}>
                <button
                  className={`${styles.btn} ${authTab === 'guest' ? styles.btnGreen : styles.btnGold}`}
                  style={{ width: '100%' }}
                  onClick={handleAuth}
                >
                  <span>
                    {authTab === 'login'    ? '▸ ENTER COMMAND CENTER'
                    : authTab === 'register' ? '▸ CREATE ACCOUNT'
                    :                         '▸ PLAY AS GUEST'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ LOBBY SCREEN ══ */}
      {screen === 'lobby' && (
        <div className={styles.lobbyScreen}>
          <div className={styles.lobbyInner}>
            <div className={styles.lobbyTitle}>BATTLE<br />SHIPS</div>
            <div className={styles.lobbySub}>▸ Strategic Naval Warfare ◂</div>
            <div className={styles.lobbyGrid}>
              <div className={`${styles.lobbyCard} ${styles.solo}`} onClick={() => setLobbyPanel(lobbyPanel === 'solo' ? null : 'solo')}>
                <div className={styles.lcIcon}>🤖</div>
                <div className={styles.lcTitle}>VS COMPUTER</div>
                <div className={styles.lcDesc}>Battle an AI. Difficulty scales with board size — bigger board, smarter enemy.</div>
              </div>
              <div className={styles.lobbyCard} onClick={createRoom}>
                <div className={styles.lcIcon}>⚓</div>
                <div className={styles.lcTitle}>CREATE BATTLE</div>
                <div className={styles.lcDesc}>Generate a room code and share it with your opponent.</div>
              </div>
              <div className={styles.lobbyCard} onClick={() => setLobbyPanel(lobbyPanel === 'join' ? null : 'join')}>
                <div className={styles.lcIcon}>🎯</div>
                <div className={styles.lcTitle}>JOIN BATTLE</div>
                <div className={styles.lcDesc}>Enter your opponent's room code to join their fleet battle.</div>
              </div>
              {/* Scoreboard card — always shown; label differs for guests */}
              <div className={`${styles.lobbyCard} ${styles.score}`} onClick={openScoreboard}>
                <div className={styles.lcIcon}>{currentUser?.isGuest ? '🏅' : '📊'}</div>
                <div className={styles.lcTitle}>{currentUser?.isGuest ? 'LEADERBOARD' : 'SCOREBOARD'}</div>
                <div className={styles.lcDesc}>
                  {currentUser?.isGuest
                    ? "View today's global rankings. Register to track your own stats & achievements."
                    : 'View your personal stats, achievements, and the global daily leaderboard.'}
                </div>
              </div>
            </div>

            {/* Solo panel — clicking a card also sets boardSize */}
            {lobbyPanel === 'solo' && (
              <div className={styles.roomPanel}>
                <div className={styles.roomPanelTitle}>▸ VS COMPUTER — DIFFICULTY IS SET BY BOARD SIZE</div>
                <div className={styles.aiDiffGrid}>
                  {[
                    { size: 5,  rank: 'ENSIGN',  badge: 'EASY',   badgeCls: styles.badgeEasy,   selCls: styles.selEasy,   cls: styles.easy,   desc: '5×5 grid · 3 ships · AI fires randomly. Perfect for beginners.' },
                    { size: 10, rank: 'CAPTAIN', badge: 'MEDIUM', badgeCls: styles.badgeMedium, selCls: styles.selMedium, cls: styles.medium, desc: '10×10 grid · 6 ships · AI hunts & targets hits methodically.' },
                    { size: 15, rank: 'ADMIRAL', badge: 'HARD',   badgeCls: styles.badgeHard,   selCls: styles.selHard,   cls: styles.hard,   desc: '15×15 grid · 10 ships · AI uses probability maps. Very hard.' },
                  ].map(d => (
                    <div
                      key={d.size}
                      className={`${styles.aiDiffCard} ${boardSize === d.size ? d.selCls : ''}`}
                      onClick={() => setBoardSize(d.size)}
                    >
                      <div className={`${styles.adcName} ${d.cls}`}>{d.rank}</div>
                      <div className={`${styles.adcBadge} ${d.badgeCls}`}>{d.badge}</div>
                      <div className={styles.adcDesc}>{d.desc}</div>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'center', marginTop: 16 }}>
                  <button className={`${styles.btn} ${styles.btnGreen}`} onClick={() => enterSetup('solo')}>
                    <span>▸ ENTER BATTLE</span>
                  </button>
                </div>
              </div>
            )}

            {/* Create room panel */}
            {lobbyPanel === 'create' && (
              <div className={styles.roomPanel}>
                <div className={styles.roomPanelTitle}>▸ ROOM CREATED — SHARE CODE WITH OPPONENT</div>
                <div className={styles.roomCode} onClick={() => navigator.clipboard.writeText(roomCode).then(() => showToast('Copied!'))}>
                  {roomCode}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div className={styles.spinner} style={{ margin: '0 auto' }} />
                  <p style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx2)' }}>{peerStatus}</p>
                </div>
              </div>
            )}

            {/* Join room panel */}
            {lobbyPanel === 'join' && (
              <div className={styles.roomPanel}>
                <div className={styles.roomPanelTitle}>▸ ENTER ENEMY ROOM CODE</div>
                <div className={styles.roomInput}>
                  <input
                    className={styles.input}
                    type="text"
                    maxLength={6}
                    placeholder="XXXXXX"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => e.key === 'Enter' && joinRoom()}
                  />
                  <button className={styles.btn} onClick={joinRoom}><span>CONNECT</span></button>
                </div>
                {joinStatus && <p style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx2)' }}>{joinStatus}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ SETUP SCREEN ══ */}
      {screen === 'setup' && (
        <div className={styles.setupScreen}>
          <div className={styles.setupLayout}>
            {/* Left column: nationality + board size */}
            <div>
              <div className={styles.panel} style={{ marginBottom: 14 }}>
                <div className={styles.panelTitle}>▸ NATIONALITY</div>
                {(Object.entries(NATIONS) as [Nation, typeof NATIONS[Nation]][]).map(([id, n]) => (
                  <div
                    key={id}
                    className={`${styles.nationBtn} ${nation === id ? styles.active : ''}`}
                    onClick={() => { setNation(id); if (mode === 'multi') sendMsg({ type: 'nation', nation: id }); }}
                  >
                    <div className={styles.nationFlag}>{n.flag}</div>
                    <div>
                      <div className={styles.nationName}>{n.name}</div>
                      <div className={styles.nationDesc}>
                        {id === 'usa' ? 'Advanced guided missiles · Fast destroyers'
                          : id === 'russia' ? 'Heavy cruisers · Nuclear submarines'
                          : 'Carrier groups · Stealth corvettes'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.panel}>
                <div className={styles.panelTitle}>▸ BATTLE ZONE</div>
                {[
                  { s: 5,  meta: '3 ships · Quick skirmish',      badge: styles.badgeE, diff: 'EASY' },
                  { s: 10, meta: '6 ships · Standard engagement',  badge: styles.badgeM, diff: 'MEDIUM' },
                  { s: 15, meta: '10 ships · Full naval war',      badge: styles.badgeH, diff: 'HARD' },
                ].map(({ s, meta, badge, diff }) => (
                  <div
                    key={s}
                    className={`${styles.sizeBtn} ${boardSize === s ? styles.active : ''}`}
                    onClick={() => handleSizeChange(s)}
                  >
                    <div className={styles.sizeLbl}>{s} × {s}</div>
                    <div className={styles.sizeMeta}>{meta}</div>
                    <div className={`${styles.diffBadge} ${badge}`}>{diff}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Center column: placement grid */}
            <div className={styles.gridWrap}>
              <div className={styles.panel} style={{ textAlign: 'center' }}>
                <div className={styles.panelTitle}>▸ PLACE YOUR FLEET</div>
                <div className={styles.gridControls}>
                  {(['H', 'V'] as Orientation[]).map(o => (
                    <div
                      key={o}
                      className={`${styles.ctrlBtn} ${orientation === o ? styles.active : ''}`}
                      onClick={() => setOrientation(o)}
                    >
                      {o === 'H' ? '↔ HORIZONTAL' : '↕ VERTICAL'}
                    </div>
                  ))}
                  <div className={styles.ctrlBtn} onClick={doClearShips}>⟳ RESET</div>
                  <div className={styles.ctrlBtn} onClick={doAutoPlace}>⚡ AUTO PLACE</div>
                </div>
                <Grid
                  board={myBoard}
                  boardSize={boardSize}
                  placedShips={placedShips}
                  previewCells={previewCells}
                  invalidPreview={previewInvalid}
                  onCellClick={handlePlaceShip}
                  onCellHover={handlePreview}
                  onCellLeave={() => setPreviewCells(null)}
                />
              </div>

              <div className={styles.readyZone}>
                <div className={styles.readyRow}>
                  <div className={styles.readyInd}>
                    <div className={`${styles.rdot} ${youReady ? styles.rdotOn : styles.rdotOff}`} />
                    <span>YOU: {youReady ? 'READY' : 'NOT READY'}</span>
                  </div>
                  {mode === 'multi' && (
                    <div className={styles.readyInd}>
                      <div className={`${styles.rdot} ${oppReady ? styles.rdotOn : styles.rdotOff}`} />
                      <span>OPPONENT: {oppReady ? 'READY' : 'WAITING'}</span>
                    </div>
                  )}
                </div>
                {shipList.every(s => s.placed) && !youReady && (
                  <button className={`${styles.btn} ${styles.btnGold}`} onClick={handleReady}>
                    <span>▸ READY FOR BATTLE</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right column: fleet roster */}
            <div className={styles.panel}>
              <div className={styles.panelTitle}>▸ FLEET ROSTER</div>
              {shipList.map(ship => (
                <div
                  key={ship.id}
                  className={`${styles.shipItem} ${ship.placed ? styles.done : ''} ${selectedShip === ship.id ? styles.sel : ''}`}
                  onClick={() => { if (!ship.placed) setSelectedShip(ship.id); }}
                >
                  <div>
                    <div className={styles.shipNm}>{ship.emoji} {ship.name}</div>
                    <div className={styles.shipVisual}>
                      {Array(ship.size).fill(0).map((_, i) => <div key={i} className={styles.shipBlk} />)}
                    </div>
                  </div>
                  <div className={styles.shipSz}>×{ship.size}</div>
                </div>
              ))}
              <div className={styles.hint}>
                {!selectedShip && !shipList.every(s => s.placed) ? 'SELECT A SHIP TO PLACE'
                  : selectedShip ? `PLACE ${shipList.find(s => s.id === selectedShip)?.name?.toUpperCase()}`
                  : 'ALL SHIPS PLACED — READY!'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ GAME SCREEN ══ */}
      {screen === 'game' && (
        <div className={styles.gameScreen}>
          <div className={styles.gameLayout}>
            {/* My board */}
            <div className={styles.gamePanel}>
              <div className={styles.boardLbl}>
                YOUR WATERS — <strong>{NATIONS[nation].name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Grid board={myBoard} boardSize={boardSize} placedShips={placedShips} />
              </div>
            </div>

            {/* Center HUD */}
            <div className={styles.centerCol}>
              <div className={`${styles.turnBox} ${isMyTurn ? styles.yours : styles.theirs}`}>
                <div style={{ fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>STATUS</div>
                <div>{isMyTurn ? 'FIRE!' : mode === 'solo' ? 'AI TURN' : 'ENEMY TURN'}</div>
              </div>

              <div className={styles.scoreBox}>
                <div className={styles.scoreRow}><span>YOUR HITS</span><span className={styles.scoreVal}>{myHits}</span></div>
                <div className={styles.scoreRow}><span>ENEMY HITS</span><span className={styles.scoreVal}>{enemyHits}</span></div>
                <div className={styles.scoreRow}><span>YOUR SHIPS</span><span className={styles.scoreVal}>{placedShips.filter(s => !s.sunk).length}</span></div>
                {mode === 'solo' && (
                  <div className={styles.scoreRow}>
                    <span>AI SHIPS</span>
                    <span className={styles.scoreVal}>{aiRef.current?.state.ships.filter(s => !s.sunk).length ?? '?'}</span>
                  </div>
                )}
              </div>

              {aiThinking && (
                <div className={styles.aiThinking}>
                  <div className={styles.aiDot} />
                  <div className={styles.aiDot} />
                  <div className={styles.aiDot} />
                  <span style={{ fontSize: 9, marginLeft: 4 }}>TARGETING...</span>
                </div>
              )}

              <div className={styles.logArea}>
                <div className={styles.logTitle}>BATTLE LOG</div>
                <div className={styles.eventLog} id="battleLog">
                  {logEntries.map(e => (
                    <div key={e.id} className={`${styles.logEntry} ${e.cls}`}>
                      [{e.time}] {e.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Enemy board */}
            <div className={`${styles.gamePanel} ${isMyTurn ? styles.enemyBoard : ''}`}>
              <div className={styles.boardLbl}>
                ENEMY WATERS — <strong>{NATIONS[opponentNation]?.name}{mode === 'solo' ? ' [AI]' : ''}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Grid
                  board={enemyBoard}
                  boardSize={boardSize}
                  enemyView
                  onCellClick={fireAt}
                />
              </div>
              <div className={styles.fireHint}>
                {isMyTurn
                  ? '▸ Click enemy grid to fire'
                  : mode === 'solo' ? 'AI is targeting your fleet...'
                  : 'Waiting for enemy attack...'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ SCOREBOARD SCREEN ══ */}
      {screen === 'scoreboard' && currentUser && (
        <div className={styles.scoreScreen}>
          <div className={styles.sbTitle}>{currentUser.isGuest ? '🏅 LEADERBOARD' : '📊 SCOREBOARD'}</div>
          <div className={styles.sbSub}>▸ FLEET RECORDS & GLOBAL RANKINGS ◂</div>
          <div style={{ marginBottom: 16 }}>
            <button className={`${styles.btn} ${styles.btnSm}`} onClick={goLobby}><span>◂ BACK</span></button>
          </div>
          <div className={styles.sbLayout}>
            {/* Left column: personal stats for registered users, or guest CTA */}
            <div>
              {!currentUser.isGuest ? (
                <>
                  <div className={styles.sbSection}>
                    <div className={styles.sbSectionTitle}>▸ COMMANDER: {currentUser.username.toUpperCase()}</div>
                    <div className={styles.statGrid}>
                      {[
                        { val: currentUser.stats.wins,        lbl: 'TOTAL WINS' },
                        { val: currentUser.stats.losses,      lbl: 'LOSSES' },
                        { val: currentUser.stats.gamesPlayed, lbl: 'GAMES PLAYED' },
                        { val: currentUser.stats.bestStreak,  lbl: 'BEST STREAK' },
                        { val: currentUser.stats.winStreak,   lbl: 'CURRENT STREAK' },
                        {
                          val: `${currentUser.stats.totalShots > 0
                            ? Math.round(currentUser.stats.totalHits / currentUser.stats.totalShots * 100)
                            : 0}%`,
                          lbl: 'LIFETIME ACCURACY',
                        },
                      ].map((s, i) => (
                        <div key={i} className={styles.statCard}>
                          <div className={styles.statVal}>{s.val}</div>
                          <div className={styles.statLbl}>{s.lbl}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={styles.sbSection}>
                    <div className={styles.sbSectionTitle}>▸ ACHIEVEMENTS</div>
                    <div className={styles.achieveGrid}>
                      {ACHIEVEMENTS.map(ach => {
                        const unlocked = ach.check(currentUser.stats);
                        return (
                          <div key={ach.id} className={`${styles.achCard} ${unlocked ? styles.unlocked : styles.locked}`}>
                            <div className={styles.achIcon}>{ach.icon}</div>
                            <div className={styles.achTitle}>{ach.title}</div>
                            <div className={styles.achDesc}>{ach.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* Guest sees a prompt to register */
                <div className={styles.sbSection}>
                  <div className={styles.sbSectionTitle}>▸ PLAYING AS GUEST</div>
                  <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', padding: 20, marginBottom: 16 }}>
                    <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>🔒</div>
                    <div style={{ fontFamily: 'var(--font-hud)', fontSize: 13, color: 'var(--ac)', marginBottom: 10, textAlign: 'center', letterSpacing: 1 }}>
                      STATS & ACHIEVEMENTS LOCKED
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx2)', lineHeight: 1.7, textAlign: 'center', marginBottom: 16 }}>
                      Guest sessions don't save your progress.<br />
                      Register a free account to unlock:<br />
                      persistent win history · achievements · streaks
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <button
                        className={`${styles.btn} ${styles.btnGold}`}
                        onClick={() => { setCurrentUser(null); setAuthUser(''); setAuthPass(''); setAuthErr(''); setAuthTab('register'); setScreen('auth'); }}
                      >
                        <span>▸ CREATE FREE ACCOUNT</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx3)', lineHeight: 1.6, padding: '10px 12px', border: '1px solid var(--border)' }}>
                    ℹ Guest wins appear on the leaderboard today tagged with [G]. Your username may be claimed by anyone — register to secure it.
                  </div>
                </div>
              )}
            </div>

            {/* Right column: global leaderboard */}
            <div>
              <div className={styles.sbSection}>
                <div className={styles.sbSectionTitle}>
                  <span>▸ GLOBAL DAILY LEADERS ({todayKey()})</span>
                  <button className={`${styles.btn} ${styles.btnSm}`} onClick={openScoreboard}><span>⟳ REFRESH</span></button>
                </div>
                {sbLoading ? (
                  <div style={{ textAlign: 'center', padding: 30 }}>
                    <div className={styles.spinner} style={{ margin: '0 auto' }} />
                  </div>
                ) : (
                  <div className={styles.leaderboard}>
                    <div className={styles.lbHead}>
                      <span>#</span><span>COMMANDER</span>
                      <span style={{ textAlign: 'right' }}>TODAY</span>
                      <span style={{ textAlign: 'right' }}>TOTAL</span>
                    </div>
                    {globalLeaders.length === 0 ? (
                      <div style={{ padding: 20, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx3)' }}>
                        No battles recorded today.
                      </div>
                    ) : globalLeaders.map((entry, i) => {
                      // Match both "username" and "username [G]" for guests
                      const myName = currentUser.isGuest
                        ? `${currentUser.username} [G]`
                        : currentUser.username;
                      const isMe = entry.username.toLowerCase() === myName.toLowerCase();
                      const rankCls = i === 0 ? styles.gold : i === 1 ? styles.silver : i === 2 ? styles.bronze : '';
                      return (
                        <div key={entry.username} className={`${styles.lbRow} ${isMe ? styles.me : ''}`}>
                          <span className={`${styles.lbRank} ${rankCls}`}>{i === 0 ? '👑' : i + 1}</span>
                          <span className={`${styles.lbName} ${isMe ? styles.me : ''}`}>{entry.username}{isMe ? ' (you)' : ''}</span>
                          <span className={styles.lbWins}>{entry.dailyWins}</span>
                          <span className={styles.lbTotal}>{entry.totalWins}</span>
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

      {/* ══ RESULT SCREEN ══ */}
      {screen === 'result' && (
        <div className={styles.resultScreen}>
          <div className={styles.resultIcon}>{resultWon ? '🏆' : '💀'}</div>
          <div className={`${styles.resultTitle} ${resultWon ? styles.resultWin : styles.resultLose}`}>
            {resultWon ? 'VICTORY!' : 'DEFEATED'}
          </div>
          <div className={styles.resultSub}>
            {resultWon
              ? `${NATIONS[nation].flag} ${NATIONS[nation].name} dominates the seas!`
              : `${NATIONS[opponentNation].flag} ${NATIONS[opponentNation].name} wins — your fleet is destroyed.`}
          </div>

          <div className={styles.resultStats}>
            {[
              { val: myHits,   lbl: 'HITS' },
              { val: myMisses, lbl: 'MISSES' },
              { val: `${myHits + myMisses > 0 ? Math.round(myHits / (myHits + myMisses) * 100) : 0}%`, lbl: 'ACCURACY' },
              { val: currentUser?.stats.wins ?? 0, lbl: 'TOTAL WINS' },
            ].map((s, i) => (
              <div key={i} className={styles.rsCard}>
                <div className={styles.rsVal}>{s.val}</div>
                <div className={styles.rsLbl}>{s.lbl}</div>
              </div>
            ))}
          </div>

          {newAchievements.length > 0 && (
            <div className={styles.resultAch}>
              <div className={styles.resultAchTitle}>🎖 ACHIEVEMENTS UNLOCKED</div>
              {newAchievements.map(a => (
                <div key={a.id} className={styles.newAch}>
                  <span>{a.icon}</span>
                  <span>{a.title} — {a.desc}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className={`${styles.btn} ${styles.btnGold}`} onClick={playAgain}><span>▸ NEW BATTLE</span></button>
            <button className={styles.btn} onClick={openScoreboard}><span>📊 SCOREBOARD</span></button>
            <button className={styles.btn} onClick={goLobby}><span>◂ MAIN MENU</span></button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
