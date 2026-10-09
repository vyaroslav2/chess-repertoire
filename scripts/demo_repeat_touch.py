# Smallest legal-chess position set that reproduces a repeat touch (TR.38).
#
# Two transpositions are needed. One creates a pointer INSIDE a subtree; the
# other fires a cascade into the top of that same subtree. The cascade then
# reaches the owner twice - once by descending, once through the pointer.
#
#   d4 d5 Nf3                      P   owner of the trigger
#     |- Nf6 c4                    C1
#     |     |- e6 g3               D1  canonical
#     |           |- Be7 Bg2       E1  D1's children - these make the refire
#     |           |- Be7 Nc3       E2
#     |- Nf6 g3                    C2
#           |- e6 c4               D2  -> same position as D1, becomes a pointer
#   Nf3 d5 d4                      Q   -> same position as P, becomes a pointer
#
# Q's cascade pushes into P, which distributes to C1 and C2. C1 delivers to D1
# directly; C2 delivers to D2, which forwards to D1. D1 is touched twice - a
# REVISIT - and because D1 has children it re-pushes to both of them, so the
# edges D1 -> E1 and D1 -> E2 each carry twice with different amounts. Those
# are the REFIRES.

import chess, re, os, sys, hashlib, json, decimal

MOVE_NOTATION = "san"    # "san" (Nf3) or "uci" (g1f3) - how moves are written
SAN_ALIGN = "right"      # "right" or "left" - how moves sit in their column
EXACT_CSV = True         # also write the full-precision figures for a spreadsheet
DECIMALS = 22            # decimal places every percentage is padded to, here
                         # and in the walker. Values are printed exactly and
                         # then padded with zeros so columns line up; a value
                         # needing more places keeps them all.
_W = DECIMALS + 4
_TOL = 1e-12             # figures are exact, so only float noise is tolerated
# Adding two printed figures can be out by half a unit of the last decimal for
# each of them, so a check on a sum needs more room than a check on one value.
_SUM_TOL = _TOL * 4


NODES = [   # share of the position, Lichess explorer 1600-2000, rapid + classical.
            # These are absolute shares: White's moves at a position do NOT sum
            # to 100%, because the popularity filter keeps only some of them.
    ("d4",                              24.682),
    ("Nf3",                              2.735),
    ("d4 d5 Nf3",                       15.614),
    ("d4 d5 Nf3 Nf6 c4",                19.326),
    ("d4 d5 Nf3 Nf6 g3",                10.765),
    ("d4 d5 Nf3 Nf6 c4 e6 g3",          19.796),
    ("d4 d5 Nf3 Nf6 g3 e6 c4",           2.372),
    ("d4 d5 Nf3 Nf6 c4 e6 g3 Be7 Bg2",  96.961),
    ("d4 d5 Nf3 Nf6 c4 e6 g3 Be7 Nc3",   1.046),
    ("Nf3 d5 d4",                       38.233),
]

