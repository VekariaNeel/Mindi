const RED = ["♥","♦"];

export default function Card({ card, onClick, selected, disabled, size="md", faceDown }) {
  const isRed = RED.includes(card?.suit);
  const sizes = {
    sm: { width:44, height:62, rankSize:11, suitSize:16 },
    md: { width:58, height:82, rankSize:13, suitSize:22 },
    lg: { width:68, height:96, rankSize:15, suitSize:26 },
  };
  const sz = sizes[size] || sizes.md;

  if (faceDown) return (
    <div style={{ width:sz.width, height:sz.height, borderRadius:8, flexShrink:0,
      background:"linear-gradient(135deg,#1e3a5f,#0f2040)",
      border:"1.5px solid #2a4a7f", display:"flex", alignItems:"center",
      justifyContent:"center", fontSize:sz.suitSize, opacity:0.9 }}>
      🂠
    </div>
  );

  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:sz.width, height:sz.height, borderRadius:8, flexShrink:0,
      background: selected ? "#fffbeb" : "#ffffff",
      border: selected ? "2px solid #e8c97a" : "1.5px solid #ddd",
      display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"space-between", padding:"5px",
      boxShadow: selected ? "0 0 0 3px rgba(232,201,122,0.3), 0 6px 20px rgba(0,0,0,0.4)"
                          : "0 2px 8px rgba(0,0,0,0.35)",
      transform: selected ? "translateY(-12px)" : disabled ? "none" : "translateY(0)",
      opacity: disabled ? 0.3 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      transition:"all 0.15s", position:"relative",
    }}>
      <span style={{ fontSize:sz.rankSize, fontWeight:700, alignSelf:"flex-start",
        color: isRed ? "#c0392b" : "#111", lineHeight:1 }}>{card.rank}</span>
      <span style={{ fontSize:sz.suitSize, color: isRed ? "#c0392b" : "#111",
        lineHeight:1 }}>{card.suit}</span>
      <span style={{ fontSize:sz.rankSize, fontWeight:700, alignSelf:"flex-end",
        color: isRed ? "#c0392b" : "#111", lineHeight:1,
        transform:"rotate(180deg)" }}>{card.rank}</span>
    </button>
  );
}
