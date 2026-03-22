import { useState, useEffect, useRef } from "react";
import socket from "../socket";

export default function Lobby({ session, onGameStart }) {
  const [lobbyState, setLobbyState] = useState(null);
  const [selected, setSelected] = useState([]);
  const [chatMsg, setChatMsg] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const chatRef = useRef();

  useEffect(() => {
    socket.on("lobby_state", setLobbyState);
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

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit("chat", { roomCode: session.roomCode, message: chatMsg.trim() });
    setChatMsg("");
  };

  if (!lobbyState) return <div className="loading-screen">Connecting...</div>;

  const players = lobbyState.players || [];
  const teamA = lobbyState.teamA || [];
  const teamB = lobbyState.teamB || [];
  const slotsPerTeam = lobbyState.playerLimit / 2;
  const totalAssigned = teamA.length + teamB.length;
  const allAssigned = teamA.length === slotsPerTeam && teamB.length === slotsPerTeam && totalAssigned === players.length;
  const allConnected = players.filter(p=>p.connected).length === lobbyState.playerLimit;
  const getName = (pid) => players.find(p=>p.id===pid)?.name || pid;

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
        </div>
      </div>

      {/* Players */}
      <div className="lobby-section">
        <div className="lobby-section-title">Players ({players.length}/{lobbyState.playerLimit})</div>
        <div className="lobby-player-list">
          {players.map(p => (
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
          {Array.from({length: lobbyState.playerLimit - players.length}).map((_,i) => (
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
            {!allConnected ? `Waiting for players (${players.length}/${lobbyState.playerLimit})`
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
