# Tree-walker - MOCK MODE with the full TR transposition/cascade logic.
# FENs are random 3-letter placeholders, not real chess. The 7 transpositions
# are hardcoded to fire (their pair shares a key); every other node gets a
# unique key, so no other collisions occur. The TR logic below is the real
# thing - only the source of positionKey (mock table vs. chess.Board) differs.
#
# Box IDs in comments refer to the TR flowchart.

RAW_NODES = [
    (1, "d2d4", 24.682),
    (1, "e2e4", 64.383),
    (2, "d2d4 d7d5 c1f4", 19.532),
    (2, "d2d4 d7d5 b1c3", 5.7),
    (2, "d2d4 d7d5 g1f3", 15.614),
    (2, "d2d4 d7d5 c2c4", 43.177),
    (2, "d2d4 d7d5 e2e3", 8.219),
    (2, "e2e4 c7c6 f1c4", 6.93),
    (2, "e2e4 c7c6 b1c3", 5.705),
    (2, "e2e4 c7c6 g1f3", 26.396),
    (2, "e2e4 c7c6 d2d4", 49.753),
    (3, "d2d4 d7d5 c1f4 h7h5 b1c3", 5.976),
    (3, "d2d4 d7d5 c1f4 h7h5 g1f3", 22.38),
    (3, "d2d4 d7d5 c1f4 h7h5 e2e3", 39.574),
    (3, "d2d4 d7d5 c1f4 h7h5 h2h3", 18.892),
    (3, "d2d4 d7d5 c1f4 h7h5 h2h4", 10.243),
    (3, "d2d4 d7d5 b1c3 c7c6 c1f4", 45.912),
    (3, "d2d4 d7d5 b1c3 c7c6 g1f3", 15.745),
    (3, "d2d4 d7d5 b1c3 c7c6 e2e4", 23.716),
    (3, "d2d4 d7d5 g1f3 c7c6 c1f4", 26.401),
    (3, "d2d4 d7d5 g1f3 c7c6 b1c3", 6.215),
    (3, "d2d4 d7d5 g1f3 c7c6 c2c4", 17.716),
    (3, "d2d4 d7d5 g1f3 c7c6 e2e3", 24.886),
    (3, "d2d4 d7d5 g1f3 c7c6 g2g3", 11.208),
    (3, "d2d4 d7d5 c2c4 d5c4 b1c3", 31.546),
    (3, "d2d4 d7d5 c2c4 d5c4 g1f3", 8.144),
    (3, "d2d4 d7d5 c2c4 d5c4 e2e3", 29.879),
    (3, "d2d4 d7d5 c2c4 d5c4 e2e4", 26.14),
    (3, "d2d4 d7d5 e2e3 c8f5 f1d3", 29.197),
    (3, "d2d4 d7d5 e2e3 c8f5 g1f3", 20.211),
    (3, "d2d4 d7d5 e2e3 c8f5 c2c4", 23.088),
    (3, "d2d4 d7d5 e2e3 c8f5 f2f4", 6.561),
    (3, "e2e4 c7c6 f1c4 d7d5 e4d5", 95.623),
    (3, "e2e4 c7c6 b1c3 d7d5 g1f3", 28.408),
    (3, "e2e4 c7c6 b1c3 d7d5 d2d4", 12.078),
    (3, "e2e4 c7c6 b1c3 d7d5 e4d5", 44.82),
    (3, "e2e4 c7c6 g1f3 g7g6 f1c4", 23.257),
    (3, "e2e4 c7c6 g1f3 g7g6 b1c3", 13.223),
    (3, "e2e4 c7c6 g1f3 g7g6 d2d4", 50.736),
    (3, "e2e4 c7c6 d2d4 d7d5 b1c3", 20.7),
    (3, "e2e4 c7c6 d2d4 d7d5 e4e5", 43.457),
    (3, "e2e4 c7c6 d2d4 d7d5 e4d5", 27.494),
    (4, "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 c3b5", 17.742),
    (4, "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 g1f3", 14.839),
    (4, "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 e2e3", 36.935),
    (4, "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 f2f3", 9.516),
    (4, "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 h2h3", 11.935),
    (4, "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 b1d2", 5.635),
    (4, "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 e2e3", 59.813),
    (4, "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 h2h3", 20.443),
    (4, "d2d4 d7d5 c1f4 h7h5 e2e3 e7e5 f4e5", 54.486),
    (4, "d2d4 d7d5 c1f4 h7h5 e2e3 e7e5 d4e5", 41.897),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 g1f3", 7.251),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 c2c3", 23.867),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 d4c5", 7.402),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 e2e3", 58.912),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 g1f3", 6.87),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 c2c3", 21.374),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 d4c5", 7.125),
    (4, "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 e2e3", 61.069),
    (4, "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 c3a4", 25.707),
    (4, "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 a1b1", 33.044),
    (4, "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 a2a3", 5.321),
    (4, "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 b2b3", 15.43),
    (4, "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 e2e3", 7.029),
    (4, "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 b1d2", 20.338),
    (4, "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 f3e5", 8.727),
    (4, "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 e2e3", 58.559),
    (4, "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 h2h3", 6.9),
    (4, "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 c1f4", 44.217),
    (4, "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 e2e3", 22.831),
    (4, "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 h2h3", 9.384),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 c1f4", 7.07),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 b1c3", 35.669),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 a2a4", 6.669),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 c4d5", 15.116),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 e2e3", 16.634),
    (4, "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 g2g3", 9.912),
    (4, "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 f1d3", 14.244),
    (4, "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 f1e2", 33.625),
    (4, "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 b1d2", 16.518),
    (4, "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 c2c4", 17.293),
    (4, "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 h2h3", 12.624),
    (4, "d2d4 d7d5 g1f3 c7c6 g2g3 c8f5 f1g2", 92.791),
    (4, "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 g1f3", 6.671),
    (4, "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 a2a4", 46.65),
    (4, "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 e2e3", 11.91),
    (4, "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 e2e4", 24.962),
    (4, "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 b1c3", 57.385),
    (4, "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 d1a4", 7.431),
    (4, "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 e2e3", 24.826),
    (4, "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 g2g3", 5.212),
    (4, "d2d4 d7d5 c2c4 d5c4 e2e3 b8c6 f1c4", 93.718),
    (4, "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 b1c3", 29.14),
    (4, "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 g1f3", 7.617),
    (4, "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 a2a4", 53.108),
    (4, "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 d3f5", 55.797),
    (4, "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 g1f3", 10.687),
    (4, "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 f2f4", 17.649),
    (4, "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 f1d3", 33.671),
    (4, "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 f1e2", 8.064),
    (4, "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 b1d2", 7.732),
    (4, "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 a2a3", 9.514),
    (4, "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 c2c4", 24.099),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 b1c3", 32.374),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 g1f3", 14.217),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 d1b3", 6.694),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 a2a3", 14.624),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 c4c5", 12.18),
    (4, "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 c4d5", 14.128),
    (4, "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 f1d3", 20.679),
    (4, "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 g1f3", 64.15),
    (4, "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 c2c3", 5.152),
    (4, "e2e4 c7c6 f1c4 d7d5 e4d5 c6d5 c4b3", 68.542),
    (4, "e2e4 c7c6 f1c4 d7d5 e4d5 c6d5 c4b5", 28.02),
    (4, "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 d2d3", 5.491),
    (4, "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 d2d4", 44.219),
    (4, "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 e4d5", 31.518),
    (4, "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 h2h3", 6.116),
    (4, "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 f1b5", 10.45),
    (4, "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 g1f3", 8.818),
    (4, "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 d2d4", 73.267),
    (4, "e2e4 c7c6 g1f3 g7g6 f1c4 d7d5 e4d5", 95.802),
    (4, "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 d2d3", 6.123),
    (4, "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 d2d4", 43.492),
    (4, "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 e4e5", 6.724),
    (4, "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 e4d5", 33.79),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1c4", 16.951),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1d3", 13.382),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1e2", 5.366),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c1e3", 6.118),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 b1c3", 27.719),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c2c3", 6.608),
    (4, "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c2c4", 12.609),
    (4, "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 f1d3", 10.942),
    (4, "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 c1f4", 6.297),
    (4, "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 g1f3", 36.881),
    (4, "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 e4e5", 16.01),
    (4, "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 e4d5", 15.0),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 f1d3", 11.69),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 b1c3", 6.285),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 g1f3", 38.306),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 c2c3", 9.299),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 c2c4", 9.366),
    (4, "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 f2f4", 13.17),
    (4, "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 b1c3", 40.459),
    (4, "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 g1f3", 26.315),
    (4, "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 c2c4", 24.285),
]

