# Общий кэш оценок: экспорт и импорт

Скрипты обмениваются оценками Stockfish между твоей таблицей `calculations` и моим проектом. Правила — в SCR.50–57.

* `sc_import.py` — импорт: без аргументов открывает окно выбора файла.
* `sc_export.py` — экспорт: без аргументов.
* `sc_exchange.py` — общий код. Его можно запускать и напрямую, с аргументами.

## Установка

Нужен Python 3.8 или новее.

```bash
python -m pip install chess mysql-connector-python
```

Положи все три `.py` в папку со своими скриптами, рядом с `db_config.py` и `.env`:

```
d:\Файлы\Разработки\Шахматы\Gambits\Контент\Python\
```

Скрипт подключается так же, как твои: `mysql_config("gambits")`. Если `db_config.py` рядом нет, он читает `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` и `DB_PORT` из `.env`. Таблица — `TABLE_NAME` в начале `sc_exchange.py`, по умолчанию `calculations`.

## Импорт

Двойной щелчок по `sc_import.py` или:

```bash
python "d:\Файлы\Разработки\Шахматы\Gambits\Контент\Python\sc_import.py"
```

Откроется окно выбора файла. Можно и сразу указать файл:

```bash
python "d:\Файлы\Разработки\Шахматы\Gambits\Контент\Python\sc_import.py" "c:\Users\nasta\Downloads\evals-2026-11-13.json"
```

Сначала проверяется весь файл, потом всё пишется одной транзакцией: либо целиком, либо никак (SCR.53).
* Новая позиция добавляется новой строкой, с `hash` и `ponder`, как их делает Colab.
* Если позиция уже стоит в очереди (`uci` пуст), строка заполняется. Colab её больше не считает.
* Позиция, которая уже посчитана, должна совпасть во всех полях. Тогда она пропускается, дубликатов не будет. Если хоть одна расходится, ничего не пишется.
* После записи скрипт перечитывает строки и только потом делает commit. Если столбец что-то обрезал (например, `pv` в `varchar(255)`), всё откатывается.

Перед первым импортом сделай дамп `calculations` в Workbench, на всякий случай.

## Экспорт

Двойной щелчок по `sc_export.py` или:

```bash
python "d:\Файлы\Разработки\Шахматы\Gambits\Контент\Python\sc_export.py"
```

Пишет все посчитанные строки в `exports\evals-ГГГГ-ММ-ДД.json` в папке скрипта. Строки, где `uci` пуст, ещё не посчитаны, поэтому не попадают в файл. Нули в `cp` и `mate` становятся `null` (SCR.57). Если хоть одна строка нарушает правила SCR.55, файл не пишется, а скрипт называет эти строки по `id`.

## Кнопки в Access

На форме — две кнопки, `btnImport` и `btnExport`. В модуль формы:

```vba
' Если python не находится, впиши полный путь, например "C:\Python312\python.exe".
Private Const PYTHON_EXE As String = "python"
Private Const SCRIPT_DIR As String = "d:\Файлы\Разработки\Шахматы\Gambits\Контент\Python\"

Private Sub btnImport_Click()
    Dim picker As Object
    Set picker = Application.FileDialog(3) ' msoFileDialogFilePicker
    picker.Title = "Файл оценок для импорта"
    picker.AllowMultiSelect = False
    picker.Filters.Clear
    picker.Filters.Add "Файл обмена", "*.json"
    If picker.Show <> -1 Then Exit Sub
    RunScript "sc_import.py", picker.SelectedItems(1)
End Sub

Private Sub btnExport_Click()
    RunScript "sc_export.py", ""
End Sub

' Открывает окно скрипта и ждёт, пока его закроют (Enter).
Private Sub RunScript(script As String, argument As String)
    Dim command As String
    Dim exitCode As Long
    command = """" & PYTHON_EXE & """ """ & SCRIPT_DIR & script & """"
    If argument <> "" Then command = command & " """ & argument & """"
    exitCode = CreateObject("WScript.Shell").Run(command, 1, True)
    If exitCode = 0 Then
        MsgBox "Готово.", vbInformation
    Else
        MsgBox "Не получилось (код " & exitCode & "). Причина — в окне скрипта.", vbExclamation
    End If
End Sub
```

Окно скрипта остаётся открытым, пока не нажмёшь Enter: в нём видно, сколько оценок добавлено или что пошло не так.

## Проверка

```bash
python -m unittest test_sc_exchange.py
```

Тесты используют SQLite вместо MySQL, поэтому база не нужна.
