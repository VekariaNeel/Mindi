import { useSocket } from "../context/SocketContext";
import { useGame } from "../context/GameContext";

export default function Results() {
  const { socket } = useSocket();
  const { state, dispatch } = useGame();
  const { gameOver, token, isLeader, isSpectator } = state;

  if (!gameOver) return null;

  const { winner, tensTaken, tricksTaken } = gameOver;
  const isDraw = winner === "draw";

  const handlePlayAgain = () => {
    socket.emit("play_again", { token });
  };

  const handleGoHome = () => {
    dispatch({ type: "RESET" });
  };

  return (
    <div className="results-page">
      <div className="results-card">
        <div className="results-trophy">{isDraw ? "🤝" : "🏆"}</div>
        <div className="results-title">
          {isDraw ? "It's a Draw!" : `Team ${winner} Wins!`}
        </div>
        <div className="results-scores">
          {["A","B"].map(t => (
            <div key={t} className={`results-score-row${t===winner&&!isDraw?" winner":""}`}>
              <span className={`results-team-name${t===winner&&!isDraw?" winner":""}`}>
                Team {t} {t===winner&&!isDraw?"🏆":""}
              </span>
              <div className="results-team-stats">
                <span>{tensTaken?.[t]??0} 🔟 tens</span>
                <span>{tricksTaken?.[t]??0} tricks</span>
              </div>
            </div>
          ))}
        </div>
        <div className="results-btns">
          {isLeader && (
            <button className="results-primary-btn" onClick={handlePlayAgain}>
              Play Again →
            </button>
          )}
          {!isLeader && !isSpectator && (
            <div className="results-wait-msg">Waiting for leader to start next game...</div>
          )}
          <button className="results-secondary-btn" onClick={handleGoHome}>
            {isSpectator ? "Go Home" : "Leave Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
