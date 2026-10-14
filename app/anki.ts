"use server";

// AK.07: Anki's reviewer runs the session, through AnkiConnect; the web app is its screen.
import { PrismaClient } from "@prisma/client";
import { lineEvals, lineOpenings } from "../lib/line-details";

const prisma = new PrismaClient();

const ankiConnectUrl = "http://localhost:8765";
const modelName = "Chess Repertoire";

export type AnkiCounts = { newCount: number; learnCount: number; reviewCount: number };
export type AnkiSession =
  | { status: "card"; card: any; counts: AnkiCounts }
  | { status: "done" }
  | { status: "error"; message: string };

class AnkiError extends Error {}

async function anki<T>(action: string, params: object = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ankiConnectUrl, {
      method: "POST",
      body: JSON.stringify({ action, version: 6, params }),
      cache: "no-store",
    });
  } catch {
    throw new AnkiError("Anki is not running. Start Anki, then reload."); // AK.14
  }
  const { result, error } = await response.json();
  if (error) throw new Error(`AnkiConnect ${action}: ${error}`);
  return result;
}

// AK.06: the deck is wherever our note type's cards are, whatever its name.
async function findDeck() {
  const cardIds = await anki<number[]>("findCards", { query: `note:"${modelName}"` });
  if (cardIds.length === 0) {
    const profile = await anki<string>("getActiveProfile");
    throw new AnkiError(`No ${modelName} cards in profile ${profile}. Open profile User test New in Anki, then reload.`);
  }
  const [card] = await anki<{ deckName: string }[]>("cardsInfo", { cards: [cardIds[0]] });
  return card.deckName;
}

type ReviewerCard = { cardId: number; modelName: string; deckName: string; fields: Record<string, { value: string }> };

// Anki's current card, or null when its reviewer is not on our deck.
async function reviewerCard(deckName: string) {
  try {
    const card = await anki<ReviewerCard | null>("guiCurrentCard");
    return card && card.modelName === modelName && card.deckName === deckName ? card : null;
  } catch (error) {
    if (error instanceof AnkiError) throw error;
    return null; // "Gui review is not currently active."
  }
}

// A field as plain text: Anki's editor may add tags and &nbsp;.
function plainText(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// AK.03: "1. e4 c6 2. d4" --> ["e4", "c6", "d4"]; "2... d5" --> ["d5"]
function sansOf(numbered: string) {
  return plainText(numbered).split(" ").filter(token => token !== "" && !/^\d+\.(\.\.)?$/.test(token));
}

// The card in the trainer's shape, with the line's evals and openings from the database (AK.11).
async function trainerCard(card: ReviewerCard) {
  const lineMoves = sansOf(card.fields.Line.value);
  const [answerSan] = sansOf(card.fields.Answer.value);
  const color = lineMoves.length % 2 === 0 ? "white" : "black";

  const node = await prisma.repertoireNode.findFirst({
    where: { displayPgn: lineMoves.join(" "), outgoingMoves: { some: { san: answerSan } } },
    include: { outgoingMoves: { where: { san: answerSan } } },
  });
  const targetMove = node?.outgoingMoves[0];

  let openingByPly: any[];
  let evalByPly: any[];
  if (node && targetMove) {
    const historyUcis = node.history === "" ? [] : node.history.split(/\s+/);
    openingByPly = await lineOpenings(node.repertoireId, node.history, targetMove);
    evalByPly = await lineEvals(node.repertoireId, historyUcis);
  } else {
    // Not in the database: the card's own opening, at the end of the line; no evals.
    openingByPly = Array(lineMoves.length + 1).fill(null);
    openingByPly[lineMoves.length] = { eco: null, openingName: plainText(card.fields.Opening.value), openingMetadataStatus: "PRESENT" };
    evalByPly = Array(lineMoves.length).fill(null);
  }

  return {
    id: `anki-${card.cardId}`,
    ankiCardId: card.cardId,
    lineMoves,
    targetMove: { san: answerSan, cp: targetMove?.cp ?? null, mate: targetMove?.mate ?? null },
    repertoire: { color },
    openingByPly,
    evalByPly,
  };
}

async function deckCounts(deckName: string): Promise<AnkiCounts> {
  const stats = await anki<Record<string, { name: string; new_count: number; learn_count: number; review_count: number }>>("getDeckStats", { decks: [deckName] });
  const deck = Object.values(stats).find(stat => stat.name === deckName);
  return { newCount: deck?.new_count ?? 0, learnCount: deck?.learn_count ?? 0, reviewCount: deck?.review_count ?? 0 };
}

// Anki's GUI calls return before the reviewer has moved on. Polls the
// reviewer's card until done() accepts it, for up to 3s.
async function waitForReviewer(deckName: string, done: (card: ReviewerCard | null, tick: number) => boolean | Promise<boolean>) {
  for (let tick = 0; tick < 30; tick++) {
    const card = await reviewerCard(deckName);
    if (await done(card, tick)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function cardReps(cardId: number) {
  const [info] = await anki<{ reps: number }[]>("cardsInfo", { cards: [cardId] });
  return info.reps;
}

// Anki's current card, starting its reviewer on the deck if need be.
async function nextCard(deckName: string): Promise<AnkiSession> {
  let card = await reviewerCard(deckName);
  if (!card) {
    await anki("guiDeckReview", { name: deckName });
    // Nothing due: the reviewer never starts, so this waits the full 1s.
    await waitForReviewer(deckName, (shown, tick) => shown !== null || tick >= 10);
    card = await reviewerCard(deckName);
  }
  if (!card) return { status: "done" };
  await anki("guiStartCardTimer"); // AK.09
  return { status: "card", card: await trainerCard(card), counts: await deckCounts(deckName) };
}

async function session(run: (deckName: string) => Promise<AnkiSession>): Promise<AnkiSession> {
  try {
    return await run(await findDeck());
  } catch (error) {
    if (error instanceof AnkiError) return { status: "error", message: error.message };
    console.error(`"[FAILED] ${(error as Error).message}"`);
    return { status: "error", message: (error as Error).message };
  }
}

export async function ankiNext() {
  return session(nextCard);
}

// AK.07: ease 1-4 is Again, Hard, Good, Easy.
export async function ankiGrade(cardId: number, ease: number) {
  return session(async deckName => {
    // AK.10: drop the grade if Anki has moved on to another card.
    const card = await reviewerCard(deckName);
    if (card?.cardId === cardId) {
      const repsBefore = await cardReps(cardId);
      await anki("guiShowAnswer");
      await anki("guiAnswerCard", { ease });
      // Wait for another card, or the end. The same card may rightly come
      // straight back (Again, nothing else due): then wait until the grade is
      // saved, plus 300ms for the reviewer to show it afresh.
      let savedTicks = 0;
      await waitForReviewer(deckName, async shown => {
        if (shown === null || shown.cardId !== cardId) return true;
        if (await cardReps(cardId) > repsBefore) savedTicks++;
        return savedTicks > 3;
      });
    }
    return nextCard(deckName);
  });
}

// AK.13: gradedCardId is the card of the grade to take back; it comes back.
export async function ankiUndo(gradedCardId: number) {
  return session(async deckName => {
    const repsBefore = await cardReps(gradedCardId);
    await anki("guiUndo");
    // The reviewer does not show the card again until Anki's window has focus,
    // so restart it once the undo is saved. The undone card heads the queue.
    await waitForReviewer(deckName, async () => await cardReps(gradedCardId) < repsBefore);
    await anki("guiDeckReview", { name: deckName });
    await waitForReviewer(deckName, shown => shown?.cardId === gradedCardId);
    return nextCard(deckName);
  });
}
