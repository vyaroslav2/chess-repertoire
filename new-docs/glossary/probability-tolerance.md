---
tags:
  - glossary
  - reviewed
aliases:
  - probabilityTolerance
  - tolerance
---
**`probabilityTolerance`** — how far apart two probabilities can be and still count as equal: 0.0001% (0.000001 as a fraction). See [[generation-config]].

Computers store probabilities as floats, and each sum adds a very small error. A total that should be exactly 100% may come out as 99.99999998%. So the checks do not test for exact equality. They test "within 0.0001%".

The tolerance is absolute, not relative. 99.99995% passes as 100%, but 99.9998% fails.

Probabilities are never rounded, so the error stays far below this limit ([[file-naming]], rule 11).

Not the same as [[tiny-threshold|tinyThreshold]], which drops a very small gain during a cascade. That gain is counted in `tinyDroppedTotal`, so it is not lost.