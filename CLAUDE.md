# Arlo — Project Context for Claude

Arlo is an **AI solutions company** for UK small business. The flagship product
is an **AI phone agent (AI receptionist)** that answers every call, qualifies
it, books it, and summarises it for the owner.

## Positioning (read `docs/POSITIONING.md` — source of truth)

- **Arlo = the company/brand.** "AI that works for your business." Not just
  "the voice agent company" — the brand is broad so it can grow into other AI
  services later.
- **Angel = Arlo's OWN in-house agent** (answers Arlo's line, makes demo/sales
  calls). Angel is the demo mascot, **not** the product sold to clients.
- **Client agents are white-labelled** to each business (their name, their
  greeting, their services). Angel is only ever Arlo's own.
- **Core rule: brand broad, sell narrow.** Company = AI solutions; cold
  outreach = one vertical, one concrete promise (e.g. "AI receptionist for
  plumbers").

## What's built

- `agent/` — Angel prompts (inbound receptionist + outbound demo) and Retell
  config; `functions.json` for book/confirm/message actions.
- `n8n/angel-workflow.json` — automation wiring calls → Google Calendar + Gmail.
- `scripts/setup.py` — one-command build (Twilio SIP trunk + Retell agent +
  number import). Safe to re-run.
- `marketing/ads/` — social ad creatives + captions; `muapi_gen.py` for
  AI-image generation via MuAPI.
- Secrets live in gitignored `.env` (never commit).

## Dev

- Work on branch `claude/arlo-voice-agent-demo-8jtj0s`.
- Live demo number: +1 608 946 0425 (US placeholder; UK number pending a
  Twilio regulatory bundle).