MOCK_KEYS = {
    "d2d4": "uda",
    "d2d4 d7d5 c1f4": "xih",
    "d2d4 d7d5 c1f4 h7h5 b1c3": "hex",
    "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 c3b5": "dvx",
    "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 g1f3": "rcs",
    "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 e2e3": "nba",
    "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 f2f3": "cgh",
    "d2d4 d7d5 c1f4 h7h5 b1c3 c8f5 h2h3": "qta",
    "d2d4 d7d5 c1f4 h7h5 g1f3": "rgw",
    "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 b1d2": "uwr",
    "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 e2e3": "nho",
    "d2d4 d7d5 c1f4 h7h5 g1f3 g8f6 h2h3": "siz",
    "d2d4 d7d5 c1f4 h7h5 e2e3": "ayz",
    "d2d4 d7d5 c1f4 h7h5 e2e3 e7e5 f4e5": "fwn",
    "d2d4 d7d5 c1f4 h7h5 e2e3 e7e5 d4e5": "kie",
    "d2d4 d7d5 c1f4 h7h5 h2h3": "gyk",
    "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 g1f3": "dcm",
    "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 c2c3": "dll",
    "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 d4c5": "tiz",
    "d2d4 d7d5 c1f4 h7h5 h2h3 c7c5 e2e3": "bxo",
    "d2d4 d7d5 c1f4 h7h5 h2h4": "rdm",
    "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 g1f3": "crj",
    "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 c2c3": "utl",
    "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 d4c5": "sgw",
    "d2d4 d7d5 c1f4 h7h5 h2h4 c7c5 e2e3": "cbv",
    "d2d4 d7d5 b1c3": "hyj",
    "d2d4 d7d5 b1c3 c7c6 c1f4": "chd",
    "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 c3a4": "mio",
    "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 a1b1": "ulf",
    "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 a2a3": "llg",
    "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 b2b3": "viw",
    "d2d4 d7d5 b1c3 c7c6 c1f4 d8b6 e2e3": "vuc",
    "d2d4 d7d5 b1c3 c7c6 g1f3": "bhb",
    "d2d4 d7d5 b1c3 c7c6 e2e4": "qfb",
    "d2d4 d7d5 g1f3": "tuf",
    "d2d4 d7d5 g1f3 c7c6 c1f4": "rxh",
    "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 b1d2": "fom",
    "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 f3e5": "iuw",
    "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 e2e3": "rhv",
    "d2d4 d7d5 g1f3 c7c6 c1f4 c8g4 h2h3": "kyy",
    "d2d4 d7d5 g1f3 c7c6 b1c3": "bhb",
    "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 c1f4": "zkm",
    "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 e2e3": "icg",
    "d2d4 d7d5 g1f3 c7c6 b1c3 c8f5 h2h3": "swk",
    "d2d4 d7d5 g1f3 c7c6 c2c4": "gup",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 c1f4": "muo",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 b1c3": "eie",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 a2a4": "hxr",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 c4d5": "rix",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 e2e3": "sns",
    "d2d4 d7d5 g1f3 c7c6 c2c4 a7a6 g2g3": "mlh",
    "d2d4 d7d5 g1f3 c7c6 e2e3": "eqp",
    "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 f1d3": "cyb",
    "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 f1e2": "deu",
    "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 b1d2": "fzv",
    "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 c2c4": "ntc",
    "d2d4 d7d5 g1f3 c7c6 e2e3 c8g4 h2h3": "mmt",
    "d2d4 d7d5 g1f3 c7c6 g2g3": "oqi",
    "d2d4 d7d5 g1f3 c7c6 g2g3 c8f5 f1g2": "rav",
    "d2d4 d7d5 c2c4": "xdv",
    "d2d4 d7d5 c2c4 d5c4 b1c3": "ryi",
    "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 g1f3": "yuk",
    "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 a2a4": "djn",
    "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 e2e3": "foa",
    "d2d4 d7d5 c2c4 d5c4 b1c3 a7a6 e2e4": "xxi",
    "d2d4 d7d5 c2c4 d5c4 g1f3": "qyf",
    "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 b1c3": "qdu",
    "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 d1a4": "juq",
    "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 e2e3": "tge",
    "d2d4 d7d5 c2c4 d5c4 g1f3 c8f5 g2g3": "lyf",
    "d2d4 d7d5 c2c4 d5c4 e2e3": "ryq",
    "d2d4 d7d5 c2c4 d5c4 e2e3 b8c6 f1c4": "atk",
    "d2d4 d7d5 c2c4 d5c4 e2e4": "pad",
    "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 b1c3": "lzj",
    "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 g1f3": "hbh",
    "d2d4 d7d5 c2c4 d5c4 e2e4 b7b5 a2a4": "scc",
    "d2d4 d7d5 e2e3": "xpc",
    "d2d4 d7d5 e2e3 c8f5 f1d3": "yry",
    "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 d3f5": "eev",
    "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 g1f3": "prf",
    "d2d4 d7d5 e2e3 c8f5 f1d3 e7e6 f2f4": "iqt",
    "d2d4 d7d5 e2e3 c8f5 g1f3": "ngr",
    "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 f1d3": "prf",
    "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 f1e2": "yxw",
    "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 b1d2": "gwj",
    "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 a2a3": "mvu",
    "d2d4 d7d5 e2e3 c8f5 g1f3 e7e6 c2c4": "hck",
    "d2d4 d7d5 e2e3 c8f5 c2c4": "loq",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 b1c3": "odh",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 g1f3": "hck",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 d1b3": "asr",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 a2a3": "hsh",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 c4c5": "acw",
    "d2d4 d7d5 e2e3 c8f5 c2c4 e7e6 c4d5": "ubh",
    "d2d4 d7d5 e2e3 c8f5 f2f4": "cbk",
    "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 f1d3": "iqt",
    "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 g1f3": "cqh",
    "d2d4 d7d5 e2e3 c8f5 f2f4 e7e6 c2c3": "ivp",
    "e2e4": "gre",
    "e2e4 c7c6 f1c4": "xss",
    "e2e4 c7c6 f1c4 d7d5 e4d5": "phz",
    "e2e4 c7c6 f1c4 d7d5 e4d5 c6d5 c4b3": "pzn",
    "e2e4 c7c6 f1c4 d7d5 e4d5 c6d5 c4b5": "gdd",
    "e2e4 c7c6 b1c3": "vnl",
    "e2e4 c7c6 b1c3 d7d5 g1f3": "nno",
    "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 d2d3": "xbv",
    "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 d2d4": "uud",
    "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 e4d5": "bmx",
    "e2e4 c7c6 b1c3 d7d5 g1f3 h7h6 h2h3": "kzd",
    "e2e4 c7c6 b1c3 d7d5 d2d4": "qfb",
    "e2e4 c7c6 b1c3 d7d5 e4d5": "hgg",
    "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 f1b5": "roe",
    "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 g1f3": "nfi",
    "e2e4 c7c6 b1c3 d7d5 e4d5 c6d5 d2d4": "ohc",
    "e2e4 c7c6 g1f3": "ozr",
    "e2e4 c7c6 g1f3 g7g6 f1c4": "dbu",
    "e2e4 c7c6 g1f3 g7g6 f1c4 d7d5 e4d5": "rac",
    "e2e4 c7c6 g1f3 g7g6 b1c3": "yhf",
    "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 d2d3": "npp",
    "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 d2d4": "gmb",
    "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 e4e5": "fma",
    "e2e4 c7c6 g1f3 g7g6 b1c3 d7d5 e4d5": "miz",
    "e2e4 c7c6 g1f3 g7g6 d2d4": "zoj",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1c4": "nwx",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1d3": "zrv",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 f1e2": "wpe",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c1e3": "gjg",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 b1c3": "bsx",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c2c3": "rbx",
    "e2e4 c7c6 g1f3 g7g6 d2d4 d7d6 c2c4": "kbb",
    "e2e4 c7c6 d2d4": "spq",
    "e2e4 c7c6 d2d4 d7d5 b1c3": "qfb",
    "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 f1d3": "qcf",
    "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 c1f4": "ctc",
    "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 g1f3": "vhm",
    "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 e4e5": "vss",
    "e2e4 c7c6 d2d4 d7d5 b1c3 a7a6 e4d5": "dsh",
    "e2e4 c7c6 d2d4 d7d5 e4e5": "stb",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 f1d3": "tcn",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 b1c3": "vss",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 g1f3": "qki",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 c2c3": "gvw",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 c2c4": "khi",
    "e2e4 c7c6 d2d4 d7d5 e4e5 a7a6 f2f4": "mev",
    "e2e4 c7c6 d2d4 d7d5 e4d5": "ujo",
    "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 b1c3": "kyc",
    "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 g1f3": "aot",
    "e2e4 c7c6 d2d4 d7d5 e4d5 d8d5 c2c4": "sdc",
}


