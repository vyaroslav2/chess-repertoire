# Экспорт оценок без аргументов (SCR.51, SCR.56, SCR.57). Лежит рядом с sc_exchange.py.
#
#   python sc_export.py   -> exports\evals-ГГГГ-ММ-ДД.json в папке скрипта
#
# В конце ждёт Enter, чтобы окно не закрылось. --no-pause отключает это.
import sys
import traceback

import sc_exchange


def main(argv):
    try:
        code = sc_exchange.main(["export"])
    except Exception:
        traceback.print_exc()
        print("[ОШИБКА] Экспорт не выполнен. Файл не записан.", file=sys.stderr)
        code = 1
    if "--no-pause" not in argv:
        input("\nНажми Enter, чтобы закрыть окно...")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
