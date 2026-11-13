# Проверки sc_exchange.py на SQLite вместо MySQL (тот же SQL, только %s -> ?).
#   python -m unittest test_sc_exchange.py      (из папки scripts/sc-friend)
from __future__ import annotations

import hashlib
import json
import sqlite3
import unittest

import sc_exchange as sc

SICILIAN = {
    "fullFen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    "uci": "c7c5", "san": "c5", "cp": 30, "mate": None, "depth": 24, "nodes": 187654321,
    "pv": "c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3",
}
BACK_RANK = {
    "fullFen": "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    "uci": "a1a8", "san": "Ra8#", "cp": None, "mate": 1, "depth": 245, "nodes": 1200, "pv": "a1a8",
}
INDIAN = {
    "fullFen": "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1",
    "uci": "g8f6", "san": "Nf6", "cp": 0, "mate": None, "depth": 25, "nodes": 199999999, "pv": "g8f6 c2c4",
}
PENDING_FEN = "rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1"


class SqliteAsMysql:
    """Обёртка над sqlite3 с параметрами %s, как у mysql.connector."""

    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute(
            "CREATE TABLE calculations (id INTEGER PRIMARY KEY AUTOINCREMENT, fen TEXT, uci TEXT, san TEXT, "
            "cp INTEGER, pv TEXT, mate INTEGER, depth INTEGER, nodes INTEGER, hash TEXT, ponder TEXT)"
        )
        self.db.commit()

    def cursor(self):
        outer = self.db.cursor()

        class Cursor:
            def execute(self, query, params=()):
                outer.execute(query.replace("%s", "?"), params)

            def fetchall(self):
                return outer.fetchall()

            def close(self):
                outer.close()

        return Cursor()

    def commit(self):
        self.db.commit()

    def rollback(self):
        self.db.rollback()

    def add(self, fen, uci=None, san=None, cp=None, mate=None, depth=None, nodes=None, pv=None):
        self.db.execute(
            "INSERT INTO calculations (fen, uci, san, cp, mate, depth, nodes, pv) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (fen, uci, san, cp, mate, depth, nodes, pv),
        )
        self.db.commit()

    def add_eval(self, e, **override):
        """Строка в старой кодировке друга: 0 вместо null."""
        row = {"fen": e["fullFen"], "uci": e["uci"], "san": e["san"], "cp": e["cp"] if e["cp"] is not None else 0,
               "mate": e["mate"] if e["mate"] is not None else 0, "depth": e["depth"], "nodes": e["nodes"], "pv": e["pv"]}
        row.update(override)
        self.add(**row)

    def rows(self):
        return self.db.execute("SELECT id, fen, uci, san, cp, mate, depth, nodes, pv, hash, ponder FROM calculations ORDER BY id").fetchall()


class Rules(unittest.TestCase):
    def test_each_rule(self):
        cases = [
            ({**SICILIAN, "rank": 1}, "поля должны быть"),
            ({**SICILIAN, "fullFen": SICILIAN["fullFen"].replace(" b ", "  b ")}, "не в каноническом"),
            ({**SICILIAN, "fullFen": "8/8/8/8/8/8/8/8 w - - 0 1"}, "не допустимая позиция"),
            ({**SICILIAN, "mate": 3}, "ровно одно из cp и mate"),
            ({**SICILIAN, "cp": None}, "ровно одно из cp и mate"),
            ({**SICILIAN, "cp": 30.5}, "cp не целое"),
            ({**SICILIAN, "cp": True}, "cp не целое"),
            ({**BACK_RANK, "mate": 0}, "mate равен 0"),
            ({**SICILIAN, "depth": 0}, "depth"),
            ({**SICILIAN, "nodes": 200_000_000}, "лимита узлов"),
            ({**SICILIAN, "uci": "c7c4", "pv": "c7c4"}, "невозможен"),
            ({**SICILIAN, "san": "c6"}, "должно быть c5"),
            ({**SICILIAN, "pv": "d7d5 e4d5"}, "pv начинается не с uci"),
            ({**SICILIAN, "pv": "c7c5 g1f3 d7d6 d2d4 c5d4 f3d"}, 'ход 6 в pv, "f3d"'),
            ({**SICILIAN, "pv": "c7c5  g1f3"}, "ход 2 в pv"),
        ]
        for value, expected in cases:
            self.assertIn(expected, sc.eval_problem(value) or "(прошло)", value)
        for e in (SICILIAN, BACK_RANK, INDIAN):
            self.assertIsNone(sc.eval_problem(e))


