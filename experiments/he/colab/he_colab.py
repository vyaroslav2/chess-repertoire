"""HE evaluations on Google Colab: Stockfish 19 at 2M nodes, one search per job.

Paste the whole file into one Colab cell, after mounting Drive (drive.mount). Set JOBS and
RESULTS below, then run the cell. It installs Stockfish 19, checks it with bench, and
searches every job not yet in RESULTS, writing one line per finished search. Drive gets
RESULTS only when the file is closed, so it is closed and reopened every SAVE_EVERY results.
Stop it at any time with the stop button; run the cell again to carry on where it stopped.

The engine settings match experiments/he/engine.ts. Both people must use them unchanged,
or the two halves cannot be joined.
"""
import hashlib, json, os, queue, re, subprocess, tarfile, threading, time, urllib.request

JOBS = "/content/drive/MyDrive/he/jobs-a.jsonl"
RESULTS = "/content/drive/MyDrive/he/results-a.jsonl"
LIMIT = None                         # e.g. 50 for a test run: only the first 50 jobs; None for all jobs 
ENGINES = os.cpu_count() or 1        # one single-threaded engine per core
SAVE_EVERY = 500                     # close RESULTS this often, so Drive gets it

# Fixed. Do not change: they define the eval profile.
NODES, HASH_MB, THREADS, MULTIPV = 2_000_000, 64, 1, 1
URL = "https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz"
SHA256 = "9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f"  # GitHub's digest
BINARY = "sf19/stockfish/stockfish-linux-x86-64-universal"
BENCH_NODES = 2497913                # Stockfish 19's bench signature

BOUND = re.compile(r"\b(?:lowerbound|upperbound)\b")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def install(binary=None):
    """Download and unpack Stockfish 19 unless given a binary, then check it with bench."""
    if binary is None:
        binary = BINARY
        if not os.path.exists(binary):
            urllib.request.urlretrieve(URL, "sf19.tar.gz")
            if sha256("sf19.tar.gz") != SHA256:
                raise SystemExit("Wrong download: SHA-256 does not match the Stockfish 19 release.")
            with tarfile.open("sf19.tar.gz") as archive:
                archive.extractall("sf19", filter="data")
            os.chmod(binary, 0o755)
    out = subprocess.run([binary, "bench"], capture_output=True, text=True)
    text = out.stdout + out.stderr
    found = re.search(r"Nodes searched\s*:\s*(\d+)", text)
    if not found or int(found.group(1)) != BENCH_NODES:
        raise SystemExit(f"bench gave {found and found.group(1)}, expected {BENCH_NODES}: not the same engine.")
    name = next((line for line in text.splitlines() if line.startswith("Stockfish")), "?")
    speed = re.search(r"Nodes/second\s*:\s*(\d+)", text)
    print(f"{name} | bench {BENCH_NODES} OK | {int(speed.group(1)):,} nodes/s on one core")
    return binary, name


class Engine:
    def __init__(self, binary):
        self.process = subprocess.Popen([binary], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.DEVNULL, text=True, bufsize=1)
        self.send("uci")
        self.read_until("uciok")
        self.send(f"setoption name Threads value {THREADS}")
        self.send(f"setoption name Hash value {HASH_MB}")
        self.send(f"setoption name MultiPV value {MULTIPV}")
        self.send("isready")
        self.read_until("readyok")

    def send(self, command):
        self.process.stdin.write(command + "\n")
        self.process.stdin.flush()

    def read_until(self, prefix):
        lines = []
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError("Stockfish exited.")
            lines.append(line.rstrip("\n"))
            if lines[-1].startswith(prefix):
                return lines

    def search(self, fen, uci):
        # Empty hash before every search, so results don't depend on job order.
        self.send("ucinewgame")
        self.send("setoption name Clear Hash")
        self.send("isready")
        self.read_until("readyok")
        self.send(f"position fen {fen}")
        self.send(f"go nodes {NODES} searchmoves {uci}")
        return self.read_until("bestmove ")

    def close(self):
        try:
            self.send("quit")
        except OSError:
            pass
        self.process.kill()


