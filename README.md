<div align="center">

# 🃏 Mindi

### The East African Card Game — Online Multiplayer

**Real-time · Any Device · No Download Needed**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![Vite](https://img.shields.io/badge/Vite-4-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)

</div>

---

## 📖 What is Mindi?

Mindi is a popular trick-taking card game widely played across East Africa and South Asia. Players are split into two teams and compete to collect as many **10s** as possible. A secret trump card — the **HUKUM** — adds a layer of surprise: its suit is hidden until a player can't follow the led suit, at which point it's dramatically revealed to all players.

---

## ✨ Features

- 🌐 **Real-time multiplayer** — play with friends on any device, anywhere
- 👥 **2–12 players** — supports any even number from 4 to 12
- 🏠 **Room system** — create a room, share a link, play instantly
- 🤝 **Team assignment** — leader manually assigns players to Team A & B
- 🂠 **HUKUM reveal** — secret trump card revealed with a full-screen animation
- 👁 **Spectator mode** — watch live games without playing
- 💬 **In-game chat** — talk to all players and spectators
- ⏸ **Disconnect handling** — game pauses and resumes when a player reconnects
- 🔄 **Play again** — same room, leader can rearrange teams between games
- 🏆 **Won pile display** — collected tricks shown per team with 10s face-up

---

## 🎮 How to Play

### Setup
1. **Leader** opens the app → **Create Room** → choose number of players (4, 6, 8...)
2. **Share the invite link** with friends via WhatsApp, Telegram, etc.
3. **Friends** click the link → enter their name → join the room
4. **Leader assigns teams** — drag players into Team A and Team B
5. **Leader clicks Start Game**

### Gameplay
- Each player sees **only their own cards** on their own device
- Players take turns in a fixed sequence: **A1 → B1 → A2 → B2 → ...**
- The **HUKUM holder** always leads the first trick
- Every player **must follow the led suit** if they can

### HUKUM (Trump) Rules
| Situation | What happens |
|---|---|
| Can't follow suit + HUKUM not revealed | HUKUM reveals! Must play HUKUM suit if you have it |
| Can't follow suit + HUKUM already revealed | Play any card freely |
| Has the led suit | Must follow suit — no exceptions |

### Card Priority
```
After HUKUM revealed:
  HUKUM suit  >  Led suit  >  All other suits
  (even 2 of HUKUM beats Ace of any other suit)

Before HUKUM revealed:
  Led suit wins  >  All other suits (lose automatically)
```

### Winning
- Each **10** collected = **1 point** for your team
- Game ends when all cards are played
- **Team with more 10s wins**
- **Tiebreaker:** team that won more tricks wins

---

## 🚀 Quick Start (Local)

### Prerequisites
- [Node.js 18+](https://nodejs.org)

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/mindi.git
cd mindi
```

### 2. Start the server
```bash
cd server
npm install
npm run dev
# ✅ Running on http://localhost:3001
```

### 3. Start the client
```bash
# In a new terminal
cd client
npm install
npm run dev
# ✅ Running on http://localhost:5173
```

### 4. Open and play
Open **http://localhost:5173** in your browser.
To test multiplayer locally, open **multiple browser tabs** — each tab acts as a different player.

---

## ☁️ Deploy Online (Free)

### Step 1 — Deploy Server on Railway

```bash
cd server
npm install -g @railway/cli
railway login
railway init
railway up
```

Railway gives you a URL like `https://mindi-server.railway.app` — copy it.

### Step 2 — Set client environment

Open `client/.env` and update:
```env
VITE_SERVER_URL=https://your-server-url.railway.app
```

### Step 3 — Deploy client on Vercel

```bash
cd client
npm install -g vercel
vercel
```

Vercel gives you a URL like `https://mindi-game.vercel.app` — share this with your friends!

---

## 🏗️ Project Structure

```
mindi/
├── server/
│   ├── index.js          # Express + Socket.io server, all event handlers
│   ├── gameEngine.js     # Complete Mindi game logic (deck, turns, scoring)
│   ├── roomManager.js    # Room lifecycle, players, tokens, reconnection
│   └── package.json
│
└── client/
    ├── src/
    │   ├── App.jsx           # Routing + reconnect logic
    │   ├── socket.js         # Socket.io singleton
    │   ├── index.css         # Global styles
    │   ├── pages/
    │   │   ├── Home.jsx      # Create / Join / Spectate
    │   │   ├── Lobby.jsx     # Team assignment + invite link
    │   │   ├── Game.jsx      # Live game: round table, hand, chat
    │   │   └── Results.jsx   # End screen + play again
    │   └── components/
    │       └── Card.jsx      # Reusable playing card component
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🔌 Socket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `create_room` | `{ name, playerLimit }` | Create a new room |
| `join_room` | `{ roomCode, name }` | Join an existing room |
| `join_spectator` | `{ roomCode, name }` | Watch as spectator |
| `reconnect_player` | `{ token }` | Rejoin after disconnect |
| `assign_teams` | `{ roomCode, teamA, teamB }` | Leader assigns teams |
| `start_game` | `{ roomCode }` | Leader starts the game |
| `play_card` | `{ roomCode, card }` | Play a card |
| `end_game` | `{ roomCode }` | Leader force-ends game |
| `play_again` | `{ roomCode }` | Leader restarts |
| `chat` | `{ roomCode, message }` | Send a chat message |

### Server → Client
| Event | Description |
|---|---|
| `room_created` | Room created, returns code + token |
| `room_joined` | Joined successfully, returns token |
| `lobby_state` | Full lobby state (players, teams, chat) |
| `game_started` | Game is beginning, player names map |
| `game_state` | Per-player game state (your hand only) |
| `game_event` | Card played / trick won event |
| `hukum_triggered` | HUKUM revealed — show overlay |
| `game_paused` | Player disconnected — game paused |
| `player_reconnected` | Player rejoined — game resumed |
| `game_over` | Game ended with final scores |
| `return_to_lobby` | Play again — back to lobby |
| `chat_message` | Incoming chat message |

---

## 🧪 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 4 |
| Styling | Pure CSS with CSS variables |
| Realtime | Socket.io 4.7 |
| Backend | Node.js, Express |
| Deployment | Vercel (client) + Railway (server) |

---

## 📜 Game Rules Summary

| Players | Decks | Cards / Player | Tens in Play |
|---|---|---|---|
| 4 | 1 | 13 | 4 |
| 6 | 1 | 8 | 4 |
| 8 | 2 | 13 | 8 |
| 10 | 2 | 10 | 8 |
| 12 | 3 | 13 | 12 |

> If cards can't be divided equally, lowest-ranked cards (2s first, then 3s...) are removed one at a time until divisible.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## 📄 License

MIT — do whatever you want with it. Have fun! 🃏
