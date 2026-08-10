async function testOpenSearch(query: string) {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&format=json`;
  const res = await fetch(url);
  const data = await res.json();
  if (data[1] && data[1].length > 0) {
    console.log(`[${query}] Matched: ${data[1][0]}`);
  } else {
    console.log(`[${query}] No match.`);
  }
}

async function main() {
  await testOpenSearch("Caro-Kann Defense Advance Variation");
  await testOpenSearch("Caro-Kann Defense: Advance Variation");
  await testOpenSearch("Queen's Gambit Declined Chigorin Defense");
  await testOpenSearch("Queen's Gambit Accepted");
}

main();
