---
tags:
  - processed
---
### FR — Send a Lichess request with retry and user fallback handling

**What the code does**  
FR is the shared HTTP-request helper used when the project asks Lichess for data.

The caller supplies:

- the URL to request;
    
- optionally, the maximum number of automatic attempts;
    
- whether the Lichess API token may be used;
    
- whether this is an `"explorer"` request or an `"eval"` request.
    

The defaults are:

- `10` automatic attempts;
    
- token use enabled;
    
- API type `"explorer"`.
    

The request normally sends:

`Accept: application/json`

If `useToken` is enabled and the `LICHESS_API_TOKEN` environment variable exists, it also sends:

`Authorization: Bearer <token>`

This means the human-data Explorer requests from F currently send the token when one is configured.

FR then sends the HTTP request.

If the response succeeds, it reads the JSON response and immediately returns that data to the caller.

So the ordinary successful path is simply:

```text
request
-> successful response
-> parse JSON
-> return data
```

If Lichess responds with HTTP **429**, meaning the rate limit has been hit, FR treats it specially.

While automatic attempts remain, it:

- prints a rate-limit warning;
    
- waits `2` seconds;
    
- sends the request again.
    

There can be up to `10` attempts in total under the default setting.

If the final automatic attempt also receives `429`, FR stops retrying automatically and asks the user what to do.

For an ordinary Explorer request, the choices are:

- Enter = retry;
    
- `n` = skip;
    
- `s` = stop the script.
    

For an engine-evaluation request, there is one additional choice:

- `c` = fall back from Lichess cloud evaluation to ChessDB.
    

Any unrecognised answer behaves like Enter and retries.

Choosing Enter does **not** merely add another attempt to the existing count.

FR calls `fetchWithRetry()` again from the beginning. The new call therefore receives a fresh set of up to `10` automatic attempts.

If those are exhausted and the user chooses Enter again, another fresh set begins.

There is consequently **no overall retry limit** once manual retrying starts.

Choosing `n` returns `null` to the caller.

For F's human-data requests, this means the caller receives no data for that request.

Choosing `s` executes:

`process.exit(0)`

and stops the Node process immediately.

The `c` choice is available only when the request was marked as an engine-evaluation request.

If selected, FR sets:

`GlobalState.lichessCloudEvals = false`

and returns `null`.

The calling evaluation logic can then fall back to ChessDB instead of continuing to use Lichess cloud evaluation.

---

FR handles **network errors** separately from HTTP responses.

A network error means the request itself failed, for example because the connection could not be completed.

If automatic attempts remain, FR:

- prints the network error;
    
- waits `1` second;
    
- tries again.
    

After the final automatic network-error attempt, it presents the same user choices:

- Enter = retry;
    
- `n` = skip;
    
- `s` = stop;
    
- and `c` for an engine-evaluation request.
    

Again, choosing Enter starts a completely fresh set of automatic attempts.

---

Other unsuccessful HTTP responses are treated differently.

If Lichess responds with an HTTP error other than `429`, FR:

- prints the status;
    
- immediately returns `null`.
    

It does **not** automatically retry the request and does not ask the user what to do.

So FR currently distinguishes three main failure types:

```text
429
-> automatic retries
-> then ask user

network error
-> automatic retries
-> then ask user

other HTTP error
-> immediately return null
```

If execution somehow exits the retry loop without returning earlier, FR also returns `null`.

**Why this matters**  
FR is the common failure-handling layer underneath several Lichess requests.

For human Explorer data, F relies on it when fetching:

- Masters;
    
- Elite;
    
- Amateur.
    

For engine evaluation, other parts of the project can use the same helper while enabling the special ChessDB fallback behaviour.

This means FR determines:

- how aggressively Lichess is retried;
    
- how rate limits are handled;
    
- when the user must intervene;
    
- whether a failed request becomes `null`;
    
- whether the process can be stopped;
    
- when cloud evaluation can fall back to another source.
    

Errors here can therefore affect much more than one individual API call.

**Why it may have been designed this way**  
Likely: the automatic retries were intended to survive short-lived connection problems and temporary Lichess rate limiting without requiring user intervention immediately.

The manual prompt was likely added because, after repeated failures, the programme cannot know whether it should keep waiting, skip the data, switch network/VPN, or stop.

The special ChessDB option exists because an engine-evaluation request has another evaluation source available, whereas Explorer human-game data does not have an equivalent substitute.

**Also affects:**  
[[F]]  
[[B2.08]]  
[[R.14]]

Notes:

 #bug For required human-data Explorer requests, "skip" must not return `null` and allow generation to continue. We decided in [[F]] that generation requires complete human data: after retries are exhausted, failure to obtain a required bucket must stop generation rather than make a failed request indistinguishable from genuine zero data. The `n` option therefore should not permit an Explorer failure to continue through the repertoire algorithm. Engine-evaluation requests may have different fallback rules. 
 
#bug Choosing `s` calls `process.exit(0)` immediately. According to the current run flow, this bypasses the normal cleanup in [[R.14]], leaving `generator.lock` behind. The next generation then refuses to start until that lock is removed manually. User-requested stopping should unwind through normal cleanup rather than terminating the process directly.
    
#bug The `c` (fall back to ChessDB) option is ineffective: it sets the cloud-eval switch to false, but the switch already starts false and nothing turns it on, so Diagram B never uses Lichess cloud eval in the first place. Same fault described in full at [[B2.06]]; fixing it means deciding whether cloud eval should be the first source at all.
    
#bug Every non-429 HTTP failure is currently treated as immediately non-retryable. That groups temporary server failures such as HTTP `5xx` together with permanent client errors such as many `4xx` responses. Temporary Lichess server errors should normally be eligible for controlled retry, while genuinely non-retryable responses should fail clearly. Required Explorer data must ultimately hard-fail generation if it cannot be obtained. 
    
#roadmap Centralise Lichess request scheduling in FR. Every outgoing Lichess request should pass through one shared limiter so independently running fetch logic cannot collectively exceed the intended request rate. F should then no longer need its own arbitrary one-second waits between Masters, Elite and Amateur requests. 

#bug Opening Explorer requests do not require Lichess authentication, but `fetchWithRetry()` defaults to sending `LICHESS_API_TOKEN` whenever one is configured. Explorer requests should be made without the token. Reserve authenticated requests for endpoints that actually require or benefit from authentication.

#bug A required Explorer request has no clean failure path. Today it can only succeed, skip (which [[F]] says must not be allowed for required data), or stop the whole script via `s`. Once manual retrying starts there is no overall limit, so a request that can never succeed loops until the user gives up and stops everything. There needs to be a fourth outcome: fail this request and stop generation with a clear error, without killing the process abruptly. This is the same outcome the skip-hard-fail bug above and the `s`-cleanup bug both point towards.

#note After the automatic retry cycle is exhausted, pressing Enter deliberately starts another complete retry cycle. This is intended so the user can, for example, switch VPN and continue without restarting generation.
