# Fetches real Lichess Explorer data for the demo positions and writes it to a
# local JSON file. No database.
#
# Settings mirror the project's AMATEUR bucket (src/lib/core/config.ts) and the
# pacing in src/lib/api/retry.ts:
#   source   lichess
#   speeds   classical, rapid
#   ratings  1600, 1800, 2000
#   1s between requests, 60s cooldown after any 429, 10 attempts,
#   15s timeout, backoff x2 capped at 30s, bearer token if LICHESS_API_TOKEN is set
#
# A node is a White move, so its weight comes from the position BEFORE that
# move - the parent, with White to move. Several nodes share a parent, so only
# the distinct parent positions are requested.
#
#   python fetch_demo_data.py

import chess, json, os, sys, time, urllib.request, urllib.error, urllib.parse

# ---- the demo tree ---------------------------------------------------------
NODES = [
    "d4",
    "Nf3",
    "d4 d5 Nf3",
    "d4 d5 Nf3 Nf6 c4",
    "d4 d5 Nf3 Nf6 g3",
    "d4 d5 Nf3 Nf6 c4 e6 g3",
    "d4 d5 Nf3 Nf6 g3 e6 c4",
    "d4 d5 Nf3 Nf6 c4 e6 g3 Be7 Bg2",
    "d4 d5 Nf3 Nf6 c4 e6 g3 Be7 Nc3",
    "Nf3 d5 d4",
]

# ---- config, matching the project ------------------------------------------
SOURCE   = "lichess"
SPEEDS   = ["classical", "rapid"]
RATINGS  = [1600, 1800, 2000]

RETRY_ATTEMPTS          = 10
NETWORK_RETRY_DELAY_MS  = 1000
RATE_LIMIT_RETRY_DELAY_MS = 60_000      # Lichess asks for a full minute after a 429
BETWEEN_REQUEST_DELAY_MS = 1000
REQUEST_TIMEOUT_MS      = 15000
RETRY_BACKOFF_MULTIPLIER = 2
MAXIMUM_RETRY_DELAY_MS  = 30000

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_real_data.json")

_next_request_at = 0.0

def explorer_url(fen):
    # quote(safe="") matches encodeURIComponent in the project's lichess.ts:
    # spaces become %20, not "+". urlencode would produce "+".
    return "https://explorer.lichess.ovh/%s?fen=%s&speeds=%s&ratings=%s" % (
        SOURCE,
        urllib.parse.quote(fen, safe=""),
        ",".join(SPEEDS),
        ",".join(str(r) for r in RATINGS),
    )

# The token lives in the central env file, exactly as start_tree_generator.ts
# loads it: C:\Files\.env first, then a local .env, then the environment.
ENV_FILES = [r"C:\Files\.env",
             os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
             os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")]

def load_token():
    for path in ENV_FILES:
        if not os.path.isfile(path):
            continue
        for raw in open(path, encoding="utf-8-sig", errors="replace"):
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "LICHESS_API_TOKEN":
                value = value.strip().strip('"').strip("'")
                if value:
                    return value, path
    value = os.environ.get("LICHESS_API_TOKEN", "").strip()
    return (value, "environment") if value else ("", None)

TOKEN, TOKEN_FROM = load_token()

TOKEN_HELP = (
    "The Lichess opening explorer requires authentication (changed March 2026).\n"
    "Looked for LICHESS_API_TOKEN in:\n"
    + "".join("  %s\n" % p for p in ENV_FILES) +
    "  the environment\n\n"
    "If the token there is expired, make a new one at\n"
    "  https://lichess.org/account/oauth/token   (no scopes need ticking)\n"
    "and update C:\\Files\\.env."
)

def fetch_with_retry(url):
    """One request slot at a time, 1s apart, with the project's retry policy."""
    global _next_request_at
    headers = {"Accept": "application/json", "Authorization": "Bearer " + TOKEN}

    for attempt in range(RETRY_ATTEMPTS):
        wait = _next_request_at - time.time()
        if wait > 0:
            time.sleep(wait)
        started = time.time()
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_MS / 1000.0) as r:
                body = r.read().decode("utf-8")
            _next_request_at = max(_next_request_at,
                                   started + BETWEEN_REQUEST_DELAY_MS / 1000.0)
            return json.loads(body)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                _next_request_at = max(_next_request_at,
                                       time.time() + RATE_LIMIT_RETRY_DELAY_MS / 1000.0)
                print("  [WARNING] rate limit (429). Pausing %ds before retry "
                      "(attempt %d/%d)" % (RATE_LIMIT_RETRY_DELAY_MS / 1000,
                                           attempt + 1, RETRY_ATTEMPTS))
                continue
            if e.code in (401, 403):
                sys.exit("\nHTTP %d - LICHESS_API_TOKEN was rejected. It is most "
                         "likely expired or revoked.\n\n%s" % (e.code, TOKEN_HELP))
            if 500 <= e.code <= 599:
                delay = min(MAXIMUM_RETRY_DELAY_MS,
                            NETWORK_RETRY_DELAY_MS * (RETRY_BACKOFF_MULTIPLIER ** attempt))
                print("  [WARNING] HTTP %d. Retrying in %.0fs (attempt %d/%d)"
                      % (e.code, delay / 1000.0, attempt + 1, RETRY_ATTEMPTS))
                time.sleep(delay / 1000.0)
                continue
            sys.exit("HTTP %d on %s" % (e.code, url))
        except Exception as e:
            delay = min(MAXIMUM_RETRY_DELAY_MS,
                        NETWORK_RETRY_DELAY_MS * (RETRY_BACKOFF_MULTIPLIER ** attempt))
            print("  [WARNING] network error: %s. Retrying in %.0fs (attempt %d/%d)"
                  % (e, delay / 1000.0, attempt + 1, RETRY_ATTEMPTS))
            time.sleep(delay / 1000.0)
            continue
    sys.exit("retries exhausted for " + url)

