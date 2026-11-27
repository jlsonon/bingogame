import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { Server, Socket } from "socket.io";
import { createServer as createViteServer } from "vite";
import { checkValidWin, checkDikitSidequest, countDikitPairs, generateRandomCard, DEFAULT_BINGO_PATTERNS, PRESET_PATTERNS, type BingoPattern, type GameMode } from "./src/lib/bingo";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NATURAL_VOICE_MAP } from "./src/lib/voices";
import { z } from "zod";

const SettingsSchema = z.object({
  mode: z.enum(['Bingo', 'Blackout', 'Dikit']).optional(),
  autoCallSpeed: z.number().min(0).optional(),
  voiceMode: z.string().max(64).optional(),
  ambienceEnabled: z.boolean().optional(),
  voiceId: z.string().max(64).optional(),
  roundName: z.string().max(40).optional(),
  prizeText: z.string().max(80).optional(),
  patterns: z.array(z.any()).optional(),
  hidePattern: z.boolean().optional()
});

const UpdateCardsSchema = z.object({
  code: z.string().length(4),
  cards: z.array(z.array(z.array(z.number().int().min(0).max(75)))).max(4)
});

const JoinRoomSchema = z.object({
  code: z.string().length(4),
  nickname: z.string().min(1).max(24),
  avatarColor: z.string().startsWith('#').max(7).optional(),
  cardCount: z.number().int().min(0).max(4).optional()
});

interface Player {
  id: string;
  socketId?: string;
  nickname: string;
  avatarColor?: string;
  isHost: boolean;
  connected: boolean;
  activeCards: number[][][]; // Array of cards, each card is 5x5 array of numbers
  markedCells: Record<number, number[]>; // Track marked cells on server for recovery
  hasDikit: boolean;
  nextRoundChoice?: 'keep' | 'change';
  isReady: boolean;
}

interface DikitFightContender {
  id: string;
  playerId: string;
  playerName: string;
  cardIndex: number;
  card: number[][];
  initialDikitCount: number;
}

interface DikitFightState {
  status: 'active' | 'resolved';
  ballCalledIndex: number;
  contenders: DikitFightContender[];
  winners?: DikitFightContender[];
  roundBingoPending?: boolean;
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
  voiceMode: string;
  ambienceEnabled: boolean;
  voiceId: string;
  patterns: BingoPattern[];
  nextRoundEndsAt?: number;
  dikitEndsAt?: number;
  claims: any[];
  hidePattern: boolean;
  dikitWinners: any[];
  dikitFight?: DikitFightState | null;
  verifiedWinners: any[];
  multiBingoPending?: boolean;
  tiedWinners?: any[];
  stats: {
    totalCardsSold: number;
    totalPlayersJoined: number;
    gamesPlayed: number;
    winners: { name: string, pattern: string, round: number, time: number }[];
    startTime: number;
  };
}

const rooms: Record<string, Room> = {};
const roomCleanupTimers: Record<string, NodeJS.Timeout> = {};
const nextRoundTimers: Record<string, NodeJS.Timeout> = {};
const dikitGraceTimers: Record<string, NodeJS.Timeout> = {};
const pendingDikitClaims: Record<string, { ballIndex: number; claims: DikitFightContender[] }> = {};

// --- SESSION LOCKING ---
const sessionSockets: Record<string, string> = {}; // sessionId -> socketId
// -----------------------

// --- GLOBAL PATTERN PERSISTENCE ---
const PATTERNS_FILE = path.join(process.cwd(), "patterns.json");
let globalPatternLibrary: BingoPattern[] = [];

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

// --- HALL OF FAME PERSISTENCE ---
const HOF_FILE = path.join(process.cwd(), "hallOfFame.json");
let globalHallOfFame: any[] = [];

function loadGlobalPatterns() {
  try {
    if (fs.existsSync(PATTERNS_FILE)) {
      const data = fs.readFileSync(PATTERNS_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        globalPatternLibrary = parsed
          .filter(p => !isDeletedPattern(p))
          .map(sanitizeCustomPattern)
          .filter((p): p is BingoPattern => Boolean(p));
        saveGlobalPatterns();
      }
      console.log(`Loaded ${globalPatternLibrary.length} patterns from server storage.`);
    }
  } catch (err) {
    console.error("Failed to load global patterns:", err);
    globalPatternLibrary = [];
  }
}

