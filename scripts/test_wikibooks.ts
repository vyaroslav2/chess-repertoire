async function testWikibooks(title: string) {
  const url = `https://en.wikibooks.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data.query.pages;
  const pageId = Object.keys(pages)[0];
  if (pageId !== "-1") {
    console.log(`[${title}] Found:`, pages[pageId].extract.substring(0, 100) + "...");
  } else {
    console.log(`[${title}] Failed.`);
  }
}

async function main() {
  await testWikibooks("Chess_Opening_Theory/1._e4/1...c6");
  await testWikibooks("Chess_Opening_Theory/1._d4");
}

main();
