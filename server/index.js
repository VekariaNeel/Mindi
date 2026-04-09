require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const {
  initGame, processPlay, getCurrentTurn, getLegalCards,
  checkHukumTrigger, sanitizeForPlayer, sanitizeForSpectator,
} = require("./gameEngine");

const app = express();
const origin = process.env.CLIENT_URL || "*";
app.use(cors({ origin }));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin, methods: ["GET", "POST"] },
});

// ── STATE ─────────────────────────────────────────────────────
const rooms = {};

// ── HEALTH ────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ ok: true }));

// ── HELPERS ───────────────────────────────────────────────────
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length:5}, () => chars[Math.floor(Math.random()*chars.length)]).join(""); }
  while (rooms[code]);
  return code;
}

function getRoom(roomCode) { return rooms[roomCode]; }

function getRoomPlayers(roomCode) {
  const room = rooms[roomCode];
  if (!room) return [];
  return Object.values(room.players).map(p => ({
    id: p.id, name: p.name, team: p.team,
    connected: p.connected, isLeader: p.isLeader, isBot: p.isBot
  }));
}

function addChatMessage(roomCode, senderName, message, isSpectator = false) {
  const room = rooms[roomCode];
  if (!room) return null;
  const msg = { senderName, message, isSpectator, time: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  return msg;
}

function broadcastGameState(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.game) return;

  Object.values(room.players).forEach(p => {
    if (p.socketId) {
      io.to(p.socketId).emit("game_state", sanitizeForPlayer(room.game, p.id));
    }
  });

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

function playBotTurn(roomCode) {
  const room = getRoom(roomCode);
  if (!room || !room.game || room.phase !== "playing") return;

  const currentTurn = getCurrentTurn(room.game);
  const player = room.players[currentTurn];
  if (!player || !player.isBot) return;

  // Small delay to make it feel human
  setTimeout(() => {
    const freshRoom = getRoom(roomCode);
    if (!freshRoom || !freshRoom.game || freshRoom.phase !== "playing") return;
    if (getCurrentTurn(freshRoom.game) !== currentTurn) return; // turn changed

    const hand = freshRoom.game.hands[currentTurn] || [];
    if (hand.length === 0) return;

    const legalCards = getLegalCards(hand, freshRoom.game.currentTrick, freshRoom.game.hukumRevealed, freshRoom.game.hukumCard, freshRoom.game.hukumJustRevealed);
    const cardToPlay = legalCards.length > 0 ? legalCards[Math.floor(Math.random() * legalCards.length)] : hand[0];

    const result = processPlay(freshRoom.game, currentTurn, cardToPlay, player.name);
    if (!result || result.error) return; // Should rarely happen unless bug

    const playerNames = Object.fromEntries(
      Object.values(freshRoom.players).map(p => [p.id, p.name])
    );

    io.to(roomCode).emit("game_event", {
      ...freshRoom.game.lastEvent,
      playerNames,
    });

    if (freshRoom.game.phase === "game_over") {
      freshRoom.phase = "game_over";
      io.to(roomCode).emit("game_over", {
        winner: freshRoom.game.winner,
        tens: freshRoom.game.tens,
        tricks: freshRoom.game.tricks,
      });
      broadcastGameState(roomCode);
      return;
    }

    const hukumTrigger = checkHukumTrigger(freshRoom.game);
    if (hukumTrigger) {
      io.to(roomCode).emit("hukum_triggered", {
        ...hukumTrigger,
        playerName: freshRoom.players[hukumTrigger.nextPlayerId]?.name || "",
        playerNames,
      });
    }

    broadcastGameState(roomCode);

    // If next player is ALSO a bot, cascade it
    playBotTurn(roomCode);

  }, 1000);
}

// ── SOCKET EVENTS ─────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // ── CREATE ROOM ──────────────────────────────────────────────
  socket.on("create_room", ({ uid, name, playerLimit }) => {
    const n = parseInt(playerLimit);
    if (!name?.trim()) return socket.emit("error", "Enter your name");
    if (!uid) return socket.emit("error", "Not authenticated");
    if (!n || n < 4 || n % 2 !== 0) return socket.emit("error", "Invalid player count");

    const roomCode = generateCode();
    rooms[roomCode] = {
      code: roomCode,
      phase: "lobby",
      playerLimit: n,
      leaderId: uid,
      players: {
        [uid]: {
          id: uid, name: name.trim(),
          socketId: socket.id,
          team: null, connected: true, isLeader: true, isBot: false,
        }
      },
      spectators: {},
      teamA: [], teamB: [],
      game: null,
      chat: [],
      pausedBy: null,
    };

    socket.join(roomCode);
    socket.emit("room_created", { roomCode, playerId: uid });
    broadcastLobby(roomCode);
  });

  // ── JOIN ROOM ────────────────────────────────────────────────
  socket.on("join_room", ({ uid, roomCode, name }) => {
    if (!name?.trim()) return socket.emit("error", "Enter your name");
    if (!roomCode?.trim()) return socket.emit("error", "Enter room code");
    if (!uid) return socket.emit("error", "Not authenticated");

    const code = roomCode.trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit("error", "Room not found");
    
    if (room.players[uid]) {
      // Reconnet
      room.players[uid].socketId = socket.id;
      room.players[uid].connected = true;
      room.players[uid].name = name.trim(); // Update name just in case
      if (room.phase === "playing" && room.players[uid].isBot) {
         room.players[uid].isBot = false;
         io.to(code).emit("chat_message", addChatMessage(code, "System", `${name.trim()} returned and took control from the bot.`));
      }
    } else {
      if (room.phase !== "lobby") return socket.emit("error", "Game already started");
      if (Object.keys(room.players).length >= room.playerLimit) return socket.emit("error", "Room is full");
      
      room.players[uid] = {
        id: uid, name: name.trim(),
        socketId: socket.id,
        team: null, connected: true, isLeader: false, isBot: false,
      };
      const msg = addChatMessage(code, "System", `${name.trim()} joined the room.`);
      io.to(code).emit("chat_message", msg);
    }

    socket.join(code);
    socket.emit("room_joined", { roomCode: code, playerId: uid, isLeader: room.players[uid].isLeader });
    broadcastLobby(code);
    
    if (room.phase === "playing" && room.game) {
      socket.emit("game_state", sanitizeForPlayer(room.game, uid));
      broadcastGameState(code);
    }
  });

  // ── JOIN AS SPECTATOR ────────────────────────────────────────
  socket.on("join_spectator", ({ roomCode, name }) => {
    if (!roomCode?.trim()) return socket.emit("error", "Enter room code");

    const code = roomCode.trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit("error", "Room not found");

    room.spectators[socket.id] = { name: name || "Spectator", socketId: socket.id };

    socket.join(code);
    socket.emit("spectator_joined", { roomCode: code });

    if (room.game) {
      socket.emit("game_state", sanitizeForSpectator(room.game));
    }

    broadcastLobby(code);
    const msg = addChatMessage(code, "System", `${name || "A spectator"} is watching.`);
    io.to(code).emit("chat_message", msg);
  });

  // ── RECONNECT ────────────────────────────────────────────────
  socket.on("reconnect_player", ({ uid, roomCode }) => {
    if (!uid || !roomCode) return socket.emit("error", "Missing uid or room");

    const code = roomCode.trim().toUpperCase();
    const room = rooms[code];
    if (!room) return socket.emit("error", "Room not found");

    const player = room.players[uid];
    if (!player) return socket.emit("error", "Player not found");

    player.socketId  = socket.id;
    player.connected = true;

    if (player.isBot) {
        player.isBot = false;
        io.to(code).emit("chat_message", addChatMessage(code, "System", `${player.name} returned and took control from the bot.`));
    }

    // Auto-resume if paused (though we use bots now, we might leave paused logic for backwards compatibility if needed, but we can clear it)
    if (room.phase === "paused" && room.pausedBy === uid) {
      room.phase = "playing";
      room.pausedBy = null;
    }

    socket.join(code);
    socket.emit("reconnected", { roomCode: code, playerId: uid, isLeader: player.isLeader, phase: room.phase });

    if (room.phase === "playing" && room.game) {
      socket.emit("game_state", sanitizeForPlayer(room.game, uid));
      broadcastGameState(code);
      io.to(code).emit("player_reconnected", { playerName: player.name });
    } else {
      broadcastLobby(code);
    }
  });

  // ── KICK PLAYER ──────────────────────────────────────────────
  socket.on("kick_player", ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can kick");

    const target = room.players[targetId];
    if (!target) return;

    if (target.socketId) io.to(target.socketId).emit("room_ended", { message: "You were kicked by the host." });
    delete room.players[targetId];

    // Re-assign teams array
    room.teamA = room.teamA.filter(id => id !== targetId);
    room.teamB = room.teamB.filter(id => id !== targetId);

    addChatMessage(roomCode, "System", `${target.name} was kicked from the room.`);
    broadcastLobby(roomCode);
  });

  // ── LEAVE ROOM ───────────────────────────────────────────────
  socket.on("leave_room", ({ roomCode, uid }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players[uid];
    if (!player) return;

    socket.leave(roomCode);
    
    if (room.phase === "lobby") {
        delete room.players[uid];
        room.teamA = room.teamA.filter(id => id !== uid);
        room.teamB = room.teamB.filter(id => id !== uid);
        addChatMessage(roomCode, "System", `${player.name} left the room.`);
        broadcastLobby(roomCode);
    } else {
        // Mid-game leave -> Bot
        player.isBot = true;
        player.socketId = null;
        player.connected = false;
        addChatMessage(roomCode, "System", `${player.name} left. A Bot will play for them.`);
        broadcastGameState(roomCode);
        broadcastLobby(roomCode);
        playBotTurn(roomCode);
    }
  });

  // ── ASSIGN TEAMS ─────────────────────────────────────────────
  socket.on("assign_teams", ({ roomCode, teamA, teamB }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit("error", "Room not found");

    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can assign teams");

    room.teamA = teamA;
    room.teamB = teamB;

    Object.keys(room.players).forEach(pid => {
      if (teamA.includes(pid))      room.players[pid].team = "A";
      else if (teamB.includes(pid)) room.players[pid].team = "B";
      else                          room.players[pid].team = null;
    });

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
    
    // Check if the first player happens to be a bot (rare but possible if start_game fired right as someone left)
    playBotTurn(roomCode);
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
    if (player.isBot) return socket.emit("error", "You are marked as a bot, please wait or rejoin.");

    const result = processPlay(room.game, player.id, card, player.name);
    if (result?.error) return socket.emit("error", result.error);

    const playerNames = Object.fromEntries(
      Object.values(room.players).map(p => [p.id, p.name])
    );

    io.to(roomCode).emit("game_event", {
      ...room.game.lastEvent,
      playerNames,
    });

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

    const hukumTrigger = checkHukumTrigger(room.game);
    if (hukumTrigger) {
      io.to(roomCode).emit("hukum_triggered", {
        ...hukumTrigger,
        playerName: room.players[hukumTrigger.nextPlayerId]?.name || "",
        playerNames,
      });
    }

    broadcastGameState(roomCode);

    // After human plays, check if next is a bot
    playBotTurn(roomCode);
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
    Object.values(room.players).forEach(p => { 
        p.team = null; 
        if (p.isBot) p.isBot = false; // bots become humans waiting on reconnect, or stay disconnected
    });

    io.to(roomCode).emit("return_to_lobby");
    broadcastLobby(roomCode);
  });

  // ── END ROOM (leader dissolves the room entirely) ────────────
  socket.on("end_room", ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room) return;
    const player = Object.values(room.players).find(p => p.socketId === socket.id);
    if (!player?.isLeader) return socket.emit("error", "Only leader can end room");
    io.to(roomCode).emit("room_ended", { message: "The leader has ended the room." });
    delete rooms[roomCode];
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
    for (const room of Object.values(rooms)) {
      if (room.spectators[socket.id]) {
        delete room.spectators[socket.id];
        broadcastLobby(room.code);
        return;
      }
      for (const player of Object.values(room.players)) {
        if (player.socketId === socket.id) {
          player.connected = false;
          player.socketId  = null;
          
          if (room.phase === "playing") {
             player.isBot = true; // mid-game disconnects convert to bots immediately
             addChatMessage(room.code, "System", `${player.name} disconnected. A Bot is filling in.`);
             broadcastGameState(room.code);
             playBotTurn(room.code);
          } else {
             io.to(room.code).emit("player_disconnected", { playerName: player.name });
          }
          broadcastLobby(room.code);
          return;
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`✅ Mindi server running on port ${PORT}`));
