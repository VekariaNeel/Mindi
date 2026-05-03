import { useState, useEffect } from "react";
import socket from "./socket";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";
import { auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import "./index.css";

export default function App() {
  const [page, setPage] = useState("home");
  const [session, setSession] = useState(null);
  const [gameStartData, setGameStartData] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoaded(true);
    });
    return unsub;
  }, []);

  // Reconnect on reload — only fires when auth is ready and there's a saved room
  useEffect(() => {
    if (!authLoaded || !user) return;
    const mindiRoom = sessionStorage.getItem("mindi_room");
    if (!mindiRoom) return;

    const onReconnected = (data) => {
      const isLeader = sessionStorage.getItem("mindi_leader") === "true";
      setSession({ ...data, name: user.displayName, isLeader, role: "player" });
      // Navigate to correct page based on server-reported phase
      setPage(data.phase === "playing" ? "game" : "lobby");
    };

    const onReconnectError = (err) => {
      // Only clear stored room on definitive session errors
      if (err === "Room not found" || err === "Player not found") {
        sessionStorage.removeItem("mindi_room");
      }
    };

    socket.once("reconnected", onReconnected);
    socket.once("error", onReconnectError);

    // FIX: wait for the socket to actually be open before emitting
    const doEmit = async () => {
      const token = await user.getIdToken();
      socket.emit("reconnect_player", { token, roomCode: mindiRoom });
    };
    if (socket.connected) {
      doEmit();
    } else {
      socket.once("connect", doEmit);
      socket.connect();
    }

    return () => {
      socket.off("reconnected", onReconnected);
      socket.off("error", onReconnectError);
      socket.off("connect", doEmit);
    };
  }, [authLoaded, user]);

  // Global socket event listeners
  useEffect(() => {
    const onReturnToLobby = () => {
      setGameResult(null);
      setGameStartData(null);
      setPage("lobby");
    };

    // Room ended by leader OR the player was kicked — go to home
    const onRoomEnded = () => {
      sessionStorage.removeItem("mindi_room");
      sessionStorage.removeItem("mindi_leader");
      socket.disconnect();
      setSession(null);
      setGameStartData(null);
      setGameResult(null);
      setPage("home");
    };

    socket.on("return_to_lobby", onReturnToLobby);
    socket.on("room_ended", onRoomEnded);

    return () => {
      socket.off("return_to_lobby", onReturnToLobby);
      socket.off("room_ended", onRoomEnded);
    };
  }, []);

  const handleJoined = (data) => {
    setSession(data);
    sessionStorage.setItem("mindi_room", data.roomCode);
    sessionStorage.setItem("mindi_leader", String(data.isLeader));
    setPage("lobby");
  };

  const handleGameStart = (data) => {
    setGameStartData(data);
    setPage("game");
  };

  const handleGameOver = (result) => {
    setGameResult(result);
    setPage("results");
  };

  const handlePlayAgain = () => {
    socket.emit("play_again", { roomCode: session.roomCode });
  };

  const handleGoHome = () => {
    sessionStorage.removeItem("mindi_room");
    sessionStorage.removeItem("mindi_leader");
    socket.disconnect();
    setSession(null);
    setGameStartData(null);
    setGameResult(null);
    setPage("home");
  };

  if (!authLoaded) return <div className="home-page"><div className="home-card">Loading...</div></div>;

  if (page === "home")    return <Home user={user} onJoined={handleJoined} />;
  if (page === "lobby")   return <Lobby session={session} onGameStart={handleGameStart} onGoHome={handleGoHome} />;
  if (page === "game")    return <Game session={session} playerNames={gameStartData?.playerNames || {}} onGameOver={handleGameOver} onGoHome={handleGoHome} />;
  if (page === "results") return <Results result={gameResult} session={session} onPlayAgain={handlePlayAgain} onGoHome={handleGoHome} />;
}
