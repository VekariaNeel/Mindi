import { useEffect, useState } from "react";
import { SocketProvider, useSocket } from "./context/SocketContext";
import { GameProvider, useGame } from "./context/GameContext";
import Home from "./pages/Home";
import Lobby from "./pages/Lobby";
import Game from "./pages/Game";
import Results from "./pages/Results";

function SocketWiring() {
  const { socket } = useSocket();
  const { dispatch } = useGame();

  useEffect(() => {
    socket.on("room_update", (room) => dispatch({ type: "ROOM_UPDATE", room }));
    socket.on("game_started", (data) => dispatch({ type: "GAME_STARTED", removedCards: data?.removedCards }));
    socket.on("game_state", (state) => dispatch({ type: "GAME_STATE", state }));
    socket.on("action", (action) => dispatch({ type: "ACTION", action }));
    socket.on("game_over", (data) => dispatch({ type: "GAME_OVER", data }));
    socket.on("back_to_lobby", () => dispatch({ type: "BACK_TO_LOBBY" }));
    socket.on("game_ended_by_leader", () => dispatch({ type: "BACK_TO_LOBBY" }));
    socket.on("room_ended", () => {
      localStorage.removeItem("mindi_token");
      localStorage.removeItem("mindi_name");
      localStorage.removeItem("mindi_roomCode");
      dispatch({ type: "RESET" });
    });

    return () => {
      socket.off("room_update");
      socket.off("game_started");
      socket.off("game_state");
      socket.off("action");
      socket.off("game_over");
      socket.off("back_to_lobby");
      socket.off("game_ended_by_leader");
      socket.off("room_ended");
    };
  }, [socket, dispatch]);

  return null;
}

function AutoReconnect() {
  const { socket, connected } = useSocket();
  const { state, dispatch } = useGame();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!connected || attempted || state.page !== "home") return;

    const savedToken = localStorage.getItem("mindi_token");
    if (!savedToken) { setAttempted(true); return; }

    const onAuthed = (data) => {
      socket.off("auth_failed", onFailed);
      setAttempted(true);

      // Determine which page to go to based on room phase
      let page = "lobby";
      if (data.phase === "playing") page = "game";
      else if (data.phase === "game_over") page = "results";

      dispatch({
        type: "JOINED_ROOM",
        roomCode: data.roomCode,
        playerId: data.playerId || null,
        token: savedToken,
        isLeader: data.isLeader || false,
        isSpectator: data.isSpectator || false,
        playerName: data.playerName || localStorage.getItem("mindi_name") || "Player",
      });

      // If game was in progress, navigate there
      if (page === "game") {
        dispatch({ type: "GAME_STARTED", removedCards: [] });
      }
    };

    const onFailed = () => {
      socket.off("authed", onAuthed);
      setAttempted(true);
      // Clear stale token
      localStorage.removeItem("mindi_token");
      localStorage.removeItem("mindi_name");
      localStorage.removeItem("mindi_roomCode");
    };

    socket.once("authed", onAuthed);
    socket.once("auth_failed", onFailed);
    socket.emit("auth", { token: savedToken });
  }, [connected, attempted, state.page, socket, dispatch]);

  return null;
}

function Router() {
  const { state } = useGame();
  switch (state.page) {
    case "lobby": return <Lobby />;
    case "game": return <Game />;
    case "results": return <Results />;
    default: return <Home />;
  }
}

export default function App() {
  return (
    <SocketProvider>
      <GameProvider>
        <SocketWiring />
        <AutoReconnect />
        <Router />
      </GameProvider>
    </SocketProvider>
  );
}
