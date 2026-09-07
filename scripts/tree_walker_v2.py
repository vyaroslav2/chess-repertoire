# Tree-walker - MOCK MODE with the full TR transposition/cascade logic.
# FENs are random 3-letter placeholders, not real chess. The 7 transpositions
# are hardcoded to fire (their pair shares a key); every other node gets a
# unique key, so no other collisions occur. The TR logic below is the real
# thing - only the source of positionKey (mock table vs. chess.Board) differs.
#
# Box IDs in comments refer to the TR flowchart.

RAW_NODES = [
    (1, "d4", 24.682),
    (1, "e4", 64.383),
    (2, "d4 d5 Bf4", 19.532),
    (2, "d4 d5 Nc3", 5.7),
    (2, "d4 d5 Nf3", 15.614),
    (2, "d4 d5 c4", 43.177),
    (2, "d4 d5 e3", 8.219),
    (2, "e4 c6 Bc4", 6.93),
    (2, "e4 c6 Nc3", 5.705),
    (2, "e4 c6 Nf3", 26.396),
    (2, "e4 c6 d4", 49.753),
    (3, "d4 d5 Bf4 h5 Nc3", 5.976),
    (3, "d4 d5 Bf4 h5 Nf3", 22.38),
    (3, "d4 d5 Bf4 h5 e3", 39.574),
    (3, "d4 d5 Bf4 h5 h3", 18.892),
    (3, "d4 d5 Bf4 h5 h4", 10.243),
    (3, "d4 d5 Nc3 c6 Bf4", 45.912),
    (3, "d4 d5 Nc3 c6 Nf3", 15.745),
    (3, "d4 d5 Nc3 c6 e4", 23.716),
    (3, "d4 d5 Nf3 c6 Bf4", 26.401),
    (3, "d4 d5 Nf3 c6 Nc3", 6.215),
    (3, "d4 d5 Nf3 c6 c4", 17.716),
    (3, "d4 d5 Nf3 c6 e3", 24.886),
    (3, "d4 d5 Nf3 c6 g3", 11.208),
    (3, "d4 d5 c4 dxc4 Nc3", 31.546),
    (3, "d4 d5 c4 dxc4 Nf3", 8.144),
    (3, "d4 d5 c4 dxc4 e3", 29.879),
    (3, "d4 d5 c4 dxc4 e4", 26.14),
    (3, "d4 d5 e3 Bf5 Bd3", 29.197),
    (3, "d4 d5 e3 Bf5 Nf3", 20.211),
    (3, "d4 d5 e3 Bf5 c4", 23.088),
    (3, "d4 d5 e3 Bf5 f4", 6.561),
    (3, "e4 c6 Bc4 d5 exd5", 95.623),
    (3, "e4 c6 Nc3 d5 Nf3", 28.408),
    (3, "e4 c6 Nc3 d5 d4", 12.078),
    (3, "e4 c6 Nc3 d5 exd5", 44.82),
    (3, "e4 c6 Nf3 g6 Bc4", 23.257),
    (3, "e4 c6 Nf3 g6 Nc3", 13.223),
    (3, "e4 c6 Nf3 g6 d4", 50.736),
    (3, "e4 c6 d4 d5 Nc3", 20.7),
    (3, "e4 c6 d4 d5 e5", 43.457),
    (3, "e4 c6 d4 d5 exd5", 27.494),
    (4, "d4 d5 Bf4 h5 Nc3 Bf5 Nb5", 17.742),
    (4, "d4 d5 Bf4 h5 Nc3 Bf5 Nf3", 14.839),
    (4, "d4 d5 Bf4 h5 Nc3 Bf5 e3", 36.935),
    (4, "d4 d5 Bf4 h5 Nc3 Bf5 f3", 9.516),
    (4, "d4 d5 Bf4 h5 Nc3 Bf5 h3", 11.935),
    (4, "d4 d5 Bf4 h5 Nf3 Nf6 Nbd2", 5.635),
    (4, "d4 d5 Bf4 h5 Nf3 Nf6 e3", 59.813),
    (4, "d4 d5 Bf4 h5 Nf3 Nf6 h3", 20.443),
    (4, "d4 d5 Bf4 h5 e3 e5 Bxe5", 54.486),
    (4, "d4 d5 Bf4 h5 e3 e5 dxe5", 41.897),
    (4, "d4 d5 Bf4 h5 h3 c5 Nf3", 7.251),
    (4, "d4 d5 Bf4 h5 h3 c5 c3", 23.867),
    (4, "d4 d5 Bf4 h5 h3 c5 dxc5", 7.402),
    (4, "d4 d5 Bf4 h5 h3 c5 e3", 58.912),
    (4, "d4 d5 Bf4 h5 h4 c5 Nf3", 6.87),
    (4, "d4 d5 Bf4 h5 h4 c5 c3", 21.374),
    (4, "d4 d5 Bf4 h5 h4 c5 dxc5", 7.125),
    (4, "d4 d5 Bf4 h5 h4 c5 e3", 61.069),
    (4, "d4 d5 Nc3 c6 Bf4 Qb6 Na4", 25.707),
    (4, "d4 d5 Nc3 c6 Bf4 Qb6 Rb1", 33.044),
    (4, "d4 d5 Nc3 c6 Bf4 Qb6 a3", 5.321),
    (4, "d4 d5 Nc3 c6 Bf4 Qb6 b3", 15.43),
    (4, "d4 d5 Nc3 c6 Bf4 Qb6 e3", 7.029),
    (4, "d4 d5 Nf3 c6 Bf4 Bg4 Nbd2", 20.338),
    (4, "d4 d5 Nf3 c6 Bf4 Bg4 Ne5", 8.727),
    (4, "d4 d5 Nf3 c6 Bf4 Bg4 e3", 58.559),
    (4, "d4 d5 Nf3 c6 Bf4 Bg4 h3", 6.9),
    (4, "d4 d5 Nf3 c6 Nc3 Bf5 Bf4", 44.217),
    (4, "d4 d5 Nf3 c6 Nc3 Bf5 e3", 22.831),
    (4, "d4 d5 Nf3 c6 Nc3 Bf5 h3", 9.384),
    (4, "d4 d5 Nf3 c6 c4 a6 Bf4", 7.07),
    (4, "d4 d5 Nf3 c6 c4 a6 Nc3", 35.669),
    (4, "d4 d5 Nf3 c6 c4 a6 a4", 6.669),
    (4, "d4 d5 Nf3 c6 c4 a6 cxd5", 15.116),
    (4, "d4 d5 Nf3 c6 c4 a6 e3", 16.634),
    (4, "d4 d5 Nf3 c6 c4 a6 g3", 9.912),
    (4, "d4 d5 Nf3 c6 e3 Bg4 Bd3", 14.244),
    (4, "d4 d5 Nf3 c6 e3 Bg4 Be2", 33.625),
    (4, "d4 d5 Nf3 c6 e3 Bg4 Nbd2", 16.518),
    (4, "d4 d5 Nf3 c6 e3 Bg4 c4", 17.293),
    (4, "d4 d5 Nf3 c6 e3 Bg4 h3", 12.624),
    (4, "d4 d5 Nf3 c6 g3 Bf5 Bg2", 92.791),
    (4, "d4 d5 c4 dxc4 Nc3 a6 Nf3", 6.671),
    (4, "d4 d5 c4 dxc4 Nc3 a6 a4", 46.65),
    (4, "d4 d5 c4 dxc4 Nc3 a6 e3", 11.91),
    (4, "d4 d5 c4 dxc4 Nc3 a6 e4", 24.962),
    (4, "d4 d5 c4 dxc4 Nf3 Bf5 Nc3", 57.385),
    (4, "d4 d5 c4 dxc4 Nf3 Bf5 Qa4+", 7.431),
    (4, "d4 d5 c4 dxc4 Nf3 Bf5 e3", 24.826),
    (4, "d4 d5 c4 dxc4 Nf3 Bf5 g3", 5.212),
    (4, "d4 d5 c4 dxc4 e3 Nc6 Bxc4", 93.718),
    (4, "d4 d5 c4 dxc4 e4 b5 Nc3", 29.14),
    (4, "d4 d5 c4 dxc4 e4 b5 Nf3", 7.617),
    (4, "d4 d5 c4 dxc4 e4 b5 a4", 53.108),
    (4, "d4 d5 e3 Bf5 Bd3 e6 Bxf5", 55.797),
    (4, "d4 d5 e3 Bf5 Bd3 e6 Nf3", 10.687),
    (4, "d4 d5 e3 Bf5 Bd3 e6 f4", 17.649),
    (4, "d4 d5 e3 Bf5 Nf3 e6 Bd3", 33.671),
    (4, "d4 d5 e3 Bf5 Nf3 e6 Be2", 8.064),
    (4, "d4 d5 e3 Bf5 Nf3 e6 Nbd2", 7.732),
    (4, "d4 d5 e3 Bf5 Nf3 e6 a3", 9.514),
    (4, "d4 d5 e3 Bf5 Nf3 e6 c4", 24.099),
    (4, "d4 d5 e3 Bf5 c4 e6 Nc3", 32.374),
    (4, "d4 d5 e3 Bf5 c4 e6 Nf3", 14.217),
    (4, "d4 d5 e3 Bf5 c4 e6 Qb3", 6.694),
    (4, "d4 d5 e3 Bf5 c4 e6 a3", 14.624),
    (4, "d4 d5 e3 Bf5 c4 e6 c5", 12.18),
    (4, "d4 d5 e3 Bf5 c4 e6 cxd5", 14.128),
    (4, "d4 d5 e3 Bf5 f4 e6 Bd3", 20.679),
    (4, "d4 d5 e3 Bf5 f4 e6 Nf3", 64.15),
    (4, "d4 d5 e3 Bf5 f4 e6 c3", 5.152),
    (4, "e4 c6 Bc4 d5 exd5 cxd5 Bb3", 68.542),
    (4, "e4 c6 Bc4 d5 exd5 cxd5 Bb5+", 28.02),
    (4, "e4 c6 Nc3 d5 Nf3 h6 d3", 5.491),
    (4, "e4 c6 Nc3 d5 Nf3 h6 d4", 44.219),
    (4, "e4 c6 Nc3 d5 Nf3 h6 exd5", 31.518),
    (4, "e4 c6 Nc3 d5 Nf3 h6 h3", 6.116),
    (4, "e4 c6 Nc3 d5 exd5 cxd5 Bb5+", 10.45),
    (4, "e4 c6 Nc3 d5 exd5 cxd5 Nf3", 8.818),
    (4, "e4 c6 Nc3 d5 exd5 cxd5 d4", 73.267),
    (4, "e4 c6 Nf3 g6 Bc4 d5 exd5", 95.802),
    (4, "e4 c6 Nf3 g6 Nc3 d5 d3", 6.123),
    (4, "e4 c6 Nf3 g6 Nc3 d5 d4", 43.492),
    (4, "e4 c6 Nf3 g6 Nc3 d5 e5", 6.724),
    (4, "e4 c6 Nf3 g6 Nc3 d5 exd5", 33.79),
    (4, "e4 c6 Nf3 g6 d4 d6 Bc4", 16.951),
    (4, "e4 c6 Nf3 g6 d4 d6 Bd3", 13.382),
    (4, "e4 c6 Nf3 g6 d4 d6 Be2", 5.366),
    (4, "e4 c6 Nf3 g6 d4 d6 Be3", 6.118),
    (4, "e4 c6 Nf3 g6 d4 d6 Nc3", 27.719),
    (4, "e4 c6 Nf3 g6 d4 d6 c3", 6.608),
    (4, "e4 c6 Nf3 g6 d4 d6 c4", 12.609),
    (4, "e4 c6 d4 d5 Nc3 a6 Bd3", 10.942),
    (4, "e4 c6 d4 d5 Nc3 a6 Bf4", 6.297),
    (4, "e4 c6 d4 d5 Nc3 a6 Nf3", 36.881),
    (4, "e4 c6 d4 d5 Nc3 a6 e5", 16.01),
    (4, "e4 c6 d4 d5 Nc3 a6 exd5", 15.0),
    (4, "e4 c6 d4 d5 e5 a6 Bd3", 11.69),
    (4, "e4 c6 d4 d5 e5 a6 Nc3", 6.285),
    (4, "e4 c6 d4 d5 e5 a6 Nf3", 38.306),
    (4, "e4 c6 d4 d5 e5 a6 c3", 9.299),
    (4, "e4 c6 d4 d5 e5 a6 c4", 9.366),
    (4, "e4 c6 d4 d5 e5 a6 f4", 13.17),
    (4, "e4 c6 d4 d5 exd5 Qxd5 Nc3", 40.459),
    (4, "e4 c6 d4 d5 exd5 Qxd5 Nf3", 26.315),
    (4, "e4 c6 d4 d5 exd5 Qxd5 c4", 24.285),
]

