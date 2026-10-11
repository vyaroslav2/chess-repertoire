"""Compare two node-capped depth_drift.py runs: shallow vs deep search.

Each run must use --multipv 1 and an unreachable --depths (e.g. 99), so each
position keeps only the deepest depth completed before its --max-nodes cap.

Run:
    python scripts/node_compare.py scripts/temp/nodes_2m.json scripts/temp/nodes_50m.json

Scores are from White's point of view, in cp.
"""
import json
import statistics
import sys

BANDS_CP = [5, 10, 15, 20, 25, 30, 35]


def load(path):
    """{fen: (uci, cp from White's view, depth)}; mates and empty searches skipped."""
    out = {}
    for p in json.load(open(path, encoding="utf-8"))["positions"]:
        if not p["depths"]:
            continue
        depth = max(p["depths"], key=int)
        row = p["depths"][depth][0]
        if row["mate"] is None:
            out[p["fen"]] = (row["uci"], row["cp"] * p["sign"], int(depth))
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: node_compare.py <shallow.json> <deep.json>")
    shallow, deep = load(sys.argv[1]), load(sys.argv[2])
    fens = [f for f in shallow if f in deep]
    if not fens:
        sys.exit("No positions in common.")
    a = [shallow[f][1] for f in fens]
    b = [deep[f][1] for f in fens]
    diffs = [y - x for x, y in zip(a, b)]
    changed = sum(shallow[f][0] != deep[f][0] for f in fens)

    print(f"Positions compared: {len(fens)}")
    print(f"Depth reached: shallow {statistics.median(shallow[f][2] for f in fens)}, "
          f"deep {statistics.median(deep[f][2] for f in fens)} (median)")
    print(f"Best move changed: {changed} of {len(fens)} ({changed / len(fens):.0%})")
    print()
    print("Direction (deep - shallow, White's view):")
    print(f"- Average: {statistics.mean(diffs):+.1f} cp (near 0 = no bias)")
    print(f"- Up {sum(d > 0 for d in diffs)}, down {sum(d < 0 for d in diffs)}, "
          f"same {sum(d == 0 for d in diffs)}")
    print(f"- Average size: {statistics.mean(abs(d) for d in diffs):.1f} cp")
    if len(fens) > 1 and statistics.pvariance(a) > 0:
        slope = statistics.linear_regression(a, b).slope
        print(f"- Growth: deep = {slope:.2f} x shallow (1.00 = no growth; above 1 = deep evals are bigger)")
    print()
    print("| Change   | Positions | Share |")
    print("|----------|----------:|------:|")
    low = 0
    for high in BANDS_CP:
        n = sum(low <= abs(d) <= high for d in diffs)
        print(f"| {low}-{high} cp".ljust(11) + f"| {n:9} | {n / len(fens):5.0%} |")
        low = high + 1
    n = sum(abs(d) > BANDS_CP[-1] for d in diffs)
    print(f"| > {BANDS_CP[-1]} cp".ljust(11) + f"| {n:9} | {n / len(fens):5.0%} |")


if __name__ == "__main__":
    main()
