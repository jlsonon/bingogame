import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import type { BingoPattern, GameMode } from '../lib/bingo';

export interface Player {
  id: string;
  socketId?: string;
  nickname: string;
  avatarColor?: string;
  isHost: boolean;
  connected: boolean;
  activeCards: number[][][];
  markedCells: Record<number, number[]>;
  hasDikit: boolean;
  nextRoundChoice?: 'keep' | 'change';
  isReady: boolean;
}

export interface DikitFightContender {
  id: string;
  playerId: string;
  playerName: string;
  cardIndex: number;
  card: number[][];
  initialDikitCount: number;
}

export interface DikitFightState {
  status: 'active' | 'resolved';
  ballCalledIndex: number;
  contenders: DikitFightContender[];
  winners?: DikitFightContender[];
  roundBingoPending?: boolean;
}

export interface Room {
  id: string;
  mode: GameMode;
  status: 'waiting' | 'playing' | 'paused' | 'finished' | 'next_round';
  remainingBalls: number[];
  calledNumbers: number[];
  players: Record<string, Player>;
  hostId: string;
  prizeText: string;
  roundName: string;
  roundNumber: number;
  autoCallSpeed: number;
  voiceMode: string;
  ambienceEnabled: boolean;
  voiceId?: string;
  patterns: BingoPattern[];
  nextRoundEndsAt?: number;
  dikitEndsAt?: number;
  claims: any[];
  hidePattern: boolean;
  dikitWinners: any[];
  dikitFight?: DikitFightState | null;
  verifiedWinners: any[];
  stats: {
    totalCardsSold: number;
    totalPlayersJoined: number;
    gamesPlayed: number;
    winners: { name: string, pattern: string, round: number, time: number }[];
    startTime: number;
  };
}

export interface Emote {
  id: string;
  emoji: string;
}


interface GameState {
  socket: Socket | null;
  sessionId: string;
  connect: () => void;
  room: Room | null;
  me: Player | null;
  nickname: string;
  avatarColor: string;
  setProfile: (nickname: string, color: string) => void;
  createRoom: () => Promise<{ success: boolean; code?: string; error?: string }>;
  joinRoom: (code: string, cardCount?: number) => Promise<boolean>;
  rejoinRoom: (code: string, role: 'host' | 'player' | 'display' | 'godview') => Promise<boolean>;
  
  // Host actions
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  resetGame: () => void;
  startNextRound: () => void;
  callNextBall: () => void;
  updateSettings: (settings: any) => void;
  verifyClaim: (claimId: string, isValid: boolean) => void;

  // Player actions
  updateMyCards: (cards: number[][][]) => void;
  updateMarkedCells: (markedCells: Record<number, number[]>) => void;
  claimBingo: (cardIndex: number, markedCells: number[]) => void;
  claimDikit: (cardIndex: number, markedCells: number[]) => void;
  sendEmote: (emoji: string) => void;
  setNextRoundChoice: (choice: 'keep' | 'change') => void;
  setPlayerReady: () => void;
  leaveRoom: () => void;

  // Events
  latestBall: number | null;
  claimAlert: any | null;
  dikitAlert: any[] | null;
  dikitFight: DikitFightState | null;
  winner: any[] | null;
  emotes: Emote[];
  nearWinAlert: { playerName: string, patternName: string } | null;
  globalPatterns: BingoPattern[];
  hallOfFame: any[];
  saveGlobalPattern: (pattern: BingoPattern) => void;
  deleteGlobalPattern: (id: string) => void;
  dismissWinner: () => void;
  dismissDikit: () => void;
}

const SOCKET_URL = window.location.origin;
const SESSION_KEY = 'bingo_session_id';

function getSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

const DELETED_PATTERN_IDENTIFIERS = new Set([
  'letter-x', 'letter-t', 'letter-l', 'dikit',
  'letter x', 'letter t', 'letter l'
]);

