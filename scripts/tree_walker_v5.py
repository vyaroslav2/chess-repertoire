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

import decimal

# ---------------------------------------------------------------- settings
DECIMALS = 22               # decimal places every percentage is padded to.
                            # Values are printed exactly - never rounded - and
                            # then padded with zeros to this width so columns
                            # line up. A value needing more places keeps them
                            # all rather than being cut short.
LEDGER = []                 # one record per arithmetic step, floats untouched


def warn(where, text):
    """A roll-up entry, tagged with the step it happened on.

    Without the tag a warning names the nodes involved but not the moment,
    which leaves you searching the cascade for the step that produced it."""
    log_lines.append("[WARNING] %-10s %s" % (where, text))


def ledger(event, step_no, action, item, source, node, before, amount,
           factor, after, queue):
    """Keep what a step did, in full precision.

    The printed log rounds to DECIMALS so it stays readable, and multiplying a
    rounded figure gives a different answer from the one the cascade got. The
    raw floats are recorded here instead of being reconstructed from the text
    afterwards, because by then the digits are already gone."""
    LEDGER.append({
        "event": event, "step": step_no, "action": action, "item": item,
        "from": source.history if source is not None else "",
        "node": node.history if node is not None else "",
        "fen": node.key if node is not None else "",
        "before": before, "amount": amount, "factor": factor, "after": after,
        "queue": queue,
    })

_PCT_W = DECIMALS + 4       # percentage column width
_LABEL_W = 25               # label column, shared by every figure list

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
filtered_total   = [0.0]  # probability that left the tree because a White move
                          # was not among the candidates (popularity filter or
                          # a repetition drop). A list so nested scopes can add.
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

def _digits(x):
    """The exact value, padded with zeros so columns line up.

    repr gives the shortest text that reads back as the same float - the value
    itself, with no invented digits. "%.22f" is not used: it would print
    24.682 as 24.68199999999999860734, exposing how the float is stored rather
    than what it is, and it silently drops digits from very small values."""
    x = float(x)
    text = repr(x)
    if "e" in text or "E" in text:
        text = format(decimal.Decimal(text), "f")     # no exponent notation
    if "." not in text:
        text += ".0"
    whole, frac = text.split(".")
    return whole + "." + frac.ljust(DECIMALS, "0")

def pct(x):
    """A percentage, padded to a fixed width - for the UPDATED NODES table."""
    return "%*s%%" % (_PCT_W, _digits(x))

def signed(x):
    """A change, padded to the same width, always carrying its sign."""
    text = _digits(x)
    return "%*s%%" % (_PCT_W, text if text.startswith("-") else "+" + text)

def num(x):
    """A percentage, compact - for values and sums inside a step block."""
    return _digits(x) + "%"