# ---- real explorer data, if fetch_demo_data.py has been run ----------------
# Without it the tree holds only our own moves, so the walker normalises over
# those alone and d4 reads 90% instead of its real 24.682%. Loading the file
# adds every other move at each position as a leaf, so moveProb matches the
# explorer exactly.
def load_real(nodes):
    """Refresh the shares from fetch_demo_data.py's output, if it is there.
    shareOfPosition is games / totalGames at that position - the same figure
    evaluator.ts computes, and used as-is: no normalising, no rounding.

    The share is worked out here from the two game counts rather than read
    from the stored shareOfPosition, in the same order the fetch used it:
    the counts are exact integers, so this is the one figure in the chain
    that cannot have drifted, and TypeScript doing 100 * games / total on
    the same two integers lands on the same float."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_real_data.json")
    if not os.path.isfile(path):
        return nodes, None
    data = json.load(open(path, encoding="utf-8"))

    share = {}
    for row in data["nodes"]:
        games, total = row.get("games"), row.get("positionTotalGames")
        if games is not None and total:
            share[row["san"]] = 100.0 * games / total
        else:
            share[row["san"]] = row.get("shareOfPosition", 0.0)

    missing = [san for san, _w in nodes if san not in share]
    if missing:
        # These fall back to the built-in weights, which are written to three
        # decimals - so they are not the explorer's figures. Say so, rather
        # than letting them sit in the table looking like the rest.
        print("not in demo_real_data.json, using the built-in weight: %s"
              % ", ".join(missing))
    return [(san, share.get(san, w)) for san, w in nodes], data

KEY_LENGTH = 5           # symbols in a position key, like a short git hash

_KEY_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
# A key must never be readable as something else in the log. Requiring both a
# digit and a letter rules out every English word in one stroke, so no
# blocked-word list is needed, and rules out a bare number too. The UCI test
# matters more than it looks: "e2e4q" is a legal promotion string, and the
# formatter would happily read such a key as a move.
_UCI_LOOKALIKE = re.compile(r"^[a-h][1-8][a-h][1-8][qrbn]?$")


def _key_candidate(fen, width, nonce):
    digest = hashlib.md5(("%s|%d" % (fen, nonce)).encode()).hexdigest()
    value, out = int(digest, 16), []
    for _ in range(width):
        value, remainder = divmod(value, 36)
        out.append(_KEY_ALPHABET[remainder])
    return "".join(out)


def _key_is_usable(key):
    return (any(c.isdigit() for c in key)
            and any(c.isalpha() for c in key)
            and not _UCI_LOOKALIKE.match(key))


def build_keys(fens, width=None):
    """A key per position, all the same width.

    A taken key is simply passed over for the next candidate, so the limit is
    how full the space is rather than the birthday square root: 50,000
    positions in 48 million slots costs a few dozen retries, not a collision.
    The candidates come from the position itself, so the first choice - and
    the fallback order after it - are the same on every run."""
    width = width or KEY_LENGTH
    taken, keys, clashes = {}, {}, 0
    for fen in dict.fromkeys(fens):
        for nonce in range(10000):
            key = _key_candidate(fen, width, nonce)
            if not _key_is_usable(key):
                continue            # unreadable shape, not a clash
            if key not in taken:
                break
            clashes += 1
        else:
            raise SystemExit(
                "no free position key of %d symbols; raise KEY_LENGTH" % width)
        taken[key] = fen
        keys[fen] = key
    return keys, width, clashes

def walk(san_path):
    """UCI path + the real position (placement, side, castling, legal ep)."""
    board, uci = chess.Board(), []
    for san in san_path.split():
        mv = board.parse_san(san)
        uci.append(mv.uci())
        board.push(mv)
    return " ".join(uci), " ".join(board.fen().split()[:4])

NODES, REAL_DATA = load_real(NODES)
if REAL_DATA:
    src_info = REAL_DATA["source"]
    print("real explorer data: %s, speeds %s, ratings %s, fetched %s"
          % (src_info["database"], ",".join(src_info["speeds"]),
             ",".join(str(r) for r in src_info["ratings"]), REAL_DATA["fetchedAt"]))
    print("%d nodes, shares taken from the fetch" % len(NODES))
else:
    print("demo_real_data.json not found - using the built-in shares "
          "(the same figures, from the last fetch)")
print()

raw_nodes, keys, tags, fen_of = [], {}, {}, {}
_walked = [(san, weight) + walk(san) for san, weight in NODES]
_key_of_fen, KEY_WIDTH, _key_clashes = build_keys(
    [fen for _s, _w, _p, fen in _walked])
for san, weight, path, fen in _walked:
    raw_nodes.append((len(path.split()) // 2 + 1, path, weight))
    keys[path] = _key_of_fen[fen]
    fen_of[path] = fen
    tags[_key_of_fen[fen]] = fen

print("position keys")
for tag in sorted(set(keys.values())):
    print("  %s  %s" % (tag, tags[tag]))

print()
print("shared keys")
seen = {}
for san, _ in NODES:
    path, _fen = walk(san)
    seen.setdefault(keys[path], []).append(san)
for tag in sorted(seen):
    group = seen[tag]
    if len(group) > 1:
        print("  %s %s == %s" % (tag, group[0], " == ".join(group[1:])))

# ---- run it through the walker ---------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
def default_walker():
    def version(name):
        m = re.search(r"tree_walker_v(\d+)\.py$", name)
        return int(m.group(1)) if m else -1
    for folder in (HERE, os.getcwd()):
        try:
            names = os.listdir(folder)
        except OSError:
            continue
        versioned = sorted((n for n in names if version(n) >= 0), key=version)
        if versioned:
            return os.path.join(folder, versioned[-1])
    return os.path.join(HERE, "tree_walker_v3.py")

walker = sys.argv[1] if len(sys.argv) > 1 else default_walker()
print()
print("walker: %s" % os.path.basename(walker))
src = open(walker).read()
src = re.sub(r"RAW_NODES = \[.*?\n\]", "RAW_NODES = " + repr(raw_nodes), src, flags=re.S)
src = re.sub(r"MOCK_KEYS = \{.*?\n\}", "MOCK_KEYS = " + repr(keys), src, flags=re.S)
src = src.replace('input("\\nPress Enter to close...")', "")

# This script only ever sees the walker's printed text, so a contribution
# smaller than its last decimal is gone before it arrives. The walker has its
# own DECIMALS setting, so the two are kept in step here rather than left to
# drift apart.
if re.search(r"^DECIMALS\s*=\s*\S+", src, flags=re.M):
    src = re.sub(r"^DECIMALS\s*=\s*\S+", "DECIMALS = %r" % (DECIMALS,),
                 src, count=1, flags=re.M)
else:
    # An older walker with the precision baked into its format strings.
    # Widen those instead; precision is only ever raised, never lowered.
    def _widen_decimals(match):
        return ".%d%s" % (max(int(match.group(1)), DECIMALS), match.group(2))
    src = re.sub(r"\.(\d)([f%])", _widen_decimals, src)
print()

_UCI_MOVE = r"[a-h][1-8][a-h][1-8][qrbn]?"
_UCI_HISTORY = _UCI_MOVE + r"(?: +" + _UCI_MOVE + r")*"
_NUM = r"[0-9.]+(?:[eE][-+]?[0-9]+)?"
_KEY = r"[0-9a-z]+"          # a position key: alphanumeric, not letters only

_UCI_HISTORY_RE = re.compile(
    r"(?<![A-Za-z0-9])" + _UCI_HISTORY
)
_NODE_TABLE_RE = re.compile(
    r"^\s*(\d+)\s+(" + _UCI_HISTORY + r")"
    r"\s+FEN=(" + _KEY + r")"
    r"\s+cumProb=\s*(" + _NUM + r")%"
    r"\s+routeProb=\s*(" + _NUM + r")%"
    r"\s+moveProb=\s*(" + _NUM + r")%"
    r"(?:\s+\[(TR\d+)\s+->\s+(" + _UCI_HISTORY + r")\s+FEN=(" + _KEY + r")\])?"
    r"\s*$"
)
_POINTER_RE = re.compile(
    r"\[(TR\d+)\s+->\s+(" + _UCI_HISTORY + r")\s+FEN=(" + _KEY + r")\]"
)

DISPLAY_ROW_BY_UCI = {}

def _split_uci(text):
    """Leading run of real moves, and whatever the walker wrote after them.

    Field values are not always a bare path - the walker may append a note
    such as [POINTER, OWNER]. Converting that as if it were a move raises,
    which would stop the whole run, so it is carried through untouched."""
    tokens = (text or "").split()
    board, kept = chess.Board(), 0
    for token in tokens:
        try:
            move = chess.Move.from_uci(token)
            if move not in board.legal_moves:
                break
            board.push(move)
        except Exception:
            break
        kept += 1
    return " ".join(tokens[:kept]), " ".join(tokens[kept:])

def _san_tokens_from_uci(uci_history):
    board = chess.Board()
    san_tokens = []
    for token in uci_history.split():
        move = chess.Move.from_uci(token)
        san_tokens.append(board.san(move))
        board.push(move)
    return san_tokens

# How wide a move has to be for the columns to line up. A SAN can run to
# seven characters (bxc8=Q#), but most trees never produce one, and reserving
# room for the worst case pushes the paths apart for no reason. These are
# measured from the tree in hand once it is known - see _measure_move_width.
_SAN_W = 7               # widest move in the tree
_MOVENO_W = 1            # digits in the highest move number


def _measure_move_width(uci_histories):
    """Size the move columns to the widest move actually present.

    Measured across every row of every table at once, not per table: an
    UPDATED NODES list is a subset of the baseline, and if each were sized
    on its own the same path would sit at a different offset in each one."""
    global _SAN_W, _MOVENO_W
    widest, deepest = 2, 1
    for uci in uci_histories:
        tokens = _move_tokens(_split_uci(uci)[0])
        for token in tokens:
            widest = max(widest, len(token))
        deepest = max(deepest, (len(tokens) + 1) // 2)
    _SAN_W, _MOVENO_W = widest, len(str(deepest))


def _move(token):
    """One move in its column, on whichever side SAN_ALIGN asks for."""
    return "%-*s" % (_SAN_W, token) if SAN_ALIGN == "left" \
        else "%*s" % (_SAN_W, token)


def _move_tokens(uci_history):
    """The moves of a path, written the way MOVE_NOTATION asks for.

    Column widths are measured from these, so uci mode sizes itself to 4 for
    an ordinary tree and only grows to 5 where a promotion appears."""
    if MOVE_NOTATION == "uci":
        return uci_history.split()
    return _san_tokens_from_uci(uci_history)


def _san_cells_from_uci(uci_history):
    san_tokens = _move_tokens(uci_history)
    out = []
    for i, token in enumerate(san_tokens):
        if i % 2 == 0:
            out.append("%*d." % (_MOVENO_W, i // 2 + 1))
        out.append(_move(token))
    return " ".join(out).rstrip()

def _table_line_from_uci(uci_history):
    uci_history, trailing = _split_uci(uci_history)
    san_tokens = _move_tokens(uci_history)
    groups = []
    for i in range(0, len(san_tokens), 2):
        move_no = i // 2 + 1
        white = san_tokens[i]
        if i + 1 < len(san_tokens):
            black = san_tokens[i + 1]
            groups.append("%*d. %s %s" % (_MOVENO_W, move_no,
                                          _move(white), _move(black)))
        else:
            groups.append("%*d. %s" % (_MOVENO_W, move_no, _move(white)))
    line = " ".join(groups).rstrip()
    if trailing:
        line = (line + "  " + trailing).strip()
    return line

def _format_uci_history(match):
    return _san_cells_from_uci(match.group(0))

def _short_pointer(match):
    event, target_uci, fen_tag = match.groups()
    target_row = DISPLAY_ROW_BY_UCI[target_uci]
    return "[%s -> %d FEN=%s]" % (event, target_row, fen_tag)

_NODE_HEADER_PRINTED = False

# The node table is printed three times: once as the baseline before any
# transposition has moved anything, once after each cascade with a change
# column, and once at the end with the totals. Rows are kept here in print
# order so the later two can be rebuilt.
NODE_ROWS = []              # node, fen, move%, route%, note, uci, walker cum%
_running_cum = {}           # uci -> cumProb as it stands right now

_NODE_FMT = ("%4s  %-{k}s  " + "  ".join(["%{w}s"] * 3) + "  %-3s  %-8s %s"
             ).replace("{k}", str(KEY_WIDTH)).replace("{w}", str(_W))
_NODE_FMT_CHANGE = ("%4s  %-{k}s  " + "  ".join(["%{w}s"] * 3)
                    + "  %{w1}s  %-3s  %-8s %s"
                    ).replace("{k}", str(KEY_WIDTH)
                    ).replace("{w1}", str(_W + 1)).replace("{w}", str(_W))


def _ending_flags():
    """A node is an ending when no other node in the table continues it.

    Worked out from the paths, not read from the walker - so if the count
    here ever disagrees with the walker's own "endings reached", that is a
    real difference and not just two ways of printing the same thing."""
    continued = set()
    for _row, _fen, _move, _route, _note, uci, _walker in NODE_ROWS:
        tokens = uci.split()
        while len(tokens) > 1:
            tokens = tokens[:-1]
            continued.add(" ".join(tokens))
    # A pointer is not an ending: its branch carries on at the owner, which
    # is why it hands its cumProb over instead of keeping it.
    return {uci: ("" if uci in continued or note else "end")
            for _r, _f, _m, _rt, note, uci, _w in NODE_ROWS}


def _node_table(title, prev=None, touched=None):
    """The table. With prev, a change column is added; with touched, only the
    nodes that set of paths names.

    Rows are picked by whether a step touched them, not by whether the number
    visibly moved: cumProb is read from the walker at three decimals, so a
    contribution smaller than 0.001 lands as +0.000 and would otherwise look
    like nothing happened."""
    out = [title] if title else []
    ends = _ending_flags()
    if prev is None:
        out.append(_NODE_FMT % ("node", "fen", "move%", "route%", "cum%",
                                "end", "note", "path"))
    else:
        out.append(_NODE_FMT_CHANGE % ("node", "fen", "move%", "route%",
                                       "cum%", "change", "end", "note",
                                       "path"))
    for row, fen, move, route, note, uci, _walker in NODE_ROWS:
        if touched is not None and uci not in touched:
            continue
        # Every column gets the same decimal count, whatever width the
        # walker happened to print each figure at.
        move, route = _pct(move), _pct(route)
        cum = _pct(_running_cum.get(uci, 0.0))
        path = _table_line_from_uci(uci)
        if prev is None:
            out.append(_NODE_FMT % (row, fen, move, route, cum,
                                    ends.get(uci, ""), note, path))
        else:
            delta = _running_cum.get(uci, 0.0) - prev.get(uci, 0.0)
            shown = _signed(delta) if (touched is not None
                                        or abs(delta) > _TOL) else ""
            out.append(_NODE_FMT_CHANGE % (row, fen, move, route, cum, shown,
                                           ends.get(uci, ""), note, path))
    return "\n".join(out)


def _print_final_table(count):
    if not NODE_ROWS:
        return
    _builtin_print()
    _builtin_print(_node_table(
        "FINAL TABLE   after %d transposition(s)" % count))

    # The count and the total are both in the walker's summary above, so they
    # are not repeated here.

    # The running totals were built from the cascade steps alone. The walker
    # reached its own figures separately, so a disagreement is worth saying.
    for row, _fen, _move, _route, _note, uci, walker in NODE_ROWS:
        if walker is None:
            continue
        if abs(_running_cum.get(uci, 0.0) - float(walker)) > _TOL:
            _builtin_print(
                "WARNING  node %s: walker says %s, the steps add up to %s"
                % (row, _pct(walker), _pct(_running_cum.get(uci, 0.0))))


def _collect_node_row(line):
    """Take one row of the walker's node list. True when it was taken.

    Rows are held rather than printed as they arrive: whether a node is an
    ending depends on the nodes that come after it, so the table can only be
    drawn once the list has finished."""
    m = _NODE_TABLE_RE.match(line)
    if not m:
        return False

    (row, uci_history, fen_tag, cum_prob, route_prob, move_prob,
     event, target_uci, _target_fen) = m.groups()
    row = int(row)

    # Record the row number exactly as the walker displays it.
    # A transposition always points back to an already-seen canonical node.
    DISPLAY_ROW_BY_UCI[uci_history] = row

    note = ""
    if event is not None:
        note = "%s->%d" % (event, DISPLAY_ROW_BY_UCI[target_uci])

    # Baseline: nothing has been handed over yet, so cumProb is routeProb.
    # The walker's own figure is kept for the check at the end.
    NODE_ROWS.append((row, fen_tag, move_prob, route_prob, note,
                      uci_history, cum_prob))
    _running_cum[uci_history] = float(route_prob)
    return True


def _flush_baseline_table():
    global _NODE_HEADER_PRINTED
    if _NODE_HEADER_PRINTED or not NODE_ROWS:
        return
    _NODE_HEADER_PRINTED = True
    _measure_move_width([uci for _r, _f, _m, _rt, _n, uci, _w in NODE_ROWS])
    _builtin_print(_node_table("BASELINE TABLE   before any transposition"))


def _format_walker_string(arg):
    # Everywhere else, keep SAN histories and short pointer annotations.
    arg = _POINTER_RE.sub(_short_pointer, arg)
    arg = _UCI_HISTORY_RE.sub(_format_uci_history, arg)

    # No padding between any *Prob= label and its value.
    arg = re.sub(r"((?:cum|route|move)Prob=)\s+", r"\1", arg)
    return arg

# ---- cascade blocks ---------------------------------------------------------
# A cascade is one transposition plus everything it sets off. The walker prints
# it a line at a time, so the whole block is held back and re-rendered once it
# is complete: step numbers, node numbers and the endings total are only
# settled after the last line has arrived.
#
# Two names for the two kinds of push:
#   HANDOVER  the pointer held a balance, gives it up, lands on zero
#   FORWARD   the pointer was already at zero, passes someone else's through
#
# ENQUEUE is not numbered - nothing is calculated there, it only records what
# is waiting. Its #n is already the identifier, so the step that later spends
# it needs no "queued at" note.

COMPACT_STEPS = True     # False keeps the walker's one-field-per-line stanzas
SHOW_UPDATED_NODES = False   # True keeps the walker's own UPDATED NODES list

_UPDATED_NODES_RE = re.compile(r"^\s*UPDATED NODES\b")
_swallowing_updated = False

# The walker prints its warnings roll-up at the end of its own output, which
# is the middle of this script's. They are held back and printed last instead,
# so nothing worth reading sits above a wall of warnings.
_WARNINGS_RE = re.compile(r"^\s*Warnings roll-up\s*$")
_deferred_warnings = []
_swallowing_warnings = False
_cascade_count = 0

_TR_HEADER_RE = re.compile(r"^\s*TRANSPOSITION\s+(TR\d+)\s*$")
_TR_RULE_RE = re.compile(r"^\s*[-=]{5,}\s*$")
_TR_ROW_RE = re.compile(
    r"^\s*(POINTER|OWNER)\s+(" + _UCI_HISTORY + r")"
    r"\s+fen\s*=?\s*(" + _KEY + r")"
    r"\s+cumProb\s*=?\s*(" + _NUM + r")\s*%"
    r"(?:\s*->\s*(" + _NUM + r")\s*%)?"
    r"\s*$"
)
_TR_CASCADE_RE = re.compile(
    r"^\s*CASCADE\s+carrying\s*=?\s*(" + _NUM + r")\s*%"
    r"\s+endingTotal\s*=?\s*(" + _NUM + r")\s*%\s*$"
)
_ENQUEUE_RE = re.compile(
    r"^\s*\[(\d+)\]\s+ENQUEUE\s+#(\d+)\s*->\s*(" + _UCI_HISTORY + r")"
    r"\s+(" + _NUM + r")\s*%\s*x\s*(" + _NUM + r")\s*%\s*=\s*(" + _NUM + r")\s*%"
    r"\s+queue\s+(\d+)\s*$"
)
_STEP_HEAD_RE = re.compile(
    r"^\s*\[(\d+)\]\s+([A-Z]+)(?:\s+#(\d+))?"
    r"(?:\s+\(queued at \[\d+\]\))?\s*$"
)
# A handover subtracts rather than adds, so its sum needs its own pattern.
_DIFF_RE = re.compile(r"(" + _NUM + r")\s*%\s*-\s*(" + _NUM +
                      r")\s*%\s*->\s*(" + _NUM + r")\s*%")
_STEP_FIELD_RE = re.compile(r"^\s+([A-Za-z]+)\s*:\s*(.*?)\s*$")
_STEP_NOTE_RE = re.compile(r"^\s+!!\s*(.*?)\s*$")
_SUM_RE = re.compile(r"(" + _NUM + r")\s*%\s*\+\s*(" + _NUM + r")\s*%\s*->\s*(" + _NUM + r")\s*%")

# label, node, cumProb before, arrow, cumProb after, path
# step id, kind, item, from, node, before, add, result, queue, path
# Paths are left out here on purpose: the node numbers point at the tables,
# which carry the paths already. Only stray text the walker appended to a
# field is passed through, so nothing it said is silently lost.
# One shape for every row in the cascade body. The sums go in a single column
# rather than under cum%/add/result: those headings only ever described an
# apply. On an enqueue the first figure is the amount being split, not a
# cumulative probability, and a seed has no before and no after at all.
_ARITH_W = _W * 3 + 8
_ROW_FMT = ("%-9s %-9s %-6s %4s %-2s %-4s  %-{a}s  %5s  %-3s %s"
            ).replace("{a}", str(_ARITH_W))


def _row(step_id, kind, item, source, arrow, target, arithmetic,
         queue, end, trailing):
    return _ROW_FMT % (step_id, kind, item, source, arrow, target,
                       arithmetic, queue, end, trailing)


def _sum_text(before, op1, added, op2, after):
    """The row's arithmetic, written out in fixed positions.

    Each figure keeps its own column even when a row has no use for it, so the
    operators stack down the page and an amount always sits in the same place
    whatever kind of row it is on. A seed has only an amount, and it lands in
    the amount column rather than drifting to the end of the line."""
    return "%*s %-2s %*s %-2s %*s" % (
        _W, before or "", op1 or "", _W, added or "",
        op2 or "", _W, after or "")


def _row_header():
    return _row("step", "action", "item", "from", "", "node",
                "%-*s" % (_ARITH_W, "arithmetic"), "queue", "end", "")


_RULE_WIDTH = 80         # the same width as the walker's own rules

_tr_block = None            # the cascade being collected, or None


def _pct(value):
    """The same decimal count everywhere, so number columns stay readable."""
    if value is None or value == "":
        return "?"
    value = float(value)
    text = repr(value)
    if "e" in text or "E" in text:
        text = format(decimal.Decimal(text), "f")     # no exponent notation
    if "." not in text:
        text += ".0"
    whole, frac = text.split(".")
    return whole + "." + frac.ljust(DECIMALS, "0")


def _signed(value):
    """A change, always carrying its sign so the column reads at a glance."""
    text = _pct(value)
    return text if text.startswith("-") else "+" + text


def _node_no(uci_history):
    """The row number this path was given in the node table above."""
    uci_history, _trailing = _split_uci(uci_history)
    return str(DISPLAY_ROW_BY_UCI.get(uci_history, "?"))


def _parent_no(uci_history):
    """Row number of the nearest ancestor that appears in the node table."""
    uci_history, _trailing = _split_uci(uci_history)
    tokens = uci_history.split()
    while len(tokens) > 1:
        tokens = tokens[:-1]
        row = DISPLAY_ROW_BY_UCI.get(" ".join(tokens))
        if row is not None:
            return str(row)
    return ""


def _queue_count(text):
    m = re.search(r"(\d+)", text or "")
    return m.group(1) if m else ""


def _new_block(event):
    return {"event": event, "rows": [], "carrying": None, "ending_total": None,
            "cascade_seen": False, "steps": [], "owner_actual": None,
            "warnings": [], "raw": [], "handover_item": None}


# ---- collecting -------------------------------------------------------------

def _start_step(block, verb, item):
    block["steps"].append({"kind": verb, "item": item, "fields": {}})


def _handover_duplicate(block, step):
    """The walker's first APPLY repeats the header: same two nodes, same sum.

    It is dropped so the handover is stated once, and its arithmetic is used
    for the owner's real closing value instead of one computed here."""
    if step["kind"] != "APPLY" or step["item"] != "1":
        return False
    owner = next((r for r in block["rows"] if r[0].upper() == "OWNER"), None)
    if owner is None or step["fields"].get("node") != owner[1]:
        return False

    block["handover_item"] = step["item"]
    m = _SUM_RE.search(step["fields"].get("cumProb", ""))
    if m:
        before, added, after = m.groups()
        block["owner_actual"] = after
        if abs(float(before) + float(added) - float(after)) > _SUM_TOL:
            block["warnings"].append(
                "handover does not add up: %s + %s should be %s, walker says %s"
                % (_pct(before), _pct(added), _pct(float(before) + float(added)),
                   _pct(after)))
    return True


