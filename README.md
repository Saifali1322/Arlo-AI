# Inbound voice agent — Free Business Registration Ltd

A phone agent that answers inbound calls for a UK company formation service:
screens the proposed company name against Companies House rules, classifies the
business for a SIC code, captures the full registration, hands off to the
mandatory identity check, and qualifies the caller for the paid launch package.

Twilio → Deepgram → **Claude Opus 5** → ElevenLabs, streaming end to end, with
working barge-in.

```
  caller ──▶ Twilio Media Streams ──▶ Deepgram (streaming STT)
                     ▲                        │
                     │                        ▼
             ElevenLabs (streaming TTS) ◀── Claude + tools
```

## Quick start — browser demo, no phone number

Three API keys, about five minutes. No Twilio account, no tunnel.

```bash
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY
npm run dev
```

Open **http://localhost:3000/demo** and click *Start call*. Captured fields
appear live at **/leads**.

Same prompt, same tools, same model as the phone line — only the audio transport
differs. `/health` reports which vendors are actually wired up.

## Taking real calls

Add the Twilio block to `.env`, then expose the server:

```bash
ngrok http 3000            # note the https URL
```

Set `PUBLIC_URL` to that URL, restart, and point your Twilio number's **A call
comes in** webhook at `POST {PUBLIC_URL}/voice`.

Dial the number. That's it — `/voice` returns TwiML that connects the call's
audio to the `/twilio` WebSocket.

Twilio webhook signatures are verified by default. Leave that on: without it,
anyone who finds the URL can drive your agent and your Anthropic spend.

## What it does on a call

| Tool | Purpose |
|---|---|
| `check_company_name` | Suffix, sensitive words, permitted characters, and the "same as" rule — optionally live against the real register |
| `suggest_sic_code` | Plain-English description → SIC code |
| `save_registration` | Incremental capture; returns what's still outstanding |
| `send_verification_link` | The mandatory Companies House ID check, by SMS or email |
| `quote_services` | Prices from a fixed catalogue, so it can't invent one |
| `lookup_order` | Status check on an existing registration |
| `book_callback` / `transfer_to_human` / `end_call` | Escalation and disposition |

Full conversation design, a four-minute demo script, and the latency budget are
in **[docs/CALL-FLOWS.md](docs/CALL-FLOWS.md)**. The business research behind it
is in **[docs/RESEARCH.md](docs/RESEARCH.md)**.

## Three things worth knowing

**It cannot complete a formation on the phone — by design.** Since 18 November
2025 every UK director must verify their identity with Companies House before
appointment. That is statutory. The agent captures everything, then hands off to
an IDV link. Any voice agent claiming to finish a formation on a call is telling
callers something untrue.

**Barge-in clears downstream buffers.** Aborting the LLM and TTS is the easy
part. Twilio also holds up to a second of queued playback, so the agent must
send a `clear` event too — otherwise it keeps talking after it "stopped", which
is exactly what makes these demos feel broken.

**Thinking stays on.** Disabling it is the obvious latency win, but on Opus 5 it
can cause tool calls to be emitted as plain text rather than structured
`tool_use` blocks — the turn succeeds, no error is raised, and the call silently
never runs. On a form-filling agent that means losing the caller's details
without anyone noticing. `effort: low` buys the latency instead.

## Layout

```
src/
  agent/       brain (Claude turn loop) · session (barge-in) · prompt · tools · sentences
  domain/      companyName · sic · catalogue · leads      ← pure, fully tested
  stt/  tts/   Deepgram · ElevenLabs, behind swappable interfaces
  telephony/   Twilio Media Streams · browser transport
  audio/       G.711 µ-law codec, energy, WAV
public/        demo page · leads dashboard
test/          55 tests over the deterministic core
```

`npm test` · `npm run typecheck` · `npm run build`

The domain layer has no I/O and no vendor coupling — company-name rules, SIC
matching, pricing and validation are all pure functions with tests. STT and TTS
sit behind one-method interfaces; swapping Deepgram for AssemblyAI or ElevenLabs
for Cartesia is a single file each.

## Configuration

Every option is documented in [`.env.example`](.env.example). The ones that
matter most:

| Variable | Effect |
|---|---|
| `DEEPGRAM_ENDPOINTING_MS` | Biggest latency lever. Lower is snappier but starts cutting callers off mid-sentence — tune against real recordings |
| `ANTHROPIC_EFFORT` | `low` by default; raise if the agent mishandles awkward calls |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5` saves ~200–400 ms TTFT if you need it |
| `COMPANIES_HOUSE_API_KEY` | Free; upgrades name checking from rules-only to live availability |
| `HUMAN_HANDOFF_NUMBER` | Where transfers land |

## Status

The deterministic core — name rules, SIC matching, pricing, validation, the
µ-law codec, the streaming chunker — is covered by 55 passing tests, and the
server builds, boots and serves cleanly.

The live path (Claude turn loop, Deepgram, ElevenLabs, Twilio) has **not** been
run end to end here: it needs the four vendor keys, which weren't available in
this environment. First call on real credentials is the remaining verification
step. Watch the console — it logs first-chunk latency per turn and every
barge-in.

## Before production

- Point `LeadStore` at the real CRM (it's a deliberate seam)
- Replace the placeholder IDV URL with the real Companies House flow
- Confirm the transfer destination and its hours
- If enabling `RECORD_CALLS`, announce recording — it's personal data
- Load-test Deepgram and ElevenLabs concurrency limits against expected call volume
