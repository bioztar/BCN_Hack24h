export { gamePlugin, GAME_WEB_DIST, type GameOptions } from "./plugin.js";
export { GAMES, GAME_IDS, isGameId, type GameId, type GameSpec } from "./games.js";
export { GameStore, dayOf, type LeaderboardEntry } from "./store.js";
export { issueToken, verifyToken, TOKEN_TTL_MS } from "./token.js";
export { parseScore, cleanName } from "./validate.js";
