import { RemoteEngineEvaluation } from "../db/operations";

export type LichessMateContext =
  | { kind: "NO_MATE" }
  | {
      kind: "FORCED_MATE";
      shortestMateDistance: number;
      shortestMateMoves: Set<string>;
      fallbackUci: string;
      fallbackMate: number;
    };

export function analyseLichessMateSnapshot(
  evaluations: RemoteEngineEvaluation[]
): LichessMateContext {
  const seenUcis = new Set<string>();

  for (const ev of evaluations) {
    if (seenUcis.has(ev.uci)) {
      throw new Error("Duplicate UCI in engine result");
    }
    seenUcis.add(ev.uci);

    if (ev.mate !== null) {
      if (typeof ev.mate !== "number" || !Number.isFinite(ev.mate) || !Number.isInteger(ev.mate) || ev.mate === 0) {
        throw new Error("Invalid mate data: must be non-zero integer");
      }
      if (ev.cp !== null) {
        throw new Error("Invalid mate data: cannot have both cp and mate");
      }
    } else if (ev.cp !== null) {
      if (typeof ev.cp !== "number" || !Number.isFinite(ev.cp)) {
        throw new Error("Invalid cp data: must be finite number");
      }
    } else {
      throw new Error("Invalid evaluation: must have either cp or mate");
    }
  }

  // Black is looking for mate < 0.
  const blackMates = evaluations.filter((ev) => ev.mate !== null && ev.mate < 0);

  if (blackMates.length === 0) {
    return { kind: "NO_MATE" };
  }

  // Since Black mates are < 0, distance is the absolute value.
  let shortestMateDistance = Infinity;
  for (const ev of blackMates) {
    const dist = Math.abs(ev.mate!);
    if (dist < shortestMateDistance) {
      shortestMateDistance = dist;
    }
  }

  const shortestMateMoves = new Set<string>();
  let fallbackUci = "";
  let fallbackMate = 0;

  for (const ev of evaluations) {
    if (ev.mate !== null && ev.mate < 0 && Math.abs(ev.mate) === shortestMateDistance) {
      shortestMateMoves.add(ev.uci);
      if (fallbackUci === "") {
        fallbackUci = ev.uci;
        fallbackMate = ev.mate;
      }
    }
  }

  return {
    kind: "FORCED_MATE",
    shortestMateDistance,
    shortestMateMoves,
    fallbackUci,
    fallbackMate
  };
}

export type MateVerificationResult = "ACCEPT" | "REJECT";

export function verifyCandidateAgainstLichessMate(
  candidateUci: string,
  mateContext: Extract<LichessMateContext, { kind: "FORCED_MATE" }>
): MateVerificationResult {
  if (mateContext.shortestMateMoves.has(candidateUci)) {
    return "ACCEPT";
  }
  return "REJECT";
}