# Keys that would read as column headings in the spreadsheet are not allowed.
BLOCKED_KEYS = {"fen", "pgn", "san", "uci", "row", "key"}
_bad = sorted(k for k in MOCK_KEYS.values() if k in BLOCKED_KEYS)
if _bad:
    raise SystemExit("HARD ERROR: reserved position key(s) in MOCK_KEYS: %s" % ", ".join(_bad))

# ---------------------------------------------------------------- settings
TINY_THRESHOLD = 0.00001    # 0.00001% - a gain smaller than this is dropped
TOUCH_CAP      = 500        # one node touched more than this in one cascade = loop
TOLERANCE      = 0.0001     # slack for floating-point comparisons, in %

# ---------------------------------------------------------------- raw input
by_history = {h: raw for (_mv, h, raw) in RAW_NODES}

def parent_history(history):
    """The White node one full move earlier ('e4 c6 d4' -> 'e4')."""
    t = history.split()
    return " ".join(t[:-2]) if len(t) > 1 else None

candidates = {}   # parent history (or None for the root) -> list of child histories
for (_mv, h, _raw) in RAW_NODES:
    candidates.setdefault(parent_history(h), []).append(h)

# ---------------------------------------------------------------- the tree
class Node:
    __slots__ = ("history", "key", "moveProb", "routeProb", "cumProb",
                 "transposesTo", "pointerEvent", "children", "parent", "order")
    def __init__(self, history, key, moveProb, routeProb, cumProb, parent, order):
        self.history      = history
        self.key          = key
        self.moveProb     = moveProb      # %
        self.routeProb    = routeProb     # % - frozen at creation, never touched again
        self.cumProb      = cumProb       # % - this is what the cascade moves around
        self.transposesTo = None          # None = canonical; otherwise the owner Node
        self.pointerEvent = None          # the event that emptied this node
        self.children     = []
        self.parent       = parent
        self.order        = order

