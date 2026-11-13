# Общий кэш оценок (SCR.50–57): экспорт и импорт файла обмена для таблицы `calculations` в MySQL.
#
#   python sc_exchange.py export              -> exports/evals-ГГГГ-ММ-ДД.json
#   python sc_exchange.py export --out f.json
#   python sc_exchange.py import f.json
#
# Нужно: Python 3.8+, python-chess, mysql-connector-python
#   python -m pip install chess mysql-connector-python
# Пароль MySQL: переменная окружения SC_MYSQL_PASSWORD, иначе скрипт спросит его.
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

import chess

# --- MySQL: поменять под себя ---
DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": os.environ.get("SC_MYSQL_USER", "root"),
    "database": "gambits",
}
TABLE_NAME = "calculations"

# SCR.10, SCR.12, SCR.22: ровно эти настройки, у обоих одинаковые. Не менять.
SETTINGS = {
    "engine": "Stockfish 19",
    "bench": 2497913,
    "nodes": 200_000_000,
    "threads": 1,
    "hashMb": 1024,
    "multiPv": 1,
    "record": 2,
}
FORMAT = "shared-eval-cache"
FORMAT_VERSION = 1
FILE_KEYS = ["format", "formatVersion", "settings", "evals"]
EVAL_KEYS = ["fullFen", "uci", "san", "cp", "mate", "depth", "nodes", "pv"]
COMPARED_KEYS = ["uci", "san", "cp", "mate", "depth", "nodes", "pv"]
UCI_PATTERN = re.compile(r"^[a-h][1-8][a-h][1-8][qrbn]?$")
MAX_PROBLEMS_SHOWN = 20
COLUMNS = "id, fen, uci, san, cp, mate, depth, nodes, pv"


class Refused(Exception):
    """Файл или таблица не прошли проверку. Ничего не записано."""


# --- Проверки (SCR.55) ---

def canonical_full_fen(raw):
    """SCR.21: все шесть полей, через один пробел, счётчики на месте. Как в коде Colab."""
    parts = raw.split()
    if len(parts) != 6:
        raise ValueError(f"нужно ровно 6 полей FEN, а их {len(parts)}")
    pieces, side, castling, ep, half, full = parts
    if not half.isdigit() or not full.isdigit() or int(full) < 1:
        raise ValueError("неверные счётчики")
    castling = "".join(c for c in "KQkq" if c in castling) or "-"
    pieces = chess.Board(f"{pieces} {side} {castling} {ep} 0 1").board_fen()
    return f"{pieces} {side} {castling} {ep} {int(half)} {int(full)}"


def is_whole(value):
    # bool — тоже int в Python, поэтому type(), а не isinstance().
    return type(value) is int


def play_uci(board, uci):
    """Делает ход, если он возможен; иначе None."""
    if not isinstance(uci, str) or not UCI_PATTERN.match(uci):
        return None
    move = chess.Move.from_uci(uci)
    if move not in board.legal_moves:
        return None
    san = board.san(move)
    board.push(move)
    return san


def eval_problem(e, node_limit=SETTINGS["nodes"]):
    """SCR.55: первое нарушенное правило или None."""
    if not isinstance(e, dict):
        return "не объект"
    if sorted(e.keys()) != sorted(EVAL_KEYS):
        return "поля должны быть ровно такие: " + ", ".join(EVAL_KEYS)

    fen = e["fullFen"]
    if not isinstance(fen, str):
        return "fullFen не строка"
    try:
        canonical = canonical_full_fen(fen)
        board = chess.Board(canonical)
    except ValueError as error:
        return f"fullFen — не допустимая позиция ({error})"
    if not board.is_valid():
        return "fullFen — не допустимая позиция"
    if canonical != fen:
        return f"fullFen не в каноническом виде; канонический: {canonical}"

    cp, mate = e["cp"], e["mate"]
    if (cp is None) == (mate is None):
        return "должно быть задано ровно одно из cp и mate"
    if cp is not None and not is_whole(cp):
        return "cp не целое число"
    if mate is not None and not is_whole(mate):
        return "mate не целое число"
    if mate == 0:
        return "mate равен 0"

    if not is_whole(e["depth"]) or e["depth"] < 1:
        return "depth не целое число от 1"
    if not is_whole(e["nodes"]) or e["nodes"] < 1:
        return "nodes не целое число от 1"
    if e["nodes"] >= node_limit:
        return f"nodes не меньше лимита узлов, {node_limit}"

    uci, san, pv = e["uci"], e["san"], e["pv"]
    if not all(isinstance(x, str) for x in (uci, san, pv)):
        return "uci, san и pv должны быть строками"
    played = play_uci(board, uci)
    if played is None:
        return f"ход {uci} здесь невозможен"
    if played != san:
        return f"san {san} — не ход {uci}; должно быть {played}"

    moves = pv.split(" ")
    if moves[0] != uci:
        return "pv начинается не с uci"
    for i, move in enumerate(moves[1:], start=2):
        if play_uci(board, move) is None:
            return f'ход {i} в pv, "{move}", невозможен; возможно, pv обрезан'
    return None