def _collect_tr_line(line):
    """True when the line has been taken into the cascade being collected."""
    global _tr_block

    if _tr_block is not None:
        _tr_block["raw"].append(line)       # kept in case rendering fails
        if not line.strip():
            return True                     # spacing is decided at render time
        if _TR_RULE_RE.match(line):
            return True

        m = _TR_ROW_RE.match(line)
        if m:
            _tr_block["rows"].append(m.groups())
            return True

        m = _TR_CASCADE_RE.match(line)
        if m:
            _tr_block["carrying"], _tr_block["ending_total"] = m.groups()
            _tr_block["cascade_seen"] = True
            return True

        m = _ENQUEUE_RE.match(line)
        if m:
            _walker_no, item, uci, carried, share, result, queue = m.groups()
            _tr_block["steps"].append({
                "kind": "ENQUEUE", "item": item, "uci": uci,
                "carried": carried, "share": share, "result": result,
                "queue": queue})
            return True

        m = _STEP_HEAD_RE.match(line)
        if m:
            _walker_no, verb, item = m.groups()
            _start_step(_tr_block, verb, item)
            return True

        m = _STEP_FIELD_RE.match(line)
        if m and _tr_block["steps"] and "fields" in _tr_block["steps"][-1]:
            key, value = m.groups()
            _tr_block["steps"][-1]["fields"][key] = value
            return True

        m = _STEP_NOTE_RE.match(line)
        if m and _tr_block["steps"]:
            _tr_block["steps"][-1].setdefault("notes", []).append(m.group(1))
            return True

        if line.startswith(" "):
            # Some other indented line belonging to the step above. Keep it
            # rather than letting it end the block: everything after it would
            # be lost, which is how the refire steps went missing.
            if _tr_block["steps"]:
                _tr_block["steps"][-1].setdefault("notes", []).append(
                    line.strip())
            return True

        _flush_tr_block()

    m = _TR_HEADER_RE.match(line)
    if m:
        _tr_block = _new_block(m.group(1))
        return True
    return False


