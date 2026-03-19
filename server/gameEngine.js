const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

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
    const ofRank = deck.filter(c => c.rank === rank);
    for (const card of ofRank) {
      if (deck.length % n === 0) break;
      deck = deck.filter(c => c.id !== card.id);
      removed.push(card);
    }
  }
  return { deck, removed };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealCards(deck, n) {
  const shuffled = shuffle(deck);
  const perPlayer = shuffled.length / n;
  return Array.from({ length: n }, (_, i) =>
    shuffled.slice(i * perPlayer, (i + 1) * perPlayer)
  );
}

// sequence: A1,B1,A2,B2,...
function buildSequence(players) {
  const teamA = players.filter(p => p.team === "A").sort((a, b) => a.seat - b.seat);
  const teamB = players.filter(p => p.team === "B").sort((a, b) => a.seat - b.seat);
  const seq = [];
  for (let i = 0; i < teamA.length; i++) {
    if (teamA[i]) seq.push(teamA[i].id);
    if (teamB[i]) seq.push(teamB[i].id);
  }
  return seq;
}

function cardPower(card, ledSuit, hukumSuit) {
  if (hukumSuit && card.suit === hukumSuit) return 1000 + RANK_VALUE[card.rank];
  if (card.suit === ledSuit) return RANK_VALUE[card.rank];
  return 0;
}

function trickWinner(trick, ledSuit, hukumSuit) {
  let best = trick[0];
  for (const t of trick.slice(1))
    if (cardPower(t.card, ledSuit, hukumSuit) > cardPower(best.card, ledSuit, hukumSuit))
      best = t;
  return best.playerId;
}

function legalCards(hand, currentTrick, hukumRevealed, hukumCard) {
  if (!hand || hand.length === 0) return [];
  if (currentTrick.length === 0) return hand;
  const ledSuit = currentTrick[0].card.suit;
  const hasSuit = hand.some(c => c.suit === ledSuit);
  if (hasSuit) return hand.filter(c => c.suit === ledSuit);
  // Before hukum is revealed, all suits are treated equally — play any card.
  // The act of not following suit triggers the hukum reveal in playCard().
  return hand;
}

function initGame(players) {
  const n = players.length;
  const { deck, removed } = prepareDeck(n);
  const handsArr = dealCards(deck, n);
  const sequence = buildSequence(players);
  const handMap = {};
  sequence.forEach((pid, i) => { handMap[pid] = handsArr[i]; });

  const hukumHolderIdx = Math.floor(Math.random() * sequence.length);
  const hukumHolderId = sequence[hukumHolderIdx];
  const hukumHolderHand = handMap[hukumHolderId];
  const hukumCardIdx = Math.floor(Math.random() * hukumHolderHand.length);
  const hukumCard = hukumHolderHand[hukumCardIdx];

  return {
    phase: "playing",
    n,
    sequence,
    hands: handMap,
    hukumHolderId,
    hukumCard,
    hukumSuit: null,
    hukumRevealed: false,
    currentLeaderId: hukumHolderId,
    currentTurnInTrick: 0,
    currentTrick: [],
    tricksTaken: { A: 0, B: 0 },
    tensTaken: { A: 0, B: 0 },
    removedCards: removed,
    lastAction: null,
    paused: false,
    pausedFor: null,
  };
}

function playCard(state, playerId, card, players) {
  const leaderPos = state.sequence.indexOf(state.currentLeaderId);
  const expectedId = state.sequence[(leaderPos + state.currentTurnInTrick) % state.n];
  if (expectedId !== playerId) return { error: "Not your turn" };

  const hand = state.hands[playerId];
  if (!hand || !hand.find(c => c.id === card.id)) return { error: "Card not in hand" };

  const legal = legalCards(hand, state.currentTrick, state.hukumRevealed, state.hukumCard);
  if (!legal.find(c => c.id === card.id)) return { error: "Illegal card" };

  const s = JSON.parse(JSON.stringify(state));
  s.hands[playerId] = s.hands[playerId].filter(c => c.id !== card.id);

  let hukumTriggered = false;
  if (!s.hukumRevealed && s.currentTrick.length > 0) {
    const ledSuit = s.currentTrick[0].card.suit;
    const hadSuit = hand.some(c => c.suit === ledSuit);
    if (!hadSuit) {
      s.hukumRevealed = true;
      s.hukumSuit = s.hukumCard.suit;
      hukumTriggered = true;
    }
  }

  s.currentTrick.push({ playerId, card });
  s.lastAction = { type: "card_played", playerId, card, hukumTriggered, hukumSuit: s.hukumSuit };

  if (s.currentTrick.length === s.n) {
    const ledSuit = s.currentTrick[0].card.suit;
    const winnerId = trickWinner(s.currentTrick, ledSuit, s.hukumSuit);
    const winnerPlayer = players.find(p => p.id === winnerId);
    const winTeam = winnerPlayer ? winnerPlayer.team : "A";

    s.tricksTaken[winTeam]++;
    const tensInTrick = s.currentTrick.filter(t => t.card.rank === "10").length;
    s.tensTaken[winTeam] += tensInTrick;

    s.lastAction = {
      type: "trick_won",
      playerId, card, hukumTriggered, hukumSuit: s.hukumSuit,
      trickWinnerId: winnerId,
      trickWinnerTeam: winTeam,
      tensCollected: tensInTrick,
      completedTrick: s.currentTrick,
    };

    s.currentTrick = [];
    s.currentTurnInTrick = 0;
    s.currentLeaderId = winnerId;

    const totalRemaining = Object.values(s.hands).reduce((sum, h) => sum + h.length, 0);
    if (totalRemaining === 0) {
      s.phase = "game_over";
      let winner;
      if (s.tensTaken.A > s.tensTaken.B) winner = "A";
      else if (s.tensTaken.B > s.tensTaken.A) winner = "B";
      else if (s.tricksTaken.A > s.tricksTaken.B) winner = "A";
      else if (s.tricksTaken.B > s.tricksTaken.A) winner = "B";
      else winner = "draw";
      s.winner = winner;
      s.lastAction.type = "game_over";
      s.lastAction.winner = winner;
    }
  } else {
    s.currentTurnInTrick++;
  }

  return { state: s };
}

function getCurrentTurnId(state) {
  const leaderPos = state.sequence.indexOf(state.currentLeaderId);
  return state.sequence[(leaderPos + state.currentTurnInTrick) % state.n];
}

function getLegalCards(state, playerId) {
  return legalCards(state.hands[playerId] || [], state.currentTrick, state.hukumRevealed, state.hukumCard);
}

module.exports = { initGame, playCard, getCurrentTurnId, getLegalCards, buildSequence };