MOCK_KEYS = {
    "d4": "uda",
    "d4 d5 Bf4": "xih",
    "d4 d5 Bf4 h5 Nc3": "hex",
    "d4 d5 Bf4 h5 Nc3 Bf5 Nb5": "dvx",
    "d4 d5 Bf4 h5 Nc3 Bf5 Nf3": "rcs",
    "d4 d5 Bf4 h5 Nc3 Bf5 e3": "nba",
    "d4 d5 Bf4 h5 Nc3 Bf5 f3": "cgh",
    "d4 d5 Bf4 h5 Nc3 Bf5 h3": "qta",
    "d4 d5 Bf4 h5 Nf3": "rgw",
    "d4 d5 Bf4 h5 Nf3 Nf6 Nbd2": "uwr",
    "d4 d5 Bf4 h5 Nf3 Nf6 e3": "nho",
    "d4 d5 Bf4 h5 Nf3 Nf6 h3": "siz",
    "d4 d5 Bf4 h5 e3": "ayz",
    "d4 d5 Bf4 h5 e3 e5 Bxe5": "fwn",
    "d4 d5 Bf4 h5 e3 e5 dxe5": "kie",
    "d4 d5 Bf4 h5 h3": "gyk",
    "d4 d5 Bf4 h5 h3 c5 Nf3": "dcm",
    "d4 d5 Bf4 h5 h3 c5 c3": "dll",
    "d4 d5 Bf4 h5 h3 c5 dxc5": "tiz",
    "d4 d5 Bf4 h5 h3 c5 e3": "bxo",
    "d4 d5 Bf4 h5 h4": "rdm",
    "d4 d5 Bf4 h5 h4 c5 Nf3": "crj",
    "d4 d5 Bf4 h5 h4 c5 c3": "utl",
    "d4 d5 Bf4 h5 h4 c5 dxc5": "sgw",
    "d4 d5 Bf4 h5 h4 c5 e3": "cbv",
    "d4 d5 Nc3": "hyj",
    "d4 d5 Nc3 c6 Bf4": "chd",
    "d4 d5 Nc3 c6 Bf4 Qb6 Na4": "mio",
    "d4 d5 Nc3 c6 Bf4 Qb6 Rb1": "ulf",
    "d4 d5 Nc3 c6 Bf4 Qb6 a3": "llg",
    "d4 d5 Nc3 c6 Bf4 Qb6 b3": "viw",
    "d4 d5 Nc3 c6 Bf4 Qb6 e3": "vuc",
    "d4 d5 Nc3 c6 Nf3": "bhb",
    "d4 d5 Nc3 c6 e4": "qfb",
    "d4 d5 Nf3": "tuf",
    "d4 d5 Nf3 c6 Bf4": "rxh",
    "d4 d5 Nf3 c6 Bf4 Bg4 Nbd2": "fom",
    "d4 d5 Nf3 c6 Bf4 Bg4 Ne5": "iuw",
    "d4 d5 Nf3 c6 Bf4 Bg4 e3": "rhv",
    "d4 d5 Nf3 c6 Bf4 Bg4 h3": "kyy",
    "d4 d5 Nf3 c6 Nc3": "bhb",
    "d4 d5 Nf3 c6 Nc3 Bf5 Bf4": "zkm",
    "d4 d5 Nf3 c6 Nc3 Bf5 e3": "icg",
    "d4 d5 Nf3 c6 Nc3 Bf5 h3": "swk",
    "d4 d5 Nf3 c6 c4": "gup",
    "d4 d5 Nf3 c6 c4 a6 Bf4": "muo",
    "d4 d5 Nf3 c6 c4 a6 Nc3": "eie",
    "d4 d5 Nf3 c6 c4 a6 a4": "hxr",
    "d4 d5 Nf3 c6 c4 a6 cxd5": "rix",
    "d4 d5 Nf3 c6 c4 a6 e3": "sns",
    "d4 d5 Nf3 c6 c4 a6 g3": "mlh",
    "d4 d5 Nf3 c6 e3": "eqp",
    "d4 d5 Nf3 c6 e3 Bg4 Bd3": "cyb",
    "d4 d5 Nf3 c6 e3 Bg4 Be2": "deu",
    "d4 d5 Nf3 c6 e3 Bg4 Nbd2": "fzv",
    "d4 d5 Nf3 c6 e3 Bg4 c4": "ntc",
    "d4 d5 Nf3 c6 e3 Bg4 h3": "mmt",
    "d4 d5 Nf3 c6 g3": "oqi",
    "d4 d5 Nf3 c6 g3 Bf5 Bg2": "rav",
    "d4 d5 c4": "xdv",
    "d4 d5 c4 dxc4 Nc3": "ryi",
    "d4 d5 c4 dxc4 Nc3 a6 Nf3": "yuk",
    "d4 d5 c4 dxc4 Nc3 a6 a4": "djn",
    "d4 d5 c4 dxc4 Nc3 a6 e3": "foa",
    "d4 d5 c4 dxc4 Nc3 a6 e4": "xxi",
    "d4 d5 c4 dxc4 Nf3": "qyf",
    "d4 d5 c4 dxc4 Nf3 Bf5 Nc3": "qdu",
    "d4 d5 c4 dxc4 Nf3 Bf5 Qa4+": "juq",
    "d4 d5 c4 dxc4 Nf3 Bf5 e3": "tge",
    "d4 d5 c4 dxc4 Nf3 Bf5 g3": "lyf",
    "d4 d5 c4 dxc4 e3": "ryq",
    "d4 d5 c4 dxc4 e3 Nc6 Bxc4": "atk",
    "d4 d5 c4 dxc4 e4": "pad",
    "d4 d5 c4 dxc4 e4 b5 Nc3": "lzj",
    "d4 d5 c4 dxc4 e4 b5 Nf3": "hbh",
    "d4 d5 c4 dxc4 e4 b5 a4": "scc",
    "d4 d5 e3": "xpc",
    "d4 d5 e3 Bf5 Bd3": "yry",
    "d4 d5 e3 Bf5 Bd3 e6 Bxf5": "eev",
    "d4 d5 e3 Bf5 Bd3 e6 Nf3": "prf",
    "d4 d5 e3 Bf5 Bd3 e6 f4": "iqt",
    "d4 d5 e3 Bf5 Nf3": "ngr",
    "d4 d5 e3 Bf5 Nf3 e6 Bd3": "prf",
    "d4 d5 e3 Bf5 Nf3 e6 Be2": "yxw",
    "d4 d5 e3 Bf5 Nf3 e6 Nbd2": "gwj",
    "d4 d5 e3 Bf5 Nf3 e6 a3": "mvu",
    "d4 d5 e3 Bf5 Nf3 e6 c4": "hck",
    "d4 d5 e3 Bf5 c4": "loq",
    "d4 d5 e3 Bf5 c4 e6 Nc3": "odh",
    "d4 d5 e3 Bf5 c4 e6 Nf3": "hck",
    "d4 d5 e3 Bf5 c4 e6 Qb3": "asr",
    "d4 d5 e3 Bf5 c4 e6 a3": "hsh",
    "d4 d5 e3 Bf5 c4 e6 c5": "acw",
    "d4 d5 e3 Bf5 c4 e6 cxd5": "ubh",
    "d4 d5 e3 Bf5 f4": "cbk",
    "d4 d5 e3 Bf5 f4 e6 Bd3": "iqt",
    "d4 d5 e3 Bf5 f4 e6 Nf3": "cqh",
    "d4 d5 e3 Bf5 f4 e6 c3": "ivp",
    "e4": "gre",
    "e4 c6 Bc4": "xss",
    "e4 c6 Bc4 d5 exd5": "phz",
    "e4 c6 Bc4 d5 exd5 cxd5 Bb3": "pzn",
    "e4 c6 Bc4 d5 exd5 cxd5 Bb5+": "gdd",
    "e4 c6 Nc3": "vnl",
    "e4 c6 Nc3 d5 Nf3": "nno",
    "e4 c6 Nc3 d5 Nf3 h6 d3": "xbv",
    "e4 c6 Nc3 d5 Nf3 h6 d4": "uud",
    "e4 c6 Nc3 d5 Nf3 h6 exd5": "bmx",
    "e4 c6 Nc3 d5 Nf3 h6 h3": "kzd",
    "e4 c6 Nc3 d5 d4": "qfb",
    "e4 c6 Nc3 d5 exd5": "hgg",
    "e4 c6 Nc3 d5 exd5 cxd5 Bb5+": "roe",
    "e4 c6 Nc3 d5 exd5 cxd5 Nf3": "nfi",
    "e4 c6 Nc3 d5 exd5 cxd5 d4": "ohc",
    "e4 c6 Nf3": "ozr",
    "e4 c6 Nf3 g6 Bc4": "dbu",
    "e4 c6 Nf3 g6 Bc4 d5 exd5": "rac",
    "e4 c6 Nf3 g6 Nc3": "yhf",
    "e4 c6 Nf3 g6 Nc3 d5 d3": "npp",
    "e4 c6 Nf3 g6 Nc3 d5 d4": "gmb",
    "e4 c6 Nf3 g6 Nc3 d5 e5": "fma",
    "e4 c6 Nf3 g6 Nc3 d5 exd5": "miz",
    "e4 c6 Nf3 g6 d4": "zoj",
    "e4 c6 Nf3 g6 d4 d6 Bc4": "nwx",
    "e4 c6 Nf3 g6 d4 d6 Bd3": "zrv",
    "e4 c6 Nf3 g6 d4 d6 Be2": "wpe",
    "e4 c6 Nf3 g6 d4 d6 Be3": "gjg",
    "e4 c6 Nf3 g6 d4 d6 Nc3": "bsx",
    "e4 c6 Nf3 g6 d4 d6 c3": "rbx",
    "e4 c6 Nf3 g6 d4 d6 c4": "kbb",
    "e4 c6 d4": "spq",
    "e4 c6 d4 d5 Nc3": "qfb",
    "e4 c6 d4 d5 Nc3 a6 Bd3": "qcf",
    "e4 c6 d4 d5 Nc3 a6 Bf4": "ctc",
    "e4 c6 d4 d5 Nc3 a6 Nf3": "vhm",
    "e4 c6 d4 d5 Nc3 a6 e5": "vss",
    "e4 c6 d4 d5 Nc3 a6 exd5": "dsh",
    "e4 c6 d4 d5 e5": "stb",
    "e4 c6 d4 d5 e5 a6 Bd3": "tcn",
    "e4 c6 d4 d5 e5 a6 Nc3": "vss",
    "e4 c6 d4 d5 e5 a6 Nf3": "qki",
    "e4 c6 d4 d5 e5 a6 c3": "gvw",
    "e4 c6 d4 d5 e5 a6 c4": "khi",
    "e4 c6 d4 d5 e5 a6 f4": "mev",
    "e4 c6 d4 d5 exd5": "ujo",
    "e4 c6 d4 d5 exd5 Qxd5 Nc3": "kyc",
    "e4 c6 d4 d5 exd5 Qxd5 Nf3": "aot",
    "e4 c6 d4 d5 exd5 Qxd5 c4": "sdc",
}


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
                 "transposesTo", "children", "parent", "order")
    def __init__(self, history, key, moveProb, routeProb, cumProb, parent, order):
        self.history      = history
        self.key          = key
        self.moveProb     = moveProb      # %
        self.routeProb    = routeProb     # % - frozen at creation, never touched again
        self.cumProb      = cumProb       # % - this is what the cascade moves around
        self.transposesTo = None          # None = canonical; otherwise the owner Node
        self.children     = []
        self.parent       = parent
        self.order        = order