# ---- rendering --------------------------------------------------------------

def _handover_rows(block, step_id):
    """Emptying the pointer - the one balance change nobody queued.

    Crediting the owner is not here: the walker seeds a worklist item for it
    and then applies it, so those arrive as SEED and APPLY rows of their own.
    If a walker did not emit them, the owner row is drawn here instead so the
    credit is never simply missing."""
    ends = _ending_flags()
    by_role = {role.upper(): (uci, before, after)
               for role, uci, _fen, before, after in block["rows"]}
    carrying = block["carrying"]
    out = []

    if "POINTER" in by_role:
        uci, before, after = by_role["POINTER"]
        given = carrying if carrying is not None else before
        out.append(_row(step_id, "HANDOVER", "--", "", "", _node_no(uci),
                        _sum_text(_pct(before), "-", _pct(given), "->",
                                  _pct(after if after is not None else 0.0)),
                        "", ends.get(_split_uci(uci)[0], ""),
                        _split_uci(uci)[1]))

    owner_covered = any(
        "fields" in s and _split_uci(s["fields"].get("node", ""))[0]
        == _split_uci(by_role.get("OWNER", ("",))[0])[0]
        and s["kind"] in ("APPLY", "SEED")
        for s in block["steps"])
    if "OWNER" in by_role and not owner_covered:
        uci, before, after = by_role["OWNER"]
        if after is None:
            after = float(before) + float(carrying or 0.0)
        source = _node_no(by_role["POINTER"][0]) if "POINTER" in by_role else ""
        out.append(_row("", "APPLY", "#%s" % (block["handover_item"] or "1"),
                        source, "->", _node_no(uci),
                        _sum_text(_pct(before), "+",
                                  _pct(carrying if carrying is not None else 0.0),
                                  "->", _pct(after)),
                        "", ends.get(_split_uci(uci)[0], ""),
                        _split_uci(uci)[1]))
    return out


