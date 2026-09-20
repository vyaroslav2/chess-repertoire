My goal now is to draft the bones, foundation -- and explore only where I feel depth is needed (e.g. maths, transpositions handling (done already) etc. -- e.g. I have had problems with transpositions in the past, now I drew the diagram and the logic is bullet proof).  
So my code is somewhat working. The goal is to document what's working (before building on top of that) and to make it 'truth', so that a building AI won't get off rails with future iterations. The documentation says what the app does -- the source of truth.  
Also documentation reveals bugs and gaps in the logic I might have not noticed because of the happy path. Also I get to know the architecture of my app better (again, I find some things that are not intentions = bugs). 
The `new-docs` are the up-to-date docs, the `\chess-repertoire\docs` are just legacy docs, I haven't removed them yet, but you should not look to them. 
Before going to polish and clear errors in the existing docs, I want to know if I covered everything, or did I miss some core logic. 
I'm writing intentions that do not always match the existing production code.
Use plain and simple SSBE, and be concise.
1. SRS logic is out of the scope of these docs.
2. Reconciliation is abandoned. 
3. Local engine deep verification is now done (in the new docs) after each Black response.
4. Stored cache and it's corresponding cache profile is permanent truth. It doesn't expire. So until we change e.g. speeds or ratings in generation config, the cache is truth. 
5. The new-docs are the ultimate-truth. The real code could not match it.
6. **What happens when a transposition increases the depth budget?**[^1]  
    A position stops at depth 5 while rare. Later, another route raises its `cumProb` into the common band, allowing depth 15. Does generation reopen it and expand its descendants? How does that interact with `visitedList`? The cascade covers probability updates; the missing connection is to further expansion. See [generation config](C:/chess-repertoire/new-docs/config/generation-config.md) and [S3](C:/chess-repertoire/new-docs/specs/S3.md). This is on the roadmap -- out of these new-docs scope.