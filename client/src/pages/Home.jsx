import { useState, useEffect } from "react";
import socket from "../socket";

export default function Home({ onJoined }) {
  const [tab, setTab]               = useState("create");
  const [name, setName]             = useState("");
  const [roomCode, setRoomCode]     = useState("");
  const [playerLimit, setPlayerLimit] = useState(4);
  const [spectatorName, setSpectatorName] = useState("");
  const [error, setError]           = useState("");
  const [showRules, setShowRules]   = useState(false);
  const [loading, setLoading]       = useState(false);

  // Auto-fill room code + switch to join tab if opened via invite link
  useEffect(() => {
    const autoJoin = sessionStorage.getItem("mindi_autojoin");
    if (autoJoin) {
      setRoomCode(autoJoin.toUpperCase());
      setTab("join");
      sessionStorage.removeItem("mindi_autojoin");
    }
  }, []);

  const connect = () => new Promise((resolve) => {
    if (socket.connected) return resolve();
    socket.once("connect", resolve);
    socket.connect();
  });

  const handleCreate = async () => {
    if (!name.trim()) return setError("Enter your name");
    setError(""); setLoading(true);
    await connect();

    socket.once("room_created", (data) => {
      setLoading(false);
      localStorage.setItem("mindi_token", data.token);
      localStorage.setItem("mindi_name", name.trim());
      localStorage.setItem("mindi_leader", "true");
      onJoined({ ...data, name: name.trim(), isLeader: true, role: "player" });
    });
    socket.once("error", (msg) => { setLoading(false); setError(msg); });
    socket.emit("create_room", { name: name.trim(), playerLimit });
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError("Enter your name");
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);
    await connect();

    socket.once("room_joined", (data) => {
      setLoading(false);
      localStorage.setItem("mindi_token", data.token);
      localStorage.setItem("mindi_name", name.trim());
      localStorage.setItem("mindi_leader", "false");
      onJoined({ ...data, name: name.trim(), isLeader: false, role: "player" });
    });
    socket.once("error", (msg) => { setLoading(false); setError(msg); });
    socket.emit("join_room", { roomCode: roomCode.trim().toUpperCase(), name: name.trim() });
  };

  const handleSpectate = async () => {
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);
    await connect();

    socket.once("spectator_joined", (data) => {
      setLoading(false);
      onJoined({ ...data, name: spectatorName.trim() || "Spectator", isLeader: false, role: "spectator" });
    });
    socket.once("error", (msg) => { setLoading(false); setError(msg); });
    socket.emit("join_spectator", { roomCode: roomCode.trim().toUpperCase(), name: spectatorName.trim() || "Spectator" });
  };

  return (
    <div className="home-page">
      <div className="home-card">
        <div className="home-logo">
          <span className="home-logo-icon">🃏</span>
          <span className="home-logo-title">MINDI</span>
          <span className="home-logo-sub">Card Game</span>
        </div>
        <div className="home-tabs">
          {["create","join","spectate"].map(t => (
            <button key={t} className={`home-tab${tab===t?" active":""}`}
              onClick={() => { setTab(t); setError(""); }}>
              {t==="create"?"Create Room":t==="join"?"Join Room":"Spectate"}
            </button>
          ))}
        </div>

        {tab==="create" && <>
          <div className="home-field">
            <label className="home-label">Your Name</label>
            <input className="home-input" placeholder="e.g. Rahul" value={name}
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
          <button className="home-btn" onClick={handleCreate} disabled={loading}>
            {loading ? "Connecting..." : "Create Room →"}
          </button>
        </>}

        {tab==="join" && <>
          <div className="home-field">
            <label className="home-label">Your Name</label>
            <input className="home-input" placeholder="e.g. Rahul" value={name}
              onChange={e=>setName(e.target.value)} />
          </div>
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={roomCode}
              onChange={e=>setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleJoin()} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleJoin} disabled={loading}>
            {loading ? "Connecting..." : "Join Room →"}
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
          <button className="home-btn" onClick={handleSpectate} disabled={loading}>
            {loading ? "Connecting..." : "Watch Game →"}
          </button>
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
            <div className="modal-rule"><span className="modal-rule-head">Teams — </span>Players split into 2 equal teams. Cards are dealt equally to all.</div>
            <div className="modal-rule"><span className="modal-rule-head">HUKUM — </span>One player secretly holds the HUKUM card. Its suit becomes trump — nobody knows it yet!</div>
            <div className="modal-rule"><span className="modal-rule-head">Playing — </span>The HUKUM holder leads first. Everyone must follow the led suit if they can.</div>
            <div className="modal-rule"><span className="modal-rule-head">Trump Reveal — </span>Can't follow suit and HUKUM isn't revealed? It reveals now — you must play a card of that suit.</div>
            <div className="modal-rule"><span className="modal-rule-head">HUKUM Priority — </span>Even 2 of HUKUM beats Ace of any other suit. Once revealed, if you can't follow suit, play freely.</div>
            <div className="modal-rule"><span className="modal-rule-head">Winning — </span>Team with more 10s wins. Tie goes to the team with more tricks.</div>
            <button className="modal-close-btn" onClick={()=>setShowRules(false)}>Got it!</button>
          </div>
        </div>
      )}
    </div>
  );
}