def parse(lines, uci):
    """The last exact score: the deepest completed depth, as in engine.ts.

    The score stays as Stockfish gives it, from the side to move (always Black here).
    The import flips it to White's view.
    """
    best = re.match(r"bestmove (\S+)", lines[-1])
    if not best or best.group(1) != uci:
        raise ValueError(f"Engine did not return the requested move {uci}: {lines[-1]}")
    for line in reversed(lines):
        if not line.startswith("info ") or BOUND.search(line):
            continue
        depth = re.search(r"\bdepth (\d+)\b", line)
        score = re.search(r"\bscore (cp|mate) (-?\d+)\b", line)
        pv = re.search(r"\bpv (\S+)", line)
        multipv = re.search(r"\bmultipv (\d+)\b", line)
        if not (depth and int(depth.group(1)) and score and pv) or (multipv and multipv.group(1) != "1"):
            continue
        if pv.group(1) != uci:
            break
        nodes = re.search(r"\bnodes (\d+)\b", line)
        value = int(score.group(2))
        return {"cp": value if score.group(1) == "cp" else None,
                "mate": value if score.group(1) == "mate" else None,
                "depth": int(depth.group(1)), "nodes": int(nodes.group(1)) if nodes else None,
                "info": line, "bestmove": lines[-1]}
    raise ValueError(f"No exact score for {uci}.")


def finished_ids(jobs):
    """Ids already in RESULTS. A line cut off by a crash is removed first."""
    if not os.path.exists(RESULTS):
        return set()
    with open(RESULTS, "rb+") as file:
        data = file.read()
        if data and not data.endswith(b"\n"):
            file.truncate(data.rfind(b"\n") + 1)
            print("Removed a line cut off by the last stop.")
    done = set()
    with open(RESULTS, encoding="utf-8") as file:
        for line in file:
            row = json.loads(line)
            if row["type"] == "result":
                if row["id"] not in jobs or row["uci"] != jobs[row["id"]]["uci"]:
                    raise SystemExit(f"RESULTS has id {row['id']}, which is not in JOBS: wrong pair of files?")
                done.add(row["id"])
    return done


def main(binary=None):
    binary, name = install(binary)
    with open(JOBS, encoding="utf-8") as file:
        jobs = {}
        for line in file:
            job = json.loads(line)
            if job["id"] in jobs:
                raise SystemExit(f"Job id {job['id']} appears twice in JOBS.")
            jobs[job["id"]] = job
    done = finished_ids(jobs)
    if LIMIT is not None:
        jobs = {job_id: jobs[job_id] for job_id in sorted(jobs)[:LIMIT]}
        done &= set(jobs)
    todo = queue.Queue()
    for job_id in sorted(jobs):
        if job_id not in done:
            todo.put(jobs[job_id])
    total, remaining = len(jobs), todo.qsize()
    print(f"{total:,} jobs, {len(done):,} done, {remaining:,} to go, {ENGINES} engine(s)")
    if not remaining:
        return

    lock, stop, errors = threading.Lock(), threading.Event(), []
    progress = {"count": 0, "started": time.time()}
    out = open(RESULTS, "a", encoding="utf-8")
    out.write(json.dumps({"type": "session", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                          "engine": name, "archiveSha256": SHA256, "binarySha256": sha256(binary),
                          "bench": BENCH_NODES, "nodes": NODES, "hashMb": HASH_MB, "threads": THREADS,
                          "multiPv": MULTIPV, "engines": ENGINES, "jobs": os.path.basename(JOBS)}) + "\n")
    out.flush()

    def worker():
        nonlocal out
        engine = None
        try:
            engine = Engine(binary)
            while not stop.is_set():
                try:
                    job = todo.get_nowait()
                except queue.Empty:
                    return
                result = parse(engine.search(job["fen"], job["uci"]), job["uci"])
                with lock:
                    out.write(json.dumps({"type": "result", "id": job["id"], "uci": job["uci"], **result}) + "\n")
                    out.flush()
                    os.fsync(out.fileno())
                    progress["count"] += 1
                    count = progress["count"]
                    if count in (10, 50) or count % 200 == 0 or count == remaining:
                        hours = (time.time() - progress["started"]) / 3600
                        rate = count / hours
                        left = (remaining - count) / rate
                        print(f"{len(done) + count:,} / {total:,} done | {rate:,.0f} an hour | about {left:.1f} h left")
                    if count % SAVE_EVERY == 0:
                        # Drive uploads a file only once it is closed.
                        out.close()
                        out = open(RESULTS, "a", encoding="utf-8")
                        print(f"Saved {len(done) + count:,} results to Drive")
        except Exception as error:
            errors.append(error)
            stop.set()
        finally:
            if engine:
                engine.close()

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(ENGINES)]
    for thread in threads:
        thread.start()
    try:
        while any(thread.is_alive() for thread in threads):
            time.sleep(1)
    except KeyboardInterrupt:
        stop.set()
        print("Stopping after the searches in progress...")
        for thread in threads:
            thread.join()
    finally:
        out.close()
    if errors:
        raise errors[0]
    print(f"Saved {progress['count']:,} results this session in {RESULTS}")


if __name__ == "__main__":
    main()
