"""Depth drift test: how Stockfish evals, ranks and cp losses change with depth.

For each position, Stockfish searches up to the largest depth in DEPTHS with
MultiPV. Every completed depth is printed live. Then it compares the first and
the deepest recorded depth, and shows each move's cp loss against the best move
at every recorded depth. See scripts/README.md.

Run:
    python scripts/depth_drift.py
    python scripts/depth_drift.py --depths 16 20 24 28 --multipv 5 --threads 1

Edit CONFIG below for the defaults. Command-line options override them.
Ctrl+C stops early; finished positions are kept and summarised.
Scores are shown from White's point of view, in cp: negative is good for Black.
Internally (gaps, flips, cache) they stay from the side to move.
"""
import argparse
import json
import os
import signal
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

import chess
import chess.engine

# ---------------------------------------------------------------- CONFIG ----
ROOT = Path(__file__).resolve().parent.parent
STOCKFISH_PATH = (ROOT / "stockfish-windows-x86-64-universal" / "stockfish"
                  / "stockfish-windows-x86-64-universal.exe")  # Stockfish 19
OUTPUT_JSON = ROOT / "scripts" / "temp" / "depth_drift_results.json"
CACHE_DB = ROOT / "scripts" / "temp" / "depth_drift_cache.db"

DEPTHS = [24, 30]      # depths to record; the search runs to the largest
MULTIPV = 5                    # lines per position: best move + MULTIPV-1 others
THREADS = 4                    # 1 = fully repeatable; more = faster
HASH_MB = 256
TIME_CAP_SECONDS = None         # per position; None = no cap
MIN_NODES = None               # keep searching past the target depth until this many
                               # nodes; None = off. --min-nodes alone = 200 million
MAX_NODES = None               # stop at this many nodes, even before the target; None = off
TOLERANCES_CP = [35, 50, 80]   # loss tables: "Rejected at" uses these
CHANGE_STEPS_CP = [5, 10, 15, 20, 25, 30, 35]  # summary: bands of eval change size
# Tolerance per position, as in the generator: the band comes from the full move
# number (moves 1-4 early, 5-8 middle, 9+ late; see moveNumberBands in config.ts).
BAND_LAST_MOVE = {"early": 4, "middle": 8}
TOLERANCE_BY_BAND = {"early": 80, "middle": 50, "late": 35}  # apiToleranceCp
SHOW_ALL_DEPTHS = True         # print every completed depth, not only DEPTHS
SKIP_IN_CHECK = True           # positions in check have few moves and can stall

# Positions: FENS first, then positions sampled from LINES (SAN, from the start).
# Duplicates are analysed once. --fen on the command line replaces both.
FENS = ["rnbqkbnr/pp2pp1p/2pp2p1/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R b KQkq - 1 4"]
# 5 random 10-ply lines from the "Black Universal Repertoire" in prisma/dev.db.
LINES = [
    "e4 c6 d4 d5 exd5 Qxd5 Nf3 Qa5+ Nc3 Bf5",
    "e4 c6 d4 d5 e5 a6 Bd3 g6 c3 c5",
    "d4 d5 Nf3 c6 e3 Bg4 Be2 Nd7 Nbd2 e6",
    "d4 d5 e3 Bf5 Nf3 e6 a3 Nd7 b4 c6",
    "e4 c6 Nf3 g6 Bc4 d5 exd5 cxd5 Bb3 Nc6",
]
# LINES = [
#     "e4 c6 Nf3 g6 d4 d6 Nc3 Nd7",
#     "d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7",
#     "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Na5 Bc2 c5 d4 Qc7",
#     "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3",
#     "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O",
# ]
# A position is sampled after this many plies have been played.
# 3, then every 2nd: after 1.e4 c6 2.d4 (Black's 2nd move), then Black's 3rd, 4th...
# Odd numbers = Black to move; even numbers = White to move.
START_PLY = 3                  # first sampled position: Black's 2nd move
EVERY_N_PLIES = 2              # every 2 plies: Black's moves only
# ---------------------------------------------------------------------------

MATE_CP = 100_000              # mates sort above any cp; excluded from stats


