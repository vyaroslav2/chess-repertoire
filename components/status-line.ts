// UI.22: `S` turns the status line on and off. On, <html> carries
// data-status-line="on" and CSS shows the line; off, it shows only on hover.

export const statusLineKey = "status-line";

// Run in <head> before the first paint, so a saved "on" never shows late.
export const statusLineScript = `(function(){try{
if(localStorage.getItem("${statusLineKey}")==="1")document.documentElement.dataset.statusLine="on";
}catch(e){}})()`;

export function toggleStatusLine() {
  const root = document.documentElement;
  const on = root.dataset.statusLine !== "on";
  if (on) root.dataset.statusLine = "on";
  else delete root.dataset.statusLine;
  try {
    localStorage.setItem(statusLineKey, on ? "1" : "0");
  } catch {}
}
