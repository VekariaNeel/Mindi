const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const rm = require("./roomManager");
const { initGame, playCard, getCurrentTurnId, getLegalCards } = require("./gameEngine");

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ─── REST ─────────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/room/create", (req, res) => {
  const { name, playerLimit } = req.body;
  if (!name || !playerLimit) return res.status(400).json({ error: "Missing fields" });
  const n = parseInt(playerLimit);
  if (isNaN(n) || n < 4 || n % 2 !== 0) return res.status(400).json({ error: "Invalid player limit" });
  const result = rm.createRoom(name, n);
  res.json(result);
});

app.post("/room/join", (req, res) => {
  const { roomCode, name } = req.body;
  if (!roomCode || !name) return res.status(400).json({ error: "Missing fields" });
  const result = rm.joinRoom(roomCode.toUpperCase(), name);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post("/room/spectate", (req, res) => {
  const { roomCode, name } = req.body;
  if (!roomCode) return res.status(400).json({ error: "Missing room code" });
  const result = rm.joinAsSpectator(roomCode.toUpperCase(), name);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

app.post("/room/name-reconnect", (req, res) => {
  const { roomCode, name } = req.body;
  const result = rm.nameReconnect(roomCode.toUpperCase(), name, null);
  if (result.error) return res.status(400).json(result);
  res.json({ token: result.token, playerId: result.player.id });
});

app.get("/room/:code", (req, res) => {
  const room = rm.getRoom(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json(rm.publicRoom(room));
});

// ─── SOCKET ───────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ── Room Creation / Joining (socket-based) ────────────────────────────────
  socket.on("create_room", ({ name, playerLimit }) => {
    if (!name || !playerLimit) return socket.emit("error", "Missing fields");
    const n = parseInt(playerLimit);
    if (isNaN(n) || n < 4 || n % 2 !== 0) return socket.emit("error", "Invalid player limit");
    const result = rm.createRoom(name, n);
    // Bind socket to the new player
    rm.setPlayerSocket(result.token, socket.id);
    socket.join(result.code);
    socket.emit("room_created", result);
    io.to(result.code).emit("room_update", rm.publicRoom(rm.getRoom(result.code)));
  });

  socket.on("join_room", ({ roomCode, name }) => {
    if (!roomCode || !name) return socket.emit("error", "Missing fields");
    const result = rm.joinRoom(roomCode.toUpperCase(), name);
    if (result.error) return socket.emit("error", result.error);
    rm.setPlayerSocket(result.token, socket.id);
    socket.join(result.code);
    socket.emit("room_joined", result);
    io.to(result.code).emit("room_update", rm.publicRoom(rm.getRoom(result.code)));
  });

  socket.on("join_spectator", ({ roomCode, name }) => {
    if (!roomCode) return socket.emit("error", "Missing room code");
    const result = rm.joinAsSpectator(roomCode.toUpperCase(), name);
    if (result.error) return socket.emit("error", result.error);
    rm.setPlayerSocket(result.token, socket.id);
    socket.join(result.code);
    socket.emit("spectator_joined", result);
    io.to(result.code).emit("room_update", rm.publicRoom(rm.getRoom(result.code)));
  });

  // ── Auth / Reconnect ──────────────────────────────────────────────────────
  socket.on("auth", ({ token }) => {
    const ref = rm.setPlayerSocket(token, socket.id);
    if (!ref) return socket.emit("auth_failed", "Invalid token");

    const { room, isSpectator, player } = ref;
    socket.join(room.code);

    // Resume game if it was paused for this player
    if (!isSpectator && room.gameState && room.gameState.paused) {
      if (room.gameState.pausedFor === player.id || room.players.every(p => p.connected)) {
        room.gameState.paused = false;
        room.gameState.pausedFor = null;
      }
    }

    if (isSpectator) {
      socket.emit("authed", {
        isSpectator: true,
        roomCode: room.code,
        phase: room.phase,
      });
    } else {
      socket.emit("authed", {
        isSpectator: false,
        playerId: player.id,
        roomCode: room.code,
        isLeader: player.isLeader,
        playerName: player.name,
        phase: room.phase, // lobby | playing | game_over
      });
    }

    // Send current room state
    io.to(room.code).emit("room_update", rm.publicRoom(room));

    // If game is active, send game state
    if (room.gameState && room.gameState.phase === "playing" && !room.gameState.paused) {
      io.to(room.code).emit("game_resumed");
      emitGameState(room, io);
    }
  });

  // ── Lobby ─────────────────────────────────────────────────────────────────
  socket.on("assign_teams", ({ token, assignments }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const leader = roomRef.players.find(p => p.token === token && p.isLeader);
    if (!leader) return socket.emit("error", "Not the leader");
    rm.assignTeams(roomRef.code, assignments);
    const room = rm.getRoom(roomRef.code);
    io.to(room.code).emit("room_update", rm.publicRoom(room));
  });

  socket.on("start_game", ({ token }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const room = rm.getRoom(roomRef.code);
    const leader = room.players.find(p => p.token === token && p.isLeader);
    if (!leader) return socket.emit("error", "Not the leader");

    const activePlayers = room.players.filter(p => !p.isSpectator);
    if (activePlayers.length !== room.playerLimit)
      return socket.emit("error", "Not enough players");

    const unassigned = activePlayers.filter(p => !p.team);
    if (unassigned.length > 0)
      return socket.emit("error", "All players must be assigned to a team");

    const teamA = activePlayers.filter(p => p.team === "A");
    const teamB = activePlayers.filter(p => p.team === "B");
    if (teamA.length !== teamB.length)
      return socket.emit("error", "Teams must be equal size");

    room.gameState = initGame(activePlayers);
    room.phase = "playing";
    io.to(room.code).emit("game_started", { removedCards: room.gameState.removedCards });
    emitGameState(room, io);
  });

  // ── Game ──────────────────────────────────────────────────────────────────
  socket.on("play_card", ({ token, card }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return socket.emit("error", "Invalid token");
    const room = rm.getRoom(roomRef.code);
    if (!room || !room.gameState) return;
    if (room.gameState.paused) return socket.emit("error", "Game is paused");
    if (room.gameState.phase !== "playing") return;

    const player = room.players.find(p => p.token === token);
    if (!player) return;

    const result = playCard(room.gameState, player.id, card, room.players);
    if (result.error) return socket.emit("error", result.error);

    room.gameState = result.state;

    // Broadcast last action to all
    io.to(room.code).emit("action", room.gameState.lastAction);

    if (room.gameState.phase === "game_over") {
      room.phase = "game_over";
      io.to(room.code).emit("game_over", {
        winner: room.gameState.winner,
        tensTaken: room.gameState.tensTaken,
        tricksTaken: room.gameState.tricksTaken,
      });
    }

    emitGameState(room, io);
  });

  socket.on("end_game_force", ({ token }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const room = rm.getRoom(roomRef.code);
    const leader = room.players.find(p => p.token === token && p.isLeader);
    if (!leader) return;
    room.phase = "lobby";
    room.gameState = null;
    room.players.forEach(p => { p.team = null; p.seat = null; });
    io.to(room.code).emit("game_ended_by_leader");
    io.to(room.code).emit("room_update", rm.publicRoom(room));
  });

  socket.on("play_again", ({ token }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const room = rm.getRoom(roomRef.code);
    const leader = room.players.find(p => p.token === token && p.isLeader);
    if (!leader) return;
    room.phase = "lobby";
    room.gameState = null;
    io.to(room.code).emit("back_to_lobby");
    io.to(room.code).emit("room_update", rm.publicRoom(room));
  });

  // ── End Room (destroy) ─────────────────────────────────────────────────────
  socket.on("end_room", ({ token }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const room = rm.getRoom(roomRef.code);
    if (!room) return;
    const leader = room.players.find(p => p.token === token && p.isLeader);
    if (!leader) return socket.emit("error", "Not the leader");
    io.to(room.code).emit("room_ended");
    // Make all sockets leave the room
    io.in(room.code).socketsLeave(room.code);
    rm.destroyRoom(room.code);
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on("chat", ({ token, message }) => {
    const roomRef = rm.getRoomByToken(token);
    if (!roomRef) return;
    const room = rm.getRoom(roomRef.code);

    let sender = room.players.find(p => p.token === token);
    let senderName = sender ? sender.name : "Spectator";
    let senderId = sender ? sender.id : token;

    if (!sender) {
      const spec = room.spectators.find(s => s.token === token);
      if (spec) { senderName = spec.name; senderId = spec.id; }
    }

    const msg = rm.addChatMessage(room.code, senderId, senderName, message.slice(0, 200));
    io.to(room.code).emit("chat_message", msg);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const result = rm.disconnectPlayer(socket.id);
    if (!result) return;
    const { room, player, isSpectator, spectator } = result;

    if (isSpectator) {
      io.to(room.code).emit("room_update", rm.publicRoom(room));
      return;
    }

    io.to(room.code).emit("player_disconnected", { playerId: player.id, name: player.name });
    io.to(room.code).emit("room_update", rm.publicRoom(room));

    if (room.gameState && room.gameState.paused) {
      io.to(room.code).emit("game_paused", { playerId: player.id, name: player.name });
    }
  });
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function emitGameState(room, io) {
  const gs = room.gameState;
  if (!gs) return;

  const currentTurnId = getCurrentTurnId(gs);

  // Emit personalized state to each player
  room.players.forEach(player => {
    if (player.isSpectator) return;
    const sock = io.sockets.sockets.get(player.socketId);
    if (!sock) return;

    const myHand = gs.hands[player.id] || [];
    const myLegal = getLegalCards(gs, player.id);

    sock.emit("game_state", {
      phase: gs.phase,
      paused: gs.paused,
      pausedFor: gs.pausedFor,
      sequence: gs.sequence,
      hukumRevealed: gs.hukumRevealed,
      hukumSuit: gs.hukumSuit,
      hukumHolderId: gs.hukumHolderId,
      isHukumHolder: gs.hukumHolderId === player.id,
      currentTurnId,
      isMyTurn: currentTurnId === player.id,
      currentTrick: gs.currentTrick,
      tricksTaken: gs.tricksTaken,
      tensTaken: gs.tensTaken,
      myHand,
      myLegalCardIds: myLegal.map(c => c.id),
      removedCards: gs.removedCards,
      handSizes: Object.fromEntries(
        Object.entries(gs.hands).map(([pid, h]) => [pid, h.length])
      ),
    });  // NOTE: hukumCard intentionally NOT sent — holder sees neutral badge only
  });

  // Spectators get full public state (no hands)
  const spectatorState = {
    phase: gs.phase,
    paused: gs.paused,
    hukumRevealed: gs.hukumRevealed,
    hukumSuit: gs.hukumSuit,
    currentTurnId,
    currentTrick: gs.currentTrick,
    tricksTaken: gs.tricksTaken,
    tensTaken: gs.tensTaken,
    handSizes: Object.fromEntries(
      Object.entries(gs.hands).map(([pid, h]) => [pid, h.length])
    ),
  };

  room.spectators.forEach(spec => {
    const sock = io.sockets.sockets.get(spec.socketId);
    if (sock) sock.emit("game_state", { ...spectatorState, isSpectator: true });
  });
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Mindi server running on port ${PORT}`));