function isDeletedPattern(pattern: { id?: string; name?: string } | null | undefined): boolean {
  if (!pattern) return false;
  const id = (pattern.id || '').toLowerCase().trim();
  const name = (pattern.name || '').toLowerCase().trim();
  return DELETED_PATTERN_IDENTIFIERS.has(id) || DELETED_PATTERN_IDENTIFIERS.has(name);
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  sessionId: getSessionId(),
  room: null,
  me: null,
  nickname: localStorage.getItem('bingo_nickname') || '',
  avatarColor: localStorage.getItem('bingo_avatar') || '#3b82f6',
  latestBall: null,
  claimAlert: null,
  dikitAlert: null,
  dikitFight: null,
  winner: null,
  globalPatterns: [],
  emotes: [],
  nearWinAlert: null,
  hallOfFame: [],

  setProfile: (nickname, avatarColor) => {
    localStorage.setItem('bingo_nickname', nickname);
    localStorage.setItem('bingo_avatar', avatarColor);
    set({ nickname, avatarColor });
  },

  connect: () => {
    if (get().socket) return;
    const newSocket = io(SOCKET_URL);
    
    newSocket.on("room_updated", (room: Room) => {
      const sessionId = get().sessionId;
      const currentRoom = get().room;
      
      // If round changed or game reset, clear local alerts
      const roundChanged = currentRoom && (room.roundNumber !== currentRoom.roundNumber || room.status === 'waiting');
      const hasVerifiedWinners = Array.isArray(room.verifiedWinners) && room.verifiedWinners.length > 0;
      
      set({
        room,
        me: room.players[sessionId] || null,
        latestBall: room.calledNumbers.at(-1) || null,
        winner: (room.status === 'waiting' || roundChanged || !hasVerifiedWinners) ? null : get().winner,
        claimAlert: roundChanged ? null : get().claimAlert,
        dikitAlert: roundChanged ? null : get().dikitAlert,
        dikitFight: roundChanged ? null : (room.dikitFight || null),
        nearWinAlert: roundChanged ? null : get().nearWinAlert
      });
    });

    newSocket.on("ball_called", (data: { ball: number, room: Room }) => {
      // Could play sound here
      set({ latestBall: data.ball, nearWinAlert: null });
    });

    newSocket.on("emote_received", (emote: Emote) => {
      set(state => ({ emotes: [...state.emotes, emote] }));
      setTimeout(() => {
         set(state => ({ emotes: state.emotes.filter(e => e.id !== emote.id) }));
      }, 4000);
    });

    newSocket.on("near_win_alert", (data: { playerName: string, patternName: string }) => {
      set({ nearWinAlert: data });
    });

    newSocket.on("bingo_claim_alert", (claim: any) => {
      set({ claimAlert: claim });
    });

    newSocket.on("dikit_winners_announced", (claims: any[]) => {
      set({ dikitAlert: claims });
      // Auto dismiss after 7 seconds
      setTimeout(() => {
         set({ dikitAlert: null });
      }, 7000);
    });

    newSocket.on("dikit_fight_started", (fight: DikitFightState) => {
      set({ dikitFight: fight });
    });

    newSocket.on("dikit_fight_won", (winners: any[]) => {
      set({ dikitAlert: winners });
      setTimeout(() => {
         set({ dikitAlert: null });
      }, 7000);
    });

    newSocket.on("winners_announced", (claims: any[]) => {
      set({ winner: claims, claimAlert: null });
    });

    newSocket.on("claim_rejected", () => {
      set({ claimAlert: null });
    });

    newSocket.on("global_patterns_updated", (patterns: BingoPattern[]) => {
      const cleaned = (patterns || []).filter(p => !isDeletedPattern(p) && p.match !== 'dikit');
      try {
        localStorage.setItem('bingo_pattern_library', JSON.stringify(cleaned));
      } catch (e) {
        console.warn("Could not cache patterns to localStorage:", e);
      }
      set({ globalPatterns: cleaned });
    });

    newSocket.on("hall_of_fame_updated", (hof: any[]) => {
      set({ hallOfFame: hof });
    });

    newSocket.emit("get_global_patterns", (serverPatterns: BingoPattern[]) => {
      try {
        const stored = localStorage.getItem('bingo_pattern_library');
        const localPatterns: BingoPattern[] = stored ? JSON.parse(stored) : [];
        const patternMap = new Map<string, BingoPattern>();
        
        // Add valid server patterns
        (serverPatterns || []).forEach(p => {
          if (p && p.id && !isDeletedPattern(p) && p.match !== 'dikit' && Array.isArray(p.cells) && p.cells.filter(c => c !== 12).length > 0) {
            patternMap.set(p.id, p);
          }
        });

        // Sync valid local patterns
        localPatterns.forEach(p => {
          if (p && p.id && !isDeletedPattern(p) && p.match !== 'dikit' && Array.isArray(p.cells) && p.cells.filter(c => c !== 12).length > 0) {
            if (!patternMap.has(p.id)) {
              patternMap.set(p.id, p);
              newSocket.emit("save_global_pattern", p);
            }
          }
        });
        const combined = Array.from(patternMap.values());
        localStorage.setItem('bingo_pattern_library', JSON.stringify(combined));
        set({ globalPatterns: combined });
      } catch {
        const cleaned = (serverPatterns || []).filter(p => !isDeletedPattern(p) && p.match !== 'dikit');
        set({ globalPatterns: cleaned });
      }
    });


    newSocket.emit("get_hall_of_fame", (hof: any[]) => {
      set({ hallOfFame: hof });
    });

    set({ socket: newSocket });
  },

  saveGlobalPattern: (pattern: BingoPattern) => {
    if (isDeletedPattern(pattern) || pattern.match === 'dikit') return;
    // Validate pattern before saving - must have at least 1 non-free cell
    const nonFree = pattern.cells?.filter(c => c !== 12) || [];
    if (nonFree.length === 0) return;

    set(state => {
      const exists = state.globalPatterns.some(p => p.id === pattern.id);
      const next = exists
        ? state.globalPatterns.map(p => p.id === pattern.id ? pattern : p)
        : [...state.globalPatterns, pattern];
      return { globalPatterns: next };
    });
    try {
      const stored = localStorage.getItem('bingo_pattern_library');
      const list: BingoPattern[] = stored ? JSON.parse(stored) : [];
      const idx = list.findIndex(p => p.id === pattern.id);
      if (idx !== -1) list[idx] = pattern;
      else list.push(pattern);
      localStorage.setItem('bingo_pattern_library', JSON.stringify(list));
    } catch (e) {
      console.warn("Could not save pattern to localStorage:", e);
    }
    const { socket } = get();
    if (socket) socket.emit("save_global_pattern", pattern);
  },

  deleteGlobalPattern: (id: string) => {
    set(state => ({
      globalPatterns: state.globalPatterns.filter(p => p.id !== id)
    }));
    try {
      const stored = localStorage.getItem('bingo_pattern_library');
      if (stored) {
        const list: BingoPattern[] = JSON.parse(stored);
        localStorage.setItem('bingo_pattern_library', JSON.stringify(list.filter(p => p.id !== id)));
      }
    } catch (e) {
      console.warn("Could not remove pattern from localStorage:", e);
    }
    const { socket } = get();
    if (socket) socket.emit("delete_global_pattern", id);
  },

  createRoom: () => {
    return new Promise<{ success: boolean; code?: string; error?: string }>((resolve) => {
      let { socket } = get();
      if (!socket) {
        get().connect();
        socket = get().socket;
      }
      if (!socket) {
        resolve({ success: false, error: "Unable to establish connection to server." });
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ success: false, error: "Server response timed out. Please try again." });
      }, 6000);

      const doCreate = () => {
        const { nickname, avatarColor } = get();
        const effectiveName = nickname.trim() || 'Host';
        socket!.emit("create_room", { sessionId: get().sessionId, nickname: effectiveName, avatarColor }, (res: any) => {
          clearTimeout(timeout);
          if (res && res.success && res.room) {
            localStorage.setItem('bingo_room_code', res.room.id);
            localStorage.setItem('bingo_room_role', 'host');
            set({ room: res.room, me: res.room.players[get().sessionId] });
            resolve({ success: true, code: res.room.id });
          } else {
            resolve({ success: false, error: res?.message || "Failed to create room." });
          }
        });
      };

      if (socket.connected) {
        doCreate();
      } else {
        socket.once("connect", doCreate);
      }
    });
  },

  joinRoom: (code: string, cardCount?: number) => {
    return new Promise((resolve) => {
      let { socket } = get();
      if (!socket) {
        get().connect();
        socket = get().socket;
      }
      if (!socket) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, 6000);

      const doJoin = () => {
        const { nickname, avatarColor } = get();
        const effectiveName = nickname.trim() || 'Player';
        const count = typeof cardCount === 'number'
          ? cardCount
          : parseInt(localStorage.getItem('bingo_initial_cards') ?? '1');
        socket!.emit("join_room", { code, sessionId: get().sessionId, nickname: effectiveName, avatarColor, cardCount: count }, (res: any) => {
          clearTimeout(timeout);
          if (res && res.success && res.room) {
            localStorage.setItem('bingo_room_code', res.room.id);
            localStorage.setItem('bingo_room_role', 'player');
            set({ room: res.room, me: res.room.players[get().sessionId] });
            resolve(true);
          } else {
            resolve(false);
          }
        });
      };

      if (socket.connected) {
        doJoin();
      } else {
        socket.once("connect", doJoin);
      }
    });
  },

  rejoinRoom: (code: string, role: 'host' | 'player' | 'display' | 'godview') => {
    return new Promise((resolve) => {
      let { socket } = get();
      if (!socket) {
        get().connect();
        socket = get().socket;
      }
      if (!socket) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        resolve(false);
      }, 6000);

      const doRejoin = () => {
        const { nickname, avatarColor, sessionId } = get();
        socket!.emit("rejoin_room", { code, sessionId, nickname, avatarColor, role }, (res: any) => {
          clearTimeout(timeout);
          if (res && res.success && res.room) {
            if (role === 'host' || role === 'player') {
              localStorage.setItem('bingo_room_code', res.room.id);
              localStorage.setItem('bingo_room_role', role);
            }
            set({ room: res.room, me: res.room.players[sessionId] || null, latestBall: res.room.calledNumbers.at(-1) || null });
            resolve(true);
          } else {
            resolve(false);
          }
        });
      };

      if (socket.connected) {
        doRejoin();
      } else {
        socket.once("connect", doRejoin);
      }
    });
  },

  leaveRoom: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    localStorage.removeItem('bingo_room_code');
    localStorage.removeItem('bingo_room_role');
    set({ socket: null, room: null, me: null, latestBall: null, winner: null, claimAlert: null, dikitAlert: null });
  },

  startGame: () => {
    const { socket, room } = get();
    if (socket && room) {
      set({ winner: null, claimAlert: null, dikitAlert: null, nearWinAlert: null });
      socket.emit("start_game", { code: room.id });
    }
  },

  pauseGame: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit("pause_game", { code: room.id });
  },

  resumeGame: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit("resume_game", { code: room.id });
  },

  resetGame: () => {
    const { socket, room } = get();
    if (socket && room) {
       set({ latestBall: null, winner: null, claimAlert: null });
       socket.emit("reset_game", { code: room.id });
    }
  },

  startNextRound: () => {
    const { socket, room } = get();
    if (socket && room) {
       set({ latestBall: null, winner: null, claimAlert: null });
       socket.emit("start_next_round", { code: room.id });
    }
  },

  callNextBall: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit("call_next_ball", { code: room.id });
  },

  updateSettings: (settings: any) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("update_settings", { code: room.id, settings });
  },

  verifyClaim: (claimId: string, isValid: boolean) => {
    const { socket, room } = get();
    if (socket && room) {
       socket.emit("verify_claim", { code: room.id, claimId, isValid });
       set({ claimAlert: null });
    }
  },

  updateMyCards: (cards: number[][][]) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("update_cards", { code: room.id, cards });
  },

  updateMarkedCells: (markedCells: Record<number, number[]>) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("update_marked_cells", { code: room.id, markedCells });
  },

  claimBingo: (cardIndex: number, markedCells: number[]) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("claim_bingo", { code: room.id, cardIndex, markedCells });
  },

  claimDikit: (cardIndex: number, markedCells: number[]) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("claim_dikit", { code: room.id, cardIndex, markedCells });
  },

  sendEmote: (emoji: string) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("send_emote", { code: room.id, emoji });
  },

  setNextRoundChoice: (choice: 'keep' | 'change') => {
    const { socket, room } = get();
    if (socket && room) socket.emit("set_next_round_choice", { code: room.id, choice });
  },

  setPlayerReady: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit("set_player_ready", { code: room.id });
  },

  dismissWinner: () => set({ winner: null }),
  dismissDikit: () => set({ dikitAlert: null })

}));