def refuse(title, problems):
    shown = problems[:MAX_PROBLEMS_SHOWN]
    more = f"\n  ...и ещё {len(problems) - len(shown)}" if len(problems) > len(shown) else ""
    raise Refused(title + ":\n  " + "\n  ".join(shown) + more)


def check_evals(evals, title, where=None):
    """SCR.55: каждая оценка проходит, и ни одна позиция не встречается дважды."""
    problems = []
    seen = set()
    for index, e in enumerate(evals):
        fen = e.get("fullFen") if isinstance(e, dict) else None
        label = (where[index] if where else fen) or f"оценка {index + 1}"
        problem = eval_problem(e)
        if problem:
            problems.append(f"{label}: {problem}")
        if isinstance(fen, str):
            if fen in seen:
                problems.append(f"{label}: позиция встречается больше одного раза")
            seen.add(fen)
    if problems:
        refuse(title, problems)


# --- Файл обмена (SCR.50) ---

def build_file(evals):
    """Текст файла: оценки по fullFen, поля в постоянном порядке — два экспорта одного кэша совпадают байт в байт."""
    check_evals(evals, "Экспорт отменён, файл не записан")
    ordered = [{key: e[key] for key in EVAL_KEYS} for e in sorted(evals, key=lambda e: e["fullFen"])]
    data = {"format": FORMAT, "formatVersion": FORMAT_VERSION, "settings": dict(SETTINGS), "evals": ordered}
    return json.dumps(data, indent=2, ensure_ascii=False) + "\n"


def parse_file(text):
    """SCR.52, SCR.55: читает файл другого человека. При любой ошибке отвергает его целиком."""
    try:
        data = json.loads(text)
    except ValueError as error:
        raise Refused(f"Файл отвергнут: это не JSON ({error})")
    if not isinstance(data, dict):
        raise Refused("Файл отвергнут: это не объект JSON")
    if sorted(data.keys()) != sorted(FILE_KEYS):
        raise Refused("Файл отвергнут: поля верхнего уровня должны быть ровно такие: " + ", ".join(FILE_KEYS))
    if data["format"] != FORMAT:
        raise Refused(f"Файл отвергнут: format = {data['format']!r}, а нужно {FORMAT!r}")
    if not is_whole(data["formatVersion"]) or data["formatVersion"] != FORMAT_VERSION:
        raise Refused(f"Файл отвергнут: formatVersion = {data['formatVersion']!r}, а нужно {FORMAT_VERSION}")
    theirs = data["settings"]
    if not isinstance(theirs, dict) or sorted(theirs.keys()) != sorted(SETTINGS.keys()):
        raise Refused("Файл отвергнут: поля settings должны быть ровно такие: " + ", ".join(SETTINGS))
    for key, ours in SETTINGS.items():
        value = theirs[key]
        if type(value) is not type(ours) or value != ours:
            raise Refused(f"Файл отвергнут: settings.{key} = {value!r}, а у нас {ours!r}")
    if not isinstance(data["evals"], list):
        raise Refused("Файл отвергнут: evals не список")
    check_evals(data["evals"], "Файл отвергнут, ничего не записано")
    return data["evals"]


# --- Таблица: нули <-> null (SCR.57) ---

def row_to_eval(row):
    """Строка таблицы -> оценка файла. В таблице «нет значения» — это 0: mate 0 значит «мата нет»;
    при мате cp равен 0. Здесь оба нуля становятся null."""
    _id, fen, uci, san, cp, mate, depth, nodes, pv = row
    if mate == 0:
        mate = None
    if mate is not None and cp == 0:
        cp = None
    return {"fullFen": fen, "uci": uci, "san": san, "cp": cp, "mate": mate, "depth": depth, "nodes": nodes, "pv": pv}


def eval_to_columns(e):
    """Оценка файла -> столбцы таблицы. null снова становится 0; hash и ponder — как в коде Colab."""
    moves = e["pv"].split(" ")
    return {
        "fen": e["fullFen"],
        "uci": e["uci"],
        "san": e["san"],
        "cp": e["cp"] if e["cp"] is not None else 0,
        "pv": e["pv"],
        "mate": e["mate"] if e["mate"] is not None else 0,
        "depth": e["depth"],
        "nodes": e["nodes"],
        "hash": hashlib.md5(e["fullFen"].encode("utf-8")).hexdigest(),
        "ponder": moves[1] if len(moves) > 1 else None,
    }


def read_rows(conn, only_searched):
    cursor = conn.cursor()
    where = "uci IS NOT NULL" if only_searched else "fen IS NOT NULL"
    cursor.execute(f"SELECT {COLUMNS} FROM {TABLE_NAME} WHERE {where} ORDER BY id")
    rows = cursor.fetchall()
    cursor.close()
    return rows


