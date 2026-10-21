# AD: Anki's messages for the Chess Repertoire web page.
#
# Decides nothing: Ctrl + Z from the page is Anki's own undo (AD.13). The add-on
# only keeps Anki's tooltips off the page (AD.12) and hands their text to the
# page through one more AnkiConnect action, chessMessages (AD.14).
# Install: copy this folder into Anki's addons21 folder and restart Anki.

import sys

import aqt.utils
from aqt import gui_hooks, mw
from aqt.qt import Qt

# AD.14: the latest tooltip's text, until the page asks for it.
latest_message = None


def chessMessages(self):
    # AD.14: the latest tooltip's text, or None, and empty it. On Anki's main
    # thread, as AnkiConnect answers requests there, like the tooltips.
    global latest_message
    text, latest_message = latest_message, None
    if text is None:
        return None
    # AD.15: Anki's "Answer Card undone", in Anki's language.
    answer_undone = mw.col is not None and text == mw.col.tr.undo_action_undone(
        action=mw.col.tr.actions_answer_card()
    )
    return {"text": text, "answerUndone": answer_undone}


def tooltip_unless_browser_in_front(tooltip):
    # Wraps a tooltip function: Anki's own, or another add-on's wrapper of it.
    def wrapped(msg, *args, **kwargs):
        # AD.14: keep every tooltip's text for the page.
        global latest_message
        latest_message = str(msg)
        # AD.12: an Anki tooltip floats over every program. Show it only while one
        # of Anki's windows has focus; drop it while another program (the browser) has.
        if mw.app.activeWindow() is None:
            return
        tooltip(msg, *args, **kwargs)

    wrapped.chess_repertoire = True
    return wrapped


def is_tooltip(function):
    # Anki's own tooltip, or the one now in aqt.utils (another add-on may have
    # wrapped Anki's, e.g. anki-power-suite, which loads before us), not yet ours.
    if getattr(function, "chess_repertoire", False):
        return False
    anki_own = getattr(function, "__module__", None) == "aqt.utils" and getattr(function, "__name__", None) == "tooltip"
    return anki_own or function is aqt.utils.tooltip


def close_tooltip_when_anki_loses_focus(state):
    # AD.12: a tooltip shown while Anki had focus (e.g. after Set Due Date in
    # Browse) would float on over the browser for the rest of its 3s.
    if state != Qt.ApplicationState.ApplicationActive:
        aqt.utils.closeTooltip()


def hide_tooltips_over_page():
    # Every Anki tooltip goes through aqt.utils.tooltip. Modules imported from
    # now on get ours from there; modules already in hold their own copy, which
    # may not be the one in aqt.utils now (aqt.operations.collection, for undo).
    # Each copy is wrapped and still called, so other add-ons' wrappers work on.
    for module in list(sys.modules.values()):
        if module is aqt.utils:
            continue
        try:
            tooltip = getattr(module, "tooltip", None)
            if is_tooltip(tooltip):
                module.tooltip = tooltip_unless_browser_in_front(tooltip)
        except Exception:
            pass  # a module that won't be looked into
    if is_tooltip(aqt.utils.tooltip):
        aqt.utils.tooltip = tooltip_unless_browser_in_front(aqt.utils.tooltip)


# AnkiConnect finds an action by method name, among its own methods, for each
# request (AD.02). So a method added to its class is an action like any other.
chessMessages.api = True
chessMessages.versions = ()


def attach():
    for module in list(sys.modules.values()):
        anki_connect = getattr(module, "AnkiConnect", None)
        if isinstance(anki_connect, type) and hasattr(anki_connect, "handler"):
            anki_connect.chessMessages = chessMessages
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