def parse_args():
    p = argparse.ArgumentParser(description="Stockfish depth drift test")
    p.add_argument("--depths", type=int, nargs="+", default=DEPTHS)
    p.add_argument("--multipv", type=int, default=MULTIPV)
    p.add_argument("--threads", type=int, default=THREADS)
    p.add_argument("--hash-mb", type=int, default=HASH_MB)
    p.add_argument("--min-nodes", type=int, nargs="?", const=200_000_000,
                   default=MIN_NODES, help="no value = 200 million; 0 = off")
    p.add_argument("--max-nodes", type=int, default=MAX_NODES, help="0 = off")
    p.add_argument("--time-cap", type=float, default=TIME_CAP_SECONDS,
                   help="seconds per position; 0 = no cap")
    p.add_argument("--tolerances", type=int, nargs="+", default=TOLERANCES_CP)
    p.add_argument("--stockfish", type=Path, default=STOCKFISH_PATH)
    p.add_argument("--out", type=Path, default=OUTPUT_JSON)
    p.add_argument("--fen", action="append", default=None,
                   help="analyse this FEN instead of LINES (repeatable)")
    p.add_argument("--only-marked", action="store_true", default=not SHOW_ALL_DEPTHS,
                   help="print only the depths in --depths")
    p.add_argument("--cache", type=Path, default=CACHE_DB)
    p.add_argument("--no-cache", action="store_true", help="always search again")
    p.add_argument("--clear-cache", action="store_true", help="empty the cache first")
    args = p.parse_args()
    args.depths = sorted(set(args.depths))
    if args.time_cap == 0:
        args.time_cap = None
    args.min_nodes = args.min_nodes or None
    args.max_nodes = args.max_nodes or None
    if min(args.depths) < 1 or args.multipv < 1 or args.threads < 1:
        p.error("depths, multipv and threads must be positive")
    return args


def sample_positions(fens, lines):
    boards, seen = [], set()

    def add(board):
        if SKIP_IN_CHECK and board.is_check():
            return
        if board.is_game_over():
            return
        key = board.fen()
        if key not in seen:
            seen.add(key)
            boards.append(board.copy(stack=False))

    for fen in fens:
        add(chess.Board(fen))
    for line in lines:
        board = chess.Board()
        for ply, san in enumerate(line.split(), 1):
            board.push_san(san)
            if ply >= START_PLY and (ply - START_PLY) % EVERY_N_PLIES == 0:
                add(board)
    return boards


def white_sign(board):
    """Multiply a side-to-move score by this to get White's point of view."""
    return 1 if board.turn == chess.WHITE else -1


def fmt_score(row, sign):
    if row["mate"] is not None:
        return f"M{row['mate'] * sign:+d}"
    return f"{row['cp'] * sign:+d}"


def table_row(cells, widths, right):
    """One Markdown table row, padded so it also lines up in the console."""
    parts = [str(c).rjust(w) if r else str(c).ljust(w)
             for c, w, r in zip(cells, widths, right)]
    return "| " + " | ".join(parts) + " |"


def table_rule(widths, right):
    # Alignment colons only when writing to a file (for Obsidian); plain in a terminal.
    if sys.stdout.isatty():
        return "|" + "|".join("-" * (w + 2) for w in widths) + "|"
    return "|" + "|".join(("-" * (w + 1) + ":") if r else (":" + "-" * (w + 1))
                          for w, r in zip(widths, right)) + "|"


def table_head(headers, widths, right):
    return [table_row(headers, widths, right), table_rule(widths, right)]


ORDINALS = ["1st", "2nd", "3rd"] + [f"{n}th" for n in range(4, 51)]
MOVE_W = 13
DEPTH_COLS = (["Depth", "Time", "Nodes"], [5, 8, 7], [False, True, True])


def fmt_count(n):
    if n is None:
        return "-"
    for unit, size in (("G", 1e9), ("M", 1e6), ("k", 1e3)):
        if n >= size:
            return f"{n / size:.1f}{unit}"
    return str(n)