function saveGlobalPatterns() {
  try {
    fs.writeFileSync(PATTERNS_FILE, JSON.stringify(globalPatternLibrary, null, 2));
  } catch (err) {
    console.error("Failed to save global patterns:", err);
  }
}

function loadHOF() {
  try {
    if (fs.existsSync(HOF_FILE)) {
      const data = fs.readFileSync(HOF_FILE, "utf-8");
      globalHallOfFame = JSON.parse(data);
      console.log(`Loaded ${globalHallOfFame.length} HOF entries.`);
    }
  } catch (err) {
    console.error("Failed to load HOF:", err);
    globalHallOfFame = [];
  }
}

function saveHOF() {
  try {
    fs.writeFileSync(HOF_FILE, JSON.stringify(globalHallOfFame, null, 2));
  } catch (err) {
    console.error("Failed to save HOF:", err);
  }
}

function registerSessionSocket(io: Server, sessionId: string, socketId: string) {
  const oldSocketId = sessionSockets[sessionId];
  if (oldSocketId && oldSocketId !== socketId) {
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) {
       oldSocket.emit("force_disconnect", { message: "Joined from another tab" });
       oldSocket.disconnect(true);
    }
  }
  sessionSockets[sessionId] = socketId;
}

loadGlobalPatterns();
loadHOF();
// ----------------------------------

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function initBalls(): number[] {
  const balls = Array.from({ length: 75 }, (_, i) => i + 1);
  // Fisher-Yates (Knuth) Shuffle
  for (let i = balls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  return balls;
}

// Auto-caller timeouts
const autoCallTimers: Record<string, NodeJS.Timeout> = {};

function stopAutoCaller(code: string) {
  if (autoCallTimers[code]) {
    clearInterval(autoCallTimers[code]);
    delete autoCallTimers[code];
  }
}

// Helper to check near wins across the room when a ball is called
function checkRoomForNearWins(code: string, io: Server, room: Room) {
  if (!room.calledNumbers || room.calledNumbers.length === 0) return;
  let nearWinData: { playerName: string, patternName: string } | null = null;

  Object.values(room.players).forEach(player => {
    player.activeCards.forEach((card, idx) => {
      const marked = player.markedCells[idx] || [];
      const res = checkValidWin(card, marked, room.calledNumbers, room.mode, room.patterns);
      if (res.cellsAway === 1) {
        nearWinData = { 
           playerName: player.nickname, 
           patternName: res.pattern || room.mode 
        };
      }
    });
  });

  if (nearWinData) {
    io.to(code).emit("near_win_alert", nearWinData);
  }
}

function resolveDikitFight(code: string, io: Server, room: Room, winners: DikitFightContender[]) {
  if (!room.dikitFight || room.dikitFight.status !== 'active') return;

  room.dikitFight.status = 'resolved';
  room.dikitFight.winners = winners;
  room.dikitWinners = winners;

  io.to(code).emit("dikit_fight_won", winners);
  io.to(code).emit("dikit_winners_announced", winners);

  // If Bingo was already won while Dikit fight was active, conclude the round now!
  if (room.dikitFight.roundBingoPending || (room.verifiedWinners && room.verifiedWinners.length > 0)) {
    stopAutoCaller(code);
    room.stats.gamesPlayed += 1;
    room.status = 'next_round';
    room.nextRoundEndsAt = Date.now() + 20_000;

    if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
    nextRoundTimers[code] = setTimeout(() => prepareNextRound(code, io), 20_000);

    io.to(code).emit("winners_announced", room.verifiedWinners);
  }
}

function checkDikitFightProgress(code: string, io: Server, room: Room) {
  if (!room.dikitFight || room.dikitFight.status !== 'active') return;

  const contenders = room.dikitFight.contenders;
  const hits: DikitFightContender[] = [];

  for (const contender of contenders) {
    const player = room.players[contender.playerId];
    const marked = player?.markedCells[contender.cardIndex] || [];
    const effectiveMarked = [...new Set([...marked, ...room.calledNumbers])];
    const currentPairs = countDikitPairs(contender.card, effectiveMarked, room.calledNumbers);

    if (currentPairs > contender.initialDikitCount) {
      hits.push(contender);
    }
  }

  if (hits.length === 1 || hits.length === 2) {
    resolveDikitFight(code, io, room, hits);
  } else if (hits.length >= 3) {
    for (const h of hits) {
      const player = room.players[h.playerId];
      const marked = player?.markedCells[h.cardIndex] || [];
      const effectiveMarked = [...new Set([...marked, ...room.calledNumbers])];
      h.initialDikitCount = countDikitPairs(h.card, effectiveMarked, room.calledNumbers);
    }
    io.to(code).emit("dikit_fight_tied_again", { contenders: hits });
  }
}

function drawNextBall(code: string, io: Server) {
  const room = rooms[code];
  if (!room || room.status !== 'playing' || room.remainingBalls.length === 0) {
    if (room && room.remainingBalls.length === 0) {
      stopAutoCaller(code);
      if (room.dikitFight && room.dikitFight.status === 'active') {
        resolveDikitFight(code, io, room, room.dikitFight.contenders.slice(0, 2));
      }
    }
    return;
  }

  const ball = room.remainingBalls.pop()!;
  room.calledNumbers.push(ball);
  io.to(code).emit("ball_called", { ball, room });
  checkRoomForNearWins(code, io, room);
  checkDikitFightProgress(code, io, room);
  io.to(code).emit("room_updated", room);
}

function startAutoCaller(code: string, io: Server) {
  const room = rooms[code];
  if (!room || room.status !== 'playing' || room.autoCallSpeed <= 0) return;
  
  stopAutoCaller(code);
  autoCallTimers[code] = setInterval(() => {
    drawNextBall(code, io);
  }, room.autoCallSpeed * 1000);
}

function prepareNextRound(code: string, io: Server, autoStart = false) {
  const room = rooms[code];
  if (!room || room.status !== 'next_round') return;
  room.status = autoStart ? 'playing' : 'waiting';
  room.calledNumbers = [];
  room.remainingBalls = initBalls();
  room.claims = [];
  room.dikitWinners = [];
  room.dikitFight = null;
  delete pendingDikitClaims[code];
  room.verifiedWinners = [];
  room.multiBingoPending = false;
  room.tiedWinners = [];
  room.nextRoundEndsAt = undefined;
  room.roundNumber += 1;
  room.roundName = `Round ${room.roundNumber}`;
  Object.values(room.players).forEach(player => {
    player.nextRoundChoice = 'keep';
    player.isReady = false;
    // We don't reset markedCells here because the client might choose to keep their cards.
    // The client will send an update_cards/update_marked_cells if they change them.
    // Actually, on new round, even if they keep cards, the marks are reset.
    const resetMarked: Record<number, number[]> = {};
    player.activeCards.forEach((_, i) => { resetMarked[i] = [0]; });
    player.markedCells = resetMarked;
  });
  if (nextRoundTimers[code]) {
    clearTimeout(nextRoundTimers[code]);
    delete nextRoundTimers[code];
  }
  io.to(code).emit("room_updated", room);
  if (autoStart && room.autoCallSpeed > 0) {
    startAutoCaller(code, io);
  }
}

function normalizeCode(code: unknown) {
  if (typeof code !== 'string') return '';
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

function sanitizeCustomPattern(pattern: unknown): BingoPattern | null {
  if (!pattern || typeof pattern !== 'object') return null;
  const source = pattern as Partial<BingoPattern>;
  if (isDeletedPattern(source)) return null;
  if (source.match === 'dikit') return null;

  const id = sanitizeText(source.id, randomUUID(), 48);
  const cells = Array.isArray(source.cells)
    ? [...new Set(source.cells.filter(cell => Number.isInteger(cell) && cell >= 0 && cell < 25))]
    : [];
  const nonFree = cells.filter(cell => cell !== 12);
  if (nonFree.length === 0) return null;
  return {
    id,
    name: sanitizeText(source.name, 'Custom Pattern', 28),
    type: 'custom',
    match: 'cells',
    cells: [...new Set([...cells, 12])].sort((a, b) => a - b)
  };
}

function getAllLibraryPatterns(): BingoPattern[] {
  const customPatterns = globalPatternLibrary.filter(p => !isDeletedPattern(p));
  return [
    ...PRESET_PATTERNS,
    ...customPatterns.filter(p => !PRESET_PATTERNS.some(preset => preset.id === p.id))
  ];
}

function sanitizePatterns(value: unknown): BingoPattern[] {
  const allLibraryPatterns = getAllLibraryPatterns();
  if (!Array.isArray(value)) return allLibraryPatterns;
  const presetIds = new Set(PRESET_PATTERNS.map(pattern => pattern.id));
  const patterns = value
    .map((pattern): BingoPattern | null => {
      if (!pattern || typeof pattern !== 'object') return null;
      const source = pattern as Partial<BingoPattern>;
      if (isDeletedPattern(source)) return null;
      const id = sanitizeText(source.id, randomUUID(), 48);
      const preset = presetIds.has(id) ? PRESET_PATTERNS.find(item => item.id === id) : null;
      if (preset) return preset;
      return sanitizeCustomPattern(pattern);
    })
    .filter((pattern): pattern is BingoPattern => Boolean(pattern));

  return patterns.length ? patterns : allLibraryPatterns;
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

  const ttsCache = new Map<string, Buffer>();

  app.get("/api/tts", async (req, res) => {
    try {
      const voiceId = String(req.query.voice || 'natural_jenny');
      const ballNum = req.query.ball ? parseInt(String(req.query.ball), 10) : undefined;
      const preview = req.query.preview === 'true';
      const customText = req.query.text ? String(req.query.text).slice(0, 100) : undefined;

      const voiceConfig = NATURAL_VOICE_MAP[voiceId];
      if (!voiceConfig) {
        return res.status(400).json({ error: "Invalid natural voice ID" });
      }

      let textToSpeak = "";
      if (ballNum && ballNum >= 1 && ballNum <= 75) {
        const letter = ballNum <= 15 ? 'B' : ballNum <= 30 ? 'I' : ballNum <= 45 ? 'N' : ballNum <= 60 ? 'G' : 'O';
        textToSpeak = `${letter}... ${ballNum}.`;
      } else if (customText) {
        textToSpeak = customText;
      } else if (preview) {
        textToSpeak = `Lucky Bingo! B... 12.`;
      } else {
        textToSpeak = `Lucky Bingo!`;
      }

      const cacheKey = `${voiceConfig.edgeVoice}:${textToSpeak}`;
      if (ttsCache.has(cacheKey)) {
        const cached = ttsCache.get(cacheKey)!;
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", cached.length);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(cached);
      }

      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceConfig.edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const stream = tts.toStream(textToSpeak);
      const chunks: Buffer[] = [];

      stream.audioStream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.audioStream.on("end", () => {
        const fullBuffer = Buffer.concat(chunks);
        ttsCache.set(cacheKey, fullBuffer);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", fullBuffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(fullBuffer);
      });

      stream.audioStream.on("error", (err: any) => {
        console.error("TTS stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "TTS generation error" });
        }
      });
    } catch (err: any) {
      console.error("TTS endpoint error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "TTS endpoint failed" });
      }
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/rooms", (req, res) => {
    const activeRooms = Object.values(rooms)
      .map(r => ({
        id: r.id,
        status: r.status,
        players: Object.values(r.players).filter(p => p.connected).length,
        mode: r.mode,
        hostName: r.players[r.hostId]?.nickname || 'Unknown'
      }))
      .filter(r => r.players > 0);
    res.json(activeRooms);
  });

const rateLimits: Record<string, number> = {};

io.on("connection", (socket: Socket) => {
  // --- GLOBAL PATTERN EVENTS ---
  socket.on("get_global_patterns", (callback) => {
    if (callback) callback(globalPatternLibrary);
  });

  socket.on("get_hall_of_fame", (callback) => {
    if (callback) callback(globalHallOfFame);
  });

  socket.on("save_global_pattern", (pattern: BingoPattern) => {
    const sanitized = sanitizeCustomPattern(pattern);
    if (!sanitized) return;
    const index = globalPatternLibrary.findIndex(p => p.id === sanitized.id);
    if (index !== -1) {
      globalPatternLibrary[index] = sanitized;
    } else {
      globalPatternLibrary.push(sanitized);
    }
    saveGlobalPatterns();
    io.emit("global_patterns_updated", globalPatternLibrary);
  });

  socket.on("delete_global_pattern", (id: string) => {
    globalPatternLibrary = globalPatternLibrary.filter(p => p.id !== id);
    saveGlobalPatterns();
    io.emit("global_patterns_updated", globalPatternLibrary);
  });
  // ----------------------------

  socket.on("create_room", (data: { sessionId?: string, nickname: string, avatarColor?: string }, callback) => {
    const ip = socket.handshake.address;
    const now = Date.now();
    if (rateLimits[ip] && now - rateLimits[ip] < 1000) {
      if (callback) callback({ success: false, message: "Too many room creations. Please wait a moment." });
      return;
    }
    rateLimits[ip] = now;

      let code = generateRoomCode();
      while (rooms[code]) {
        code = generateRoomCode();
      }
      const sessionId = getSessionId(data.sessionId);
      registerSessionSocket(io, sessionId, socket.id);

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
        voiceMode: 'robotic',
        ambienceEnabled: false,
        voiceId: '24JGmqE2AvYy6abpAy3g',
        patterns: getAllLibraryPatterns(),
        claims: [],
        hidePattern: false,
        dikitWinners: [],
        dikitFight: null,
        verifiedWinners: [],
        multiBingoPending: false,
        tiedWinners: [],
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
        markedCells: {},
        hasDikit: false,
        nextRoundChoice: 'keep',
        isReady: false
      };

      newRoom.players[sessionId] = hostPlayer;
      rooms[code] = newRoom;
      
      socket.join(code);
      if (callback) callback({ success: true, room: newRoom });
    });

    socket.on("join_room", (data: { code: string, sessionId?: string, nickname: string, avatarColor?: string, cardCount?: number }, callback) => {
      const parsed = JoinRoomSchema.safeParse(data);
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

      let activeCards = room.players[sessionId]?.activeCards || [];
      let markedCells = room.players[sessionId]?.markedCells || {};

      if (typeof data.cardCount === 'number' && (room.status === 'waiting' || room.status === 'next_round' || activeCards.length === 0)) {
        const count = Math.min(Math.max(data.cardCount, 0), 4);
        activeCards = Array.from({ length: count }, () => generateRandomCard());
        markedCells = {};
        activeCards.forEach((_, i) => { markedCells[i] = [0]; });
      }

      const newPlayer: Player = {
        id: sessionId,
        socketId: socket.id,
        nickname: sanitizeText(data.nickname || 'Guest', 'Player', 24),
        avatarColor: data.avatarColor || '#ef4444',
        isHost: false,
        connected: true,
        activeCards,
        markedCells,
        hasDikit: false,
        nextRoundChoice: 'keep',
        isReady: false
      };

      room.players[sessionId] = {
        ...room.players[sessionId],
        ...newPlayer,
        isHost: room.players[sessionId]?.isHost || false,
        nextRoundChoice: room.players[sessionId]?.nextRoundChoice || 'keep',
        activeCards,
        markedCells
      };

      room.stats.totalCardsSold = Object.values(room.players).reduce((sum, p) => sum + (p.activeCards?.length || 0), 0);
      registerSessionSocket(io, sessionId, socket.id);
      socket.join(code);
      io.to(code).emit("room_updated", room);
      if (callback) callback({ success: true, room });
    });

    socket.on("rejoin_room", (data: { code: string, sessionId?: string, nickname?: string, avatarColor?: string, role?: 'host' | 'player' | 'display' | 'godview' }, callback) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const sessionId = getSessionId(data.sessionId);

      if (!room) {
        if (callback) callback({ success: false, message: "Room not found" });
        return;
      }

      if (data.role === 'display') {
        touchRoom(code);
        socket.join(code);
        if (callback) callback({ success: true, room });
        return;
      }

      if (data.role === 'godview') {
        if (room.hostId !== sessionId) {
          if (callback) callback({ success: false, message: "Host session not found" });
          return;
        }
        touchRoom(code);
        socket.join(code);
        if (callback) callback({ success: true, room });
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
        existing.nickname = sanitizeText(data.nickname || existing.nickname, existing.nickname, 24);
        existing.avatarColor = data.avatarColor || existing.avatarColor;
        registerSessionSocket(io, sessionId, socket.id);
      } else {
        if (callback) callback({ success: false, message: "Session not found. Please join from the landing page." });
        return;
      }

      touchRoom(code);
      socket.join(code);
      io.to(code).emit("room_updated", room);
      if (callback) callback({ success: true, room });
    });

    socket.on("update_cards", (data: { code: string, cards: number[][][] }) => {
      const parsed = UpdateCardsSchema.safeParse(data);
      if (!parsed.success) return;

      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player) {
        if (!['waiting', 'next_round'].includes(room.status)) return;
        player.activeCards = data.cards;
        
        // Update statistics
        room.stats.totalCardsSold = Object.values(room.players).reduce((sum, p) => sum + p.activeCards.length, 0);
        
        io.to(code).emit("room_updated", room);
      }
    });

    socket.on("update_marked_cells", (data: { code: string, markedCells: Record<number, number[]> }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player) {
        player.markedCells = data.markedCells;
        // Don't emit to whole room to save bandwidth, just update server state.
        // The host will get this naturally on next room_updated broadcast.
      }
    });

    socket.on("send_emote", (data: { code: string, emoji: string }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       if (room) {
          io.to(code).emit("emote_received", { emoji: data.emoji, id: randomUUID() });
       }
    });

    socket.on("start_game", (data: { code: string }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        room.status = 'playing';
        room.claims = [];
        room.verifiedWinners = [];
        room.dikitWinners = [];
        io.to(code).emit("room_updated", room);
        
        if (room.autoCallSpeed > 0) {
          startAutoCaller(code, io);
        }
      }
    });

    socket.on("update_settings", (data: { code: string, settings: any }) => {
      const parsed = SettingsSchema.safeParse(data.settings);
      if (!parsed.success) return;

      const code = normalizeCode(data.code);
      const room = rooms[code];
      const host = room?.players[room.hostId];
      if (room && host?.socketId === socket.id) {
        const settings = data.settings || {};
        if (settings.mode) room.mode = settings.mode;
        if (typeof settings.autoCallSpeed === 'number') {
          room.autoCallSpeed = settings.autoCallSpeed;
          if (room.status === 'playing') {
            if (room.autoCallSpeed > 0) {
              startAutoCaller(code, io);
            } else {
              stopAutoCaller(code);
            }
          }
        }
        if (settings.voiceMode) room.voiceMode = settings.voiceMode;
        if (typeof settings.ambienceEnabled === 'boolean') room.ambienceEnabled = settings.ambienceEnabled;
        if (settings.voiceId) room.voiceId = sanitizeText(settings.voiceId, '24JGmqE2AvYy6abpAy3g', 64);
        if (settings.roundName) room.roundName = sanitizeText(settings.roundName, 'Round 1', 40);
        if (settings.prizeText) room.prizeText = sanitizeText(settings.prizeText, '', 80);
        if (settings.patterns) {
          room.patterns = sanitizePatterns(settings.patterns);
          let patternsChanged = false;
          room.patterns.forEach(p => {
            if (p.type === 'custom') {
              const sanitized = sanitizeCustomPattern(p);
              if (sanitized) {
                const idx = globalPatternLibrary.findIndex(gp => gp.id === sanitized.id);
                if (idx !== -1) {
                  globalPatternLibrary[idx] = sanitized;
                } else {
                  globalPatternLibrary.push(sanitized);
                }
                patternsChanged = true;
              }
            }
          });
          if (patternsChanged) {
            saveGlobalPatterns();
            io.emit("global_patterns_updated", globalPatternLibrary);
          }
        }
        if (typeof settings.hidePattern === 'boolean') room.hidePattern = settings.hidePattern;
        io.to(code).emit("room_updated", room);
      }
    });

    const triggerNextBall = (code: string) => {
      drawNextBall(code, io);
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
          startAutoCaller(code, io);
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
         room.dikitWinners = [];
         room.verifiedWinners = [];
         room.multiBingoPending = false;
         room.tiedWinners = [];
         room.nextRoundEndsAt = undefined;
         if (nextRoundTimers[code]) {
           clearTimeout(nextRoundTimers[code]);
           delete nextRoundTimers[code];
         }
         Object.values(room.players).forEach(player => {
           player.nextRoundChoice = 'keep';
           player.isReady = false;
           // Reset markings
           const resetMarked: Record<number, number[]> = {};
           player.activeCards.forEach((_, i) => { resetMarked[i] = [0]; });
           player.markedCells = resetMarked;
         });
         stopAutoCaller(code);
         io.to(code).emit("room_updated", room);
       }
    });

    socket.on("claim_bingo", (data: { code: string, cardIndex: number, markedCells: number[] }) => {
      const code = normalizeCode(data.code);
      const room = rooms[code];
      const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
      if (room && player && (room.status === 'playing' || room.status === 'paused')) {
        if (!room.calledNumbers || room.calledNumbers.length === 0) {
          socket.emit("claim_rejected", { message: "No balls have been called yet" });
          return;
        }

        // Avoid duplicate claim for the same player & card
        const alreadyClaimed = room.claims.some(c => c.playerId === player.id && c.cardIndex === data.cardIndex) ||
                               room.verifiedWinners.some(w => w.playerId === player.id && w.cardIndex === data.cardIndex);
        if (alreadyClaimed) {
          return;
        }

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
        if (!room.calledNumbers || room.calledNumbers.length === 0) {
          socket.emit("claim_rejected", { message: "No balls have been called yet" });
          return;
        }

        // If Dikit is already settled this round, ignore further claims
        if (room.dikitWinners && room.dikitWinners.length > 0) return;
        if (room.dikitFight && room.dikitFight.status === 'resolved') return;

        // If Dikit fight is currently active, new contenders cannot join the ongoing fight
        if (room.dikitFight && room.dikitFight.status === 'active') return;

        const card = player.activeCards[data.cardIndex];
        const markedCells = Array.isArray(data.markedCells) ? data.markedCells.filter(Number.isInteger) : [];
        if (!isValidCard(card)) return;

        // Validate Dikit on Server
        const effectiveMarked = [...new Set([...markedCells, ...room.calledNumbers])];
        const pairsCount = countDikitPairs(card, effectiveMarked, room.calledNumbers);
        if (pairsCount === 0) {
           socket.emit("claim_rejected", { message: "Invalid Dikit claim" });
           return;
        }

        const currentBallIndex = room.calledNumbers.length;
        if (!pendingDikitClaims[code] || pendingDikitClaims[code].ballIndex !== currentBallIndex) {
          pendingDikitClaims[code] = { ballIndex: currentBallIndex, claims: [] };
        }

        const alreadyClaimed = pendingDikitClaims[code].claims.some(
          c => c.playerId === player.id && c.cardIndex === data.cardIndex
        );
        if (alreadyClaimed) return;

        const claimEntry: DikitFightContender = {
          id: randomUUID(),
          playerId: player.id,
          playerName: player.nickname,
          cardIndex: data.cardIndex,
          card,
          initialDikitCount: pairsCount
        };
        pendingDikitClaims[code].claims.push(claimEntry);

        // Notify room that Dikit was claimed - DO NOT PAUSE THE GAME!
        io.to(code).emit("dikit_claim_received", claimEntry);

        if (dikitGraceTimers[code]) {
          clearTimeout(dikitGraceTimers[code]);
        }
        dikitGraceTimers[code] = setTimeout(() => {
          delete dikitGraceTimers[code];
          const pending = pendingDikitClaims[code];
          if (!pending || pending.claims.length === 0) return;
          delete pendingDikitClaims[code];

          if (pending.claims.length === 1 || pending.claims.length === 2) {
            // 1 or 2 winners! Instant win without fight
            room.dikitWinners = pending.claims;
            io.to(code).emit("dikit_winners_announced", room.dikitWinners);
            io.to(code).emit("room_updated", room);

            // If Bingo was already verified while waiting for Dikit grace window:
            if (room.verifiedWinners && room.verifiedWinners.length > 0) {
              stopAutoCaller(code);
              room.stats.gamesPlayed += 1;
              room.status = 'next_round';
              room.nextRoundEndsAt = Date.now() + 20_000;
              if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
              nextRoundTimers[code] = setTimeout(() => prepareNextRound(code, io), 20_000);
              io.to(code).emit("winners_announced", room.verifiedWinners);
            }
          } else if (pending.claims.length >= 3) {
            // 3 OR MORE TIED ON SAME BALL -> START DIKIT FIGHT!
            room.dikitFight = {
              status: 'active',
              ballCalledIndex: pending.ballIndex,
              contenders: pending.claims,
              winners: [],
              roundBingoPending: room.verifiedWinners && room.verifiedWinners.length > 0
            };
            io.to(code).emit("dikit_fight_started", room.dikitFight);
            io.to(code).emit("room_updated", room);
            // Main game continues without interruption!
          }
        }, 2000);
      }
    });

    socket.on("verify_claim", (data: { code: string, claimId: string, isValid: boolean }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       const host = room?.players[room.hostId];
       if (room && host?.socketId === socket.id) {
          const claimIndex = room.claims.findIndex(c => c.id === data.claimId);
          if (claimIndex !== -1) {
             const claim = room.claims.splice(claimIndex, 1)[0];
             
             if (data.isValid) {
                room.verifiedWinners.push(claim);
                const winnerEntry = {
                   name: claim.playerName,
                   pattern: claim.pattern,
                   round: room.roundNumber,
                   time: Date.now()
                };
                room.stats.winners.push(winnerEntry);

                // ADD TO GLOBAL HOF
                globalHallOfFame.push(winnerEntry);
                // Keep only last 100 entries to prevent file bloat
                if (globalHallOfFame.length > 100) globalHallOfFame.shift();
                saveHOF();
                io.emit("hall_of_fame_updated", globalHallOfFame);
             } else {
                io.to(code).emit("claim_rejected", claim);
             }
             
             if (room.claims.length === 0) {
                 if (room.verifiedWinners.length > 0) {
                    // 3 or more winners: host chooses to Settle or Continue!
                    if (room.verifiedWinners.length >= 3) {
                       room.multiBingoPending = true;
                       io.to(code).emit("multi_bingo_choice_needed", {
                          winners: room.verifiedWinners
                       });
                       io.to(code).emit("room_updated", room);
                       return;
                    }

                    // 1 or 2 winners: normal finish
                    // Check if Dikit Fight is currently active!
                    if (room.dikitFight && room.dikitFight.status === 'active') {
                       room.dikitFight.roundBingoPending = true;
                       room.status = 'playing'; // Keep playing to resolve Dikit fight!
                       io.to(code).emit("bingo_won_dikit_fight_continues", {
                          bingoWinners: room.verifiedWinners,
                          dikitContenders: room.dikitFight.contenders
                       });
                       io.to(code).emit("room_updated", room);
                       if (room.autoCallSpeed > 0) {
                          startAutoCaller(code, io);
                       }
                    } else if (dikitGraceTimers[code]) {
                       // Dikit grace window is still ticking on this ball
                       room.status = 'playing';
                       io.to(code).emit("bingo_won_dikit_grace", {
                          bingoWinners: room.verifiedWinners
                       });
                       io.to(code).emit("room_updated", room);
                    } else {
                       room.stats.gamesPlayed += 1;
                       room.status = 'next_round';
                       room.nextRoundEndsAt = Date.now() + 20_000;
                       
                       if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
                       nextRoundTimers[code] = setTimeout(() => prepareNextRound(code, io), 20_000);
                       
                       io.to(code).emit("winners_announced", room.verifiedWinners);
                    }
                 } else {
                    room.status = 'playing';
                    if (room.autoCallSpeed > 0) {
                      startAutoCaller(code, io);
                    }
                 }
             }
             io.to(code).emit("room_updated", room);
          }
       }
    });

    socket.on("settle_multi_bingo", (data: { code: string, action: 'settle' | 'continue' }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       const host = room?.players[room.hostId];
       if (room && host?.socketId === socket.id && room.multiBingoPending) {
          room.multiBingoPending = false;

          if (data.action === 'settle') {
             // Conclude round awarding all 3+ winners!
             if (room.dikitFight && room.dikitFight.status === 'active') {
                room.dikitFight.roundBingoPending = true;
                room.status = 'playing';
                io.to(code).emit("bingo_won_dikit_fight_continues", {
                   bingoWinners: room.verifiedWinners,
                   dikitContenders: room.dikitFight.contenders
                });
                io.to(code).emit("room_updated", room);
                if (room.autoCallSpeed > 0) {
                   startAutoCaller(code, io);
                }
             } else if (dikitGraceTimers[code]) {
                room.status = 'playing';
                io.to(code).emit("bingo_won_dikit_grace", {
                   bingoWinners: room.verifiedWinners
                });
                io.to(code).emit("room_updated", room);
             } else {
                room.stats.gamesPlayed += 1;
                room.status = 'next_round';
                room.nextRoundEndsAt = Date.now() + 20_000;
                
                if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
                nextRoundTimers[code] = setTimeout(() => prepareNextRound(code, io), 20_000);
                
                io.to(code).emit("winners_announced", room.verifiedWinners);
                io.to(code).emit("room_updated", room);
             }
          } else if (data.action === 'continue') {
             // Host chose to Continue! Keep drawing balls to break the tie
             room.tiedWinners = [...room.verifiedWinners];
             room.verifiedWinners = [];
             room.status = 'playing';
             io.to(code).emit("multi_bingo_continued", {
                previousTiedWinners: room.tiedWinners
             });
             io.to(code).emit("room_updated", room);
             if (room.autoCallSpeed > 0) {
                startAutoCaller(code, io);
             }
          }
       }
    });

    socket.on("set_player_ready", (data: { code: string }) => {
       const code = normalizeCode(data.code);
       const room = rooms[code];
       const player = room ? Object.values(room.players).find(p => p.socketId === socket.id) : null;
       if (room && player && room.status === 'next_round') {
          player.isReady = true;
          io.to(code).emit("room_updated", room);
          
          const connectedPlayers = Object.values(room.players).filter(p => p.connected);
          const allReady = connectedPlayers.every(p => p.isReady);
          if (allReady && connectedPlayers.length > 0) {
             if (nextRoundTimers[code]) clearTimeout(nextRoundTimers[code]);
             prepareNextRound(code, io, true); // true = auto-start
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
