import { useState, useEffect } from "react";
import socket from "../socket";
import { auth, googleProvider } from "../firebase";
import { signInWithPopup } from "firebase/auth";

export default function Home({ user, onJoined }) {
  const [tab, setTab]           = useState("create");
  const [roomCode, setRoomCode] = useState("");
  const [error, setError]       = useState("");
  const [showRules, setShowRules] = useState(false);
  const [loading, setLoading]   = useState(false);

  // Auto-fill room code + switch to join tab if opened via invite link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get("join");
    if (joinCode) {
      setRoomCode(joinCode.toUpperCase());
      setTab("join");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const connect = () => new Promise((resolve) => {
    if (socket.connected) return resolve();
    socket.once("connect", resolve);
    socket.connect();
  });

  const withSocketAction = (successEvent, onSuccess, onErr) => {
    const cleanup = () => {
      socket.off(successEvent, handleSuccess);
      socket.off("error", handleError);
    };
    const handleSuccess = (data) => { cleanup(); onSuccess(data); };
    const handleError   = (msg)  => { cleanup(); onErr(msg); };
    socket.on(successEvent, handleSuccess);
    socket.on("error", handleError);
    return cleanup;
  };

  const handleGoogleSignIn = async () => {
    if (user) return user;
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (err) {
      setError("Failed to sign in with Google.");
      return null;
    }
  };

  // ── CREATE: sign in then instantly create room with defaults ──
  const handleCreate = async () => {
    setError(""); setLoading(true);
    const currentUser = await handleGoogleSignIn();
    if (!currentUser) { setLoading(false); return; }

    await connect();
    withSocketAction("room_created",
      (data) => {
        setLoading(false);
        onJoined({ ...data, name: currentUser.displayName, isLeader: true, role: "player" });
      },
      (msg) => { setLoading(false); setError(msg); }
    );
    // No playerLimit sent — server defaults to 4, leader changes it in lobby
    socket.emit("create_room", { token: await currentUser.getIdToken(), name: currentUser.displayName });
  };

  const handleJoin = async () => {
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);
    const currentUser = await handleGoogleSignIn();
    if (!currentUser) { setLoading(false); return; }

    await connect();
    withSocketAction("room_joined",
      (data) => {
        setLoading(false);
        onJoined({ ...data, name: currentUser.displayName, isLeader: false, role: "player" });
      },
      (msg) => { setLoading(false); setError(msg); }
    );
    socket.emit("join_room", { token: await currentUser.getIdToken(), roomCode: roomCode.trim().toUpperCase(), name: currentUser.displayName });
  };

  const handleSpectate = async () => {
    if (!roomCode.trim()) return setError("Enter room code");
    setError(""); setLoading(true);
    const currentUser = await handleGoogleSignIn();
    if (!currentUser) { setLoading(false); return; }

    await connect();
    withSocketAction("spectator_joined",
      (data) => {
        setLoading(false);
        onJoined({ ...data, name: currentUser.displayName, isLeader: false, role: "spectator" });
      },
      (msg) => { setLoading(false); setError(msg); }
    );
    socket.emit("join_spectator", { token: await currentUser.getIdToken(), roomCode: roomCode.trim().toUpperCase(), name: currentUser.displayName });
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
              {t==="create"?"Host a Game":t==="join"?"Join Room":"Spectate"}
            </button>
          ))}
        </div>

        {tab==="create" && <>
          {user && <div className="home-field"><div className="home-label">Signed in as: {user.displayName}</div></div>}
          <div className="home-create-info">
            <span className="home-create-icon">🎲</span>
            <div>
              <div className="home-create-title">Create a Private Room</div>
              <div className="home-create-sub">Configure players & decks once you're in the lobby</div>
            </div>
          </div>
          <button className="home-btn" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating..." : (user ? "Host a Game →" : "Sign in with Google & Host →")}
          </button>
        </>}

        {tab==="join" && <>
          {user && <div className="home-field"><div className="home-label">Signed in as: {user.displayName}</div></div>}
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={roomCode}
              onChange={e=>setRoomCode(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&handleJoin()} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleJoin} disabled={loading}>
            {loading ? "Connecting..." : (user ? "Join Room →" : "Sign in with Google & Join Room →")}
          </button>
        </>}

        {tab==="spectate" && <>
          {user && <div className="home-field"><div className="home-label">Signed in as: {user.displayName}</div></div>}
          <div className="home-field">
            <label className="home-label">Room Code</label>
            <input className="home-input" placeholder="e.g. XK94F" value={roomCode}
              onChange={e=>setRoomCode(e.target.value.toUpperCase())} maxLength={5} />
          </div>
          <button className="home-btn" onClick={handleSpectate} disabled={loading}>
            {loading ? "Connecting..." : (user ? "Watch Game →" : "Sign in with Google & Watch Game →")}
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
