# 🃏 Mindi — Online Multiplayer Card Game

## Project Structure
```
mindi/
├── server/          Node.js + Socket.io backend
└── client/          React + Vite frontend
```

---

## 🖥️ Run Locally

### 1. Start the Server
```bash
cd server
npm install
npm run dev        # runs on http://localhost:3001
```

### 2. Start the Client
```bash
cd client
npm install
npm run dev        # runs on http://localhost:5173
```

Open http://localhost:5173 in your browser.

---

## 🚀 Deploy Online

### Step 1 — Deploy Server on Railway

1. Go to https://railway.app and sign up (free)
2. Click "New Project" → "Deploy from GitHub"
3. Push your `server/` folder to a GitHub repo OR use Railway CLI:

```bash
cd server
npm install -g @railway/cli
railway login
railway init
railway up
```

4. Railway gives you a URL like: `https://mindi-server-production.railway.app`
5. Copy that URL

### Step 2 — Update Client ENV

Open `client/.env` and set:
```
VITE_SERVER_URL=https://your-server-url.railway.app
```

### Step 3 — Deploy Client on Vercel

```bash
cd client
npm install -g vercel
vercel
```

Follow prompts. Vercel gives you a URL like: `https://mindi-game.vercel.app`

---

## 🎮 How to Play

1. **Leader** opens the app → Create Room → sets player count
2. **Leader** copies the invite link and shares on WhatsApp
3. **Friends** click the link → enter their name → Join Room
4. **Leader** assigns players to Team A and Team B
5. **Leader** clicks Start Game
6. Each player sees only their own cards on their own device
7. Play in turn — must follow led suit — HUKUM card reveals trump!
8. Team with most 10s wins!

---

## 🔌 Socket Events Reference

| Event | Direction | Description |
|---|---|---|
| create_room | Client→Server | Create a new room |
| join_room | Client→Server | Join existing room |
| join_spectator | Client→Server | Watch as spectator |
| reconnect_player | Client→Server | Rejoin after disconnect |
| assign_teams | Client→Server | Leader assigns teams |
| start_game | Client→Server | Leader starts the game |
| play_card | Client→Server | Player plays a card |
| play_again | Client→Server | Leader restarts |
| end_game | Client→Server | Leader force-ends game |
| chat | Client→Server | Send chat message |
| room_created | Server→Client | Room created confirmation |
| room_joined | Server→Client | Join confirmation |
| lobby_state | Server→Client | Full lobby state |
| game_started | Server→Client | Game is starting |
| game_state | Server→Client | Current game state (per player) |
| game_event | Server→Client | Card played / trick won |
| game_paused | Server→Client | Player disconnected |
| game_over | Server→Client | Game ended with results |
| chat_message | Server→Client | Incoming chat message |