class File(unittest.TestCase):
    def test_sorted_and_byte_for_byte(self):
        a = sc.build_file([SICILIAN, BACK_RANK, INDIAN])
        b = sc.build_file([INDIAN, SICILIAN, BACK_RANK])
        self.assertEqual(a, b)
        self.assertEqual(sc.parse_file(a), sorted([SICILIAN, BACK_RANK, INDIAN], key=lambda e: e["fullFen"]))

    def test_other_settings_refused(self):
        data = json.loads(sc.build_file([SICILIAN]))
        for key, value in [("bench", 2497914), ("nodes", 100_000_000), ("threads", 2), ("record", 1), ("multiPv", True)]:
            changed = {**data, "settings": {**data["settings"], key: value}}
            with self.assertRaisesRegex(sc.Refused, f"settings.{key}"):
                sc.parse_file(json.dumps(changed))
        with self.assertRaisesRegex(sc.Refused, "больше одного раза"):
            sc.parse_file(json.dumps({**data, "evals": [SICILIAN, SICILIAN]}))


class Export(unittest.TestCase):
    def test_zeros_become_null_and_pending_rows_are_left_out(self):
        conn = SqliteAsMysql()
        conn.add_eval(SICILIAN)
        conn.add_eval(BACK_RANK)
        conn.add_eval(INDIAN)
        conn.add(PENDING_FEN)
        text, count = sc.export_evals(conn)
        self.assertEqual(count, 3)
        self.assertEqual(text, sc.build_file([SICILIAN, BACK_RANK, INDIAN]))

    def test_faults_stop_the_export(self):
        cases = [
            ({"depth": None}, "пусто: depth"),
            ({"cp": 25, "mate": 3}, "ровно одно из cp и mate"),
            ({"pv": "c7c5 g1f3 d7d6 d2d4 c5d4 f3d"}, "обрезан"),
        ]
        for override, expected in cases:
            conn = SqliteAsMysql()
            conn.add_eval(SICILIAN, **override)
            with self.assertRaisesRegex(sc.Refused, expected):
                sc.export_evals(conn)
        conn = SqliteAsMysql()
        conn.add_eval(SICILIAN)
        conn.add_eval(SICILIAN)
        with self.assertRaisesRegex(sc.Refused, "id 2, .*больше одного раза"):
            sc.export_evals(conn)


class Import(unittest.TestCase):
    def test_adds_fills_and_skips(self):
        conn = SqliteAsMysql()
        conn.add_eval(SICILIAN)
        conn.add(BACK_RANK["fullFen"])  # ждёт поиска
        result = sc.import_evals(conn, [SICILIAN, BACK_RANK, INDIAN])
        self.assertEqual(result, (1, 1, 1))

        rows = {row[1]: row for row in conn.rows()}
        self.assertEqual(len(rows), 3)
        back = rows[BACK_RANK["fullFen"]]
        self.assertEqual(back[0], 2)  # та же строка, заполнена
        self.assertEqual(back[4:6], (0, 1))  # cp 0 при мате
        self.assertEqual(back[9], hashlib.md5(BACK_RANK["fullFen"].encode("utf-8")).hexdigest())
        self.assertIsNone(back[10])  # в pv один ход: ponder пуст
        indian = rows[INDIAN["fullFen"]]
        self.assertEqual(indian[4:6], (0, 0))  # mate 0 без мата
        self.assertEqual(indian[10], "c2c4")

        self.assertEqual(sc.import_evals(conn, [SICILIAN, BACK_RANK, INDIAN]), (0, 0, 3))
        text, _ = sc.export_evals(conn)
        self.assertEqual(text, sc.build_file([SICILIAN, BACK_RANK, INDIAN]))

    def test_one_difference_refuses_the_whole_file(self):
        conn = SqliteAsMysql()
        conn.add_eval(SICILIAN)
        theirs = {**SICILIAN, "nodes": SICILIAN["nodes"] + 1}
        with self.assertRaisesRegex(sc.Refused, "nodes: у нас 187654321, у них 187654322"):
            sc.import_evals(conn, [theirs, BACK_RANK])
        self.assertEqual(len(conn.rows()), 1)

    def test_two_rows_for_one_position_refused(self):
        conn = SqliteAsMysql()
        conn.add(SICILIAN["fullFen"])
        conn.add(SICILIAN["fullFen"])
        with self.assertRaisesRegex(sc.Refused, "несколько строк"):
            sc.import_evals(conn, [SICILIAN])

    def test_a_column_that_cuts_the_pv_rolls_back(self):
        conn = SqliteAsMysql()
        conn.db.execute(
            "CREATE TRIGGER cut AFTER INSERT ON calculations BEGIN "
            "UPDATE calculations SET pv = substr(pv, 1, 10) WHERE id = NEW.id; END"
        )
        conn.db.commit()
        with self.assertRaisesRegex(sc.Refused, "не то, что ей дали"):
            sc.import_evals(conn, [INDIAN, SICILIAN])
        self.assertEqual(conn.rows(), [])


if __name__ == "__main__":
    unittest.main()