class Console:
    """Prints result lines and keeps one live status line under them."""

    def __init__(self):
        self.live = sys.stdout.isatty()
        if self.live and os.name == "nt":
            os.system("")  # turns on colour codes in older Windows consoles
        self.lock = threading.RLock()
        self.width = 0
        self.state = None
        self.stop = threading.Event()
        if self.live:
            threading.Thread(target=self._tick, daemon=True).start()

    def _tick(self):
        while not self.stop.wait(0.5):
            self.render()

    def begin(self, label):
        with self.lock:
            self.state = dict(label=label, t0=time.monotonic(),
                              depth=None, sel=None, nodes=None, nps=None)

    def update(self, info):
        with self.lock:
            if self.state is None:
                return
            for key, name in (("depth", "depth"), ("seldepth", "sel"),
                              ("nodes", "nodes"), ("nps", "nps")):
                if key in info:
                    self.state[name] = info[key]

    def end(self):
        with self.lock:
            self.state = None
            self._clear()

    def _clear(self):
        if self.live and self.width:
            sys.stdout.write("\r" + " " * self.width + "\r")
            self.width = 0

    def render(self):
        with self.lock:
            s = self.state
            if s is None or not self.live:
                return
            line = (f"  [{s['label']}] {time.monotonic() - s['t0']:6.1f} s"
                    f" | depth {s['depth'] or '-'} (sel {s['sel'] or '-'})"
                    f" | {fmt_count(s['nodes'])} nodes | {fmt_count(s['nps'])} nps")
            pad = max(0, self.width - len(line))
            sys.stdout.write("\r" + line + " " * pad)
            sys.stdout.flush()
            self.width = len(line)

    def print(self, text=""):
        with self.lock:
            self._clear()
            print(text, flush=True)
        self.render()

    def close(self):
        self.stop.set()
        self.end()


def depth_table(k, args, out, sign):
    headers, widths, right = DEPTH_COLS
    headers = headers + ORDINALS[:k]
    widths = widths + [MOVE_W] * k
    right = right + [False] * k
    out.print()
    for row in table_head(headers, widths, right):
        out.print(row)

    def print_depth(depth, entry):
        marked = depth in args.depths
        if marked or not args.only_marked:
            cells = [("*" if marked else " ") + str(depth), f"{entry['t']:.1f} s",
                     fmt_count(entry["nodes"])]
            cells += [f"{r['san']} {fmt_score(r, sign)}" for r in entry["rows"]]
            out.print(table_row(cells, widths, right))
    return print_depth


class StopRequest:
    """Ctrl+C once: stop after the next completed depth. Twice: stop now.
    Three times: plain KeyboardInterrupt."""

    def __init__(self, out):
        self.out = out
        self.presses = 0
        signal.signal(signal.SIGINT, self._handle)

    def _handle(self, signum, frame):
        self.presses += 1
        if self.presses == 1:
            self.out.print("Ctrl+C: stopping after the next depth. Press again to stop now.")
        else:
            self.out.print("Ctrl+C again: stopping now.")
            signal.signal(signal.SIGINT, signal.default_int_handler)

    @property
    def soon(self):
        return self.presses >= 1

    @property
    def now(self):
        return self.presses >= 2


def search(engine, board, index, total, args, out, stop):
    """Run Stockfish; return {depth: {t, nodes, rows}} for every completed depth."""
    k = min(args.multipv, board.legal_moves.count())
    target = max(args.depths)
    # With min nodes there is no depth limit: the loop below stops the search
    # once the target depth and min nodes are both reached.
    limit = chess.engine.Limit(depth=None if args.min_nodes else target,
                               nodes=args.max_nodes, time=args.time_cap)
    pending, completed = {}, {}
    t0 = time.monotonic()
    print_depth = depth_table(k, args, out, white_sign(board))
    out.begin(f"{index}/{total}")
    # game=index sends ucinewgame, so each position starts with an empty hash.
    with engine.analysis(board, limit, multipv=k, game=index) as analysis:
        for info in analysis:
            out.update(info)
            if stop.now:
                break
            if not all(key in info for key in ("pv", "score", "multipv", "depth")):
                continue
            if info.get("lowerbound") or info.get("upperbound"):
                continue
            depth, line = info["depth"], info["multipv"]
            score = info["score"].relative
            move = info["pv"][0]
            pending.setdefault(depth, {})[line] = dict(
                uci=move.uci(), san=board.san(move),
                cp=score.score(mate_score=MATE_CP), mate=score.mate())
            # Stockfish prints all k lines together when a depth finishes.
            if len(pending[depth]) == k and depth not in completed:
                completed[depth] = dict(t=round(time.monotonic() - t0, 2),
                                        nodes=info.get("nodes"),
                                        rows=[pending[depth][i] for i in range(1, k + 1)])
                print_depth(depth, completed[depth])
                if stop.soon:
                    break
                if (args.min_nodes and depth >= target
                        and (info.get("nodes") or 0) >= args.min_nodes):
                    break
    out.end()
    return completed


