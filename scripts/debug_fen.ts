import { Chess } from "chess.js";

async function main() {
  const chess = new Chess();
  const moves = ["d4", "d5", "Nc3", "c6", "e4", "a6", "Bf4"];
  for (const m of moves) chess.move(m);
  
  const fen = chess.fen();
  console.log("FEN:", fen);
  
  const strippedFen = fen.split(" ").slice(0, 4).join(" ");
  
  // Test masters
  const mastersUrl = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(strippedFen)}`;
  const mRes = await fetch(mastersUrl);
  console.log("Masters Status:", mRes.status);
  if (mRes.ok) {
    const mData = await mRes.json();
    console.log("Masters Moves:", mData.moves.length);
  }

  // Test cloud eval
  const cloudUrl = `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(strippedFen)}&multiPv=5`;
  const cRes = await fetch(cloudUrl);
  console.log("Cloud Eval Status:", cRes.status);
  if (cRes.ok) {
    const cData = await cRes.json();
    console.log("Cloud Eval:", cData);
  } else {
    console.log("Cloud Eval Error Text:", await cRes.text());
  }
}

main();
