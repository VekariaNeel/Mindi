import { useState, useEffect, useRef } from "react";
import socket from "../socket";
import { auth } from "../firebase";

export default function Lobby({ session, onGameStart, onGoHome }) {
  const [lobbyState, setLobbyState] = useState(null);
  const [selected, setSelected]     = useState([]);
  const [chatMsg, setChatMsg]       = useState("");
  const [error, setError]           = useState("");
  const [copied, setCopied]         = useState(false);
  const [showEndRoom, setShowEndRoom] = useState(false);
  const chatRef = useRef();

  // Local config state (leader-only, synced to server)
  const [cfgPlayers, setCfgPlayers] = useState(null);
  const [cfgDecks,   setCfgDecks]   = useState(null);

  useEffect(() => {
    socket.on("lobby_state", (state) => {
      setLobbyState(state);
      // Sync local config to server values on first load
      setCfgPlayers(p => p ?? state.playerLimit);
      setCfgDecks(d => d ?? state.numDecks);
    });
    socket.on("game_started", onGameStart);
    socket.on("error", (msg) => setError(typeof msg === "string" ? msg : "Something went wrong"));
    return () => {
      socket.off("lobby_state");
      socket.off("game_started");
      socket.off("error");
    };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [lobbyState?.chat]);

  const shareLink = () => {
    const url = `${window.location.origin}?join=${session.roomCode}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const toggleSelect = (pid) =>
    setSelected(prev => prev.includes(pid) ? prev.filter(x=>x!==pid) : [...prev, pid]);

  const assignToTeam = (team) => {
    if (!lobbyState) return;
    let teamA = [...(lobbyState.teamA||[])];
    let teamB = [...(lobbyState.teamB||[])];
    selected.forEach(pid => {
      teamA = teamA.filter(x=>x!==pid);
      teamB = teamB.filter(x=>x!==pid);
      if (team==="A") teamA.push(pid); else teamB.push(pid);
    });
    socket.emit("assign_teams", { roomCode: session.roomCode, teamA, teamB });
    setSelected([]);
  };

  const handleEndRoom = () => {
    socket.emit("end_room", { roomCode: session.roomCode });
    setShowEndRoom(false);
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit("chat", { roomCode: session.roomCode, message: chatMsg.trim() });
    setChatMsg("");
  };

  const handleLeaveRoom = () => {
    socket.emit("leave_room", { roomCode: session.roomCode });
    if (onGoHome) onGoHome();
  };

  const handleKick = (pid) => {
    socket.emit("kick_player", { roomCode: session.roomCode, targetId: pid });
  };

  // ── Emit config changes live ─────────────────────────────────
  const applyConfig = (newPlayers, newDecks) => {
    setError("");
    socket.emit("update_room_config", {
      roomCode: session.roomCode,
      playerLimit: newPlayers,
      numDecks: newDecks,
    });
  };

  if (!lobbyState) return <div className="loading-screen">Connecting...</div>;

  const players       = lobbyState.players || [];
  const teamA         = lobbyState.teamA || [];
  const teamB         = lobbyState.teamB || [];
  const playerLimit   = lobbyState.playerLimit;
  const numDecks      = lobbyState.numDecks;
  const slotsPerTeam  = Math.floor(playerLimit / 2);
  const totalAssigned = teamA.length + teamB.length;
  const allAssigned   = teamA.length === slotsPerTeam && teamB.length === slotsPerTeam && totalAssigned === players.length;
  const allConnected  = players.filter(p=>p.connected).length === playerLimit;
  const getName = (pid) => players.find(p=>p.id===pid)?.name || pid;

  // Deck options: min = floor(playerLimit/4), max = playerLimit/2 or 5 cap
  const minDecks  = Math.max(1, Math.floor(playerLimit / 4));
  const maxDecks  = Math.min(5, Math.max(minDecks, Math.floor(playerLimit / 2)));
  const deckOpts  = Array.from({ length: maxDecks - minDecks + 1 }, (_, i) => minDecks + i);

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <div className="lobby-title">🃏 Mindi</div>
        <div className="lobby-room-code">
          <span className="lobby-code-label">Room Code</span>
          <span className="lobby-code">{session.roomCode}</span>
          <button className="lobby-share-btn" onClick={shareLink}>
            {copied ? <span className="copied-text">Copied! ✓</span> : "📋 Copy Invite Link"}
          </button>
          {/* Leader: End Room only. Non-leader: Leave Room only. */}
          {session.isLeader
            ? <button className="lobby-end-room-btn" onClick={() => setShowEndRoom(true)}>End Room</button>
            : <button className="lobby-end-room-btn" style={{background:"transparent",color:"var(--red)",borderColor:"var(--red)"}} onClick={handleLeaveRoom}>Leave Room</button>
          }
        </div>
      </div>

      {/* End Room Confirm Modal */}
      {showEndRoom && (
        <div className="modal-overlay" onClick={() => setShowEndRoom(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize:"20px" }}>End Room?</div>
            <p style={{ color:"var(--muted)", fontSize:"14px", marginBottom:"20px" }}>
              This will remove all players from the room.
            </p>
            <div style={{ display:"flex", gap:"10px" }}>
              <button className="modal-close-btn" style={{ flex:1 }} onClick={() => setShowEndRoom(false)}>Cancel</button>
              <button className="modal-close-btn" style={{ flex:1, background:"rgba(224,92,92,0.15)", borderColor:"rgba(224,92,92,0.3)", color:"var(--red)" }}
                onClick={handleEndRoom}>End Room</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIVE ROOM CONFIG (leader only) ── */}
      {session.isLeader && (
        <div className="lobby-config-panel">
          <div className="lobby-config-title">⚙ Room Settings <span className="lobby-config-live">live</span></div>
          <div className="lobby-config-row">
            <div className="lobby-config-group">
              <div className="lobby-config-label">Players</div>
              <div className="lobby-config-btns">
                {[4,6,8,10,12].map(n => (
                  <button key={n}
                    className={`lobby-cfg-btn${(cfgPlayers||playerLimit)===n?" active":""}`}
                    onClick={() => {
                      setCfgPlayers(n);
                      const newMin = Math.max(1, Math.floor(n/4));
                      const safeDecks = Math.max(cfgDecks||numDecks, newMin);
                      setCfgDecks(safeDecks);
                      applyConfig(n, safeDecks);
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="lobby-config-group">
              <div className="lobby-config-label">Decks <span className="lobby-config-hint">(min {minDecks})</span></div>
              <div className="lobby-config-btns">
                {deckOpts.map(d => (
                  <button key={d}
                    className={`lobby-cfg-btn${(cfgDecks||numDecks)===d?" active":""}`}
                    onClick={() => {
                      setCfgDecks(d);
                      applyConfig(cfgPlayers||playerLimit, d);
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="lobby-config-summary">
            {playerLimit} players · {numDecks} deck{numDecks!==1?"s":""} · ~{Math.floor((numDecks*52/playerLimit))} cards/player
          </div>
        </div>
      )}

      {/* Non-leader: show read-only config */}
      {!session.isLeader && lobbyState && (
        <div className="lobby-config-readonly">
          <span className="lobby-config-readonly-item">👥 {playerLimit} players</span>
          <span className="lobby-config-readonly-sep">·</span>
          <span className="lobby-config-readonly-item">🃏 {numDecks} deck{numDecks!==1?"s":""}</span>
          <span className="lobby-config-readonly-sep">·</span>
          <span className="lobby-config-readonly-item">~{Math.floor((numDecks*52/playerLimit))} cards/player</span>
        </div>
      )}

      {/* Players */}
      <div className="lobby-section">
        <div className="lobby-section-title">Players ({players.length}/{playerLimit})</div>
        <div className="lobby-player-list">
          {players.map(p => (
            <div key={p.id} className="lobby-player-row">
              <div className="lobby-player-name">
                {p.name} {p.isLeader?"👑":""}
                {!p.connected && <span className="offline-dot">• offline</span>}
              </div>
              <div style={{display:"flex", gap:"10px", alignItems:"center"}}>
                {session.isLeader && p.id !== auth.currentUser?.uid && (
                  <button className="kick-btn" onClick={() => handleKick(p.id)}
                    style={{fontSize:"12px",background:"transparent",color:"var(--red)",border:"1px solid var(--red)",borderRadius:"4px",padding:"2px 6px"}}>Kick</button>
                )}
                {p.team
                  ? <span className={`lobby-team-badge team-${p.team.toLowerCase()}`}>Team {p.team}</span>
                  : <span className="lobby-unassigned">Unassigned</span>}
              </div>
            </div>
          ))}
          {Array.from({length: Math.max(0, playerLimit - players.length)}).map((_,i) => (
            <div key={i} className="lobby-player-row lobby-waiting-slot">
              <span style={{color:"var(--muted)",fontSize:"14px"}}>Waiting for player...</span>
            </div>
          ))}
        </div>
      </div>

      {/* Teams */}
      <div className="lobby-teams-grid">
        {["A","B"].map(team => (
          <div key={team} className={`lobby-team-box team-${team.toLowerCase()}`}>
            <div className={`lobby-team-title team-${team.toLowerCase()}`}>Team {team}</div>
            {(team==="A"?teamA:teamB).map(pid => (
              <div key={pid} className="lobby-team-slot">{getName(pid)}</div>
            ))}
            {Array.from({length: slotsPerTeam-(team==="A"?teamA:teamB).length}).map((_,i) => (
              <div key={i} className="lobby-empty-slot">Empty</div>
            ))}
          </div>
        ))}
      </div>

      {/* Assign (leader only) */}
      {session.isLeader && (
        <div className="lobby-assign-section">
          <div className="lobby-section-title">Assign Players to Teams</div>
          <div className="lobby-assign-grid">
            {players.map(p => (
              <button key={p.id} className={`lobby-assign-player${selected.includes(p.id)?" selected":""}`}
                onClick={()=>toggleSelect(p.id)}>{p.name}</button>
            ))}
          </div>
          <div className="lobby-assign-btns">
            <button className="lobby-assign-btn team-a" onClick={()=>assignToTeam("A")} disabled={!selected.length}>→ Team A</button>
            <button className="lobby-assign-btn team-b" onClick={()=>assignToTeam("B")} disabled={!selected.length}>→ Team B</button>
          </div>
        </div>
      )}

      {/* Start */}
      {session.isLeader ? (
        <>
          <button className="lobby-start-btn"
            onClick={()=>{ setError(""); socket.emit("start_game",{roomCode:session.roomCode}); }}
            disabled={!allAssigned||!allConnected}>
            {!allConnected ? `Waiting for players (${players.length}/${playerLimit})`
             : !allAssigned ? "Assign all players to teams first"
             : "Start Game →"}
          </button>
          {error && <div className="lobby-error">{error}</div>}
        </>
      ) : (
        <div className="lobby-wait-msg">Waiting for the leader to start the game...</div>
      )}

      {/* Chat */}
      <div className="chat-section">
        <div className="chat-title">Chat</div>
        <div className="chat-messages" ref={chatRef}>
          {(lobbyState.chat||[]).map((m,i) => (
            <div key={i} className="chat-msg">
              <span className="chat-msg-name">{m.senderName}: </span>{m.message}
            </div>
          ))}
        </div>
        <div className="chat-input-row">
          <input className="chat-input" placeholder="Say something..." value={chatMsg}
            onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} />
          <button className="chat-send-btn" onClick={sendChat}>Send</button>
        </div>
      </div>
    </div>
  );
}
