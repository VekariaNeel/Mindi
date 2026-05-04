import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const socket = io(SERVER_URL, {
  autoConnect: false,
  // Reconnect up to 10 times with exponential backoff (1s → 5s)
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  // Connection timeout before giving up on a single attempt
  timeout: 20000,
  // Keep-alive: match server ping settings
  pingTimeout: 20000,
  pingInterval: 25000,
});

export default socket;
