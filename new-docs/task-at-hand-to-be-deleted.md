
Use plain and simple SSBE, and be concise.
Here's the list of some logic that is intentionally not specified/written.
1. SRS logic is out of the scope of these docs.
2. Reconciliation is abandoned. 
3. Local engine deep verification is now done (in the new docs) after each Black response.
4. Stored cache and it's corresponding cache profile is permanent truth. It doesn't expire. So until we change e.g. speeds or ratings in generation config, the cache is truth. 
5. The new-docs are the ultimate-truth. The real code could not match it.
6. **What happens when a transposition increases the depth budget?**[^1]  
    A position stops at depth 5 while rare. Later, another route raises its `cumProb` into the common band, allowing depth 15. Does generation reopen it and expand its descendants? How does that interact with `visitedList`? The cascade covers probability updates; the missing connection is to further expansion. See [generation config](C:/chess-repertoire/new-docs/config/generation-config.md) and [S3](C:/chess-repertoire/new-docs/specs/S3.md). This is on the roadmap -- out of these new-docs scope.

The task now is to polish the notes. 
1. Making notes follow consistent sequential numbering (it affects the whole folder files as note-block IDs can be cited). I know this violates the rules of never change IDs, but we are currently in writing mode, so it is acceptable. 
2. Ensuring consistent naming across different types of config values, terms, etc.
3. Grammar and typos correction.
4. Some revealed major logical flaws that can cause incorrect/undesired/irrational implementation. 
5. Consistent formatting. 
6. Ensuring every more or less term is has a glossary note. 
7. Ensuring every cited config setting is present in generation config file.

Right, let's start from the OV, first. 