def replay(completed, board, args, out):
    """Print a cached search as if it had just run."""
    k = min(args.multipv, board.legal_moves.count())
    print_depth = depth_table(k, args, out, white_sign(board))
    for depth in sorted(completed):
        if depth <= max(args.depths):
            print_depth(depth, completed[depth])


def build_result(board, completed, args, cached, stopped=False):
    target = max(args.depths)
    usable = {d: e for d, e in completed.items() if d <= target}
    reached = max(usable, default=None)
    recorded = {d: usable[d]["rows"] for d in args.depths if d in usable}
    # Time cap hit before the target: also keep the deepest depth reached,
    # so the position can still be compared.
    if reached is not None and reached < target and reached not in recorded:
        recorded[reached] = usable[reached]["rows"]
    last = usable.get(reached, {})
    return dict(fen=board.fen(), lines=min(args.multipv, board.legal_moves.count()),
                seconds=last.get("t"), nodes=last.get("nodes"), target=target,
                reached=reached, capped=not stopped and (reached is None or reached < target),
                stopped=stopped, cached=cached, sign=white_sign(board), depths=recorded)


class Cache:
    """Small SQLite cache of searches. Wiped when the engine or settings change.

    Depths and the time cap are not part of the key: one stored search holds
    every depth it completed, so a lower target reuses it and a higher one
    searches again and replaces it.
    """

    def __init__(self, path, fingerprint):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("create table if not exists meta (key text primary key, value text)")
        self.db.execute("create table if not exists search (fen text primary key, "
                        "time_cap real, completed text)")
        row = self.db.execute("select value from meta where key='fingerprint'").fetchone()
        self.wiped = 0
        if row is None or row[0] != fingerprint:
            if row is not None:
                self.wiped = self.db.execute("select count(*) from search").fetchone()[0]
            self.db.execute("delete from search")
            self.db.execute("insert or replace into meta values ('fingerprint', ?)",
                            (fingerprint,))
        self.db.commit()

    def clear(self):
        self.db.execute("delete from search")
        self.db.commit()

    def get(self, fen, args):
        row = self.db.execute("select time_cap, completed from search where fen=?",
                              (fen,)).fetchone()
        if row is None:
            return None
        cap, completed = row[0], {int(d): e for d, e in json.loads(row[1]).items()}
        if max(completed, default=0) >= max(args.depths):
            return completed
        # The stored search stopped early at its time cap. A cap no larger
        # than that one would stop again, so reuse it.
        if cap is not None and args.time_cap is not None and args.time_cap <= cap:
            return completed
        return None

    def stored_depth(self, fen):
        row = self.db.execute("select completed from search where fen=?", (fen,)).fetchone()
        return max(map(int, json.loads(row[0])), default=0) if row else 0

    def put(self, fen, args, completed):
        """Store a search, unless the stored one already went deeper."""
        if not completed:
            return
        row = self.db.execute("select completed from search where fen=?", (fen,)).fetchone()
        if row and max(map(int, json.loads(row[0])), default=0) > max(completed):
            return
        self.db.execute("insert or replace into search values (?, ?, ?)",
                        (fen, args.time_cap, json.dumps(completed)))
        self.db.commit()

    def close(self):
        self.db.close()


def why_not_compared(result):
    depths = sorted(result["depths"])
    if len(depths) < 2:
        return (f"only {len(depths)} recorded depth(s) {depths}; "
                f"deepest reached d{result['reached']}, target d{result['target']}")
    first, last = result["depths"][depths[0]], result["depths"][depths[-1]]
    if any(r["mate"] is not None for r in first + last):
        return "a mate score"
    return None