nodes    = []    # every node, in creation order
registry = {}    # key -> owner Node (canonical nodes only)

log_lines        = []    # the roll-up of warnings, printed at the very end
repetition_stops = []
transpositions   = []
cascade_reports  = []

# ---------------------------------------------------------------- log layout
# Every cascade is written as one fixed-shape block:
#   header (TRANSPOSITION / FROM / TO / CASCADE)
#   numbered steps, one action each
#   UPDATED NODES
#   CASCADE END
# The vocabulary is fixed: APPLY, FORWARD, ENQUEUE, SKIP, STOP, ERROR.
# Warnings appear inline, on the step they belong to, prefixed "!!".

RULE_HEAVY = "=" * 80
RULE_LIGHT = "-" * 80

cascade_log = []          # formatted lines; printed after the tree dump

def out(line=""):
    cascade_log.append(line)

def pct(x):
    """A percentage, padded to a fixed width - for the UPDATED NODES table."""
    return "%9.3f%%" % x

def num(x):
    """A percentage, compact - for values and sums inside a step block."""
    return "%.3f%%" % x

def field(label, value):
    return "  %-11s %s" % (label + ":", value)

def step_line(state, text):
    """A step that only moves work: one line, no block."""
    state["step"] += 1
    out("[%02d] %s" % (state["step"], text))
    return state["step"]

