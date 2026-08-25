---
tags:
  - processed
---
# G — Gemini move selection

## Status

Known: G is removed from the intended repertoire-generation architecture.

The project no longer uses Gemini, or any other generative AI, to choose repertoire moves.

The existing G flow is therefore obsolete rather than something to repair.

## What is being removed

The following behaviour is not part of the intended system:

- asking Gemini for Black's reply to White's first move
- building a chess-move prompt for Gemini
- sending the request to a Gemini model or local Gemini endpoint
- cleaning Gemini's returned move text
- checking whether Gemini's suggested move is legal
- returning the Gemini move as a repertoire choice
- falling back because the Gemini request failed

No generative-AI answer should determine which chess move enters the repertoire.

## Replacement behaviour

Move selection belongs to the normal repertoire-selection architecture.

Where the project deliberately fixes an opening move rather than selecting it through the normal human/engine process, that move uses the established `"Hardcoded Opening"` selection method.

G does not need a replacement chess-selection algorithm of its own.

## Why G is discarded

The original purpose of G was to let Gemini choose a specific opening response.

That responsibility no longer belongs to AI.

The rest of the project already has explicit rules for:

- human move candidates
- engine evaluation
- Local Deep Stockfish fallback and verification
- deliberately hardcoded opening moves

Adding a separate AI decision path would create another source of repertoire choices with different rules and weaker provenance.

Known: G is therefore discarded completely from move selection.

#roadmap Gemini may be used later for **translations**.

This future use is separate from chess move selection.

Gemini may help translate project content, explanations or other text, but it must not decide which chess moves belong in a repertoire.