def num_check(x):
    """A percentage rounded to DECIMALS, for a figure that is only ever
    compared against a threshold.

    Rounding is not used for working values: a real cascade amount can be
    small enough to need more than DECIMALS places, and cutting it would
    break a hand-check. A check figure is different - it is read to see
    whether it is near zero, and anything it loses here is already below the
    precision the rest of the log works at."""
    return "%.*f%%" % (DECIMALS, float(x))

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
    filter_leak    = 0.0     # the share of this gain taken by missing moves
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
    applies = forwards = enqueues = stops = seeds = handovers = 0
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
    out("CASCADE   carrying=%s   endingTotal=%s"
        % (num(gain_for_to_node), num(ending_before)))
    out(RULE_LIGHT)
    out()

    remember(from_node)

    # Emptying the pointer is a step like any other: it changes a balance, and
    # leaving it out of the numbering made the log show one more row than the
    # step count admitted to.
    handovers += 1
    handover_step = step(state, "HANDOVER", None, "", [
        ("node", from_node.history),
        ("cumProb", "%s - %s -> %s" % (num(gain_for_to_node),
                                       num(gain_for_to_node), num(0.0))),
        ("queue", "0 waiting"),
    ])
    ledger(event_id, handover_step, "HANDOVER", 0, None, from_node,
           from_node.cumProb, gain_for_to_node, None, 0.0, 0)
    from_node.cumProb = 0.0

    worklist = [new_item(to_node, gain_for_to_node, from_node, None)]
    seeds += 1
    seed_step = step(state, "SEED", worklist[0]["id"], "", [
        ("from", from_node.history),
        ("node", to_node.history),
        ("carrying", num(gain_for_to_node)),
        ("queue", "%d waiting" % len(worklist)),
    ])
    ledger(event_id, seed_step, "SEED", worklist[0]["id"], from_node, to_node,
           None, gain_for_to_node, None, None, len(worklist))

    while worklist:                                    # TR.18 (loop back TR.20)
        item = worklist.pop(0)                         # TR.11
        node, gain, sender = item["node"], item["gain"], item["sender"]
        origin = "" if item["queued_at"] is None else "  (queued at [%02d])" % item["queued_at"]

        # TR.24 - too small to matter; drop it
        if gain < TINY_THRESHOLD:
            tiny_counter += 1                          # TR.37
            tiny_dropped += gain
            ledger(event_id, state["step"] + 1, "SKIP", item["id"], sender,
                   node, node.cumProb, gain, None, node.cumProb, len(worklist))
            step(state, "SKIP", item["id"], origin, [
                ("from", sender.history),
                ("node", node.history),
                ("carrying", num(gain)),
                ("reason", "below the tiny threshold (%s)" % num(TINY_THRESHOLD)),
                ("queue", "%d waiting" % len(worklist)),
            ])
            continue

        pending = []

        # TR.13 - has this event already touched this node?
        if (event_hash, node) in applied:
            # TR.38 - unconditional trace: this hash is back at this node again.
            repeat_touches += 1
            pending.append("revisit")

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
                pending.append("refire")
                if sender_touches <= 1:
                    warn("%s.%03d" % (event_id, state["step"] + 1),
                         "refire from a node touched once, which should not "
                         "be possible: fromNode=%s toNode=%s FEN=%s "
                         "gainOnThisItem=%s touchCount[fromNode]=%d"
                         % (sender.history, node.history, node.key, num(gain),
                            sender_touches))

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
                warn("%s.%03d" % (event_id, state["step"] + 1),
                     "duplicate propagation attempt: %s -> %s FEN=%s "
                     "gain=%s touchCount[fromNode]=%d (%s)"
                     % (sender.history, node.history, node.key, num(gain),
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
            ledger(event_id, s, "FORWARD", item["id"], node,
                   node.transposesTo, None, gain, None, None, len(worklist))
            node.cumProb = 0.0
        else:
            # TR.16 - absorb the gain
            remember(node)
            before = node.cumProb
            node.cumProb += gain
            applies += 1
            ledger(event_id, state["step"] + 1, "APPLY", item["id"], sender,
                   node, before, gain, None, node.cumProb, len(worklist))
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
                reason = "cumProb above 100%% (%s)" % num(node.cumProb)
                step(state, "ERROR", item["id"], "", [
                    ("node", node.history),
                    ("reason", reason),
                ])
                hard_error("cumProb>100%% at %s (%s)" % (node.history, num(node.cumProb)))

        # TR.31 - record the delivery
        visited_keys.add((sender.history, node.history, round(gain, 12)))
        edge_gains.setdefault((sender.history, node.history), set()).add(round(gain, 12))
        visited_list.append((sender.history, node.history, gain, node.key))
        deliveries += 1

        # TR.17 - mark, count the touch, push the children
        applied.add((event_hash, node))
        touch_counts[node] = touch_counts.get(node, 0) + 1

        if node.children:
            share_sum = sum(c.moveProb for c in node.children)
            leak = gain * (100.0 - share_sum) / 100.0
            filter_leak += leak
            filtered_total[0] += leak
            for child in node.children:
                child_gain = gain * child.moveProb / 100.0
                child_item = new_item(child, child_gain, node, None)
                enqueues += 1
                s = step_line(state, "ENQUEUE  #%d -> %-34s %8s x %8s = %8s   queue %d"
                              % (child_item["id"], child.history, num(gain),
                                 num(child.moveProb), num(child_gain), len(worklist) + 1))
                child_item["queued_at"] = s
                ledger(event_id, s, "ENQUEUE", child_item["id"], node, child,
                       gain, child_gain, child.moveProb, None,
                       len(worklist) + 1)
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
    out("  %*s %*s   %s" % (_PCT_W + 1, "cumProb", _PCT_W + 1, "change", "path"))
    for delta, after, hist, tag in changes:
        out("  %s %s   %s%s" % (pct(after), signed(delta), hist, tag))
    out()

    # ---- the closing counters ---------------------------------------------
    # One figure per line: counts first, then the percentages, each in its
    # own column so a run of them can be read straight down.
    out("CASCADE END  %s" % event_id)
    counts = [
        ("steps",                   state["step"]),
        ("handovers",               handovers),
        ("seeds",                   seeds),
        ("applies",                 applies),
        ("forwards",                forwards),
        ("enqueues",                enqueues),
        ("arrivals at an ending",   stops),
        ("tiny drops",              tiny_counter),
        ("revisits",                repeat_touches),
        ("refires",                 edge_repeats),
        ("duplicates",              duplicates),
        ("max touches on a node",   max(touch_counts.values())
                                    if touch_counts else 0),
    ]
    for label, value in counts:
        # Right-aligned one place short of the percentages below, so the last
        # digit of a count sits under the last digit of an amount.
        out("  %-*s %*d" % (_LABEL_W, label, _PCT_W - 1, value))
    amounts = [
        ("dropped (tiny)",    num(tiny_dropped)),
        ("filtered",          num(filter_leak)),
        ("endingTotal before", num(ending_before)),
        ("endingTotal after",  num(ending_after)),
        ("endingTotal change", signed(ending_after - ending_before).strip()),
    ]
    for label, value in amounts:
        out("  %-*s %*s" % (_LABEL_W, label, _PCT_W, value))
    out(RULE_HEAVY)
    out()

    # TR.41 - probability may only leave the tree through TR.24
    lost = ending_before - ending_after
    unaccounted = lost - tiny_dropped - filter_leak
    if abs(unaccounted) > TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "probability went missing: the ending total fell %.9f%%, "
                       "tiny-dropped %.9f%%, filtered %.9f%% (unaccounted %.9f%%)"
                       % (lost, tiny_dropped, filter_leak, unaccounted)),
        ])
        hard_error("unaccounted probability in cascade %s: fell %.9f%%, "
                   "tiny-dropped %.9f%%, filtered %.9f%%"
                   % (event_hash, lost, tiny_dropped, filter_leak))

    # TR.27
    if ending_after > ending_before + TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "ending total rose during this cascade: %s -> %s"
                       % (ending_before, ending_after)),
        ])
        hard_error("ending total rose during cascade %s: %s -> %s"
                   % (event_hash, ending_before, ending_after))
    # TR.30
    if ending_after > 100.0 + TOLERANCE:
        step(state, "ERROR", None, "", [
            ("reason", "ending total above 100%%: %s" % num(ending_after)),
        ])
        hard_error("ending total above 100%%: %s" % num(ending_after))

    # TR.19
    cascade_reports.append({
        "event": event_id, "from": from_node.history, "to": to_node.history,
        "fromNode": from_node, "toNode": to_node,
        "gain": gain_for_to_node, "before": ending_before, "after": ending_after,
        "deliveries": deliveries, "tiny": tiny_counter, "duplicates": duplicates,
        "forwards": forwards,
        "repeat_touches": repeat_touches, "edge_repeats": edge_repeats,
        "tiny_dropped": tiny_dropped, "filter_leak": filter_leak,
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
            warn("tree-build",
                 "REPETITION: route=%s; position already on this line; "
                 "White move not recorded; move dropped before normalising." % h)
        else:
            kept.append(h)
    if not kept:
        return

    # The raw share IS the move probability - White's moves at a position do
    # NOT sum to 100%, because the popularity filter upstream and OM.01 above
    # both remove moves and their share leaves the tree with them.
    share_sum = sum(by_history[h] for h in kept)

    # TR.21 - sanity check on the move list
    if share_sum > 100.0 + TOLERANCE:
        hard_error("White move probabilities exceed 100%% at %s (%s)"
                   % (node.history, share_sum))

    # what the missing moves take with them, on this node's value as it stands
    filtered_total[0] += node.cumProb * (100.0 - share_sum) / 100.0

    for h in sorted(kept, key=lambda k: -by_history[k]):
        move_prob = by_history[h]

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
        warn("tree-build",
             "BACKSTOP: repetition reached TR.04 at %s (owner %s). "
             "The pre-normalise check should have removed it."
             % (node.history, owner.history))
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
root_share = sum(by_history[h] for h in root_kids)
if root_share > 100.0 + TOLERANCE:
    hard_error("White move probabilities exceed 100%% at the root (%s)" % num(root_share))
filtered_total[0] += 100.0 - root_share
for h in sorted(root_kids, key=lambda k: -by_history[k]):
    mp = by_history[h]
    n = Node(h, MOCK_KEYS[h], mp, mp, mp, None, len(nodes))
    nodes.append(n)
    visit(n)

# ---------------------------------------------------------------- output
row_of = {}
for i, n in enumerate(sorted(nodes, key=lambda x: x.order), start=2):
    row_of[n] = i                       # row 2 = first node, matching the spreadsheet
for n in sorted(nodes, key=lambda x: x.order):
    line = ("%4d %-39s FEN=%-5s cumProb=%s routeProb=%s moveProb=%s"
            % (row_of[n], n.history, n.key,
               pct(n.cumProb), pct(n.routeProb), pct(n.moveProb)))
    if n.transposesTo is not None:
        line += "  [%s -> %s FEN=%s]" % (n.pointerEvent, n.transposesTo.history,
                                          n.transposesTo.key)
    print(line)

print()
print(RULE_HEAVY)
print("CASCADE LOG   %d transposition(s)" % len(cascade_reports))
print(RULE_HEAVY)
print()
for l in cascade_log:
    print(l)

# The two paths were the widest thing in the log and are already spelled out
# in each cascade's own block, so the index names the nodes by row instead.
# The pair here is the transposition's pointer and owner, which is not the
# same relationship as a step's from -> node, so it keeps its own names.
_INDEX_FMT = "  %-6s %6s %8s %5s %5s %5s %5s %5s %6s %8s %-2s %s"
print("Cascade index")
print(_INDEX_FMT % ("tr", "steps", "updated", "fwds", "revis", "refis",
                    "tiny", "dups", "%*s" % (_PCT_W + 1, "carried"),
                    "pointer", "", "owner"))
for r in cascade_reports:
    print(_INDEX_FMT
          % (r["event"], r["steps"], r["updated"], r["forwards"],
             r["repeat_touches"], r["edge_repeats"], r["tiny"],
             r["duplicates"], pct(r["gain"]),
             row_of.get(r["fromNode"], "?"), "->",
             row_of.get(r["toNode"], "?")))

print()
_total_tiny = sum(r["tiny_dropped"] for r in cascade_reports)
_unaccounted = 100.0 - ending_total() - filtered_total[0] - _total_tiny

# Counts first, then the amounts - the same shape as a CASCADE END block, so
# a short figure is never stranded beside a twenty-digit one.
print("Summary")
for _label, _value in [
    ("total nodes",          len(nodes)),
    ("canonical nodes",      sum(1 for n in nodes if n.transposesTo is None)),
    ("pointer nodes",        len(transpositions)),
    ("transpositions",       len(transpositions)),
    ("repetition stops",     len(repetition_stops)),
    ("ending nodes",         sum(1 for n in nodes
                                 if not n.children and n.transposesTo is None)),
    ("tiny-threshold drops", sum(r["tiny"] for r in cascade_reports)),
    ("revisits",             sum(r["repeat_touches"] for r in cascade_reports)),
    ("refires",              sum(r["edge_repeats"] for r in cascade_reports)),
    ("duplicates",           sum(r["duplicates"] for r in cascade_reports)),
]:
    print("  %-*s %*d" % (_LABEL_W, _label, _PCT_W - 1, _value))

for _label, _value in [
    ("ending total",         num(ending_total())),
    ("filtered away",        num(filtered_total[0])),
    ("tiny dropped",         num(_total_tiny)),
    ("endings+filtered+tiny", num(ending_total() + filtered_total[0]
                                 + _total_tiny)),
    ("unaccounted",          num_check(_unaccounted)
                             + ("" if abs(_unaccounted) <= TOLERANCE
                                else "   <-- LOOK")),
]:
    print("  %-*s %*s" % (_LABEL_W, _label, _PCT_W, _value))

for _a, _b in repetition_stops:
    print("    repetition: %s  (dropped at %s)" % (_a, _b))

if log_lines:
    print()
    print("Warnings roll-up")
    for l in log_lines:
        print("  " + l)

input("\nPress Enter to close...")