def step(state, action, item_id, note, fields, warnings=None):
    """One numbered action block. Returns its step number."""
    state["step"] += 1
    tag = "" if item_id is None else "  #%d" % item_id
    out("[%02d] %-8s%s%s" % (state["step"], action, tag, note))
    for label, value in fields:
        out(field(label, value))
    for w in (warnings or []):
        out("  !! " + w)
    out()
    return state["step"]

def hard_error(msg):
    # Flush whatever has been written so far - otherwise the cascade that
    # caused the error would be lost, which is exactly what you need to read.
    for l in cascade_log:
        print(l)
    if log_lines:
        print()
        print("Warnings so far")
        for l in log_lines:
            print("  " + l)
    raise SystemExit("HARD ERROR: " + msg)

def ending_total():
    """TR: the sum of every cumProb ending in the tree, where an ending is a
    node nothing grows out of. Add up every one of them - no skipping."""
    return sum(n.cumProb for n in nodes if not n.children)

# ---------------------------------------------------------------- cascade
def cascade(from_node, to_node, event_no):
    """TR.09 - TR.19. Runs once, start to finish, before anything else happens."""

    # TR.09 - one hash for this whole transposition event
    event_hash = "TR%02d:%s->%s" % (event_no, from_node.history, to_node.history)
    event_id   = "TR%02d" % event_no

    # TR.23 - record the ending total; reset the per-cascade counters
    ending_before  = ending_total()
    tiny_counter   = 0
    tiny_dropped   = 0.0     # TR.37 - how much probability the drops cost
    touch_counts   = {}
    applied        = set()   # (event_hash, node) already handled - TR.13
    visited_list   = []      # (sender, receiver, gain, targetFEN) - TR.31
    visited_keys   = set()   # (sender, receiver, gain) - what TR.26 actually compares
    edge_gains     = {}      # (sender, receiver) -> gains already delivered - TR.39
    edge_repeats   = 0       # TR.40 - same edge used again with a different amount
    duplicates     = 0
    repeat_touches = 0       # TR.38 - every time a hash comes back to a node, dup or not
    deliveries     = 0

    # log bookkeeping
    state         = {"step": 0}
    item_counter  = {"n": 0}
    applies = forwards = enqueues = stops = 0
    before_values = {}       # node -> its cumProb before this cascade touched it

    def remember(node):
        if node not in before_values:
            before_values[node] = node.cumProb

    def new_item(node, gain, sender, queued_at):
        item_counter["n"] += 1
        return {"node": node, "gain": gain, "sender": sender, "hash": event_hash,
                "id": item_counter["n"], "queued_at": queued_at}

    # TR.10 - seed the worklist, then empty fromNode
    gain_for_to_node = from_node.cumProb

    # ---- header -----------------------------------------------------------
    out(RULE_HEAVY)
    out("TRANSPOSITION %s" % event_id)
    out(RULE_LIGHT)
    out("POINTER   %-34s fen=%-5s cumProb %s -> %s"
        % (from_node.history, from_node.key, num(gain_for_to_node), num(0.0)))
    out("OWNER     %-34s fen=%-5s cumProb %s"
        % (to_node.history, to_node.key, num(to_node.cumProb)))
    out("CASCADE   carrying=%s   endingTotal=%.4f%%"
        % (num(gain_for_to_node), ending_before))
    out(RULE_LIGHT)
    out()

    remember(from_node)
    worklist = [new_item(to_node, gain_for_to_node, from_node, None)]
    from_node.cumProb = 0.0

    while worklist:                                    # TR.18 (loop back TR.20)
        item = worklist.pop(0)                         # TR.11
        node, gain, sender = item["node"], item["gain"], item["sender"]
        origin = "" if item["queued_at"] is None else "  (queued at [%02d])" % item["queued_at"]

        # TR.24 - too small to matter; drop it
        if gain < TINY_THRESHOLD:
            tiny_counter += 1                          # TR.37
            tiny_dropped += gain
            step(state, "SKIP", item["id"], origin, [
                ("from", sender.history),
                ("node", node.history),
                ("carrying", num(gain)),
                ("reason", "below the tiny threshold (%.5f%%)" % TINY_THRESHOLD),
                ("queue", "%d waiting" % len(worklist)),
            ])
            continue

        pending = []

        # TR.13 - has this event already touched this node?
        if (event_hash, node) in applied:
            # TR.38 - unconditional trace: this hash is back at this node again.
            repeat_touches += 1
            pending.append("revisit: this event has already reached this node "
                           "(TR.38): touchCount[toNode]=%d" % touch_counts.get(node, 0))

            # TR.39 - same fromNode and toNode as before, but a different amount?
            edge = (sender.history, node.history)
            seen_on_edge = edge_gains.get(edge)
            if seen_on_edge and round(gain, 12) not in seen_on_edge:
                # TR.40 - informational. fromNode's touch count tells the two
                # cases apart: >1 is ordinary fan-out repeating, =1 should not
                # be possible from a single touch.
                edge_repeats += 1
                sender_touches = touch_counts.get(sender, 0)
                verdict = ("expected fan-out" if sender_touches > 1
                           else "SUSPECT - fromNode touched once")
                pending.append(
                    "same edge, different gain (TR.40): touchCount[fromNode]=%d, %s"
                    % (sender_touches, verdict))
                log_lines.append(
                    "[WARNING] same hash + fromNode + toNode, different gain: "
                    "fromNode=%s toNode=%s FEN=%s gainOnThisItem=%.9f%% "
                    "touchCount[fromNode]=%d (%s)"
                    % (sender.history, node.history, node.key, gain,
                       sender_touches, verdict))
            log_lines.append(
                "[WARNING] eventHash already applied to this node: "
                "fromNode=%s toNode=%s FEN=%s gainOnThisItem=%.9f%% "
                "touchCount[toNode]=%d"
                % (sender.history, node.history, node.key, gain,
                   touch_counts.get(node, 0)))

            # TR.26 - the identical delivery, same sender, same amount?
            if (sender.history, node.history, round(gain, 12)) in visited_keys:
                # TR.35 - log it, but apply it. An identical amount can arrive
                # honestly (two equal routes into the sender), and dropping it
                # would delete real probability. If it ever IS a true duplicate,
                # applying it raises the ending total and TR.27 stops the run -
                # a much louder signal than a silently deleted item.
                duplicates += 1
                sender_touches = touch_counts.get(sender, 0)
                verdict = ("plausible - fromNode touched %d times" % sender_touches
                           if sender_touches > 1 else "SUSPECT - fromNode touched once")
                pending.append(
                    "duplicate: same sender, node and amount (TR.35): "
                    "touchCount[fromNode]=%d, %s" % (sender_touches, verdict))
                log_lines.append(
                    "[WARNING] duplicate propagation attempt: %s -> %s FEN=%s "
                    "gain=%.9f%% touchCount[fromNode]=%d (%s)"
                    % (sender.history, node.history, node.key, gain,
                       sender_touches, verdict))

        # TR.32 - is this node a pointer?
        if node.transposesTo is not None:
            # TR.15 - hand the gain straight on; this node stays empty
            remember(node)
            forwards += 1
            s = step(state, "FORWARD", item["id"], origin, [
                ("node", "%s   [POINTER, %s]" % (node.history, node.pointerEvent)),
                ("owner", node.transposesTo.history),
                ("carrying", num(gain)),
                ("queue", "%d waiting" % (len(worklist) + 1)),
            ], pending)
            worklist.append(new_item(node.transposesTo, gain, node, s))
            node.cumProb = 0.0
        else:
            # TR.16 - absorb the gain
            remember(node)
            before = node.cumProb
            node.cumProb += gain
            applies += 1
            step(state, "APPLY", item["id"], origin, [
                ("from", sender.history),
                ("node", node.history),
                ("carrying", num(gain)),
                ("cumProb", "%s + %s -> %s"
                            % (num(before), num(gain), num(node.cumProb))),
                ("queue", "%d waiting" % len(worklist)),
            ], pending)
            # TR.33
            if node.cumProb > 100.0 + TOLERANCE:
                reason = "cumProb above 100%% (%.6f%%)" % node.cumProb
                step(state, "ERROR", item["id"], "", [
                    ("node", node.history),
                    ("reason", reason),
                ])
                hard_error("cumProb>100%% at %s (%.6f%%)" % (node.history, node.cumProb))

        # TR.31 - record the delivery
        visited_keys.add((sender.history, node.history, round(gain, 12)))
        edge_gains.setdefault((sender.history, node.history), set()).add(round(gain, 12))
        visited_list.append((sender.history, node.history, gain, node.key))
        deliveries += 1

        # TR.17 - mark, count the touch, push the children
        applied.add((event_hash, node))
        touch_counts[node] = touch_counts.get(node, 0) + 1

        if node.children:
            for child in node.children:
                child_gain = gain * child.moveProb / 100.0
                child_item = new_item(child, child_gain, node, None)
                enqueues += 1
                s = step_line(state, "ENQUEUE  #%d -> %-34s %8s x %8s = %8s   queue %d"
                              % (child_item["id"], child.history, num(gain),
                                 num(child.moveProb), num(child_gain), len(worklist) + 1))
                child_item["queued_at"] = s
                worklist.append(child_item)
            out()
        elif node.transposesTo is None:
            stops += 1

        # TR.36
        if touch_counts[node] > TOUCH_CAP:
            reason = "possible loop - touched %d times" % touch_counts[node]
            step(state, "ERROR", item["id"], "", [
                ("node", node.history),
                ("reason", reason),
            ])
            hard_error("possible loop: %s touched %d times"
                       % (node.history, touch_counts[node]))

    ending_after = ending_total()

    # ---- the final list of updated nodes ----------------------------------
    changes = []
    for node, before in before_values.items():
        delta = node.cumProb - before
        if abs(delta) > 1e-12:
            tag = "   (emptied, pointer)" if node.transposesTo is not None else ""
            changes.append((delta, node.cumProb, node.history, tag))
    changes.sort(key=lambda c: -abs(c[0]))

    out(RULE_LIGHT)
    out("UPDATED NODES  (%d)" % len(changes))
    out("  %10s %10s   %s" % ("cumProb", "change", "path"))
    for delta, after, hist, tag in changes:
        out("  %9.3f%% %+9.3f%%   %s%s" % (after, delta, hist, tag))
    out()

    # ---- the closing counters ---------------------------------------------
    out("CASCADE END  %s" % event_id)
    out("  steps:       %3d     applies: %d   forwards: %d   enqueues: %d"
        % (state["step"], applies, forwards, enqueues))
    out("  endings reached: %d" % stops)
    out("  tiny:        %3d     dropped %.9f%%" % (tiny_counter, tiny_dropped))
    out("  revisits:    %3d     refires: %d   duplicates: %d   max touches on one node: %d"
        % (repeat_touches, edge_repeats, duplicates,
           max(touch_counts.values()) if touch_counts else 0))
    out("  endingTotal: %.4f%% -> %.4f%%   (change %+.4f%%)"
        % (ending_before, ending_after, ending_after - ending_before))
    out(RULE_HEAVY)
    out()

    # TR.41 - probability may only leave the tree through TR.24
    lost = ending_before - ending_after
    unaccounted = lost - tiny_dropped
    if abs(unaccounted) > TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "probability went missing: the ending total fell %.9f%% "
                       "but only %.9f%% was discarded (unaccounted %.9f%%)"
                       % (lost, tiny_dropped, unaccounted)),
        ])
        hard_error("unaccounted probability in cascade %s: fell %.9f%%, "
                   "tiny-dropped %.9f%%" % (event_hash, lost, tiny_dropped))

    # TR.27
    if ending_after > ending_before + TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "ending total rose during this cascade: %.6f%% -> %.6f%%"
                       % (ending_before, ending_after)),
        ])
        hard_error("ending total rose during cascade %s: %.6f%% -> %.6f%%"
                   % (event_hash, ending_before, ending_after))
    # TR.30
    if ending_after > 100.0 + TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "ending total above 100%%: %.6f%%" % ending_after),
        ])
        hard_error("ending total above 100%%: %.6f%%" % ending_after)

    # TR.19
    cascade_reports.append({
        "event": event_id, "from": from_node.history, "to": to_node.history,
        "gain": gain_for_to_node, "before": ending_before, "after": ending_after,
        "deliveries": deliveries, "tiny": tiny_counter, "duplicates": duplicates,
        "repeat_touches": repeat_touches, "edge_repeats": edge_repeats,
        "tiny_dropped": tiny_dropped,
        "steps": state["step"],
        "updated": len(changes),
        "max_touch": max(touch_counts.values()) if touch_counts else 0,
    })