nodes    = []    # every node, in creation order
registry = {}    # key -> owner Node (canonical nodes only)

log_lines        = []
repetition_stops = []
transpositions   = []
cascade_reports  = []

def ending_total():
    """TR: the sum of every cumProb ending in the tree, where an ending is a
    node nothing grows out of. Add up every one of them - no skipping."""
    return sum(n.cumProb for n in nodes if not n.children)

def hard_error(msg):
    raise SystemExit("HARD ERROR: " + msg)

# ---------------------------------------------------------------- cascade
def cascade(from_node, to_node, event_no):
    """TR.09 - TR.19. Runs once, start to finish, before anything else happens."""

    # TR.09 - one hash for this whole transposition event
    event_hash = "EV%02d:%s->%s" % (event_no, from_node.history, to_node.history)

    # TR.23 - record the ending total; reset the per-cascade counters
    ending_before = ending_total()
    tiny_counter  = 0
    touch_counts  = {}
    applied       = set()   # (event_hash, node) already handled - TR.13
    visited_list  = []      # (sender, receiver, gain, targetFEN) - TR.31
    visited_keys  = set()   # (sender, receiver, gain) - what TR.26 actually compares
    duplicates    = 0
    repeat_touches = 0   # TR.38 - every time a hash comes back to a node, dup or not
    deliveries    = 0

    # TR.10 - seed the worklist, then empty fromNode
    gain_for_to_node = from_node.cumProb
    worklist = [{"node": to_node, "gain": gain_for_to_node,
                 "sender": from_node, "hash": event_hash}]
    from_node.cumProb = 0.0

    while worklist:                                    # TR.18 (loop back TR.20)
        item = worklist.pop(0)                         # TR.11
        node, gain, sender = item["node"], item["gain"], item["sender"]

        # TR.24 - too small to matter; drop it
        if gain < TINY_THRESHOLD:
            tiny_counter += 1                          # TR.37
            continue

        # TR.13 - has this event already touched this node?
        if (event_hash, node) in applied:
            # TR.38 - unconditional trace: this hash is back at this node again.
            # Written every time, whether or not TR.26 below decides it's a true duplicate.
            log_lines.append(
                "[WARNING] eventHash already applied to this node: "
                "fromNode=%s toNode=%s gainOnThisItem=%.9f%%"
                % (sender.history, node.history, gain))
            repeat_touches += 1

            # TR.26 - the identical delivery, same sender, same amount?
            if (sender.history, node.history, round(gain, 12)) in visited_keys:
                # TR.35 - log it and drop it. Should never happen in a good run.
                duplicates += 1
                log_lines.append(
                    "[WARNING] duplicate propagation attempt: %s -> %s FEN=%s gain=%.9f%%"
                    % (sender.history, node.history, node.key, gain))
                continue

        # TR.32 - is this node a pointer?
        if node.transposesTo is not None:
            # TR.15 - hand the gain straight on; this node stays empty
            worklist.append({"node": node.transposesTo, "gain": gain,
                             "sender": node, "hash": event_hash})
            node.cumProb = 0.0
        else:
            # TR.16 - absorb the gain
            node.cumProb += gain
            # TR.33
            if node.cumProb > 100.0 + TOLERANCE:
                hard_error("cumProb>100%% at %s (%.6f%%)" % (node.history, node.cumProb))

        # TR.31 - record the delivery
        visited_keys.add((sender.history, node.history, round(gain, 12)))
        visited_list.append((sender.history, node.history, gain, node.key))
        deliveries += 1

        # TR.17 - mark, count the touch, push the children
        applied.add((event_hash, node))
        touch_counts[node] = touch_counts.get(node, 0) + 1
        for child in node.children:
            worklist.append({"node": child,
                             "gain": gain * child.moveProb / 100.0,
                             "sender": node, "hash": event_hash})

        # TR.36
        if touch_counts[node] > TOUCH_CAP:
            hard_error("possible loop: %s touched %d times"
                       % (node.history, touch_counts[node]))

    ending_after = ending_total()

    # TR.27
    if ending_after > ending_before + TOLERANCE:
        hard_error("ending total rose during cascade %s: %.6f%% -> %.6f%%"
                   % (event_hash, ending_before, ending_after))
    # TR.30
    if ending_after > 100.0 + TOLERANCE:
        hard_error("ending total above 100%%: %.6f%%" % ending_after)

    # TR.19
    cascade_reports.append({
        "event": event_hash, "from": from_node.history, "to": to_node.history,
        "gain": gain_for_to_node, "before": ending_before, "after": ending_after,
        "deliveries": deliveries, "tiny": tiny_counter, "duplicates": duplicates,
        "repeat_touches": repeat_touches,
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
for n in sorted(nodes, key=lambda x: x.order):
    line = ("%s FEN=%s moveProb=%.3f%% routeProb=%.3f%% cumProb=%.3f%%"
            % (n.history, n.key, n.moveProb, n.routeProb, n.cumProb))
    if n.transposesTo is not None:
        line += "  [TRANSPOSITION -> %s]" % n.transposesTo.history
    print(line)

print()
print("Cascades")
for r in cascade_reports:
    print("  %s" % r["event"])
    print("     handed over: %.3f%%   deliveries: %d   tiny-drops: %d   "
          "repeat touches: %d   duplicates: %d   max touches on one node: %d"
          % (r["gain"], r["deliveries"], r["tiny"], r["repeat_touches"],
             r["duplicates"], r["max_touch"]))
    print("     ending total: %.4f%% -> %.4f%%" % (r["before"], r["after"]))

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
print("  Ending total: %.4f%%" % ending_total())
print("  Tiny-threshold drops: %d" % sum(r["tiny"] for r in cascade_reports))
print("  Repeat touches (TR.38, hash back at a node): %d" % sum(r["repeat_touches"] for r in cascade_reports))
print("  Duplicate deliveries (TR.35, dropped): %d" % sum(r["duplicates"] for r in cascade_reports))

if log_lines:
    print()
    print("Log")
    for l in log_lines:
        print("  " + l)

input("\nPress Enter to close...")