def compare(result):
    """First vs deepest recorded depth. None if it cannot be compared."""
    if why_not_compared(result):
        return None
    depths = sorted(result["depths"])
    first, last = result["depths"][depths[0]], result["depths"][depths[-1]]
    best_first, best_last = first[0]["cp"], last[0]["cp"]
    a = {r["uci"]: r for r in first}
    b = {r["uci"]: r for r in last}
    gaps = []
    for uci in a.keys() & b.keys():
        g1, g2 = best_first - a[uci]["cp"], best_last - b[uci]["cp"]
        if g1 == 0 and g2 == 0:
            continue  # best move at both depths
        gaps.append(dict(san=a[uci]["san"], first=g1, last=g2))
    gaps.sort(key=lambda g: g["first"])
    # Every move from either depth; None where it is outside that depth's top lines.
    rows = []
    for uci in list(a) + [u for u in b if u not in a]:
        e1 = a[uci]["cp"] if uci in a else None
        e2 = b[uci]["cp"] if uci in b else None
        gap = (dict(first=best_first - e1, last=best_last - e2)
               if e1 is not None and e2 is not None else None)
        rows.append(dict(san=(a.get(uci) or b[uci])["san"], first=e1, last=e2, gap=gap))
    return dict(d_first=depths[0], d_last=depths[-1], sign=result["sign"],
                best_first=best_first, best_last=best_last, gaps=gaps, rows=rows)


def print_position_summary(result, args, out):
    out.print()
    if result.get("stopped"):
        out.print(f"Stopped by Ctrl+C at d{result['reached']} (target d{result['target']}).")
        out.print()
    if result["capped"]:
        limits = []
        if args.time_cap:
            limits.append(f"time cap {args.time_cap:g} s")
        if args.max_nodes:
            limits.append(f"max nodes {fmt_count(args.max_nodes)}")
        out.print(f"Stopped at d{result['reached']} before target d{result['target']}"
                  f" ({' or '.join(limits) or 'engine stopped'}).")
        out.print()
    cmp = compare(result)
    if cmp is None:
        out.print(f"Not compared: {why_not_compared(result)}.")
        print_loss_tables(result, args, out)
        return
    # White's point of view. Change = later depth minus earlier depth:
    # + means the eval moved towards White, - towards Black.
    sign = cmp["sign"]
    d1, d2 = cmp["d_first"], cmp["d_last"]
    rank1 = {r["san"]: n for n, r in enumerate(result["depths"][d1], 1)}
    rank2 = {r["san"]: n for n, r in enumerate(result["depths"][d2], 1)}
    headers = ["Move", f"Rank d{d1}", f"Rank d{d2}", f"Eval d{d1}", f"Eval d{d2}", "Change"]
    widths = [8, 9, 9, 9, 9, 6]
    right = [False, True, True, True, True, True]
    for row in table_head(headers, widths, right):
        out.print(row)
    for r in cmp["rows"]:
        e1 = "-" if r["first"] is None else f"{r['first'] * sign:+d}"
        e2 = "-" if r["last"] is None else f"{r['last'] * sign:+d}"
        change = ("-" if r["first"] is None or r["last"] is None
                  else f"{(r['last'] - r['first']) * sign:+d}")
        out.print(table_row([r["san"], rank1.get(r["san"], "-"), rank2.get(r["san"], "-"),
                             e1, e2, change], widths, right))
    print_loss_tables(result, args, out)


def print_loss_tables(result, args, out):
    """Per recorded depth: each non-best move's cp loss against that depth's best
    move, and the largest tolerance that rejects it (loss > tolerance)."""
    sign = result["sign"]
    for depth in sorted(result["depths"]):
        rows = result["depths"][depth]
        best = rows[0]
        out.print()
        out.print(f"Loss at d{depth}")
        out.print()
        headers = ["Move", "Eval", "Loss", "Rejected at"]
        widths = [8, 7, 5, 11]
        right = [False, True, True, True]
        for row in table_head(headers, widths, right):
            out.print(row)
        for n, r in enumerate(rows):
            if n == 0:
                loss, rejected = 0, "baseline"
            elif best["mate"] is not None or r["mate"] is not None:
                loss, rejected = "-", "-"
            else:
                # Side-to-move scores, so the loss is positive for either colour.
                loss = best["cp"] - r["cp"]
                failed = [t for t in args.tolerances if loss > t]
                rejected = max(failed) if failed else "-"
            out.print(table_row([r["san"], fmt_score(r, sign), loss, rejected],
                                widths, right))


