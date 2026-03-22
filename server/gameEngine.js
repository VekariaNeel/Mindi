const SUITS     = ["♠","♥","♦","♣"];
const RANKS     = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VAL  = Object.fromEntries(RANKS.map((r,i) => [r, i+2]));

// ── DECK ──────────────────────────────────────────────────────
function buildDecks(numDecks) {
  const cards = [];
  for (let d = 0; d < numDecks; d++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ suit, rank, id: `${rank}${suit}-${d}` });
  return cards;
}

function prepareDeck(n) {
  const numDecks = Math.floor(n / 4);
  let deck = buildDecks(numDecks);
  const removed = [];
  for (const rank of RANKS) {
    if (deck.length % n === 0) break;
    for (const card of deck.filter(c => c.rank === rank)) {
      if (deck.length % n === 0) break;
      deck = deck.filter(c => c.id !== card.id);
      removed.push(card);
    }
  }
  return { deck, removed };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}

// ── SEQUENCE: A1→B1→A2→B2→... ────────────────────────────────
function buildSequence(teamA, teamB) {
  const seq = [];
  const len = Math.max(teamA.length, teamB.length);
  for (let i = 0; i < len; i++) {
    if (i < teamA.length) seq.push(teamA[i]);
    if (i < teamB.length) seq.push(teamB[i]);
  }
  return seq;
}

// ── CARD PRIORITY ─────────────────────────────────────────────
function cardPower(card, ledSuit, hukumSuit) {
  if (hukumSuit && card.suit === hukumSuit) return 1000 + RANK_VAL[card.rank];
  if (card.suit === ledSuit) return RANK_VAL[card.rank];
  return 0;
}

function trickWinner(trick, ledSuit, hukumSuit) {
  let best = trick[0];
  for (const t of trick.slice(1))
    if (cardPower(t.card, ledSuit, hukumSuit) > cardPower(best.card, ledSuit, hukumSuit))
      best = t;
  return best.playerId;
}

// ── LEGAL CARDS ───────────────────────────────────────────────
// Rules:
// 1. Must follow led suit if possible
// 2. Can't follow led suit + HUKUM NOT YET revealed (this is the reveal moment)
//    → must play hukum suit if they have it, else play freely
// 3. Can't follow led suit + HUKUM ALREADY revealed (previous trick)
//    → play any card freely (no obligation to play hukum ever again)
function getLegalCards(hand, currentTrick, hukumRevealed, hukumCard, hukumJustRevealed=false) {
  if (!hand || hand.length === 0) return [];
  if (!currentTrick || currentTrick.length === 0) return hand;

  const ledSuit   = currentTrick[0].card.suit;
  const hukumSuit = hukumCard?.suit;

  // Rule 1: Must follow led suit
  const hasSuit = hand.some(c => c.suit === ledSuit);
  if (hasSuit) return hand.filter(c => c.suit === ledSuit);

  // Rule 2: Can't follow suit — check hukum obligation
  // hukumJustRevealed = true means this is the exact moment of reveal
  // → player must play hukum suit if they have it (one-time only)
  // After this turn, hukumJustRevealed resets to false → play freely
  if ((hukumJustRevealed || !hukumRevealed) && hukumSuit) {
    const hasHukum = hand.some(c => c.suit === hukumSuit);
    if (hasHukum) return hand.filter(c => c.suit === hukumSuit);
  }

  // Rule 3: play freely
  return hand;
}

// ── INIT GAME ─────────────────────────────────────────────────
function initGame(teamA, teamB) {
  const allPlayers = [...teamA, ...teamB];
  const n          = allPlayers.length;
  const { deck, removed } = prepareDeck(n);
  const shuffled   = shuffle(deck);
  const perPlayer  = shuffled.length / n;
  const sequence   = buildSequence(teamA, teamB);

  const hands = {};
  sequence.forEach((pid, i) => {
    hands[pid] = shuffled.slice(i * perPlayer, (i+1) * perPlayer);
  });

  const hukumHolderIdx = Math.floor(Math.random() * n);
  const hukumHolderId  = sequence[hukumHolderIdx];
  const holderHand     = hands[hukumHolderId];
  const hukumCard      = holderHand[Math.floor(Math.random() * holderHand.length)];

  return {
    phase: "playing",
    n, teamA, teamB, allPlayers, sequence, hands,
    hukumHolderId, hukumCard,
    hukumSuit: null, hukumRevealed: false, hukumJustRevealed: false,
    currentLeaderId:    hukumHolderId,
    currentTurnInTrick: 0,
    currentTrick: [],
    tens:      { A: 0, B: 0 },
    tricks:    { A: 0, B: 0 },
    wonCards:  { A: [], B: [] },  // all cards won per team
    removedCards: removed,
    lastEvent: null,
    winner:    null,
  };
}

// ── CURRENT TURN ──────────────────────────────────────────────
function getCurrentTurn(game) {
  const leaderPos = game.sequence.indexOf(game.currentLeaderId);
  return game.sequence[(leaderPos + game.currentTurnInTrick) % game.n];
}

