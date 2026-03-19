const { v4: uuidv4 } = require("uuid");

const rooms = {}; // roomCode → room
const tokenToPlayer = {}; // token → { roomCode, playerId }

function generateCode() {
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

function createRoom(leaderName, playerLimit) {
  let code = generateCode();
  while (rooms[code]) code = generateCode();

  const leaderId = uuidv4();
  const leaderToken = uuidv4();

  const leader = {
    id: leaderId,
    name: leaderName,
    token: leaderToken,
    team: null,
    seat: null,
    socketId: null,
    connected: true,
    isLeader: true,
    isSpectator: false,
  };

  rooms[code] = {
    code,
    playerLimit,
    players: [leader],
    spectators: [],
    gameState: null,
    phase: "lobby", // lobby | playing | game_over
    chat: [],
  };

  tokenToPlayer[leaderToken] = { roomCode: code, playerId: leaderId };

  return { code, playerId: leaderId, token: leaderToken };
}

function joinRoom(roomCode, playerName) {
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };

  const activePlayers = room.players.filter(p => !p.isSpectator);
  if (activePlayers.length >= room.playerLimit && room.phase === "lobby")
    return { error: "Room is full" };

  const playerId = uuidv4();
  const token = uuidv4();

  const player = {
    id: playerId,
    name: playerName,
    token,
    team: null,
    seat: null,
    socketId: null,
    connected: true,
    isLeader: false,
    isSpectator: false,
  };

  room.players.push(player);
  tokenToPlayer[token] = { roomCode, playerId };

  return { code: roomCode, playerId, token };
}

function joinAsSpectator(roomCode, spectatorName) {
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };

  const spectatorId = uuidv4();
  const token = uuidv4();

  const spectator = {
    id: spectatorId,
    name: spectatorName || "Spectator",
    token,
    socketId: null,
    connected: true,
    isSpectator: true,
  };

  room.spectators.push(spectator);
  tokenToPlayer[token] = { roomCode, playerId: spectatorId, isSpectator: true };

  return { code: roomCode, spectatorId, token };
}

function reconnect(token, socketId) {
  const ref = tokenToPlayer[token];
  if (!ref) return { error: "Invalid token" };

  const room = rooms[ref.roomCode];
  if (!room) return { error: "Room no longer exists" };

  if (ref.isSpectator) {
    const spec = room.spectators.find(s => s.id === ref.playerId);
    if (spec) {
      spec.socketId = socketId;
      spec.connected = true;
    }
    return { room, isSpectator: true, playerId: ref.playerId };
  }

  const player = room.players.find(p => p.id === ref.playerId);
  if (!player) return { error: "Player not found" };

  player.socketId = socketId;
  player.connected = true;

  // Resume game if paused for this player
  if (room.gameState && room.gameState.paused && room.gameState.pausedFor === ref.playerId) {
    room.gameState.paused = false;
    room.gameState.pausedFor = null;
  }

  // Check if all players reconnected
  const allConnected = room.players.every(p => p.connected);
  if (room.gameState && room.gameState.paused && allConnected) {
    room.gameState.paused = false;
    room.gameState.pausedFor = null;
  }

  return { room, player, isSpectator: false };
}

function nameReconnect(roomCode, playerName, socketId) {
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };

  const player = room.players.find(p => p.name === playerName && !p.connected);
  if (!player) return { error: "No disconnected player with that name" };

  player.socketId = socketId;
  player.connected = true;

  if (room.gameState && room.gameState.paused && room.gameState.pausedFor === player.id) {
    room.gameState.paused = false;
    room.gameState.pausedFor = null;
  }

  return { room, player, token: player.token };
}

function assignTeams(roomCode, assignments) {
  // assignments: [{ playerId, team, seat }]
  const room = rooms[roomCode];
  if (!room) return { error: "Room not found" };
  assignments.forEach(a => {
    const p = room.players.find(p => p.id === a.playerId);
    if (p) { p.team = a.team; p.seat = a.seat; }
  });
  return { success: true };
}

function setPlayerSocket(token, socketId) {
  const ref = tokenToPlayer[token];
  if (!ref) return null;
  const room = rooms[ref.roomCode];
  if (!room) return null;

  if (ref.isSpectator) {
    const spec = room.spectators.find(s => s.id === ref.playerId);
    if (spec) spec.socketId = socketId;
    return { room, isSpectator: true, playerId: ref.playerId };
  }

  const player = room.players.find(p => p.id === ref.playerId);
  if (player) player.socketId = socketId;
  return { room, player, isSpectator: false };
}

function disconnectPlayer(socketId) {
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    const player = room.players.find(p => p.socketId === socketId);
    if (player) {
      player.connected = false;
      // Pause game if playing
      if (room.gameState && room.gameState.phase === "playing") {
        room.gameState.paused = true;
        room.gameState.pausedFor = player.id;
      }
      return { room, player };
    }
    const spec = room.spectators.find(s => s.socketId === socketId);
    if (spec) {
      spec.connected = false;
      return { room, isSpectator: true, spectator: spec };
    }
  }
  return null;
}

function getRoom(roomCode) {
  return rooms[roomCode] || null;
}

function getRoomByToken(token) {
  const ref = tokenToPlayer[token];
  if (!ref) return null;
  return rooms[ref.roomCode] || null;
}

function addChatMessage(roomCode, senderId, senderName, message) {
  const room = rooms[roomCode];
  if (!room) return;
  const msg = { id: uuidv4(), senderId, senderName, message, time: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat = room.chat.slice(-100);
  return msg;
}

function publicRoom(room) {
  return {
    code: room.code,
    playerLimit: room.playerLimit,
    phase: room.phase,
    players: room.players.map(p => ({
      id: p.id, name: p.name, team: p.team, seat: p.seat,
      connected: p.connected, isLeader: p.isLeader, isSpectator: p.isSpectator,
    })),
    spectators: room.spectators.map(s => ({ id: s.id, name: s.name, connected: s.connected })),
    chat: room.chat,
  };
}

function destroyRoom(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  // Clean up all player tokens
  room.players.forEach(p => { delete tokenToPlayer[p.token]; });
  room.spectators.forEach(s => { delete tokenToPlayer[s.token]; });
  delete rooms[roomCode];
}

function getRefByToken(token) {
  return tokenToPlayer[token] || null;
}

module.exports = {
  createRoom, joinRoom, joinAsSpectator, reconnect, nameReconnect,
  assignTeams, setPlayerSocket, disconnectPlayer, getRoom, getRoomByToken,
  addChatMessage, publicRoom, destroyRoom, getRefByToken,
};
