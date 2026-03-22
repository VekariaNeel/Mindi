import { useState, useEffect } from "react";
import socket from "./socket";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";
import "./index.css";

export default function App() {
  const [page, setPage] = useState("home");
  const [session, setSession] = useState(null);
  const [gameStartData, setGameStartData] = useState(null);
  const [gameResult, setGameResult] = useState(null);

  // Auto-fill room code from URL ?join=XXXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    if (joinCode) sessionStorage.setItem("mindi_autojoin", joinCode);
  }, []);

  // Reconnect on reload
  useEffect(() => {
    const token = localStorage.getItem("mindi_token");
    if (!token) return;
    socket.once("reconnected", (data) => {
      const name = localStorage.getItem("mindi_name") || "Player";
      const isLeader = localStorage.getItem("mindi_leader") === "true";
      setSession({ ...data, name, isLeader, role: "player" });
      setPage("lobby");
    });
    socket.once("error", () => localStorage.removeItem("mindi_token"));
    socket.connect();
    socket.once("connect", () => {
      socket.emit("reconnect_player", { token });
    });
  }, []);

  // Return to lobby after play again
  useEffect(() => {
    socket.on("return_to_lobby", () => {
      setGameResult(null);
      setGameStartData(null);
      setPage("lobby");
    });
    return () => socket.off("return_to_lobby");
  }, []);

  const handleJoined = (data) => {
    setSession(data);
    localStorage.setItem("mindi_name", data.name);
    localStorage.setItem("mindi_leader", String(data.isLeader));
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
    localStorage.removeItem("mindi_token");
    localStorage.removeItem("mindi_name");
    localStorage.removeItem("mindi_leader");
    socket.disconnect();
    setSession(null);
    setGameStartData(null);
    setGameResult(null);
    setPage("home");
  };

  if (page === "home")    return <Home onJoined={handleJoined} />;
  if (page === "lobby")   return <Lobby session={session} onGameStart={handleGameStart} />;
  if (page === "game")    return <Game session={session} playerNames={gameStartData?.playerNames || {}} onGameOver={handleGameOver} />;
  if (page === "results") return <Results result={gameResult} session={session} onPlayAgain={handlePlayAgain} onGoHome={handleGoHome} />;
}
