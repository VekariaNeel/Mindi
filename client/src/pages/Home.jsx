import { useState } from "react";
import { useSocket } from "../context/SocketContext";
import { useGame } from "../context/GameContext";

export default function Home() {
  const { socket, connected } = useSocket();
  const { dispatch } = useGame();
  const [tab, setTab] = useState("create");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [playerLimit, setPlayerLimit] = useState(4);
  const [spectatorName, setSpectatorName] = useState("");
  const [rejoinName, setRejoinName] = useState("");
  const [rejoinCode, setRejoinCode] = useState("");
  const [error, setError] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return setError("Enter your name");
    setError(""); setLoading(true);

    const onSuccess = (data) => {
      socket.off("error", onError);
      setLoading(false);
      localStorage.setItem("mindi_token", data.token);
      localStorage.setItem("mindi_name", name.trim());
      localStorage.setItem("mindi_roomCode", data.code);
      dispatch({
        type: "JOINED_ROOM",
        roomCode: data.code,
        playerId: data.playerId,
        token: data.token,
        isLeader: true,
        isSpectator: false,
        playerName: name.trim(),
      });
    };
    const onError = (msg) => {
      socket.off("room_created", onSuccess);
      setLoading(false);
      setError(typeof msg === "string" ? msg : "Something went wrong");
    };

    socket.once("room_created", onSuccess);
    socket.once("error", onError);
    socket.emit("create_room", { name: name.trim(), playerLimit });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError("Enter your name");
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);

    const onSuccess = (data) => {
      socket.off("error", onError);
      setLoading(false);
      localStorage.setItem("mindi_token", data.token);
      localStorage.setItem("mindi_name", name.trim());
      localStorage.setItem("mindi_roomCode", data.code);
      dispatch({
        type: "JOINED_ROOM",
        roomCode: data.code,
        playerId: data.playerId,
        token: data.token,
        isLeader: false,
        isSpectator: false,
        playerName: name.trim(),
      });
    };
    const onError = (msg) => {
      socket.off("room_joined", onSuccess);
      setLoading(false);
      setError(typeof msg === "string" ? msg : "Something went wrong");
    };

    socket.once("room_joined", onSuccess);
    socket.once("error", onError);
    socket.emit("join_room", { roomCode: roomCode.trim().toUpperCase(), name: name.trim() });
  };

  const handleSpectate = () => {
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);

    const onSuccess = (data) => {
      socket.off("error", onError);
      setLoading(false);
      localStorage.setItem("mindi_token", data.token);
      localStorage.setItem("mindi_roomCode", data.code);
      dispatch({
        type: "JOINED_ROOM",
        roomCode: data.code,
        playerId: data.spectatorId,
        token: data.token,
        isLeader: false,
        isSpectator: true,
        playerName: spectatorName.trim() || "Spectator",
      });
    };
    const onError = (msg) => {
      socket.off("spectator_joined", onSuccess);
      setLoading(false);
      setError(typeof msg === "string" ? msg : "Something went wrong");
    };

    socket.once("spectator_joined", onSuccess);
    socket.once("error", onError);
    socket.emit("join_spectator", { roomCode: roomCode.trim().toUpperCase(), name: spectatorName.trim() || "Spectator" });
  };

  const handleRejoin = () => {
    if (!rejoinName.trim()) return setError("Enter your name");
    if (!rejoinCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);

    // Use name-reconnect: server looks for a disconnected player with this name
    fetch(`${import.meta.env.VITE_SERVER_URL || "http://localhost:3001"}/room/name-reconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode: rejoinCode.trim().toUpperCase(), name: rejoinName.trim() }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        localStorage.setItem("mindi_token", data.token);
        localStorage.setItem("mindi_name", rejoinName.trim());
        localStorage.setItem("mindi_roomCode", rejoinCode.trim().toUpperCase());
        // Now auth via socket to get full state
        const onAuthed = (authData) => {
          socket.off("auth_failed", onFailed);
          setLoading(false);
          let page = "lobby";
          if (authData.phase === "playing") page = "game";
          dispatch({
            type: "JOINED_ROOM",
            roomCode: authData.roomCode,
            playerId: authData.playerId || data.playerId,
            token: data.token,
            isLeader: authData.isLeader || false,
            isSpectator: authData.isSpectator || false,
            playerName: rejoinName.trim(),
          });
          if (page === "game") dispatch({ type: "GAME_STARTED", removedCards: [] });
        };
        const onFailed = () => {
          socket.off("authed", onAuthed);
          setLoading(false);
          setError("Could not rejoin. Token may be invalid.");
        };
        socket.once("authed", onAuthed);
        socket.once("auth_failed", onFailed);
        socket.emit("auth", { token: data.token });
      })
      .catch(() => { setError("Could not reach server"); setLoading(false); });
  };

  return (
    <div className="home-page">
      <div className="home-card">
        <div className="home-logo">
          <span className="home-logo-icon">🃏</span>
          <span className="home-logo-title">MINDI</span>
          <span className="home-logo-sub">Card Game</span>
        </div>
        {!connected && <div className="home-connecting">Connecting to server...</div>}
        <div className="home-tabs">
          {["create","join","spectate","rejoin"].map(t => (
            <button key={t} className={`home-tab${tab===t?" active":""}`}
              onClick={() => { setTab(t); setError(""); }}>
              {t==="create"?"Create":t==="join"?"Join":t==="spectate"?"Watch":"Rejoin"}
            </button>
          ))}
        </div>
        {tab==="create" && <>
          <div className="home-field">
            <label className="home-label">Your Name</label>
            <input className="home-input" placeholder="e.g. Ahmed" value={name}
              onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleCreate()} />
          </div>
          <div className="home-field">
            <label className="home-label">Number of Players</label>
            <div className="player-limit-grid">
              {[4,6,8,10,12].map(n=>(
                <button key={n} className={`limit-btn${playerLimit===n?" selected":""}`}
                  onClick={()=>setPlayerLimit(n)}>{n}</button>
              ))}
            </div>
          </div>
          <button className="home-btn" onClick={handleCreate} disabled={loading || !connected}>
            {loading ? "Creating..." : "Create Room →"}
          </button>
        </>}
        {tab==="join" && <>
          <div className="home-field">
            <label className="home-label">Your Name</label>
            <input className="home-input" placeholder="e.g. Ahmed" value={name}
              onChange={e=>setName(e.target.value)} />
          </div>
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={roomCode}
              onChange={e=>setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleJoin()} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleJoin} disabled={loading || !connected}>
            {loading ? "Joining..." : "Join Room →"}
          </button>
        </>}
        {tab==="spectate" && <>
          <div className="home-field">
            <label className="home-label">Your Name (optional)</label>
            <input className="home-input" placeholder="Spectator" value={spectatorName}
              onChange={e=>setSpectatorName(e.target.value)} />
          </div>
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={roomCode}
              onChange={e=>setRoomCode(e.target.value.toUpperCase())} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleSpectate} disabled={loading || !connected}>
            {loading ? "Joining..." : "Watch Game →"}
          </button>
        </>}
        {tab==="rejoin" && <>
          <div className="home-field">
            <label className="home-label">Your Name (must match exactly)</label>
            <input className="home-input" placeholder="e.g. Ahmed" value={rejoinName}
              onChange={e=>setRejoinName(e.target.value)} />
          </div>
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={rejoinCode}
              onChange={e=>setRejoinCode(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleRejoin()} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleRejoin} disabled={loading || !connected}>
            {loading ? "Rejoining..." : "Rejoin Game →"}
          </button>
          <div className="home-rejoin-hint">Use this if you cleared your browser data or switched devices. Your name must match exactly.</div>
        </>}
        {error && <div className="home-error">{error}</div>}
        <div className="home-howto">
          <button className="home-howto-btn" onClick={()=>setShowRules(true)}>How to Play?</button>
        </div>
      </div>
      {showRules && (
        <div className="modal-overlay" onClick={()=>setShowRules(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">How to Play Mindi</div>
            <div className="modal-rule"><span className="modal-rule-head">Teams — </span>Players split into 2 equal teams. Cards are dealt equally to all players.</div>
            <div className="modal-rule"><span className="modal-rule-head">HUKUM — </span>Before cards are shown, one player secretly holds the HUKUM card. The suit of this card is trump — nobody knows it yet!</div>
            <div className="modal-rule"><span className="modal-rule-head">Playing — </span>The HUKUM holder leads first. Every player must follow the led suit if they can.</div>
            <div className="modal-rule"><span className="modal-rule-head">Trump Reveal — </span>When a player can't follow suit, HUKUM is revealed. The trump suit becomes known to all.</div>
            <div className="modal-rule"><span className="modal-rule-head">HUKUM Priority — </span>Even 2 of HUKUM beats Ace of any other suit. Once revealed, if you can't follow suit, play freely.</div>
            <div className="modal-rule"><span className="modal-rule-head">Winning — </span>Team with more 10s wins. Tie goes to the team with more tricks.</div>
            <button className="modal-close-btn" onClick={()=>setShowRules(false)}>Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
