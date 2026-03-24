import { useState, useEffect, useRef } from "react";
import socket from "../socket";
import Card from "../components/Card";

// ── GAME LOGIC (UNTOUCHED) ────────────────────────────────────
function getLegalCards(hand, currentTrick, hukumRevealed, hukumSuit, hukumJustRevealed=false) {
  if (!currentTrick || currentTrick.length === 0) return hand;
  const ledSuit = currentTrick[0].card.suit;
  const hasSuit = hand.some(c => c.suit === ledSuit);
  if (hasSuit) return hand.filter(c => c.suit === ledSuit);
  if ((hukumJustRevealed || !hukumRevealed) && hukumSuit) {
    const hasHukum = hand.some(c => c.suit === hukumSuit);
    if (hasHukum) return hand.filter(c => c.suit === hukumSuit);
  }
  return hand;
}

const SUIT_COLOR = { "♥":"#e05c5c","♦":"#e05c5c","♠":"#1a1a2e","♣":"#1a1a2e" };
const RED_SUITS  = ["♥","♦"];

// ── WON PILE ──────────────────────────────────────────────────
function WonPile({ cards, teamLabel, teamColor, n }) {
  const cardsPerTrick = n || 4;
  const allCards = cards || [];
  const tricks = [];
  for (let i = 0; i < allCards.length; i += cardsPerTrick)
    tricks.push(allCards.slice(i, i + cardsPerTrick));
  const totalTens = allCards.filter(c => c.rank === "10").length;

  return (
    <div className="wonpile">
      <div className="wonpile-header" style={{ color: teamColor }}>
        {teamLabel}
        <span className="wonpile-score">{totalTens}🔟 · {tricks.length}T</span>
      </div>
      {tricks.length === 0 ? (
        <div className="wonpile-empty">No tricks yet</div>
      ) : (
        <div className="wonpile-tricks-row">
          {tricks.map((trick, ti) => {
            const tens = trick.filter(c => c.rank === "10");
            return (
              <div key={ti} className="wonpile-trick-slot">
                <div className="wonpile-trick-back" />
                {tens.length > 0 && (
                  <div className="wonpile-trick-tens">
                    {tens.map((card, ki) => (
                      <div key={ki} className="wonpile-trick-ten"
                        style={{ marginLeft: ki===0?0:-10, zIndex: ki+1,
                          color: RED_SUITS.includes(card.suit) ? "#c0392b" : "#111" }}>
                        <span className="wtt-suit">{card.suit}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PLAYER SEAT ───────────────────────────────────────────────
function PlayerSeat({ name, angle, isMe, isCurrentTurn, cardCount, isHukumHolder, hukumRevealed, tableR, isSpectator }) {
  const RAD  = Math.PI / 180;
  const seatR = tableR + 68;
  const x = Math.cos((angle - 90) * RAD) * seatR;
  const y = Math.sin((angle - 90) * RAD) * seatR;

  return (
    <div className={`pseat${isMe?" pseat-me":""}${isCurrentTurn?" pseat-active":""}`}
      style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}>
      <div className="pseat-name">
        {isCurrentTurn && <span className="pseat-dot" />}
        <span className="pseat-label">{isMe ? `${name} (You)` : name}</span>
        {isHukumHolder && !hukumRevealed && <span className="pseat-hukum">🂠</span>}
      </div>
      {!isMe && !isSpectator && (
        <div className="pseat-cards">
          {Array.from({ length: Math.min(cardCount||0, 6) }).map((_, i) => (
            <div key={i} className="pseat-cardback" style={{ marginLeft: i===0?0:-9, zIndex: i }} />
          ))}
          {(cardCount||0) > 6 && <span className="pseat-cardcount">+{cardCount-6}</span>}
        </div>
      )}
    </div>
  );
}

// ── CHAT PANEL (reused on desktop + mobile drawer) ────────────
function ChatPanel({ messages, chatMsg, setChatMsg, onSend, chatRef }) {
  return (
    <>
      <div className="chat-messages-list" ref={chatRef}>
        {messages.map((m,i) => (
          <div key={i} className="chat-msg">
            <span className="chat-msg-name">{m.senderName}: </span>{m.message}
          </div>
        ))}
      </div>
      <div className="chat-input-row">
        <input className="chat-input-field" placeholder="Message..." value={chatMsg}
          onChange={e => setChatMsg(e.target.value)}
          onKeyDown={e => e.key==="Enter" && onSend()} />
        <button className="chat-send-btn" onClick={onSend}>↑</button>
      </div>
    </>
  );
}

// ── MAIN GAME ─────────────────────────────────────────────────
export default function Game({ session, playerNames, onGameOver }) {
  const [gs, setGs]                         = useState(null);
  const [selected, setSelected]             = useState(null);
  const [event, setEvent]                   = useState(null);
  const [paused, setPaused]                 = useState(null);
  const [chatMsg, setChatMsg]               = useState("");
  const [chatMessages, setChatMessages]     = useState([]);
  const [hukumReveal, setHukumReveal]       = useState(null);
  const [hukumCountdown, setHukumCountdown] = useState(5);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [chatOpen, setChatOpen]             = useState(false);
  const [unread, setUnread]                 = useState(false);
  const chatRef      = useRef();
  const countdownRef = useRef();

  const showHukumOverlay = (card, playerName, suit) => {
    setHukumReveal({ card, playerName, suit });
    setHukumCountdown(5);
    let count = 5;
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      count--;
      setHukumCountdown(count);
      if (count <= 0) { clearInterval(countdownRef.current); setHukumReveal(null); }
    }, 1000);
  };

  useEffect(() => {
    socket.on("game_state",          s  => { setGs(s); setPaused(null); });
    socket.on("game_event",          ev => { setEvent(ev); setTimeout(() => setEvent(null), 2800); });
    socket.on("hukum_triggered",     ev => showHukumOverlay(ev.hukumCard, ev.nextPlayerName||ev.playerName, ev.hukumSuit));
    socket.on("game_paused",         d  => setPaused(d.message));
    socket.on("player_disconnected", d  => setPaused(`Waiting for ${d.playerName} to reconnect...`));
    socket.on("player_reconnected",  d  => {
      setPaused(null);
      setEvent({ type:"info", msg:`${d.playerName} reconnected!` });
      setTimeout(() => setEvent(null), 2000);
    });
    socket.on("game_over", onGameOver);
    socket.on("chat_message", msg => {
      setChatMessages(prev => [...prev.slice(-99), msg]);
      setChatOpen(prev => { if (!prev) setUnread(true); return prev; });
    });
    return () => {
      ["game_state","game_event","hukum_triggered","game_paused",
       "player_disconnected","player_reconnected","game_over","chat_message"]
        .forEach(e => socket.off(e));
      clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const playCard = () => {
    if (!selected) return;
    socket.emit("play_card", { roomCode: session.roomCode, card: selected });
    setSelected(null);
  };

  const openChat = () => { setChatOpen(true); setUnread(false); };

  const sendChat = () => {
    if (!chatMsg.trim()) return;
    socket.emit("chat", { roomCode: session.roomCode, message: chatMsg.trim() });
    setChatMsg("");
  };

  const formatEvent = ev => {
    if (!ev) return null;
    if (ev.type === "info")           return ev.msg;
    if (ev.type === "card_played")    return `${ev.playerName} played ${ev.card?.rank}${ev.card?.suit}`;
    if (ev.type === "trick_complete") return `${ev.winnerName} wins!${ev.tensCollected ? ` +${ev.tensCollected}🔟 Team ${ev.winTeam}` : ""}`;
    return null;
  };

  if (!gs) return <div className="loading-screen">Loading game...</div>;

  const isSpectator     = session.role === "spectator";
  const isMyTurn        = !isSpectator && gs.currentTurn === session.playerId;
  const myHand          = gs.myHand || [];
  const legal           = isMyTurn ? getLegalCards(myHand, gs.currentTrick, gs.hukumRevealed, gs.hukumSuit, gs.hukumJustRevealed) : [];
  const currentTurnName = playerNames?.[gs.currentTurn] || "...";
  const sequence        = gs.sequence || [];
  const n               = gs.n || 4;
  const wonCards        = gs.wonCards || { A:[], B:[] };

  const myIdx   = isSpectator ? 0 : Math.max(0, sequence.indexOf(session.playerId));
  const TABLE_R = 110;
  const angleFor = seqIdx => ((seqIdx - myIdx + n) % n) * (360 / n);

  // Hand UI (shared between desktop right panel and mobile bottom panel)
  const handUI = !isSpectator && (
    <>
      <div className="hand-title">
        {isMyTurn ? "Your Turn — Pick a Card" : "Your Hand"}
        <span className="hand-count">{myHand.length} cards</span>
      </div>
      <div className="hand-cards-row">
        {myHand.map(card => (
          <Card key={card.id} card={card} size="md"
            selected={selected?.id === card.id}
            disabled={!isMyTurn || !legal.find(c => c.id === card.id)}
            onClick={() => setSelected(selected?.id === card.id ? null : card)} />
        ))}
      </div>
      {isMyTurn && selected ? (
        <button className="play-btn" onClick={playCard}>
          Play {selected.rank}{selected.suit}
        </button>
      ) : !isMyTurn && (
        <div className="wait-turn">
          Waiting for <strong>{currentTurnName}</strong>
        </div>
      )}
    </>
  );

  return (
    <div className="game-page">

      {/* ── HUKUM REVEAL OVERLAY ── */}
      {hukumReveal && (
        <div className="hukum-overlay">
          <div className="hukum-overlay-inner">
            <div className="hukum-overlay-label">💥 HUKUM REVEALED!</div>
            <div className="hukum-overlay-by">{hukumReveal.playerName} revealed the trump</div>
            <div className="hukum-overlay-cardwrap">
              <div className="hukum-big-card" style={{ color: SUIT_COLOR[hukumReveal.card?.suit] }}>
                <span className="hukum-big-rank">{hukumReveal.card?.rank}</span>
                <span className="hukum-big-suit">{hukumReveal.card?.suit}</span>
                <span className="hukum-big-rank">{hukumReveal.card?.rank}</span>
              </div>
            </div>
            <div className="hukum-overlay-suit" style={{ color: SUIT_COLOR[hukumReveal.suit] }}>
              {hukumReveal.suit} is now HUKUM (Trump)
            </div>
            <div className="hukum-overlay-countdown">Closing in {hukumCountdown}s...</div>
          </div>
        </div>
      )}

      {/* ── END GAME CONFIRM ── */}
      {showEndConfirm && (
        <div className="modal-overlay" onClick={() => setShowEndConfirm(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ fontSize:"20px" }}>End Game?</div>
            <p style={{ color:"var(--muted)", fontSize:"14px", marginBottom:"20px" }}>
              This will end the game immediately for all players.
            </p>
            <div style={{ display:"flex", gap:"10px" }}>
              <button className="modal-close-btn" style={{ flex:1 }} onClick={() => setShowEndConfirm(false)}>Cancel</button>
              <button className="modal-close-btn" style={{ flex:1, background:"rgba(224,92,92,0.15)", borderColor:"rgba(224,92,92,0.3)", color:"var(--red)" }}
                onClick={() => { socket.emit("end_game",{roomCode:session.roomCode}); setShowEndConfirm(false); }}>End Game</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP BAR ── */}
      <div className="game-topbar">
        <span className="game-topbar-title">MINDI</span>
        {gs.hukumSuit && <span className="hukum-pill">HUKUM: {gs.hukumSuit}</span>}
        <span className="score-pill team-a">A: {gs.tens?.A||0}🔟 · {gs.tricks?.A||0}T</span>
        <span className="score-pill team-b">B: {gs.tens?.B||0}🔟 · {gs.tricks?.B||0}T</span>
        <span className="game-room-code">{session.roomCode}</span>
        {session.isLeader && (
          <button className="end-game-btn" onClick={() => setShowEndConfirm(true)}>End Game</button>
        )}
      </div>

      {paused && <div className="pause-banner">⏸ {paused}</div>}

      {/* ── GAME BODY ── */}
      <div className="game-body">

        {/* LEFT/CENTER: table + won piles stacked vertically */}
        <div className="game-center-col">

          {/* Round table scene */}
          <div className="table-scene">
            {/* Felt circle */}
            <div className="felt-circle"
              style={{ width:TABLE_R*2+16, height:TABLE_R*2+16,
                position:"absolute", top:"50%", left:"50%",
                transform:"translate(-50%,-50%)", borderRadius:"50%" }}>
              <div className="trick-center">
                {(gs.currentTrick||[]).length === 0
                  ? <span className="trick-empty-label">—</span>
                  : <div className="trick-cards-grid">
                      {(gs.currentTrick||[]).map((t,i) => (
                        <div key={i}><Card card={t.card} size="sm" disabled /></div>
                      ))}
                    </div>
                }
                {event && <div className="table-event-text">{formatEvent(event)}</div>}
                <div className="table-turn-text">
                  {paused ? "⏸ Paused"
                    : isMyTurn
                      ? <span style={{color:"var(--accent)",fontWeight:700}}>Your turn!</span>
                      : <span>{currentTurnName}</span>}
                </div>
              </div>
            </div>

            {/* Players around the table */}
            {sequence.map((pid, seqIdx) => (
              <PlayerSeat key={pid}
                name={playerNames?.[pid]||"?"} angle={angleFor(seqIdx)}
                isMe={pid===session.playerId} isCurrentTurn={gs.currentTurn===pid}
                cardCount={pid===session.playerId ? myHand.length : (gs.handSizes?.[pid]??0)}
                isHukumHolder={pid===session.playerId && gs.isHukumHolder}
                hukumRevealed={gs.hukumRevealed} tableR={TABLE_R} isSpectator={isSpectator} />
            ))}
          </div>

          {/* Won piles — directly below the table, no overlap */}
          <div className="wonpiles-row">
            <WonPile cards={wonCards.A} teamLabel="Team A" teamColor="var(--blue)" n={n} />
            <WonPile cards={wonCards.B} teamLabel="Team B" teamColor="var(--green)" n={n} />
          </div>

        </div>

        {/* RIGHT: hand + chat (desktop only, hidden on mobile) */}
        <div className="game-right-col">
          {isSpectator
            ? <div className="spectator-note">👁 Watching as {session.name}</div>
            : <div className="desktop-hand-panel">{handUI}</div>
          }
          <div className="desktop-chat-panel">
            <div className="chat-panel-title">Chat</div>
            <ChatPanel messages={chatMessages} chatMsg={chatMsg}
              setChatMsg={setChatMsg} onSend={sendChat} chatRef={chatRef} />
          </div>
        </div>

      </div>

      {/* ── MOBILE BOTTOM: hand panel (hidden on desktop) ── */}
      {!isSpectator && (
        <div className="mobile-hand-bar">
          {handUI}
        </div>
      )}

      {/* ── MOBILE CHAT BUTTON (floating, hidden on desktop) ── */}
      <button className={`mobile-chat-fab${unread?" fab-unread":""}`}
        onClick={openChat} aria-label="Chat">
        💬{unread && <span className="fab-dot" />}
      </button>

      {/* ── MOBILE CHAT DRAWER ── */}
      {chatOpen && (
        <div className="mobile-chat-backdrop" onClick={() => setChatOpen(false)}>
          <div className="mobile-chat-drawer" onClick={e => e.stopPropagation()}>
            <div className="mobile-chat-header">
              <span>Chat</span>
              <button className="mobile-chat-close" onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <ChatPanel messages={chatMessages} chatMsg={chatMsg}
              setChatMsg={setChatMsg} onSend={sendChat} chatRef={chatRef} />
          </div>
        </div>
      )}

    </div>
  );
}
