---
tags:
  - reviewed
aliases:
  - ENUM
  - enums
---
**ENUM** — a MySQL column type that allows only a fixed list of values, set when the table is created, e.g. `ENUM('1-0','0-1','1/2-1/2')`.

* Each row stores the value's number in the list, not the text: 1 byte for up to 255 values. Queries still show and compare the word.
* MySQL refuses any value outside the list, so a typo or a bug cannot slip in.
* Sorting follows the order of the list, not the alphabet.

To allow a new value, e.g. a seventh `stop_reason`, you cannot just insert it: first add it to the list with `ALTER TABLE`.
