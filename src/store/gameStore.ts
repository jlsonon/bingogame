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
  activeCards: number[][][]; // Array of cards, each card is 5x5 array of numbers
  hasDikit: boolean;
  nextRoundChoice?: 'keep' | 'change';
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
  patterns: BingoPattern[];
  nextRoundEndsAt?: number;
  claims: any[];
  hidePattern: boolean;
  dikitWinner: string | null;
  stats: {
    totalCardsSold: number;
    totalPlayersJoined: number;
    gamesPlayed: number;
    winners: { name: string, pattern: string, round: number }[];
    startTime: number;
  };
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
  createRoom: () => Promise<string>;
  joinRoom: (code: string) => Promise<boolean>;
  rejoinRoom: (code: string, role: 'host' | 'player') => Promise<boolean>;
  leaveRoom: () => void;
  
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
  claimBingo: (cardIndex: number, markedCells: number[]) => void;
  claimDikit: (cardIndex: number, markedCells: number[]) => void;
  setNextRoundChoice: (choice: 'keep' | 'change') => void;

  // Events
  latestBall: number | null;
  claimAlert: any | null;
  dikitAlert: any | null;
  winner: any | null;
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
  winner: null,

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
      
      set({
        room,
        me: room.players[sessionId] || null,
        latestBall: room.calledNumbers.at(-1) || null,
        winner: room.status === 'waiting' ? null : get().winner,
        claimAlert: roundChanged ? null : get().claimAlert,
        dikitAlert: roundChanged ? null : get().dikitAlert
      });
    });

    newSocket.on("ball_called", (data: { ball: number, room: Room }) => {
      // Could play sound here
      set({ latestBall: data.ball });
    });

    newSocket.on("bingo_claim_alert", (claim: any) => {
      set({ claimAlert: claim });
    });

    newSocket.on("dikit_claimed", (claim: any) => {
      set({ dikitAlert: claim });
      // Auto dismiss after 7 seconds
      setTimeout(() => {
         if (get().dikitAlert?.id === claim.id) {
            set({ dikitAlert: null });
         }
      }, 7000);
    });

    newSocket.on("winner_announced", (claim: any) => {
      set({ winner: claim, claimAlert: null });
    });

    newSocket.on("claim_rejected", () => {
      set({ claimAlert: null });
    });

    set({ socket: newSocket });
  },

  createRoom: () => {
    return new Promise((resolve) => {
      const { socket, nickname, avatarColor } = get();
      if (!socket) return;
      socket.emit("create_room", { sessionId: get().sessionId, nickname, avatarColor }, (res: any) => {
        if (res.success) {
          localStorage.setItem('bingo_room_code', res.room.id);
          localStorage.setItem('bingo_room_role', 'host');
          set({ room: res.room, me: res.room.players[get().sessionId] });
          resolve(res.room.id);
        }
      });
    });
  },

  joinRoom: (code: string) => {
    return new Promise((resolve) => {
      const { socket, nickname, avatarColor } = get();
      if (!socket) return;
      socket.emit("join_room", { code, sessionId: get().sessionId, nickname, avatarColor }, (res: any) => {
        if (res.success) {
          localStorage.setItem('bingo_room_code', res.room.id);
          localStorage.setItem('bingo_room_role', 'player');
          set({ room: res.room, me: res.room.players[get().sessionId] });
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  },

  rejoinRoom: (code: string, role: 'host' | 'player') => {
    return new Promise((resolve) => {
      const { socket, nickname, avatarColor, sessionId } = get();
      if (!socket) {
        resolve(false);
        return;
      }
      socket.emit("rejoin_room", { code, sessionId, nickname, avatarColor, role }, (res: any) => {
        if (res.success) {
          localStorage.setItem('bingo_room_code', res.room.id);
          localStorage.setItem('bingo_room_role', role);
          set({ room: res.room, me: res.room.players[sessionId], latestBall: res.room.calledNumbers.at(-1) || null });
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
  },

  leaveRoom: () => {
     localStorage.removeItem('bingo_room_code');
     localStorage.removeItem('bingo_room_role');
     set({ room: null, me: null, latestBall: null, winner: null, claimAlert: null });
  },

  startGame: () => {
    const { socket, room } = get();
    if (socket && room) socket.emit("start_game", { code: room.id });
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

  claimBingo: (cardIndex: number, markedCells: number[]) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("claim_bingo", { code: room.id, cardIndex, markedCells });
  },

  claimDikit: (cardIndex: number, markedCells: number[]) => {
    const { socket, room } = get();
    if (socket && room) socket.emit("claim_dikit", { code: room.id, cardIndex, markedCells });
  },

  setNextRoundChoice: (choice: 'keep' | 'change') => {
    const { socket, room } = get();
    if (socket && room) socket.emit("set_next_round_choice", { code: room.id, choice });
  },

  dismissWinner: () => set({ winner: null }),
  dismissDikit: () => set({ dikitAlert: null })

}));
