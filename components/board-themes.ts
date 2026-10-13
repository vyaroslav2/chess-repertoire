// Boards and piece sets, from Lichess (SM.08, SM.09). Files in public/board and
// public/piece, licences in public/piece/COPYING.md. Both lists are in Lichess's order.

// Board name --> file extension. Each has a 64 × 32 thumbnail beside it, except
// newspaper: an SVG, its own thumbnail.
export const boards: Record<string, string> = {
  brown: "png",
  wood: "jpg",
  wood2: "jpg",
  wood3: "jpg",
  wood4: "jpg",
  maple: "jpg",
  maple2: "jpg",
  horsey: "jpg",
  leather: "jpg",
  blue: "png",
  blue2: "jpg",
  blue3: "jpg",
  canvas: "jpg",
  "blue-marble": "jpg",
  ic: "png",
  green: "png",
  marble: "jpg",
  "green-plastic": "png",
  olive: "jpg",
  grey: "jpg",
  metal: "jpg",
  newspaper: "svg",
  purple: "png",
  "purple-diag": "png",
  pink: "png",
};

// Piece set name --> file extension.
export const pieceSets: Record<string, string> = Object.fromEntries(
  [
    "cburnett", "merida", "alpha", "pirouetti", "chessnut", "chess7", "reillycraig", "companion",
    "riohacha", "kosal", "leipzig", "fantasy", "spatial", "celtic", "california", "caliente",
    "pixel", "firi", "rhosgfx", "maestro", "fresca", "cardinal", "gioco", "tatiana", "staunty",
    "cooke", "monarchy", "papercut", "minimal-warmth", "governor", "dubrovny", "shahi-ivory-brown",
    "icpieces", "mpchess", "kiwen-suwi", "totoy", "horsey", "anarcandy", "xkcd", "shapes", "letter",
    "disguised",
  ].map((name) => [name, name === "monarchy" ? "webp" : "svg"]),
);

export const defaultBoard = "newspaper";
export const defaultPieceSet = "merida";

export const boardUrl = (board: string) => `/board/${board}.${boards[board]}`;
export const thumbnailUrl = (board: string) =>
  boards[board] === "svg" ? boardUrl(board) : `/board/${board}.thumbnail.${boards[board]}`;
export const pieceUrl = (set: string, piece: string) => `/piece/${set}/${piece}.${pieceSets[set]}`;

const pieces = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"];

// Puts the board on <html>: data-board, and --board for globals.css.
export function applyBoard(board: string) {
  const root = document.documentElement;
  root.dataset.board = board;
  root.style.setProperty("--board", `url(${boardUrl(board)})`);
}

// Puts the piece set on <html>: data-piece-set, and --piece-wP … --piece-bK.
export function applyPieceSet(set: string) {
  const root = document.documentElement;
  root.dataset.pieceSet = set;
  for (const piece of pieces) root.style.setProperty(`--piece-${piece}`, `url(${pieceUrl(set, piece)})`);
}

// Saved in localStorage under these keys.
export const boardKey = "board";
export const pieceSetKey = "piece-set";

// Run in <head> before the first paint, so a saved choice never flashes the default.
// The same as applyBoard and applyPieceSet, in plain JS.
export const themeScript = `(function(){try{
var r=document.documentElement,B=${JSON.stringify(boards)},P=${JSON.stringify(pieceSets)},
b=localStorage.getItem("${boardKey}"),p=localStorage.getItem("${pieceSetKey}");
if(B.hasOwnProperty(b)){r.dataset.board=b;r.style.setProperty("--board","url(/board/"+b+"."+B[b]+")")}
if(P.hasOwnProperty(p)){r.dataset.pieceSet=p;${JSON.stringify(pieces)}.forEach(function(k){r.style.setProperty("--piece-"+k,"url(/piece/"+p+"/"+k+"."+P[p]+")")})}
}catch(e){}})()`;
