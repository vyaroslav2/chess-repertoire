export async function fetchWikibooksSnippet(history: string[]) {
  if (history.length === 0) return null;
  
  let path = "Chess_Opening_Theory";
  for (let i = 0; i < history.length; i++) {
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      if (isWhite) {
          path += `/${moveNum}._${history[i]}`;
      } else {
          path += `/${moveNum}...${history[i]}`;
      }
  }

  try {
    const url = `https://en.wikibooks.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(path)}&format=json`;
    const res = await fetch(url);
    const data = await res.json();
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    if (pageId !== "-1") {
       let extract = pages[pageId].extract;
       // Clean up the Wikibooks heading e.g. "== 3. e5 · Advance variation =="
       extract = extract.replace(/^==[^=]+==\n/, "").trim();
       if (extract.length > 50) return extract; // ensure it's not just "..." or empty
    }
  } catch(e) {}
  return null;
}