def print_summary(results, args, started, out):
    cmps = [c for c in (compare(r) for r in results) if c]
    gaps = [g for c in cmps for g in c["gaps"]]
    if not gaps:
        return
    out.print()
    out.print("## Summary")
    out.print()
    # Size of the Change column for every move found at both depths, best moves included.
    sizes = [abs(r["last"] - r["first"]) for c in cmps for r in c["rows"]
             if r["first"] is not None and r["last"] is not None]
    out.print(f"- Average size of change: {sum(sizes) / len(sizes):.1f} cp "
              f"({len(sizes)} moves)")
    # Baseline = best move. Changed = a different best move at the deeper depth.
    changed = sum(r["depths"][c["d_first"]][0]["uci"] != r["depths"][c["d_last"]][0]["uci"]
                  for r in results for c in [compare(r)] if c)
    out.print(f"- Baseline changed: {changed} of {len(cmps)} positions "
              f"({100 * changed / len(cmps):.0f}%)")
    # Bands: each move counted once, so the rows add up to all moves.
    # cp are whole numbers, so "6-10" means more than 5 and up to 10.
    headers, widths, right = ["Change", "Moves", "Share"], [9, 5, 5], [False, True, True]
    out.print()
    for row in table_head(headers, widths, right):
        out.print(row)
    bands, low = [], 0
    for step in CHANGE_STEPS_CP:
        bands.append((f"{low}-{step} cp", low, step))
        low = step + 1
    bands.append((f"> {CHANGE_STEPS_CP[-1]} cp", low, None))
    for label, lo, hi in bands:
        n = sum(lo <= x and (hi is None or x <= hi) for x in sizes)
        out.print(table_row([label, n, f"{100 * n / len(sizes):.0f}%"], widths, right))
    out.print(table_row(["Total", len(sizes), "100%"], widths, right))
    print_gap_summary(results, out)


def band_of(board):
    move = board.fullmove_number
    if move <= BAND_LAST_MOVE["early"]:
        return "early"
    if move <= BAND_LAST_MOVE["middle"]:
        return "middle"
    return "late"


def print_gap_summary(results, out):
    """Per position: each non-best move's gap to the baseline at the first and
    last compared depth. Moves the tolerance would reject are in brackets.
    Rows where a move's pass/reject result differs between the depths are
    shown in yellow in a terminal."""
    rows = []
    for i, result in enumerate(results, 1):
        cmp = compare(result)
        if cmp is None:
            continue
        board = chess.Board(result["fen"])
        band = band_of(board)
        tol = TOLERANCE_BY_BAND[band]
        cells = [i, f"{board.fullmove_number}", f"{band} {tol}"]
        passed = {}
        for key, depth in (("first", cmp["d_first"]), ("last", cmp["d_last"])):
            lines = result["depths"][depth]
            parts, passed[key] = [], {}
            for n, r in enumerate(lines):
                gap = lines[0]["cp"] - r["cp"]
                passed[key][r["san"]] = gap <= tol
                if n == 0:
                    continue
                if gap > tol:
                    parts.append(f"({r['san']} {gap})")
                else:
                    parts.append(f"{r['san']} {gap}")
            cells.append(", ".join(parts))
        # Only moves seen at both depths can flip.
        flip = any(passed["first"][m] != passed["last"][m]
                   for m in passed["first"] if m in passed["last"])
        rows.append((cells, cmp, flip))
    if not rows:
        return
    d1, d2 = rows[0][1]["d_first"], rows[0][1]["d_last"]
    headers = ["#", "Move", "Band", f"Gaps d{d1}", f"Gaps d{d2}"]
    widths = [3, 4, 9] + [max(len(headers[k]), *(len(str(c[k])) for c, _, _ in rows))
                          for k in (3, 4)]
    right = [True, True, False, False, False]
    colour = out.live
    out.print()
    for row in table_head(headers, widths, right):
        out.print(row)
    for cells, _, flipped in rows:
        line = table_row(cells, widths, right)
        out.print(f"\033[33m{line}\033[0m" if flipped and colour else line)


