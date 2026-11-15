# Импорт оценок без аргументов (SCR.52–57). Лежит рядом с sc_exchange.py.
#
#   python sc_import.py               -> окно выбора файла
#   python sc_import.py файл.json     -> этот файл (так его зовёт кнопка в Access)
#
# В конце ждёт Enter, чтобы окно не закрылось. --no-pause отключает это.
import sys
import traceback

import sc_exchange


def pick_file():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Файл оценок для импорта",
        filetypes=[("Файл обмена", "*.json"), ("Все файлы", "*.*")],
    )
    root.destroy()
    return path


def main(argv):
    files = [a for a in argv if a != "--no-pause"]
    try:
        file = files[0] if files else pick_file()
        if not file:
            print("Файл не выбран. Ничего не сделано.")
            code = 1
        else:
            code = sc_exchange.main(["import", file])
    except Exception:
        traceback.print_exc()
        print("[ОШИБКА] Импорт не выполнен. Ничего не записано.", file=sys.stderr)
        code = 1
    if "--no-pause" not in argv:
        input("\nНажми Enter, чтобы закрыть окно...")
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
