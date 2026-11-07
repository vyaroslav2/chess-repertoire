"use client";

import { useEffect } from "react";

// Ctrl + Alt + Shift + two letter keys toggles a class on <html>, e.g. large
// coordinates (C + U, UI.32). Deliberately awkward, so it never
// clashes with the browser or the trainer. The choice is kept in localStorage.

interface HotkeyToggleProps {
  keys: [string, string]; // physical keys (e.code), e.g. ["KeyC", "KeyU"]
  className: string; // the class on <html>, also the localStorage key
}

function apply(className: string, on: boolean) {
  document.documentElement.classList.toggle(className, on);
}

export default function HotkeyToggle({ keys: [first, second], className }: HotkeyToggleProps) {
  useEffect(() => {
    try {
      apply(className, localStorage.getItem(className) === "1");
    } catch {}

    // Physical keys (e.code), so it works on any keyboard layout and with AltGr.
    const held = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      held.add(e.code);
      if (e.repeat || !e.ctrlKey || !e.altKey || !e.shiftKey) return;
      if (!held.has(first) || !held.has(second)) return;
      if (e.code !== first && e.code !== second) return;

      e.preventDefault();
      const on = !document.documentElement.classList.contains(className);
      apply(className, on);
      try {
        localStorage.setItem(className, on ? "1" : "0");
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
  }, [first, second, className]);

  return null;
}
