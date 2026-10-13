"use client";

import { useEffect } from "react";

// Ctrl + Alt + Shift + C + U toggles large coordinates (UI.32).
// Deliberately awkward, so it never clashes with the browser or the trainer.
// The choice is kept in localStorage and shown as a class on <html>.

const STORAGE_KEY = "coords-large";
const CLASS_NAME = "coords-large";

function apply(on: boolean) {
  document.documentElement.classList.toggle(CLASS_NAME, on);
}

export default function CoordsHotkey() {
  useEffect(() => {
    try {
      apply(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}

    // Physical keys (e.code), so it works on any keyboard layout and with AltGr.
    const held = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      held.add(e.code);
      if (e.repeat || !e.ctrlKey || !e.altKey || !e.shiftKey) return;
      if (!held.has("KeyC") || !held.has("KeyU")) return;
      if (e.code !== "KeyC" && e.code !== "KeyU") return;

      e.preventDefault();
      const on = !document.documentElement.classList.contains(CLASS_NAME);
      apply(on);
      try {
        localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
      } catch {}
    };
    const handleKeyUp = (e: KeyboardEvent) => held.delete(e.code);
    const clear = () => held.clear();

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return null;
}
