import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { useGame } from "../context/GameContext";

export default function Lobby() {
  const { socket } = useSocket();
  const { state, dispatch } = useGame();
  const { room, token, roomCode, isLeader } = state;

  const [selected, setSelected] = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const chatRef = useRef();

  useEffect(() => {
    const onError = (msg) => setError(typeof msg === "string" ? msg : "Something went wrong");
    socket.on("error", onError);
    return () => socket.off("error", onError);
  }, [socket]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [room?.chat]);

  const shareLink = () => {
    const url = `${window.location.origin}?join=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(()=>setCopied(false),2000); });
  };

  const toggleSelect = (pid) =>
    setSelected(prev => prev.includes(pid) ? prev.filter(x=>x!==pid) : [...prev, pid]);

  const assignToTeam = (team) => {
    if (!room) return;
    const players = room.players || [];
    const assignments = players.map(p => {
      const isSelected = selected.includes(p.id);
      return { playerId: p.id, team: isSelected ? team : p.team, seat: p.seat || 0 };
    }).filter(a => a.team);

    socket.emit("assign_teams", { token, assignments });
    setSelected([]);
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit("chat", { token, message: chatMsg.trim() });
    setChatMsg("");
  };

  const startGame = () => {
    setError("");
    socket.emit("start_game", { token });
  };

  const handleEndRoom = () => {
    socket.emit("end_room", { token });
    setShowEndConfirm(false);
  };

  if (!room) return <div className="loading-screen">Connecting to lobby...</div>;

  const players = room.players || [];
  const activePlayers = players.filter(p => !p.isSpectator);
  const teamAPlayers = activePlayers.filter(p => p.team === "A");
  const teamBPlayers = activePlayers.filter(p => p.team === "B");
  const slotsPerTeam = room.playerLimit / 2;
  const allAssigned = teamAPlayers.length === slotsPerTeam && teamBPlayers.length === slotsPerTeam;
  const allConnected = activePlayers.filter(p => p.connected).length >= room.playerLimit;

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <div className="lobby-title">🃏 Mindi</div>
        <div className="lobby-room-code">
          <span className="lobby-code-label">Room Code</span>
          <span className="lobby-code">{roomCode}</span>
          <button className="lobby-share-btn" onClick={shareLink}>
            {copied ? <span className="copied-text">Copied! ✓</span> : "📋 Copy Invite Link"}
          </button>
        </div>
      </div>

      {/* Players */}
      <div className="lobby-section">
        <div className="lobby-section-title">Players ({activePlayers.length}/{room.playerLimit})</div>
        <div className="lobby-player-list">
          {activePlayers.map(p => (
            <div key={p.id} className="lobby-player-row">
              <div className="lobby-player-name">
                {p.name} {p.isLeader?"👑":""}
                {!p.connected && <span className="offline-dot">• offline</span>}
              </div>
              {p.team
                ? <span className={`lobby-team-badge team-${p.team.toLowerCase()}`}>Team {p.team}</span>
                : <span className="lobby-unassigned">Unassigned</span>}
            </div>
          ))}
          {Array.from({length: Math.max(0, room.playerLimit - activePlayers.length)}).map((_,i) => (
            <div key={`w-${i}`} className="lobby-player-row lobby-waiting-slot">
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
            {(team==="A"?teamAPlayers:teamBPlayers).map(p => (
              <div key={p.id} className="lobby-team-slot">{p.name}</div>
            ))}
            {Array.from({length: slotsPerTeam-(team==="A"?teamAPlayers:teamBPlayers).length}).map((_,i) => (
              <div key={`e-${i}`} className="lobby-empty-slot">Empty</div>
            ))}
          </div>
        ))}
      </div>

      {/* Assign (leader only) */}
      {isLeader && (
        <div className="lobby-assign-section">
          <div className="lobby-section-title">Assign Players to Teams</div>
          <div className="lobby-assign-grid">
            {activePlayers.map(p => (
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

      {/* Start / End Room */}
      {isLeader ? (
        <>
          <button className="lobby-start-btn"
            onClick={startGame}
            disabled={!allAssigned||!allConnected}>
            {!allConnected ? `Waiting for players (${activePlayers.length}/${room.playerLimit})`
             : !allAssigned ? "Assign all players to teams first"
             : "Start Game →"}
          </button>
          <button className="end-room-btn" onClick={()=>setShowEndConfirm(true)}>
            End Room
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
          {(room.chat||[]).map((m,i) => (
            <div key={m.id || i} className="chat-msg">
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

      {/* End Room confirmation modal */}
      {showEndConfirm && (
        <div className="modal-overlay" onClick={()=>setShowEndConfirm(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">End Room?</div>
            <div className="modal-rule">This will kick all players out and destroy the room. This cannot be undone.</div>
            <div className="end-room-btns">
              <button className="end-room-confirm" onClick={handleEndRoom}>End Room</button>
              <button className="modal-close-btn" onClick={()=>setShowEndConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
