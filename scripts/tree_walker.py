# Tree-walker - MOCK MODE: FENs are random 3-letter placeholders, not real chess.
# The 7 transpositions below are hardcoded to fire (their pair shares a key);
# every other node gets a unique random key, so no other collisions occur.
# Detection logic itself is UNCHANGED - same registry check as the real version -
# only the source of the key (mock vs. chess.Board) is swapped.
# Later: replace MOCK_KEYS with real positionKey computation again.

RAW_NODES = [
    # (move_number, history, raw_moveProb)
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

by_history = {h: (mv, raw) for (mv, h, raw) in RAW_NODES}

def parent_white_node(history):
    tokens = history.split()
    if len(tokens) <= 1:
        return None
    return " ".join(tokens[:-2])

children = {}
for (mv, h, raw) in RAW_NODES:
    children.setdefault(parent_white_node(h), []).append(h)

# normalize: siblings at each White-to-move position sum to exactly 100%
normalized_prob = {}
for parent, kids in children.items():
    total_raw = sum(by_history[k][1] for k in kids)
    for k in kids:
        normalized_prob[k] = by_history[k][1] / total_raw * 100.0

def routeprob(history):
    tokens = history.split()
    r = 1.0
    for end in range(1, len(tokens) + 1, 2):
        ancestor = " ".join(tokens[:end])
        r *= normalized_prob[ancestor] / 100.0
    return r * 100.0

# ---- check-and-point walk (same registry logic as the real version) ----
registry = {}        # mock key -> owner history (the canonical node)
result = {}          # history -> (kind, owner_or_None, key)
order_index = {}
_next = [0]

REPETITIONS = 0
TRANSPOSITIONS = 0

def visit(history):
    global REPETITIONS, TRANSPOSITIONS
    key = MOCK_KEYS[history]
    order_index[history] = _next[0]; _next[0] += 1

    if key in registry:
        owner = registry[key]
        same_line = history.startswith(owner + " ") or owner == history
        if same_line:
            REPETITIONS += 1
            result[history] = ("repetition", owner, key)
        else:
            TRANSPOSITIONS += 1
            result[history] = ("transposition", owner, key)
        return   # branch stops either way - no children visited
    else:
        registry[key] = history
        result[history] = ("canonical", None, key)
        kids = sorted(children.get(history, []), key=lambda k: -by_history[k][1])
        for k in kids:
            visit(k)

root_level = sorted(children.get(None, []), key=lambda k: -by_history[k][1])
for r in root_level:
    visit(r)

# ---- print: depth-first, in real creation order ----
all_histories = sorted(result.keys(), key=lambda h: order_index[h])
for h in all_histories:
    kind, owner, key = result[h]
    mp = normalized_prob[h]
    rp = routeprob(h)
    cp = rp
    line = (h + " FEN=" + key +
            " moveProb=" + format(mp, ".3f") + "%" +
            " routeProb=" + format(rp, ".3f") + "%" +
            " cumProb=" + format(cp, ".3f") + "%")
    if kind == "transposition":
        line += "  [TRANSPOSITION -> " + owner + "]"
    elif kind == "repetition":
        line += "  [REPETITION -> " + owner + "]"
    print(line)

print()
print("Summary")
print("  Total nodes: " + str(len(result)))
print("  Transpositions: " + str(TRANSPOSITIONS))
for h in all_histories:
    kind, owner, key = result[h]
    if kind == "transposition":
        print("  " + h + "  -> " + owner)
print("  Repetition Stops: " + str(REPETITIONS))
for h in all_histories:
    kind, owner, key = result[h]
    if kind == "repetition":
        print("  " + h + "  -> " + owner)

input("\nPress Enter to close...")