def _render_step(step, step_id):
    if step["kind"] == "ENQUEUE":
        # No end flag: an enqueue only promises an amount. Nothing has
        # reached the ending until the apply that spends the item, and that
        # row carries the flag.
        return [_row(
            step_id, "ENQUEUE", "#" + step["item"],
            _parent_no(step["uci"]), "->", _node_no(step["uci"]),
            _sum_text(_pct(step["carried"]), "x", _pct(step["share"]), "=",
                      _pct(step["result"])),
            step["queue"], "", _split_uci(step["uci"])[1])]

    fields = step["fields"]
    source, target = fields.get("from", ""), fields.get("node", "")
    before = added = after = None
    operator = "+"
    item_label = "#" + step["item"] if step["item"] else "--"
    m = _SUM_RE.search(fields.get("cumProb", ""))
    if m:
        before, added, after = m.groups()

    if step["kind"] == "HANDOVER":
        # The pointer gives up everything it holds and is left at zero.
        source, target = "", fields.get("node", "")
        m = _DIFF_RE.search(fields.get("cumProb", ""))
        if m:
            before, added, after = m.groups()
        operator = "-"

    if step["kind"] == "SEED":
        # Nothing's balance moves - an item is put on the worklist for later.
        source, target = fields.get("from", ""), fields.get("node", "")
        before = after = ""
        added = re.sub(r"[^0-9.eE+-]", "", fields.get("carrying", "")) or None

    if step["kind"] == "HANDOVER":
        # The pointer gives up everything it holds and is left at zero.
        source, target = "", fields.get("node", "")
        m = _DIFF_RE.search(fields.get("cumProb", ""))
        if m:
            before, added, after = m.groups()
        operator = "-"

    if step["kind"] == "HANDOVER":
        # The pointer gives up everything it holds and is left at zero.
        source, target = "", fields.get("node", "")
        m = _DIFF_RE.search(fields.get("cumProb", ""))
        if m:
            before, added, after = m.groups()
        operator = "-"

    if step["kind"] == "SEED":
        # Nothing's balance moves - an item is put on the worklist for later,
        # so there is no before and no after, only the amount promised.
        source, target = fields.get("from", ""), fields.get("node", "")
        before = after = ""
        added = re.sub(r"[^0-9.eE+-]", "", fields.get("carrying", "")) or None

    if step["kind"] == "FORWARD":
        # A forward consumes one item and puts another on the queue, so the
        # row names both: the one spent and the one created.
        item_label = "#%s>%s" % (step["item"],
                                 fields.get("queued", "?").lstrip("#"))
        # A forward does no arithmetic: the pointer is already empty, so it
        # only routes the amount on to its owner. The sum shows up later, in
        # the step that spends the queued item.
        source, target = fields.get("node", ""), fields.get("owner", "")
        before, after = "", ""
        added = re.sub(r"[^0-9.]", "", fields.get("carrying", "")) or None

    if not COMPACT_STEPS:
        out = ["%-9s %-9s %s" % (step_id, step["kind"], "#" + step["item"])]
        for key in ("from", "node", "carrying", "cumProb", "queue"):
            if key in fields:
                value = fields[key]
                if key in ("from", "node"):
                    value = "%-4s  %s" % (_node_no(value),
                                          _table_line_from_uci(value))

                out.append("   %-10s %s" % (key + ":", value))
        return out

    ends = _ending_flags()
    if step["kind"] != "HANDOVER":
        operator = "+" if before else ""
    # Same reasoning for a seed - it queues an item, it does not deliver one.
    flag = "" if step["kind"] == "SEED" else ends.get(_split_uci(target)[0], "")
    out = [_row(
        step_id, step["kind"], item_label,
        _node_no(source) if source else "", "->" if source else "",
        _node_no(target) if target else "",
        _sum_text(_pct(before) if before else "", operator,
                  _pct(added) if added else "",
                  "->" if after else "", _pct(after) if after else ""),
        _queue_count(fields.get("queue")), flag if target else "",
        _split_uci(target)[1] if target else "")]
    # The walker's own notes on the step - revisits, refires, duplicate hits.
    # This demo exists to produce them, so they are never dropped.
    for note in step.get("notes", []):
        out.append("%-9s %s" % ("", "!! " + note))
    return out


