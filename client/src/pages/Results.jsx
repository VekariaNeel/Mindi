export default function Results({ result, session, onPlayAgain, onGoHome }) {
  if (!result) return null;
  const { winner, tens, tricks, forcedEnd } = result;

  return (
    <div className="results-page">
      <div className="results-card">
        <div className="results-trophy">🏆</div>
        <div className="results-title">
          {forcedEnd ? "Game Ended" : `Team ${winner} Wins!`}
        </div>
        <div className="results-scores">
          {["A","B"].map(t => (
            <div key={t} className={`results-score-row${t===winner&&!forcedEnd?" winner":""}`}>
              <span className={`results-team-name${t===winner&&!forcedEnd?" winner":""}`}>
                Team {t} {t===winner&&!forcedEnd?"🏆":""}
              </span>
              <div className="results-team-stats">
                <span>{tens?.[t]??0} 🔟 tens</span>
                <span>{tricks?.[t]??0} tricks</span>
              </div>
            </div>
          ))}
        </div>
        <div className="results-btns">
          {session.isLeader && (
            <button className="results-primary-btn" onClick={onPlayAgain}>
              Play Again →
            </button>
          )}
          {!session.isLeader && session.role !== "spectator" && (
            <div className="results-wait-msg">Waiting for leader to start next game...</div>
          )}
          <button className="results-secondary-btn" onClick={onGoHome}>
            {session.role==="spectator" ? "Go Home" : "Leave Room"}
          </button>
        </div>
      </div>
    </div>
  );
}
