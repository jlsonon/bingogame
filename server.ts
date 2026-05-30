import express from "express";
import { createServer } from "http";
import path from "path";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import { checkValidWin, DEFAULT_BINGO_PATTERNS, PRESET_PATTERNS, type BingoPattern, type GameMode } from "./src/lib/bingo";

interface Player {
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

interface Room {
  id: string;
  mode: GameMode;
  status: 'waiting' | 'playing' | 'paused' | 'finished' | 'next_round';
  remainingBalls: number[];
  calledNumbers: number[];
  players: Record<string, Player>; // sessionId -> Player
  hostId: string;
  prizeText: string;
  roundName: string;
  roundNumber: number;
  autoCallSpeed: number; // in seconds, 0 means manual
  patterns: BingoPattern[];
  nextRoundEndsAt?: number;
  claims: any[];
  // New V2 Statistics
  stats: {
    totalCardsSold: number;
    totalPlayersJoined: number;
    gamesPlayed: number;
    winners: { name: string, pattern: string, round: number }[];
    startTime: number;
  };
}

const rooms: Record<string, Room> = {};
const roomCleanupTimers: Record<string, NodeJS.Timeout> = {};
const nextRoundTimers: Record<string, NodeJS.Timeout> = {};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function initBalls(): number[] {
  const balls = [];
  for (let i = 1; i <= 75; i++) {
    balls.push(i);
  }
  return balls.sort(() => Math.random() - 0.5);
}

// Auto-caller timeouts
const autoCallTimers: Record<string, NodeJS.Timeout> = {};

function stopAutoCaller(code: string) {
  if (autoCallTimers[code]) {
    clearInterval(autoCallTimers[code]);
    delete autoCallTimers[code];
  }
}

function prepareNextRound(code: string, io: Server) {
  const room = rooms[code];
  if (!room || room.status !== 'next_round') return;
  room.status = 'waiting';
  room.calledNumbers = [];
  room.remainingBalls = initBalls();
  room.claims = [];
  room.nextRoundEndsAt = undefined;
  room.roundNumber += 1;
  room.roundName = `Round ${room.roundNumber}`;
  Object.values(room.players).forEach(player => {
    player.nextRoundChoice = 'keep';
  });
  if (nextRoundTimers[code]) {
    clearTimeout(nextRoundTimers[code]);
    delete nextRoundTimers[code];
  }
  io.to(code).emit("room_updated", room);
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function sanitizeText(value: unknown, fallback: string, maxLength: number) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function getSessionId(value: unknown) {
  return typeof value === "string" && value.length >= 12 ? value : randomUUID();
}

function isValidCard(card: unknown): card is number[][] {
  return Array.isArray(card) &&
    card.length === 5 &&
    card.every(row => Array.isArray(row) && row.length === 5 && row.every(num => Number.isInteger(num) && num >= 0 && num <= 75));
}

function isValidCardSet(cards: unknown): cards is number[][][] {
  return Array.isArray(cards) && cards.length > 0 && cards.length <= 4 && cards.every(isValidCard);
}

function sanitizePatterns(value: unknown): BingoPattern[] {
  if (!Array.isArray(value)) return DEFAULT_BINGO_PATTERNS;
  const presetIds = new Set(PRESET_PATTERNS.map(pattern => pattern.id));
  const patterns = value
    .map((pattern): BingoPattern | null => {
      if (!pattern || typeof pattern !== 'object') return null;
      const source = pattern as Partial<BingoPattern>;
      const id = sanitizeText(source.id, randomUUID(), 48);
      const match = source.match === 'dikit' ? 'dikit' : 'cells';
      const preset = presetIds.has(id) ? PRESET_PATTERNS.find(item => item.id === id) : null;
      if (preset) return preset;
      const cells = Array.isArray(source.cells)
        ? [...new Set(source.cells.filter(cell => Number.isInteger(cell) && cell >= 0 && cell < 25))]
        : [];
      if (match === 'cells' && cells.length === 0) return null;
      return {
        id,
        name: sanitizeText(source.name, 'Custom Pattern', 28),
        type: 'custom',
        match,
        cells
      };
    })
    .filter((pattern): pattern is BingoPattern => Boolean(pattern));

  return patterns.length ? patterns : DEFAULT_BINGO_PATTERNS;
}

function touchRoom(code: string) {
  if (roomCleanupTimers[code]) {
    clearTimeout(roomCleanupTimers[code]);
    delete roomCleanupTimers[code];
  }
}

function scheduleRoomCleanup(code: string) {
  touchRoom(code);
  roomCleanupTimers[code] = setTimeout(() => {
    const room = rooms[code];
    if (room && Object.values(room.players).every(player => !player.connected)) {
      stopAutoCaller(code);
      delete rooms[code];
    }
    delete roomCleanupTimers[code];
  }, 15 * 60 * 1000);
}

function emitRoom(io: Server, code: string) {
  const room = rooms[code];
  if (room) io.to(code).emit("room_updated", room);
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  io.on("connection", (socket: Socket) => {
    socket.on("create_room", (data: { sessionId?: string, nickname: string, avatarColor?: string }, callback) => {
      let code = generateRoomCode();
      while (rooms[code]) {
        code = generateRoomCode();
      }
      const sessionId = getSessionId(data.sessionId);
      
      const newRoom: Room = {
        id: code,
        mode: 'Bingo',
        status: 'waiting',
        remainingBalls: initBalls(),
        calledNumbers: [],
        players: {},
        hostId: sessionId,
        prizeText: '',
        roundName: 'Round 1',
        roundNumber: 1,
        autoCallSpeed: 0,
        patterns: DEFAULT_BINGO_PATTERNS,
        claims: [],
        stats: {
          totalCardsSold: 0,
          totalPlayersJoined: 1, // Host counts as first player
          gamesPlayed: 0,
          winners: [],
          startTime: Date.now()
        }
      };

      const hostPlayer: Player = {
        id: sessionId,
        socketId: socket.id,
        nickname: sanitizeText(data.nickname, 'Host', 24),
        avatarColor: data.avatarColor || '#3b82f6',
        isHost: true,
        connected: true,
        activeCards: [],
        hasDikit: false,
        nextRoundChoice: 'keep'
      };

      newRoom.players[sessionId] = hostPlayer;
      rooms[code] = newRoom;
      
      socket.join(code);
      if (callback) callback({ success: true, room: newRoom });
    });

    socket.on("join_room", (data: { code: string, sessionId?: string, nickname: string, avatarColor?: string }, callback) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      if (!room) {
        if (callback) callback({ success: false, message: "Room not found" });
        return;
      }
      touchRoom(code);
      const sessionId = getSessionId(data.sessionId);
      if (!room.players[sessionId]) {
        room.stats.totalPlayersJoined += 1;
      }

      const newPlayer: Player = {
        id: sessionId,
        socketId: socket.id,
        nickname: sanitizeText(data.nickname, 'Player', 24),
        avatarColor: data.avatarColor || '#ef4444',
        isHost: false,
        connected: true,
        activeCards: [],
        hasDikit: false,
        nextRoundChoice: 'keep'
      };

      room.players[sessionId] = {
        ...room.players[sessionId],
        ...newPlayer,
        isHost: room.players[sessionId]?.isHost || false,
        nextRoundChoice: room.players[sessionId]?.nextRoundChoice || 'keep',
        activeCards: room.players[sessionId]?.activeCards || []
      };
      socket.join(code);
      io.to(code).emit("room_updated", room);
      if (callback) callback({ success: true, room });
    });

    socket.on("rejoin_room", (data: { code: string, sessionId?: string, nickname?: string, avatarColor?: string, role?: 'host' | 'player' }, callback) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const sessionId = getSessionId(data.sessionId);
      if (!room) {
        if (callback) callback({ success: false, message: "Room not found" });
        return;
      }

      const existing = room.players[sessionId];
      const wantsHost = data.role === 'host';
      if (wantsHost && room.hostId !== sessionId) {
        if (callback) callback({ success: false, message: "Host session not found" });
        return;
      }

      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        existing.nickname = sanitizeText(data.nickname, existing.nickname, 24);
        existing.avatarColor = data.avatarColor || existing.avatarColor;
      } else if (!wantsHost) {
        room.players[sessionId] = {
          id: sessionId,
          socketId: socket.id,
          nickname: sanitizeText(data.nickname, 'Player', 24),
          avatarColor: data.avatarColor || '#ef4444',
          isHost: false,
          connected: true,
          activeCards: [],
          hasDikit: false,
          nextRoundChoice: 'keep'
        };
      } else {
        if (callback) callback({ success: false, message: "Host session not found" });
        return;
      }

      touchRoom(code);
      socket.join(code);
      io.to(code).emit("room_updated", room);
      if (callback) callback({ success: true, room });
    });

    socket.on("update_cards", (data: { code: string, cards: number[][][] }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player && isValidCardSet(data.cards)) {
        if (!['waiting', 'next_round'].includes(room.status)) return;
        player.activeCards = data.cards;
        
        // Update statistics
        room.stats.totalCardsSold = Object.values(room.players).reduce((sum, p) => sum + p.activeCards.length, 0);
        
        io.to(code).emit("room_updated", room);
      }
    });

