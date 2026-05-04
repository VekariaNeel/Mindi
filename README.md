<div align="center">

# 🃏 Mindi

### The Classic Indian Card Game — Online Multiplayer

**Real-time · Any Device · No Download Needed**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.7-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![Vite](https://img.shields.io/badge/Vite-4-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)

</div>

---

## 📖 What is Mindi?

Mindi (also known as **Mindi Coat**, **Mendhi**, or **Mendikot**) is a beloved trick-taking card game originating from **India**, widely played across Gujarat, Maharashtra, Rajasthan, and other parts of South Asia. It's a staple at family gatherings, festivals, and friendly hangouts.

Players split into two teams and compete to collect as many **10s** as possible. A secret trump card — the **HUKUM** — adds a thrilling layer of surprise: its suit stays hidden until a player can't follow the led suit, at which point the trump is dramatically revealed to everyone at the table.

This project brings the classic Mindi experience online — play with friends and family from anywhere, on any device.

---

## ✨ Features

- 🌐 **Real-time multiplayer** — play with friends on any device, anywhere
- 👥 **4–12 players** — supports any even number (4, 6, 8, 10, 12)
- 🔐 **Google Sign-In** — secure authentication via Firebase
- 🛡️ **Server-side token verification** — cryptographic JWT validation prevents spoofing
- 🏠 **Room system** — create a room, share an invite link, play instantly
- 🤝 **Team assignment** — leader manually assigns players to Team A & B
- 🂠 **HUKUM reveal** — secret trump card revealed with a full-screen animation
- 🤖 **Bot substitution** — disconnected players are replaced by bots automatically
- 👁 **Spectator mode** — watch live games without playing
- 💬 **In-game chat** — talk to all players and spectators during the game
- 🔄 **Play again** — same room, leader can rearrange teams between games
- 🏆 **Won pile display** — collected tricks shown per team with 10s highlighted
- 📱 **Responsive design** — works on desktop, tablet, and mobile

---

## 🎮 How to Play

### Setup
1. **Open the app** → Sign in with your **Google account**
2. **Create a Room** → Choose the number of players (4, 6, 8, 10, or 12)
3. **Share the invite link** with friends via WhatsApp, Telegram, etc.
4. **Friends** click the link → sign in → automatically join the room
5. **Leader assigns teams** → select players and assign to Team A or Team B
6. **Leader clicks Start Game** → cards are dealt and the game begins!

### Gameplay
- Each player sees **only their own cards** on their device
- Players take turns in a fixed sequence: **A1 → B1 → A2 → B2 → ...**
- The **HUKUM holder** always leads the first trick
- Every player **must follow the led suit** if they can

### HUKUM (Trump) Rules
| Situation | What Happens |
|---|---|
| Can't follow suit + HUKUM not yet revealed | 💥 HUKUM reveals! Must play HUKUM suit if you have it |
| Can't follow suit + HUKUM already revealed | Play any card freely |
| Has the led suit | Must follow suit — no exceptions |

### Card Priority
```
After HUKUM revealed:
  HUKUM suit  >  Led suit  >  All other suits
  (even 2♠ of HUKUM beats A♥ of any other suit!)

Before HUKUM revealed:
  Led suit wins  >  All other suits lose automatically
```

### Winning
- Each **10** collected = **1 point** for your team
- Game ends when all cards are played
- **Team with more 10s wins** 🏆
- **Tiebreaker:** team that won more tricks wins

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- [Node.js 18+](https://nodejs.org)
- A [Firebase project](https://console.firebase.google.com) with Google Sign-In enabled

### 1. Clone the repo
```bash
git clone https://github.com/VekariaNeel/Mindi.git
cd mindi
```

### 2. Configure environment

**Client** (`client/.env`):
```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"
VITE_FIREBASE_MEASUREMENT_ID="your-measurement-id"

VITE_SERVER_URL=http://localhost:3001
```

### 3. Start the server
```bash
cd server
npm install
npm run dev
# ✅ Running on http://localhost:3001
```

### 4. Start the client
```bash
# In a new terminal
cd client
npm install
npm run dev
# ✅ Running on http://localhost:5173
```

### 5. Open and play
Open **http://localhost:5173** in your browser.
To test multiplayer locally, open **multiple browser tabs** or use different browser profiles — each tab acts as a different player.

---

## ☁️ Deploy Online (Render)

### Step 1 — Deploy the Backend (Web Service)

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**
2. Connect your GitHub repo and set **Root Directory** to `server`
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
4. Add **Environment Variables**:
   ```
   CLIENT_URL=https://your-frontend.onrender.com
   FIREBASE_PROJECT_ID=your-firebase-project-id
   ```
5. Deploy — Render gives you a URL like `https://mindi-server.onrender.com`

### Step 2 — Deploy the Frontend (Static Site)

1. Go to Render Dashboard → **New** → **Static Site**
2. Connect your GitHub repo and set **Root Directory** to `client`
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Add **Environment Variables** (all your `VITE_*` keys):
   ```
   VITE_SERVER_URL=https://mindi-server.onrender.com
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   (... rest of Firebase config)
   ```
5. Deploy!

### Step 3 — Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → your project
2. **Authentication** → **Settings** → **Authorized domains**
3. Add your Render frontend URL (e.g., `your-app.onrender.com`)

Share your frontend URL with friends and start playing! 🎉

---

## 🏗️ Project Structure

```
mindi/
├── server/
│   ├── index.js          # Express + Socket.io server, auth, rate limiting
│   ├── gameEngine.js     # Complete Mindi game logic (deck, turns, scoring)
│   └── package.json
│
└── client/
    ├── src/
    │   ├── App.jsx           # Routing, auth state, reconnect logic
    │   ├── socket.js         # Socket.io singleton
    │   ├── firebase.js       # Firebase Auth initialization
    │   ├── index.css         # Global styles (pure CSS, dark theme)
    │   ├── pages/
    │   │   ├── Home.jsx      # Create / Join / Spectate + Google Sign-In
    │   │   ├── Lobby.jsx     # Team assignment, invite link, chat
    │   │   ├── Game.jsx      # Live game: round table, hand, chat
    │   │   └── Results.jsx   # End screen + play again
    │   └── components/
    │       └── Card.jsx      # Reusable playing card component
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## 🔐 Security

| Feature | Description |
|---|---|
| **Firebase ID Token Verification** | Server verifies every player's identity using Google's public RSA keys (JWT). No one can impersonate another player. |
| **Socket Rate Limiting** | Max 20 events/second per connection. Prevents spam and abuse. |
| **Session Storage** | Room data stored in `sessionStorage` — automatically cleared when the tab closes. |
| **Server-side Authority** | All game logic runs on the server. Clients cannot cheat by modifying their hand or turn. |

---

## 🔌 Socket Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `create_room` | `{ token, name, playerLimit }` | Create a new room (token = Firebase ID token) |
| `join_room` | `{ token, roomCode, name }` | Join an existing room |
| `join_spectator` | `{ token, roomCode, name }` | Watch as spectator |
| `reconnect_player` | `{ token, roomCode }` | Rejoin after disconnect |
| `assign_teams` | `{ roomCode, teamA, teamB }` | Leader assigns teams |
| `start_game` | `{ roomCode }` | Leader starts the game |
| `play_card` | `{ roomCode, card }` | Play a card on your turn |
| `leave_room` | `{ roomCode }` | Leave the room (identified by socket) |
| `end_game` | `{ roomCode }` | Leader force-ends game |
| `play_again` | `{ roomCode }` | Leader restarts the game |
| `end_room` | `{ roomCode }` | Leader dissolves the room |
| `kick_player` | `{ roomCode, targetId }` | Leader kicks a player |
| `chat` | `{ roomCode, message }` | Send a chat message |

### Server → Client
| Event | Description |
|---|---|
| `room_created` | Room created successfully, returns room code |
| `room_joined` | Joined room successfully |
| `spectator_joined` | Joined as spectator |
| `reconnected` | Reconnected to room after disconnect |
| `lobby_state` | Full lobby state (players, teams, chat) |
| `game_started` | Game beginning, includes player names map |
| `game_state` | Per-player game state (only your hand visible) |
| `game_event` | Card played / trick won notification |
| `hukum_triggered` | HUKUM revealed — triggers overlay animation |
| `game_over` | Game ended with final scores |
| `return_to_lobby` | Play again — back to lobby |
| `room_ended` | Room dissolved by leader |
| `player_reconnected` | A player reconnected |
| `chat_message` | Incoming chat message |

---

## 🧪 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 4 |
| Styling | Pure CSS with CSS variables (dark theme) |
| Authentication | Firebase Auth (Google Sign-In) |
| Token Verification | jsonwebtoken + jwks-rsa (server-side) |
| Realtime | Socket.io 4.7 |
| Backend | Node.js, Express |
| Deployment | Render (backend + frontend) |

---

## 📜 Game Rules Summary

| Players | Decks | Cards / Player | 10s in Play |
|---|---|---|---|
| 4 | 1 | 13 | 4 |
| 6 | 1 | 8 | 4 |
| 8 | 2 | 13 | 8 |
| 10 | 2 | 10 | 8 |
| 12 | 3 | 13 | 12 |

> If cards can't be divided equally, lowest-ranked cards (2s first, then 3s...) are removed one at a time until evenly divisible.

---

## 🤝 Contributing

Pull requests are welcome! For major changes, please open an issue first.

---

## 📄 License

MIT — do whatever you want with it. Have fun playing Mindi! 🃏

---

<div align="center">

**Made with ❤️ in India**

</div>
