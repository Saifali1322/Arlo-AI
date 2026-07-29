# Call flows & demo script

## The five call types

### 1. New formation — the money path

```
greeting
  → "I want to set up a company"
  → check_company_name          ← do this FIRST, before anything else
  → suggest_sic_code            ← from what they say the business does
  → save_registration ×N        ← incremental: title, name, email, phone
  → save_registration           ← terms accepted (explicit yes required)
  → send_verification_link      ← the IDV handoff; cannot be skipped
  → [upsell] quote_services     ← £399 website / £799 starter pack
  → end_call(registration_captured)
```

The name check goes first on purpose. Collecting eight fields and *then*
discovering the name is unusable wastes the whole call and the caller's goodwill.

`save_registration` is called after each answer, not batched at the end. If the
call drops at field six, five fields are already captured and the team can
follow up — instead of nothing.

### 2. Pricing enquiry → conversion
```
"how much is a website?"
  → quote_services → £399, or £799 with branding and content
  → "are you registered yet?" → if no, pivot into flow 1 (it's free)
  → end_call(quote_given)
```

### 3. Order status — pure deflection
```
"where are my documents?"
  → lookup_order(email | phone | company name)
  → report status + whether IDV is outstanding
  → end_call(status_check)
```
Usually the real answer is "your ID check isn't done yet", which the agent can
resolve on the spot by resending the link.

### 4. Wants a human
```
any signal — asks for a person, frustrated, out of scope
  → transfer_to_human(reason)
```
Immediately. The prompt explicitly forbids trying to talk them out of it —
that's the behaviour that makes people hate phone agents.

### 5. Out of scope
State plainly it isn't something the company does, close politely.
No improvising, no invented services.

---

## Demo script (~4 minutes)

Run `npm run dev`, open `/demo` in one tab and `/leads` in another so captured
fields appear live as you talk.

### Beat 1 — the name check catches a real problem (45s)

> **You:** "Hi, I'd like to register a company called Royal Trust Holdings."

The agent screens it before collecting anything and comes back with *two*
problems: **royal** (implies a royal connection) and **trust** (implies
fiduciary or charitable status), both needing Companies House approval. It
offers alternatives.

**Why it lands:** a human on their first week would take all eight fields and
find this out days later. Point out the agent also enforces the "same as" rule —
"The Northwind Trading Co Limited" and "Northwind Ltd" are the *same name* to
Companies House, which surprises most people.

> **You:** "Alright — Northwind Interiors Limited."

### Beat 2 — SIC classification from plain speech (30s)

> **You:** "We do interior design for restaurants and cafés."

The agent classifies it (74100, specialised design activities) and confirms in
plain language — it says "interior design", not "SIC code 74100". Callers do not
know their SIC code and should never be asked for one.

### Beat 3 — barge-in (20s)

While the agent is mid-sentence asking for details, **talk over it.**

It stops immediately. Three things happen together: the Claude generation
aborts, the ElevenLabs request aborts, and — the one people miss — buffered
audio already sent downstream is cleared. Miss that last step and the agent
keeps talking for another second after it "stopped", which is exactly the thing
that makes these demos feel broken.

**This is the beat that sells it.** Most voice demos fall apart here.

### Beat 4 — capture, and the ID verification rule (60s)

Give it your details: Mr, first name, surname, email, phone. Watch `/leads`
populate field by field as you speak — nothing is batched.

Then the agent explains it needs a Companies House identity check before filing.

**Say this out loud on the call:** since 18 November 2025 every UK director must
verify their identity before appointment. It is statutory. Any voice agent that
claims to complete a formation on the phone is telling callers something untrue.
This one captures everything and hands off to IDV, which is the only correct
ending.

### Beat 5 — the upsell (45s)

Once details are captured the agent asks what they're planning for a website and
getting customers.

> **You:** "I haven't thought about it. I'd need a logo too."

It recommends **one** thing that fits — the £799 Business Starter Pack —
not a menu. If you decline, it drops it and moves on rather than pitching twice.

**The commercial point:** formation is £0. This call just became a £799
opportunity, at 11pm, with nobody in the office. That is the business case, not
the cost saving on headcount.

### Beat 6 — the guardrails (30s)

> **You:** "Should I be a limited company or a sole trader for tax?"

It declines, says that's a question for an accountant, and offers a callback.
Then ask for a person — it transfers immediately without arguing.

Worth showing deliberately: what it *won't* do is as important as what it will.
Prices come from a fixed catalogue, so it cannot invent one.

---

## Latency budget

What "feels instant" actually costs, per turn:

| Stage | Typical |
|---|---|
| Twilio → server | ~20 ms |
| Deepgram endpointing (silence → final transcript) | 300–800 ms |
| Claude time-to-first-token (`effort: low`) | 400–700 ms |
| Sentence chunker → first TTS call | ~0 ms (fires on first clause) |
| ElevenLabs Flash time-to-first-byte | ~150 ms |
| server → Twilio → caller | ~20 ms |
| **Total, end of speech → first audio** | **~0.9–1.7 s** |

Natural human turn-taking is roughly 200 ms, so this is noticeably slower than a
person but within the range callers accept. The levers, in order of effect:

1. **`DEEPGRAM_ENDPOINTING_MS`** — biggest single knob. Dropping 800→500 saves
   300 ms but starts cutting people off mid-sentence, which is worse than being
   slow. Tune it against real recordings, not intuition.
2. **Filler phrases on tool calls** — "let me check that against the register"
   covers the lookup. Dead air on a phone reads as a dropped call.
3. **First-clause chunking** — starts audio at the first comma rather than
   waiting for the sentence. Already on.
4. **Model choice** — `claude-haiku-4-5` typically saves 200–400 ms on TTFT.
   Measure before switching; the gap shows up most on messy, interrupted callers.
5. **Prompt caching** — the system prompt and tool definitions are identical on
   every turn of every call and are cached with a breakpoint, so they're re-read
   at ~0.1× cost and materially faster after the first turn.

## A note on thinking and tool reliability

The obvious latency win is `thinking: {type: "disabled"}`. **Don't** — on Opus 5
that can cause tool calls to be emitted as plain text instead of structured
`tool_use` blocks. The turn completes normally, no error is raised, and the call
silently never runs.

On a form-filling agent that means losing the caller's details without anyone
noticing. Adaptive thinking stays on; `effort: low` buys the latency instead.
See `src/agent/brain.ts`.