def _render_tr_block(block):
    rows = block["rows"]
    event = block["event"]

    fens = {fen for _role, _uci, fen, _before, _after in rows}
    if len(fens) == 1:
        fen_note = "fen=%s" % fens.pop()
    elif fens:
        # Pointer and owner sharing a fen is what makes this a transposition,
        # so a disagreement here is a real finding, not a display problem.
        fen_note = "fen MISMATCH " + " vs ".join(
            "%s=%s" % (role, fen) for role, _uci, fen, _b, _a in rows)
    else:
        fen_note = ""

    head = "%-9s %s" % (event, "TRANSPOSITION")
    if fen_note:
        head += "   " + fen_note
    if block["carrying"] is not None:
        head += "   carrying %s%%" % _pct(block["carrying"])

    numbered = 0
    out = [head, "-" * _RULE_WIDTH]

    # Done before the handover is drawn: the walker's repeated first APPLY is
    # where the owner's real closing value comes from.
    steps = block["steps"]
    for s in steps:
        if "fields" in s:
            _handover_duplicate(block, s)      # records the item number only

    if rows or steps:
        if COMPACT_STEPS:
            out.append(_row_header())

    # Only reconstruct the handover if the walker did not print one itself.
    if rows and not any(s["kind"] == "HANDOVER" for s in steps):
        numbered += 1
        out += _handover_rows(block, "%s.%03d" % (event, numbered))

    if steps:
        for step in steps:
            numbered += 1
            out += _render_step(step, "%s.%03d" % (event, numbered))
        out.append("-" * _RULE_WIDTH)

    # The ending total is not printed here: the walker's CASCADE END block
    # below already gives it as before -> after with the change, which says
    # everything this line said and more.
    for warning in block["warnings"]:
        out.append("%-9s WARNING  %s" % (event, warning))
    out.append("")
    return "\n".join(row.rstrip() for row in out)