// ── PROCESS A CARD PLAY ───────────────────────────────────────
function processPlay(game, playerId, card, playerName) {
  if (getCurrentTurn(game) !== playerId)
    return { error: "Not your turn" };

  const hand = game.hands[playerId];
  if (!hand || !hand.find(c => c.id === card.id))
    return { error: "Card not in hand" };

  const legal = getLegalCards(hand, game.currentTrick, game.hukumRevealed, game.hukumCard);
  if (!legal.find(c => c.id === card.id))
    return { error: "Illegal card — must follow suit or play hukum" };

  // Remove card from hand
  game.hands[playerId] = hand.filter(c => c.id !== card.id);

  // Hukum is ALWAYS revealed before this play via checkHukumTrigger in server/index.js
  // Clear the just-revealed flag now that this player has played their card
  game.hukumJustRevealed = false;
  game.currentTrick.push({ playerId, playerName, card });

  game.lastEvent = {
    type: "card_played",
    playerId, playerName, card,
    hukumJustRevealed: false,
    hukumSuit: game.hukumSuit,
    hukumCard: null,
  };

  // ── Trick complete? ──────────────────────────────────────────
  if (game.currentTrick.length === game.n) {
    const ledSuit  = game.currentTrick[0].card.suit;
    const winnerId = trickWinner(game.currentTrick, ledSuit, game.hukumSuit);
    const winTeam  = game.teamA.includes(winnerId) ? "A" : "B";
    game.tricks[winTeam]++;
    const tensCount = game.currentTrick.filter(t => t.card.rank === "10").length;
    game.tens[winTeam] += tensCount;
    game.wonCards[winTeam].push(...game.currentTrick.map(t => t.card));

    game.lastEvent = {
      type: "trick_complete",
      playerId, playerName, card,
      hukumSuit:      game.hukumSuit,
      trick:          [...game.currentTrick],
      winnerId, winTeam, tensCollected: tensCount,
      winnerName: game.currentTrick.find(t => t.playerId === winnerId)?.playerName || "",
    };

    game.currentTrick       = [];
    game.currentTurnInTrick = 0;
    game.currentLeaderId    = winnerId;

    // Game over?
    const remaining = game.allPlayers.reduce((s, pid) => s + game.hands[pid].length, 0);
    if (remaining === 0) {
      game.phase  = "game_over";
      game.winner = game.tens.A > game.tens.B ? "A"
                  : game.tens.B > game.tens.A ? "B"
                  : game.tricks.A >= game.tricks.B ? "A" : "B";
      game.lastEvent.type   = "game_over";
      game.lastEvent.winner = game.winner;
      game.lastEvent.tens   = { ...game.tens };
      game.lastEvent.tricks = { ...game.tricks };
    }
  } else {
    game.currentTurnInTrick++;
  }

  return { success: true };
}

// ── SANITIZE FOR CLIENT ───────────────────────────────────────
function sanitizeForPlayer(game, playerId) {
  const isHukumHolder = game.hukumHolderId === playerId;

  // HUKUM holder cannot see their hidden card until revealed
  let myHand = game.hands[playerId] || [];
  if (isHukumHolder && !game.hukumRevealed) {
    myHand = myHand.filter(c => c.id !== game.hukumCard.id);
  }

  return {
    phase:          game.phase,
    n:              game.n,
    teamA:          game.teamA,
    teamB:          game.teamB,
    sequence:       game.sequence,
    currentTurn:    getCurrentTurn(game),
    currentLeaderId:game.currentLeaderId,
    myHand,
    hukumRevealed:      game.hukumRevealed,
    hukumJustRevealed:  game.hukumJustRevealed,
    hukumSuit:          game.hukumSuit,
    isHukumHolder,
    currentTrick:   game.currentTrick,
    tens:           game.tens,
    tricks:         game.tricks,
    wonCards:       game.wonCards,
    handSizes:      Object.fromEntries(game.allPlayers.map(pid => [pid, game.hands[pid]?.length ?? 0])),
    removedCards:   game.removedCards,
    lastEvent:      game.lastEvent,
    winner:         game.winner,
  };
}

function sanitizeForSpectator(game) {
  return {
    phase:          game.phase,
    n:              game.n,
    teamA:          game.teamA,
    teamB:          game.teamB,
    currentTurn:    getCurrentTurn(game),
    hukumRevealed:  game.hukumRevealed,
    hukumSuit:      game.hukumSuit,
    currentTrick:   game.currentTrick,
    tens:           game.tens,
    tricks:         game.tricks,
    wonCards:       game.wonCards,
    handSizes:      Object.fromEntries(game.allPlayers.map(pid => [pid, game.hands[pid]?.length ?? 0])),
    lastEvent:      game.lastEvent,
    winner:         game.winner,
  };
}


// ── CHECK IF NEXT PLAYER TRIGGERS HUKUM ──────────────────────
// Called after each card play. If it's mid-trick and the next
// player has no led suit cards and hukum not yet revealed,
// we reveal hukum NOW before they play so they see it first.
function checkHukumTrigger(game) {
  // Only relevant mid-trick and before hukum is revealed
  if (game.hukumRevealed) return null;
  if (game.currentTrick.length === 0) return null; // between tricks

  const ledSuit   = game.currentTrick[0].card.suit;
  const nextPlayer = getCurrentTurn(game);
  const nextHand   = game.hands[nextPlayer];

  if (!nextHand || nextHand.some(c => c.suit === ledSuit)) return null;

  // Next player has no led suit → reveal hukum now
  game.hukumRevealed      = true;
  game.hukumSuit          = game.hukumCard.suit;
  game.hukumJustRevealed  = true; // cleared after this player plays

  return {
    type:       "hukum_auto_revealed",
    nextPlayerId: nextPlayer,
    hukumCard:  game.hukumCard,
    hukumSuit:  game.hukumSuit,
  };
}

module.exports = {
  initGame, processPlay, getCurrentTurn,
  getLegalCards, checkHukumTrigger,
  sanitizeForPlayer, sanitizeForSpectator,
};