# ---------------------------------------------------------------- the walk
def line_keys(node):
    """Every position key already on this line, root down to this node."""
    seen, cur = set(), node
    while cur is not None:
        seen.add(cur.key)
        cur = cur.parent
    return seen

def expand(node):
    """node is canonical and it is Black to move. Work out White's replies."""
    kids = candidates.get(node.history, [])
    if not kids:
        return

    # OM.01 -> repetition check BEFORE normalising:
    # drop any candidate White move whose position is already on this line.
    on_line = line_keys(node)
    kept = []
    for h in kids:
        if MOCK_KEYS[h] in on_line:
            repetition_stops.append((h, node.history))
            log_lines.append(
                "[WARNING] REPETITION: route=%s; position already on this line; "
                "White move not recorded; move dropped before normalising." % h)
        else:
            kept.append(h)
    if not kept:
        return

    # OM.02 - normalise the survivors to 100%
    total_raw = sum(by_history[h] for h in kept)
    for h in sorted(kept, key=lambda k: -by_history[k]):
        move_prob = by_history[h] / total_raw * 100.0

        # TR.21 - sanity check on the move list
        if total_raw > 0 and move_prob > 100.0 + TOLERANCE:
            hard_error("White move probabilities exceed 100%% at %s" % node.history)

        child = Node(history=h, key=MOCK_KEYS[h], moveProb=move_prob,
                     routeProb=node.routeProb * move_prob / 100.0,
                     cumProb=node.cumProb * move_prob / 100.0,
                     parent=node, order=len(nodes))
        node.children.append(child)
        nodes.append(child)
        visit(child)