_builtin_print = print


def _apply_block_to_table(block):
    """The closing cumProb each step leaves behind, keyed by path."""
    changed = {}
    for role, uci, _fen, before, after in block["rows"]:
        if after is None:
            if role.upper() == "OWNER" and block["owner_actual"] is not None:
                after = block["owner_actual"]
            elif block["carrying"] is not None:
                after = float(before) + float(block["carrying"])
        if after is not None:
            changed[uci] = float(after)
    for step in block["steps"]:
        if "fields" not in step:
            continue
        fields = step["fields"]
        if step["kind"] == "SEED":
            continue        # a seed queues an item; no balance moves yet
        if step["kind"] == "HANDOVER":
            m = _DIFF_RE.search(fields.get("cumProb", ""))
            pointer = _split_uci(fields.get("node", ""))[0]
            if m and pointer:
                changed[pointer] = float(m.group(3))
            continue
        if step["kind"] == "FORWARD":
            # The pointer hands everything on and is left empty.
            pointer = _split_uci(fields.get("node", ""))[0]
            if pointer:
                changed[pointer] = 0.0
            continue
        target = fields.get("node")
        m = _SUM_RE.search(fields.get("cumProb", ""))
        if target and m:
            changed[_split_uci(target)[0]] = float(m.group(3))
    return changed


