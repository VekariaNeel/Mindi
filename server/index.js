const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const {
  createRoom, joinRoom, joinAsSpectator,
  reconnectPlayer, disconnectPlayer, assignTeams,
  addChatMessage, getRoom, getRoomPlayers,
} = require("./roomManager");

const {
  initGame, processPlay, getCurrentTurn,
  checkHukumTrigger, sanitizeForPlayer, sanitizeForSpectator,
} = require("./gameEngine");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ── HEALTH ────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true }));

// ── HELPERS ───────────────────────────────────────────────────
function broadcastGameState(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.game) return;

  // Each player gets their own sanitized state
  Object.values(room.players).forEach(p => {
    if (p.socketId) {
      io.to(p.socketId).emit("game_state", sanitizeForPlayer(room.game, p.id));
    }
  });

  // Spectators get no hand info
  Object.values(room.spectators).forEach(s => {
    io.to(s.socketId).emit("game_state", sanitizeForSpectator(room.game));
  });
}

function broadcastLobby(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit("lobby_state", {
    players: getRoomPlayers(roomCode),
    phase: room.phase,
    playerLimit: room.playerLimit,
    teamA: room.teamA,
    teamB: room.teamB,
    chat: room.chat,
  });
}

// ── SOCKET EVENTS ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // ── CREATE ROOM ──────────────────────────────────────────────
  socket.on("create_room", ({ name, playerLimit }) => {
    const n = parseInt(playerLimit);
    if (!name?.trim()) return socket.emit("error", "Enter your name");
    if (!n || n < 4 || n % 2 !== 0) return socket.emit("error", "Invalid player count");

    const result = createRoom(name.trim(), n);
    const room = getRoom(result.roomCode);
    room.players[result.playerId].socketId = socket.id;
    socket.join(result.roomCode);

    socket.emit("room_created", {
      roomCode: result.roomCode,
      playerId: result.playerId,
      token: result.token,
    });
    broadcastLobby(result.roomCode);
  });

  // ── JOIN ROOM ────────────────────────────────────────────────
  socket.on("join_room", ({ roomCode, name }) => {
    if (!name?.trim()) return socket.emit("error", "Enter your name");
    if (!roomCode?.trim()) return socket.emit("error", "Enter room code");

    const result = joinRoom(roomCode.trim().toUpperCase(), name.trim());
    if (result.error) return socket.emit("error", result.error);

    const room = getRoom(result.roomCode);
    room.players[result.playerId].socketId = socket.id;
    socket.join(result.roomCode);

    socket.emit("room_joined", {
      roomCode: result.roomCode,
      playerId: result.playerId,
      token: result.token,
    });
    broadcastLobby(result.roomCode);

    const msg = addChatMessage(result.roomCode, "System", `${name.trim()} joined the room.`);
    io.to(result.roomCode).emit("chat_message", msg);
  });

  // ── JOIN AS SPECTATOR ────────────────────────────────────────
  socket.on("join_spectator", ({ roomCode, name }) => {
    if (!roomCode?.trim()) return socket.emit("error", "Enter room code");

    const code = roomCode.trim().toUpperCase();
    const result = joinAsSpectator(code, socket.id, name || "Spectator");
    if (result.error) return socket.emit("error", result.error);

    socket.join(code);
    socket.emit("spectator_joined", { roomCode: code });

    // If game already in progress, send current state
    const room = getRoom(code);
    if (room?.game) {
      socket.emit("game_state", sanitizeForSpectator(room.game));
    }

    broadcastLobby(code);
    const msg = addChatMessage(code, "System", `${name || "A spectator"} is watching.`);
    io.to(code).emit("chat_message", msg);
  });

  // ── RECONNECT ────────────────────────────────────────────────
  socket.on("reconnect_player", ({ token }) => {
    if (!token) return socket.emit("error", "No token");

    const result = reconnectPlayer(token, socket.id);
    if (result.error) return socket.emit("error", result.error);

    const { roomCode, playerId, room } = result;
    socket.join(roomCode);
    socket.emit("reconnected", { roomCode, playerId });

    if (room.phase === "playing" && room.game) {
      socket.emit("game_state", sanitizeForPlayer(room.game, playerId));
      broadcastGameState(roomCode);
      io.to(roomCode).emit("player_reconnected", { playerName: result.player.name });
    } else {
      broadcastLobby(roomCode);
    }
  });

  // ── ASSIGN TEAMS ─────────────────────────────────────────────
  socket.on("assign_teams", ({ roomCode, teamA, teamB }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit("error", "Room not found");

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can assign teams");

    const result = assignTeams(roomCode, teamA, teamB);
    if (result.error) return socket.emit("error", result.error);

    broadcastLobby(roomCode);
  });

  // ── START GAME ───────────────────────────────────────────────
  socket.on("start_game", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit("error", "Room not found");

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can start");
    if (!room.teamA.length || !room.teamB.length) return socket.emit("error", "Assign teams first");
    if (room.teamA.length !== room.teamB.length) return socket.emit("error", "Teams must be equal size");
    const unassigned = Object.values(room.players).filter(p => !p.team);
    if (unassigned.length > 0) return socket.emit("error", `${unassigned.map(p=>p.name).join(", ")} not assigned to a team yet`);

    const connected = Object.values(room.players).filter(p => p.connected).length;
    if (connected < room.playerLimit) return socket.emit("error", `Waiting for all ${room.playerLimit} players`);

    // Build playerNames map
    const playerNames = Object.fromEntries(
      Object.values(room.players).map(p => [p.id, p.name])
    );

    room.game = initGame(room.teamA, room.teamB);
    room.phase = "playing";

    io.to(roomCode).emit("game_started", {
      playerNames,
      hukumHolderName: room.players[room.game.hukumHolderId]?.name,
      removedCards: room.game.removedCards,
    });

    broadcastGameState(roomCode);
  });

  // ── PLAY CARD ────────────────────────────────────────────────
  socket.on("play_card", ({ roomCode, card }) => {
    const room = getRoom(roomCode);
    if (!room?.game) return socket.emit("error", "No active game");
    if (room.phase === "paused") return socket.emit("error", "Game is paused");

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player) return socket.emit("error", "Player not found");

    const currentTurn = getCurrentTurn(room.game);
    if (currentTurn !== player.id) return socket.emit("error", "Not your turn");

    const result = processPlay(room.game, player.id, card, player.name);
    if (result.error) return socket.emit("error", result.error);

    // Build playerNames for event broadcast
    const playerNames = Object.fromEntries(
      Object.values(room.players).map(p => [p.id, p.name])
    );

    // Broadcast the card played event to ALL
    io.to(roomCode).emit("game_event", {
      ...room.game.lastEvent,
      playerNames,
    });

    // Game over
    if (room.game.phase === "game_over") {
      room.phase = "game_over";
      io.to(roomCode).emit("game_over", {
        winner: room.game.winner,
        tens: room.game.tens,
        tricks: room.game.tricks,
      });
      broadcastGameState(roomCode);
      return;
    }

    // Check if HUKUM should trigger for the NEXT player BEFORE they play
    const hukumTrigger = checkHukumTrigger(room.game);
    if (hukumTrigger) {
      // Broadcast hukum reveal to everyone immediately
      io.to(roomCode).emit("hukum_triggered", {
        ...hukumTrigger,
        playerName: room.players[hukumTrigger.nextPlayerId]?.name || "",
        playerNames,
      });
    }

    broadcastGameState(roomCode);
  });

  // ── END GAME (leader force ends) ─────────────────────────────
  socket.on("end_game", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit("error", "Room not found");

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can end game");

    room.phase = "game_over";
    io.to(roomCode).emit("game_over", {
      winner: null,
      tens: room.game?.tens || { A: 0, B: 0 },
      tricks: room.game?.tricks || { A: 0, B: 0 },
      forcedEnd: true,
      endedBy: player.name,
    });
  });

  // ── PLAY AGAIN ───────────────────────────────────────────────
  socket.on("play_again", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can restart");

    room.game = null;
    room.phase = "lobby";
    room.teamA = [];
    room.teamB = [];
    Object.values(room.players).forEach(p => { p.team = null; });

    io.to(roomCode).emit("return_to_lobby");
    broadcastLobby(roomCode);
  });

  // ── CHAT ─────────────────────────────────────────────────────
  socket.on("chat", ({ roomCode, message }) => {
    if (!message?.trim()) return;
    const room = getRoom(roomCode);
    if (!room) return;

    let senderName = "Spectator";
    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (player) senderName = player.name;
    else if (room.spectators[socket.id]) senderName = room.spectators[socket.id].name;

    const msg = addChatMessage(roomCode, senderName, message.trim().slice(0, 200));
    io.to(roomCode).emit("chat_message", msg);
  });

  // ── DISCONNECT ───────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("Disconnected:", socket.id);
    const result = disconnectPlayer(socket.id);
    if (!result) return;

    if (result.type === "spectator") {
      broadcastLobby(result.roomCode);
      return;
    }

    const { roomCode, playerName, room } = result;
    io.to(roomCode).emit("player_disconnected", { playerName });

    if (room.phase === "paused") {
      io.to(roomCode).emit("game_paused", {
        playerName,
        message: `Waiting for ${playerName} to reconnect...`,
      });
    }

    broadcastLobby(roomCode);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`✅ Mindi server running on port ${PORT}`));