def visit(node):
    """TR.02 - TR.10 for one freshly created White move."""
    key = node.key                                     # TR.02

    if key not in registry:                            # TR.03 = no
        registry[key] = node                           # TR.06
        node.transposesTo = None                       # TR.07
        expand(node)                                   # back to the generator
        return

    owner = registry[key]                              # TR.03 = yes

    # TR.04 - backstop only. The OM check above should already have caught this.
    if owner is node.parent or owner.history in line_keys_history(node):
        log_lines.append(
            "[WARNING] BACKSTOP: repetition reached TR.04 at %s (owner %s). "
            "The pre-normalise check should have removed it." % (node.history, owner.history))
        return                                          # TR.05 - branch stops

    # TR.08 - this node becomes a pointer; no Black answer needed here
    node.transposesTo = owner
    node.pointerEvent = "TR%02d" % (len(transpositions) + 1)
    transpositions.append((node.history, owner.history))
    cascade(node, owner, len(transpositions))           # TR.09 -> TR.19

def line_keys_history(node):
    seen, cur = set(), node.parent
    while cur is not None:
        seen.add(cur.history)
        cur = cur.parent
    return seen

# ---------------------------------------------------------------- run it
root_kids = candidates.get(None, [])
total_raw = sum(by_history[h] for h in root_kids)
for h in sorted(root_kids, key=lambda k: -by_history[k]):
    mp = by_history[h] / total_raw * 100.0
    n = Node(h, MOCK_KEYS[h], mp, mp, mp, None, len(nodes))
    nodes.append(n)
    visit(n)