    socket.on("start_game", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        room.status = 'playing';
        io.to(code).emit("room_updated", room);
        
        if (room.autoCallSpeed > 0) {
          startAutoCaller(code);
        }
      }
    });

    socket.on("update_settings", (data: { code: string, settings: any }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        const settings = data.settings || {};
        if (['Bingo', 'Blackout', 'Dikit'].includes(settings.mode)) room.mode = settings.mode;
        if ([0, 3, 5, 8].includes(settings.autoCallSpeed)) room.autoCallSpeed = settings.autoCallSpeed;
        if (typeof settings.roundName === 'string') room.roundName = sanitizeText(settings.roundName, 'Round 1', 40);
        if (typeof settings.prizeText === 'string') room.prizeText = sanitizeText(settings.prizeText, '', 80);
        if (Array.isArray(settings.patterns)) room.patterns = sanitizePatterns(settings.patterns);
        io.to(code).emit("room_updated", room);
      }
    });

    const triggerNextBall = (code: string) => {
      const room = rooms[code];
      if (room && room.status === 'playing' && room.remainingBalls.length > 0) {
        const ball = room.remainingBalls.pop()!;
        room.calledNumbers.push(ball);
        io.to(code).emit("ball_called", { ball, room });
        io.to(code).emit("room_updated", room);
      } else if (room && room.remainingBalls.length === 0) {
        stopAutoCaller(code);
      }
    };

    socket.on("call_next_ball", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        triggerNextBall(code);
      }
    });

    socket.on("pause_game", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        room.status = 'paused';
        stopAutoCaller(code);
        io.to(code).emit("room_updated", room);
      }
    });

    socket.on("resume_game", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        room.status = 'playing';
        io.to(code).emit("room_updated", room);
        if (room.autoCallSpeed > 0) {
          startAutoCaller(code);
        }
      }
    });
    
    socket.on("reset_game", (data: { code: string }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       const host = room?.players[room.hostId];
       if (room && host?.socketId === socket.id) {
         room.status = 'waiting';
         room.calledNumbers = [];
         room.remainingBalls = initBalls();
         room.claims = [];
         room.nextRoundEndsAt = undefined;
         if (nextRoundTimers[code]) {
           clearTimeout(nextRoundTimers[code]);
           delete nextRoundTimers[code];
         }
         Object.values(room.players).forEach(player => {
           player.nextRoundChoice = 'keep';
         });
         stopAutoCaller(code);
         io.to(code).emit("room_updated", room);
       }
    });

    socket.on("claim_bingo", (data: { code: string, cardIndex: number, markedCells: number[] }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player && room.status === 'playing') {
        const card = player.activeCards[data.cardIndex];
        const markedCells = Array.isArray(data.markedCells) ? data.markedCells.filter(Number.isInteger) : [];
        if (!isValidCard(card)) return;
        const winCheck = checkValidWin(card, markedCells, room.calledNumbers, room.mode, room.patterns);
        if (!winCheck.valid) {
          socket.emit("claim_rejected", { message: "Invalid claim" });
          return;
        }

        // Pause auto-caller for verification
        stopAutoCaller(code);
        room.status = 'paused';
        
        const claim = {
          id: randomUUID(),
          playerId: player.id,
          playerName: player.nickname,
          cardIndex: data.cardIndex,
          card,
          markedCells,
          pattern: winCheck.pattern,
          timestamp: Date.now()
        };
        room.claims.push(claim);
        
        io.to(code).emit("bingo_claim_alert", claim);
        io.to(code).emit("room_updated", room);
      }
    });

    socket.on("claim_dikit", (data: { code: string, cardIndex: number, markedCells: number[] }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player && room.status === 'playing') {
        const card = player.activeCards[data.cardIndex];
        if (!isValidCard(card)) return;
        
        const dikitClaim = {
          id: randomUUID(),
          playerId: player.id,
          playerName: player.nickname,
          cardIndex: data.cardIndex,
          card,
          timestamp: Date.now()
        };
        
        io.to(code).emit("dikit_claimed", dikitClaim);
      }
    });

    socket.on("verify_claim", (data: { code: string, claimId: string, isValid: boolean }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       const host = room?.players[room.hostId];
       if (room && host?.socketId === socket.id) {
          const claimIndex = room.claims.findIndex(c => c.id === data.claimId);
          if (claimIndex !== -1) {
             const claim = room.claims[claimIndex];
             if (data.isValid) {
                stopAutoCaller(code);
                room.status = 'next_round';
                room.nextRoundEndsAt = Date.now() + 20_000;
                
                // Record winner and increment games played
                room.stats.gamesPlayed += 1;
                room.stats.winners.push({
                   name: claim.playerName,
                   pattern: claim.pattern,
                   round: room.roundNumber
                });

                if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
                nextRoundTimers[code] = setTimeout(() => prepareNextRound(code, io), 20_000);
                io.to(code).emit("winner_announced", claim);
             } else {
                room.claims.splice(claimIndex, 1);
                io.to(code).emit("claim_rejected", claim);
                room.status = 'playing';
                if (room.autoCallSpeed > 0) {
                  startAutoCaller(code);
                }
             }
             io.to(code).emit("room_updated", room);
          }
       }
    });

    socket.on("set_next_round_choice", (data: { code: string, choice: 'keep' | 'change' }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player && room.status === 'next_round' && ['keep', 'change'].includes(data.choice)) {
        player.nextRoundChoice = data.choice;
        io.to(code).emit("room_updated", room);
      }
    });

    socket.on("start_next_round", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id && room.status === 'next_round') {
        prepareNextRound(code, io);
      }
    });

    socket.on("disconnect", () => {
      for (const code in rooms) {
        const room = rooms[code];
        const player = Object.values(room.players).find(p => p.socketId === socket.id);
        if (player) {
          player.connected = false;
          player.socketId = undefined;

          const connectedPlayers = Object.values(room.players).filter(p => p.connected);
          if (connectedPlayers.length === 0) {
            stopAutoCaller(code);
            if (nextRoundTimers[code]) {
              clearTimeout(nextRoundTimers[code]);
              delete nextRoundTimers[code];
            }
            scheduleRoomCleanup(code);
          } else if (room.hostId === player.id) {
            const nextHost = connectedPlayers[0];
            player.isHost = false;
            nextHost.isHost = true;
            room.hostId = nextHost.id;
            room.status = 'paused';
            stopAutoCaller(code);
            io.to(code).emit("host_changed", { hostId: nextHost.id, hostName: nextHost.nickname });
            emitRoom(io, code);
          } else {
            emitRoom(io, code);
          }
        }
      }
    });
  });

  function startAutoCaller(code: string) {
    stopAutoCaller(code);
    const room = rooms[code];
    if (room && room.autoCallSpeed > 0 && room.status === 'playing') {
      autoCallTimers[code] = setInterval(() => {
        const currentRoom = rooms[code];
        if (currentRoom && currentRoom.status === 'playing' && currentRoom.remainingBalls.length > 0) {
           const ball = currentRoom.remainingBalls.pop()!;
           currentRoom.calledNumbers.push(ball);
           io.to(code).emit("ball_called", { ball, room: currentRoom });
           io.to(code).emit("room_updated", currentRoom);
        } else {
           stopAutoCaller(code);
        }
      }, room.autoCallSpeed * 1000);
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
