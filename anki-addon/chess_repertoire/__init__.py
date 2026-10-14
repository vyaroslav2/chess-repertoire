# AD: the Ctrl + Z layer for the Chess Repertoire web page.
#
# Gives AnkiConnect one more action, chessUndo(cardId): undo the latest grade,
# but only if it is Anki's next undo step and of the card the page expects.
# Also keeps Anki's tooltips off the page while the browser is in front (AD.12).
# Install: copy this folder into Anki's addons21 folder and restart Anki.

import sys

import aqt.utils
from aqt import gui_hooks, mw
from aqt.qt import Qt

anki_tooltip = aqt.utils.tooltip


def chessUndo(self, cardId):
    # AD.04: check and undo in one step, on Anki's main thread (AnkiConnect
    # answers requests there).
    col = mw.col
    if col is None:
        raise Exception("collection is not available")

    # AD.03: the next undo step, in Anki's language, and the latest grade's card.
    step = col.undo_status().undo
    last_graded = col.db.scalar("select cid from revlog order by id desc limit 1")
    is_grade = step == col.tr.actions_answer_card()
    if not is_grade or last_graded != cardId:
        # AD.05: block. Undo nothing, and say what the next step is.
        return {"undone": False, "step": step, "isGrade": is_grade}

    # As Anki's own undo (aqt/operations/collection.py), but with no tooltip:
    # the page shows its own message (AD.06, MS.01).
    out = col.undo()
    mw.update_undo_actions()
    gui_hooks.state_did_undo(out)
    gui_hooks.operation_did_execute(out.changes, None)
    # Anki redraws its study screen only once its window has focus, and the
    # browser has it. Redraw now, so the undone card is back on screen (AD.04).
    if mw.state == "review":
        mw.reviewer.refresh_if_needed()
    return {"undone": True}


def tooltip_unless_browser_in_front(*args, **kwargs):
    # AD.12: an Anki tooltip floats over every program. Show it only while one
    # of Anki's windows has focus; drop it while another program (the browser) has.
    if mw.app.activeWindow() is None:
        return
    anki_tooltip(*args, **kwargs)


def close_tooltip_when_anki_loses_focus(state):
    # AD.12: a tooltip shown while Anki had focus (e.g. after Set Due Date in
    # Browse) would float on over the browser for the rest of its 3s.
    if state != Qt.ApplicationState.ApplicationActive:
        aqt.utils.closeTooltip()


def hide_tooltips_over_page():
    # Every Anki tooltip goes through aqt.utils.tooltip. Modules imported from
    # now on get ours from there; modules already in hold their own copy.
    aqt.utils.tooltip = tooltip_unless_browser_in_front
    for module in list(sys.modules.values()):
        try:
            if getattr(module, "tooltip", None) is anki_tooltip:
                module.tooltip = tooltip_unless_browser_in_front
        except Exception:
            pass  # a module that won't be looked into


# AnkiConnect finds an action by method name, among its own methods, for each
# request (AD.02). So a method added to its class is an action like any other.
chessUndo.api = True
chessUndo.versions = ()


def attach():
    for module in list(sys.modules.values()):
        anki_connect = getattr(module, "AnkiConnect", None)
        if isinstance(anki_connect, type) and hasattr(anki_connect, "handler"):
            anki_connect.chessUndo = chessUndo
            return True
    return False


# Add-ons load in folder-name order, so AnkiConnect (2055492159) is usually in
# already. If not, try again once every add-on has loaded.
if not attach():
    gui_hooks.main_window_did_init.append(attach)

hide_tooltips_over_page()
mw.app.applicationStateChanged.connect(close_tooltip_when_anki_loses_focus)
# Again once every add-on has loaded, for any that copied Anki's tooltip meanwhile.
gui_hooks.main_window_did_init.append(hide_tooltips_over_page)