def _flush_tr_block():
    global _tr_block, _cascade_count
    if _tr_block is None:
        return
    block, _tr_block = _tr_block, None
    if not (block["rows"] or block["steps"]):
        # Nothing recognised - fall back rather than swallow the heading.
        _builtin_print("TRANSPOSITION %s" % block["event"])
        return

    try:
        rendered = _render_tr_block(block)
    except Exception as problem:
        # Never let the way a block is displayed stop the run. Print what the
        # walker actually said, and say which line could not be handled.
        _builtin_print("TRANSPOSITION %s   (kept as printed: %s)"
                       % (block["event"], problem))
        for raw in block["raw"]:
            _builtin_print(raw)
        return
    _builtin_print(rendered)
    _cascade_count += 1

    changed = _apply_block_to_table(block)
    if changed and NODE_ROWS:
        previous = dict(_running_cum)
        _running_cum.update(changed)
        moved = sum(1 for _r, _f, _m, _rt, _n, uci, _w in NODE_ROWS
                    if uci in changed)
        _builtin_print(_node_table(
            "%s  UPDATED NODES  (%d)" % (block["event"], moved),
            previous, touched=set(changed)))
        _builtin_print()


def _suppress_updated_nodes(line):
    """The table above already says which nodes moved, and says it in context."""
    global _swallowing_updated
    if _swallowing_updated:
        if line.startswith(" ") and line.strip():
            return True
        _swallowing_updated = False
        return False
    if not SHOW_UPDATED_NODES and _UPDATED_NODES_RE.match(line):
        _swallowing_updated = True
        return True
    return False


def _defer_warnings(line):
    """True when the line has been held back for the end of the run."""
    global _swallowing_warnings
    if _swallowing_warnings:
        if line.strip():
            _deferred_warnings.append(line)
            return True
        _swallowing_warnings = False
        return True
    if _WARNINGS_RE.match(line):
        _swallowing_warnings = True
        return True
    return False


def _print_deferred_warnings():
    if not _deferred_warnings:
        return
    _builtin_print()
    _builtin_print("Warnings roll-up")
    for line in _deferred_warnings:
        # Formatted now rather than when held back: by this point every node
        # has a row number, so the paths inside a warning resolve too.
        _builtin_print(_format_walker_string(line))


def _walker_print(*args, **kwargs):
    if len(args) == 1 and isinstance(args[0], str) and not kwargs:
        if _collect_node_row(args[0]):
            return
        _flush_baseline_table()
        if _collect_tr_line(args[0]):
            return
        if _suppress_updated_nodes(args[0]):
            return
        if _defer_warnings(args[0]):
            return
    else:
        _flush_baseline_table()
        _flush_tr_block()
    formatted = tuple(
        _format_walker_string(arg) if isinstance(arg, str) else arg
        for arg in args
    )
    _builtin_print(*formatted, **kwargs)


g = {"__name__": "__main__", "print": _walker_print}
exec(compile(src, "walker", "exec"), g)
_flush_baseline_table()        # in case the output was nothing but the table
_flush_tr_block()              # in case the output ended inside a block
_print_final_table(_cascade_count)

# ---- PGN --------------------------------------------------------------------
san_of = {}
for san, _w in NODES:
    san_of[walk(san)[0]] = san

def pgn(san_path):
    out, tokens = [], san_path.split()
    for i, tok in enumerate(tokens):
        if i % 2 == 0:
            out.append("%d." % (i // 2 + 1))
        out.append(tok)
    return " ".join(out)

# ---- exact figures for hand-checking ---------------------------------------
# The log above is rounded to DECIMALS so it can be read. These two files carry
# the numbers the walker actually computed, written with enough digits to name
# the float exactly, so multiplying them in a spreadsheet gives the walker's
# answer rather than one off in the last few places.
def exact(value):
    return "" if value is None else "%.17g" % value


def write_exact_csv():
    import csv
    here = os.path.dirname(os.path.abspath(__file__))

    steps_path = os.path.join(here, "cascade_steps_exact.csv")
    with open(steps_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["event", "step", "action", "item", "createdItem",
                         "fromNode", "node", "fen", "before", "amount",
                         "factor", "after", "queue", "fromPath", "path"])
        for r in g["LEDGER"]:
            writer.writerow([
                r["event"], r["step"], r["action"], r["item"],
                r.get("created") if r.get("created") is not None else "",
                DISPLAY_ROW_BY_UCI.get(r["from"], ""),
                DISPLAY_ROW_BY_UCI.get(r["node"], ""), r["fen"],
                exact(r["before"]), exact(r["amount"]), exact(r["factor"]),
                exact(r["after"]), r["queue"], r["from"], r["node"]])

    nodes_path = os.path.join(here, "cascade_nodes_exact.csv")
    with open(nodes_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["node", "fen", "moveProb", "routeProb",
                         "baselineCumProb", "finalCumProb", "end", "note",
                         "path"])
        ends = _ending_flags()
        for row, fen, _move, _route, note, uci, _walker in NODE_ROWS:
            n = by_history.get(uci)
            if n is None:
                continue
            writer.writerow([
                row, fen, exact(n.moveProb), exact(n.routeProb),
                exact(n.routeProb), exact(n.cumProb),
                ends.get(uci, ""), note, uci])
    return steps_path, nodes_path


ordered = sorted(g["nodes"], key=lambda n: n.order)
by_history = {n.history: n for n in g["nodes"]}

if EXACT_CSV:
    try:
        for written in write_exact_csv():
            print("exact figures: %s" % os.path.basename(written))
    except Exception as problem:
        print("exact figures not written: %s" % problem)
rows = {n: i for i, n in enumerate(ordered, start=2)}

print()
print("pgn")
for n in ordered:
    print("  %3d  %s" % (rows[n], pgn(san_of[n.history])))

_print_deferred_warnings()      # last thing in the run
