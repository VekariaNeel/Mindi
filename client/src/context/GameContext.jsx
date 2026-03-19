import { createContext, useContext, useReducer } from "react";

const GameContext = createContext(null);

const init = {
  page: "home",        // home | lobby | game | results
  roomCode: null,
  playerId: null,
  token: null,
  isLeader: false,
  isSpectator: false,
  playerName: null,
  room: null,          // public room info from server
  gameState: null,
  lastAction: null,
  gameOver: null,
  removedCards: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_PAGE":
      return { ...state, page: action.page };
    case "JOINED_ROOM":
      return {
        ...state,
        roomCode: action.roomCode,
        playerId: action.playerId,
        token: action.token,
        isLeader: action.isLeader,
        isSpectator: action.isSpectator,
        playerName: action.playerName,
        page: "lobby",
      };
    case "ROOM_UPDATE":
      return { ...state, room: action.room };
    case "GAME_STARTED":
      return {
        ...state,
        page: "game",
        removedCards: action.removedCards || [],
        gameOver: null,
        lastAction: null,
      };
    case "GAME_STATE":
      return { ...state, gameState: action.state };
    case "ACTION":
      return { ...state, lastAction: action.action };
    case "GAME_OVER":
      return { ...state, gameOver: action.data, page: "results" };
    case "BACK_TO_LOBBY":
      return {
        ...state,
        page: "lobby",
        gameState: null,
        gameOver: null,
        lastAction: null,
        removedCards: [],
      };
    case "RESET":
      return { ...init };
    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);
  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  return useContext(GameContext);
}
