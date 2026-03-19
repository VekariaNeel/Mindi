import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

export function SocketProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  if (!socketRef.current) {
    socketRef.current = io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }

  useEffect(() => {
    const socket = socketRef.current;
    socket.on("connect", () => {
      setConnected(true);
      // Re-authenticate on reconnection (Socket.IO v4: 'connect' fires on reconnect too)
      const savedToken = localStorage.getItem("mindi_token");
      if (savedToken && socket.recovered === false) {
        socket.emit("auth", { token: savedToken });
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.connect();
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