# ---------------------------------------------------------------- output
row_of = {}
for i, n in enumerate(sorted(nodes, key=lambda x: x.order), start=2):
    row_of[n] = i                       # row 2 = first node, matching the spreadsheet
for n in sorted(nodes, key=lambda x: x.order):
    line = ("%4d %-39s FEN=%-5s cumProb=%8.3f%% routeProb=%8.3f%% moveProb=%8.3f%%"
            % (row_of[n], n.history, n.key, n.cumProb, n.routeProb, n.moveProb))
    if n.transposesTo is not None:
        line += "  [TR -> %s FEN=%s]" % (n.transposesTo.history, n.transposesTo.key)
    print(line)

print()
print(RULE_HEAVY)
print("CASCADE LOG   %d transposition(s)" % len(cascade_reports))
print(RULE_HEAVY)
print()
for l in cascade_log:
    print(l)

print("Cascade index")
print("  %-6s %6s %8s %10s %6s %6s %6s   %s"
      % ("tr", "steps", "updated", "carried", "tiny", "dups", "revis", "from -> to"))
for r in cascade_reports:
    print("  %-6s %6d %8d %9.3f%% %6d %6d %6d   %s -> %s"
          % (r["event"], r["steps"], r["updated"], r["gain"], r["tiny"],
             r["duplicates"], r["repeat_touches"], r["from"], r["to"]))

print()
print("Summary")
print("  Total nodes: %d" % len(nodes))
print("  Canonical nodes: %d" % sum(1 for n in nodes if n.transposesTo is None))
print("  Pointer nodes: %d (all should hold 0.000%%)" % len(transpositions))
print("  Transpositions: %d" % len(transpositions))
for a, b in transpositions:
    print("    %s  -> %s" % (a, b))
print("  Repetition Stops: %d" % len(repetition_stops))
for a, b in repetition_stops:
    print("    %s  (dropped at %s)" % (a, b))
_total_tiny = sum(r["tiny_dropped"] for r in cascade_reports)
_unaccounted = (100.0 - ending_total()) - _total_tiny
print("  Ending total: %.4f%%" % ending_total())
print("  Tiny-threshold drops: %d  (%.9f%% discarded)"
      % (sum(r["tiny"] for r in cascade_reports), _total_tiny))
print("  Unaccounted probability: %.9f%%%s"
      % (_unaccounted, "" if abs(_unaccounted) <= TOLERANCE else "   <-- LOOK"))
print("  Revisits (TR.38, hash back at a node): %d" % sum(r["repeat_touches"] for r in cascade_reports))
print("  Refires (TR.40, same edge, different gain): %d" % sum(r["edge_repeats"] for r in cascade_reports))
print("  Duplicates (TR.35, logged and applied): %d" % sum(r["duplicates"] for r in cascade_reports))

if log_lines:
    print()
    print("Warnings roll-up")
    for l in log_lines:
        print("  " + l)

input("\nPress Enter to close...")
