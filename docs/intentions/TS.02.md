Known bug:

[^1]: #note The sweeper takes the lock in two separate steps — it checks, then creates — where the generator does it in one. Between those two steps a run could start and both would proceed. Tagged as a bug in [[TS.02]], where the two-step version lives.