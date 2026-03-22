const { randomUUID } = require("crypto");

const rooms = {};        // roomCode → room
const tokenMap = {};     // token → { roomCode, playerId }

// ── CREATE ROOM ───────────────────────────────────────────────
function createRoom(leaderName, playerLimit) {
  const roomCode = generateCode();
  const leaderId = randomUUID();
  const token    = randomUUID();

  tokenMap[token] = { roomCode, playerId: leaderId };

  rooms[roomCode] = {
    code: roomCode,
    phase: "lobby",
    playerLimit,
    leaderId,
    players: {
      [leaderId]: {
        id: leaderId, name: leaderName,
        token, socketId: null,
        team: null, connected: true, isLeader: true,
      }
    },
    spectators: {},
    teamA: [], teamB: [],
    game: null,
    chat: [],
    pausedBy: null,
  };

  return { roomCode, playerId: leaderId, token };
}

// ── JOIN ROOM ─────────────────────────────────────────────────
function joinRoom(roomCode, playerName) {
  const room = rooms[roomCode];
  if (!room)                    return { error: "Room not found" };
  if (room.phase !== "lobby")   return { error: "Game already started" };
  if (Object.keys(room.players).length >= room.playerLimit)
                                return { error: "Room is full" };

  const playerId = randomUUID();
  const token    = randomUUID();
  tokenMap[token] = { roomCode, playerId };

  room.players[playerId] = {
    id: playerId, name: playerName,
    token, socketId: null,
    team: null, connected: true, isLeader: false,
  };

  return { roomCode, playerId, token };
}

// ── JOIN AS SPECTATOR ─────────────────────────────────────────
function joinAsSpectator(roomCode, socketId, name) {
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };
  room.spectators[socketId] = { name: name || "Spectator", socketId };
  return { success: true };
}

// ── RECONNECT VIA TOKEN ───────────────────────────────────────
function reconnectPlayer(token, socketId) {
  const ref = tokenMap[token];
  if (!ref) return { error: "Invalid token" };

  const room = rooms[ref.roomCode];
  if (!room) return { error: "Room no longer exists" };

  const player = room.players[ref.playerId];
  if (!player) return { error: "Player not found" };

  player.socketId  = socketId;
  player.connected = true;

  // Auto-resume if this player was the one who caused the pause
  if (room.phase === "paused" && room.pausedBy === ref.playerId) {
    const allBack = Object.values(room.players).every(p => p.connected);
    if (allBack) { room.phase = "playing"; room.pausedBy = null; }
  }

  return { success: true, roomCode: ref.roomCode, playerId: ref.playerId, player, room };
}

// ── DISCONNECT ────────────────────────────────────────────────
function disconnectPlayer(socketId) {
  for (const room of Object.values(rooms)) {
    // spectator?
    if (room.spectators[socketId]) {
      delete room.spectators[socketId];
      return { type: "spectator", roomCode: room.code };
    }
    // player?
    for (const player of Object.values(room.players)) {
      if (player.socketId === socketId) {
        player.connected = false;
        player.socketId  = null;
        if (room.phase === "playing") {
          room.phase    = "paused";
          room.pausedBy = player.id;
        }
        return { type: "player", roomCode: room.code, playerId: player.id, playerName: player.name, room };
      }
    }
  }
  return null;
}

// ── ASSIGN TEAMS ──────────────────────────────────────────────
function assignTeams(roomCode, teamA, teamB) {
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };

  // Allow partial assignments — leader assigns incrementally
  // Full validation (equal teams, all assigned) happens at start_game
  room.teamA = teamA;
  room.teamB = teamB;

  // Update each player's team field
  Object.keys(room.players).forEach(pid => {
    if (teamA.includes(pid))      room.players[pid].team = "A";
    else if (teamB.includes(pid)) room.players[pid].team = "B";
    else                          room.players[pid].team = null; // unassigned
  });

  return { success: true };
}

// ── CHAT ──────────────────────────────────────────────────────
function addChatMessage(roomCode, senderName, message, isSpectator = false) {
  const room = rooms[roomCode];
  if (!room) return null;
  const msg = { senderName, message, isSpectator, time: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  return msg;
}

// ── GETTERS ───────────────────────────────────────────────────
function getRoom(roomCode)      { return rooms[roomCode]; }

function getRoomPlayers(roomCode) {
  const room = rooms[roomCode];
  if (!room) return [];
  return Object.values(room.players).map(p => ({
    id: p.id, name: p.name, team: p.team,
    connected: p.connected, isLeader: p.isLeader,
  }));
}

// ── UTIL ──────────────────────────────────────────────────────
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms[code]);
  return code;
}

module.exports = {
  createRoom, joinRoom, joinAsSpectator,
  reconnectPlayer, disconnectPlayer, assignTeams,
  addChatMessage, getRoom, getRoomPlayers,
};