def save(path, args, results):
    path.parent.mkdir(parents=True, exist_ok=True)
    config = dict(depths=args.depths, multipv=args.multipv, threads=args.threads,
                  hash_mb=args.hash_mb, time_cap=args.time_cap,
                  stockfish=str(args.stockfish))
    path.write_text(json.dumps(dict(config=config, positions=results), indent=1),
                    encoding="utf-8")


def main():
    args = parse_args()
    boards = (sample_positions(args.fen, []) if args.fen
              else sample_positions(FENS, LINES))
    if not boards:
        sys.exit("No positions to analyse.")
    out = Console()
    print(f"Stockfish: {args.stockfish}")
    print(f"Positions {len(boards)} | depths {args.depths} | MultiPV {args.multipv} | "
          f"Threads {args.threads} | Hash {args.hash_mb} MB | "
          f"cap {args.time_cap or 'none'} s/position | "
          f"nodes min {fmt_count(args.min_nodes) if args.min_nodes else 'off'}, "
          f"max {fmt_count(args.max_nodes) if args.max_nodes else 'off'}")
    print("Depth * = recorded depth. cp from White's point of view: negative is good for Black.\n")

    # Own process group on Windows, so Ctrl+C reaches this script but not Stockfish.
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {}
    engine = chess.engine.SimpleEngine.popen_uci(str(args.stockfish), timeout=60, **group)
    results, started = [], time.monotonic()
    cache = None
    stop = StopRequest(out)
    try:
        engine.configure({"Threads": args.threads, "Hash": args.hash_mb})
        name = engine.id.get("name", "?")
        out.print(f"Engine: {name}")
        if not args.no_cache:
            # Everything that changes the search itself. Depths and time cap are not here.
            settings = dict(engine=name, multipv=args.multipv,
                            threads=args.threads, hash_mb=args.hash_mb)
            # Node limits join the key only when set, so turning them on wipes
            # the cache but an existing cache without them stays valid.
            if args.min_nodes:
                settings["min_nodes"] = args.min_nodes
            if args.max_nodes:
                settings["max_nodes"] = args.max_nodes
            fingerprint = json.dumps(settings)
            cache = Cache(args.cache, fingerprint)
            if args.clear_cache:
                cache.clear()
                out.print("Cache cleared.")
            elif cache.wiped:
                out.print(f"Settings changed: cache wiped ({cache.wiped} position(s)).")
        for i, board in enumerate(boards, 1):
            if stop.soon:
                break
            out.print()
            out.print(f"### {i}/{len(boards)}  `{board.fen()}`")
            completed = cache.get(board.fen(), args) if cache else None
            cached = completed is not None
            if cached:
                replay(completed, board, args, out)
                out.print()
                out.print("(from cache)")
            else:
                have = cache.stored_depth(board.fen()) if cache else 0
                if have:
                    out.print()
                    out.print(f"Cache has this position only to d{have}; target is "
                              f"d{max(args.depths)}. Stockfish cannot resume, so it "
                              f"searches again from depth 1.")
                completed = search(engine, board, i, len(boards), args, out, stop)
                if cache:
                    cache.put(board.fen(), args, completed)
            stopped = stop.soon and not cached and max(completed, default=0) < max(args.depths)
            result = build_result(board, completed, args, cached, stopped)
            results.append(result)
            print_position_summary(result, args, out)
            save(args.out, args, results)
    except KeyboardInterrupt:
        out.end()
        out.print("\nStopped by Ctrl+C (forced; the position in progress was not saved).")
    finally:
        out.close()
        if cache:
            cache.close()
        try:
            engine.quit()
        except Exception:
            pass
    if stop.soon:
        out.print("\nStopped by Ctrl+C." +
                  (" Finished depths are saved to the cache." if cache else ""))
    print_summary(results, args, started, out)
    if results:
        print(f"Saved: {args.out}")


if __name__ == "__main__":
    main()