def position_key(board):
    return " ".join(board.fen().split()[:4])

# ---- work out which positions to ask for -----------------------------------
def board_after(san_path):
    board = chess.Board()
    for san in san_path.split():
        board.push(board.parse_san(san))
    return board

wanted = {}          # parent fen -> {"path": san path before the move, "moves": [our moves]}
for path in NODES:
    tokens = path.split()
    parent_path = " ".join(tokens[:-1])
    last = tokens[-1]
    parent = board_after(parent_path)
    if parent.turn != chess.WHITE:
        sys.exit("not a White move: " + path)
    entry = wanted.setdefault(parent.fen(), {"path": parent_path, "moves": []})
    entry["moves"].append(last)

if not TOKEN:
    sys.exit("LICHESS_API_TOKEN is not set.\n\n" + TOKEN_HELP)

print("%d nodes -> %d distinct White-to-move positions" % (len(NODES), len(wanted)))
print("token: %s...%s  (from %s)" % (TOKEN[:4], TOKEN[-3:], TOKEN_FROM))
print()

# ---- fetch ------------------------------------------------------------------
positions = {}
for i, (fen, entry) in enumerate(wanted.items(), start=1):
    label = entry["path"] if entry["path"] else "(start)"
    print("[%d/%d] %s" % (i, len(wanted), label))
    data = fetch_with_retry(explorer_url(fen))

    board = chess.Board(fen)
    moves = []
    for m in data.get("moves", []):
        white, draws, black = m["white"], m["draws"], m["black"]
        mv = board.parse_san(m["san"])
        moves.append({
            "san": m["san"],
            "uci": mv.uci(),
            "games": white + draws + black,
            "white": white, "draws": draws, "black": black,
        })
    total = sum(m["games"] for m in moves)
    positions[fen] = {
        "path": entry["path"],
        "key": position_key(board),
        "totalGames": total,
        "moves": moves,
        "opening": data.get("opening"),
    }
    print("     %d moves, %s games total" % (len(moves), format(total, ",")))
    for our in entry["moves"]:
        hit = next((m for m in moves if m["san"] == our), None)
        if hit:
            print("       %-5s %10s games   %6.3f%% of this position"
                  % (our, format(hit["games"], ","), 100.0 * hit["games"] / total))
        else:
            print("       %-5s not in the explorer at this position (0 games)" % our)

# ---- the demo's node list, with real weights --------------------------------
node_rows = []
for path in NODES:
    tokens = path.split()
    parent_path, last = " ".join(tokens[:-1]), tokens[-1]
    parent_fen = board_after(parent_path).fen()
    pos = positions[parent_fen]
    hit = next((m for m in pos["moves"] if m["san"] == last), None)
    node_rows.append({
        "san": path,
        "move": last,
        "games": hit["games"] if hit else 0,
        "positionTotalGames": pos["totalGames"],
        "shareOfPosition": (100.0 * hit["games"] / pos["totalGames"]) if hit and pos["totalGames"] else 0.0,
        "positionPath": pos["path"],
    })

out = {
    "source": {"database": SOURCE, "speeds": SPEEDS, "ratings": RATINGS},
    "fetchedAt": time.strftime("%Y-%m-%d %H:%M:%S"),
    "positions": list(positions.values()),
    "nodes": node_rows,
}
json.dump(out, open(OUT, "w"), indent=2)

print()
print("wrote %s" % os.path.basename(OUT))
print()
print("NODES for demo_repeat_touch.py (weight = games played):")
for r in node_rows:
    print('    ("%s", %d),' % (r["san"], r["games"]))