def export_evals(conn):
    """SCR.51, SCR.57: все посчитанные строки таблицы, в виде файла. Строки, где uci пуст, ещё не посчитаны и не идут."""
    evals, where, problems = [], [], []
    for row in read_rows(conn, only_searched=True):
        label = f"id {row[0]}, {row[1]}"
        empty = [name for name, value in zip(("fen", "san", "depth", "nodes", "pv"), (row[1], row[3], row[6], row[7], row[8])) if value is None]
        if empty:
            problems.append(f"{label}: пусто: {', '.join(empty)}")
            continue
        evals.append(row_to_eval(row))
        where.append(label)
    if problems:
        refuse("Экспорт отменён, файл не записан", problems)
    check_evals(evals, "Экспорт отменён, файл не записан", where)
    return build_file(evals), len(evals)


def import_evals(conn, evals):
    """SCR.52, SCR.53, SCR.57: добавляет оценки, которых ещё нет. Сначала всё проверяет; пишет всё или ничего."""
    check_evals(evals, "Файл отвергнут, ничего не записано")
    by_fen = {}
    for row in read_rows(conn, only_searched=False):
        by_fen.setdefault(row[1], []).append(row)

    problems, inserts, updates = [], [], []
    already = 0
    for e in evals:
        rows = by_fen.get(e["fullFen"], [])
        if len(rows) > 1:
            ids = ", ".join(str(r[0]) for r in rows)
            problems.append(f"{e['fullFen']}: в таблице несколько строк с этой позицией (id {ids}); сначала исправить таблицу")
        elif not rows:
            inserts.append(e)
        elif rows[0][2] is None:
            updates.append((rows[0][0], e))  # строка ждёт поиска: заполнить её
        else:
            ours = row_to_eval(rows[0])
            differ = [key for key in COMPARED_KEYS if ours[key] != e[key]]
            if differ:
                detail = "; ".join(f"{key}: у нас {ours[key]!r}, у них {e[key]!r}" for key in differ)
                problems.append(f"{e['fullFen']} (id {rows[0][0]}): {detail}")
            else:
                already += 1
    if problems:
        refuse("Файл отвергнут, ничего не записано: эти позиции расходятся с нашей таблицей", problems)

    cursor = conn.cursor()
    try:
        for e in inserts:
            c = eval_to_columns(e)
            cursor.execute(
                f"INSERT INTO {TABLE_NAME} (fen, uci, san, cp, pv, mate, depth, nodes, hash, ponder) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (c["fen"], c["uci"], c["san"], c["cp"], c["pv"], c["mate"], c["depth"], c["nodes"], c["hash"], c["ponder"]),
            )
        for row_id, e in updates:
            c = eval_to_columns(e)
            cursor.execute(
                f"UPDATE {TABLE_NAME} SET uci=%s, san=%s, cp=%s, pv=%s, mate=%s, depth=%s, nodes=%s, hash=%s, ponder=%s WHERE id=%s",
                (c["uci"], c["san"], c["cp"], c["pv"], c["mate"], c["depth"], c["nodes"], c["hash"], c["ponder"], row_id),
            )
        # Перечитать записанное до commit: так ловится и молча обрезанный столбец (pv в varchar(255)).
        written = {e["fullFen"]: e for e in inserts}
        written.update({e["fullFen"]: e for _, e in updates})
        mismatched = []
        for row in read_rows(conn, only_searched=True):
            e = written.get(row[1])
            if e is not None and row_to_eval(row) != e:
                mismatched.append(f"id {row[0]}, {row[1]}")
        if mismatched:
            refuse("Импорт отменён, ничего не записано: таблица сохранила не то, что ей дали "
                   "(проверьте размер столбцов, например pv)", mismatched)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        cursor.close()
    return len(inserts), len(updates), already


# --- Запуск ---

def connect():
    import mysql.connector  # здесь, чтобы проверки работали и без MySQL

    password = os.environ.get("SC_MYSQL_PASSWORD")
    if password is None:
        password = getpass.getpass(f"Пароль MySQL для {DB_CONFIG['user']}: ")
    return mysql.connector.connect(**DB_CONFIG, password=password, autocommit=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Общий кэш оценок (SCR.50–57)")
    sub = parser.add_subparsers(dest="command", required=True)
    export_parser = sub.add_parser("export", help="записать все оценки в файл")
    export_parser.add_argument("--out", help="куда писать; по умолчанию exports/evals-ГГГГ-ММ-ДД.json")
    import_parser = sub.add_parser("import", help="добавить оценки из файла друга")
    import_parser.add_argument("file")
    args = parser.parse_args(argv)

    try:
        if args.command == "import":
            evals = parse_file(Path(args.file).read_text(encoding="utf-8"))
            conn = connect()
            try:
                added, filled, already = import_evals(conn, evals)
            finally:
                conn.close()
            print(f"[ГОТОВО] В файле {len(evals)} оценок: {added} добавлено, {filled} заполнено "
                  f"(строки ждали поиска), {already} уже были и совпали.")
        else:
            conn = connect()
            try:
                text, count = export_evals(conn)
            finally:
                conn.close()
            out = Path(args.out) if args.out else Path("exports") / f"evals-{date.today().isoformat()}.json"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding="utf-8", newline="\n")
            print(f"[ГОТОВО] {count} оценок записано в {out.resolve()}")
    except Refused as error:
        print(f"[ОШИБКА] {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
