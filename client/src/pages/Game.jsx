import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { useGame } from "../context/GameContext";
import Card from "../components/Card";

export default function Game() {
  const { socket } = useSocket();
  const { state } = useGame();
  const { token, roomCode, isSpectator, isLeader, playerName, room, gameState: gs, lastAction } = state;

  const [selected, setSelected] = useState(null);
  const [event, setEvent] = useState(null);
  const [paused, setPaused] = useState(null);
  const [chatMsg, setChatMsg] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const chatRef = useRef();

  // Build a playerId → name map from room data
  const playerNames = {};
  if (room?.players) {
    room.players.forEach(p => { playerNames[p.id] = p.name; });
  }

  useEffect(() => {
    const onPaused = (data) => setPaused(data.name ? `${data.name} disconnected` : "A player disconnected");
    const onResumed = () => setPaused(null);
    const onChat = (msg) => setChatMessages(prev => [...prev.slice(-99), msg]);

    socket.on("game_paused", onPaused);
    socket.on("game_resumed", onResumed);
    socket.on("chat_message", onChat);
    socket.on("player_disconnected", onPaused);

    return () => {
      socket.off("game_paused", onPaused);
      socket.off("game_resumed", onResumed);
      socket.off("chat_message", onChat);
      socket.off("player_disconnected", onPaused);
    };
  }, [socket]);

  // Show event banners based on lastAction from context
  useEffect(() => {
    if (!lastAction) return;
    setEvent(lastAction);
    const timer = setTimeout(() => setEvent(null), 2800);
    return () => clearTimeout(timer);
  }, [lastAction]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const playCard = () => {
    if (!selected) return;
    socket.emit("play_card", { token, card: selected });
    setSelected(null);
  };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit("chat", { token, message: chatMsg.trim() });
    setChatMsg("");
  };

  const handleEndRoom = () => {
    socket.emit("end_room", { token });
    setShowEndConfirm(false);
  };

  if (!gs) return <div className="loading-screen">Loading game...</div>;

  const isMyTurn = !isSpectator && gs.isMyTurn;
  const myHand = gs.myHand || [];
  const myLegalCardIds = gs.myLegalCardIds || [];
  const currentTurnName = playerNames[gs.currentTurnId] || "...";

  const formatEvent = (ev) => {
    if (!ev) return null;
    if (ev.type === "card_played") {
      const name = playerNames[ev.playerId] || "Someone";
      return `${name} played ${ev.card.rank}${ev.card.suit}${ev.hukumTriggered ? ` 💥 HUKUM REVEALED! Trump: ${ev.hukumSuit}` : ""}`;
    }
    if (ev.type === "trick_won") {
      const name = playerNames[ev.trickWinnerId] || "Someone";
      return `${name} wins the trick!${ev.tensCollected ? ` +${ev.tensCollected} ten(s) for Team ${ev.trickWinnerTeam}` : ""}`;
    }
    return null;
  };

  return (
    <div className="game-page">
      <div className="game-topbar">
        <span className="game-topbar-title">MINDI</span>
        {gs.hukumRevealed && gs.hukumSuit && <span className="hukum-pill">HUKUM: {gs.hukumSuit}</span>}
        {gs.isHukumHolder && !gs.hukumRevealed && (
          <span className="hukum-pill hukum-holder">🎴 You hold the HUKUM</span>
        )}
        <span className="score-pill team-a">A: {gs.tensTaken?.A||0}🔟 · {gs.tricksTaken?.A||0}T</span>
        <span className="score-pill team-b">B: {gs.tensTaken?.B||0}🔟 · {gs.tricksTaken?.B||0}T</span>
        <span className="game-room-code">{roomCode}</span>
        {isLeader && (
          <button className="end-room-btn-sm" onClick={()=>setShowEndConfirm(true)} title="End Room">✕</button>
        )}
      </div>

      {paused && <div className="pause-banner">⏸ {paused}</div>}

      <div className="game-body">
        {/* Center — trick area */}
        <div className="game-center">
          <div className="trick-circle">
            {(gs.currentTrick||[]).length===0
              ? <span className="trick-empty">Waiting for first card...</span>
              : (gs.currentTrick||[]).map((t,i) => (
                <div key={i} className="trick-card-slot">
                  <Card card={t.card} size="sm" disabled />
                </div>
              ))
            }
          </div>

          {event && <div className="event-banner">{formatEvent(event)}</div>}

          <div className="turn-indicator">
            {paused ? "⏸ Game paused"
              : isMyTurn ? <strong style={{color:"var(--accent)"}}>Your turn!</strong>
              : <span>Waiting for <strong>{currentTurnName}</strong></span>}
          </div>
        </div>

        {/* Right panel — hand + chat */}
        <div className="game-right">
          {isSpectator
            ? <div className="spectator-note">👁 Watching as {playerName}</div>
            : (
              <div className="hand-panel">
                <div className="hand-title">{isMyTurn ? "Your Turn — Pick a Card" : "Your Hand"}</div>
                <div className="hand-cards">
                  {myHand.map(card => (
                    <Card key={card.id} card={card} size="md"
                      selected={selected?.id===card.id}
                      disabled={!isMyTurn || !myLegalCardIds.includes(card.id)}
                      onClick={()=>setSelected(selected?.id===card.id ? null : card)} />
                  ))}
                </div>
                {isMyTurn && selected && (
                  <button className="play-btn" onClick={playCard}>
                    Play {selected.rank}{selected.suit}
                  </button>
                )}
                {!isMyTurn && (
                  <div className="wait-turn">
                    Waiting for<br/><strong>{currentTurnName}</strong>
                  </div>
                )}
              </div>
            )
          }

          {/* Chat */}
          <div className="game-chat">
            <div className="game-chat-title">Chat</div>
            <div className="game-chat-messages" ref={chatRef}>
              {chatMessages.map((m,i) => (
                <div key={m.id || i} className="chat-msg">
                  <span className="chat-msg-name">{m.senderName}: </span>{m.message}
                </div>
              ))}
            </div>
            <div className="game-chat-input-row">
              <input className="game-chat-input" placeholder="Message..." value={chatMsg}
                onChange={e=>setChatMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} />
              <button className="game-chat-send" onClick={sendChat}>↑</button>
            </div>
          </div>
        </div>
      </div>

      {/* End Room confirmation modal */}
      {showEndConfirm && (
        <div className="modal-overlay" onClick={()=>setShowEndConfirm(false)}>
          <div className="modal-card" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">End Room?</div>
            <div className="modal-rule">This will end the game and kick all players out of the room. This cannot be undone.</div>
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
