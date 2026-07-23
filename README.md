# Arlo-AI

AI agency building voice agents for UK small businesses. This repo holds the
**Angel demo** — Arlo's own AI sales agent, which answers calls to Arlo's
business number and books demo calls with the founder. It's also the live
proof of what Arlo sells: the caller experiences the product by talking to it.

## What's here

- `agent/system-prompt.md` — Angel's full conversation prompt
- `agent/functions.json` — the three actions Angel can take (book a demo,
  send a confirmation email, log a message for follow-up)
- `agent/retell-agent-config.json` — reference config for the Retell AI agent
- `n8n/angel-workflow.json` — importable n8n workflow wiring Retell to Google
  Calendar and Gmail
- `docs/SETUP.md` — step-by-step checklist to go from this repo to a live,
  callable demo

## Quick start

Read `docs/SETUP.md` — it's the fastest path from zero to a working demo.
Everything here is written; the remaining steps are account creation and
OAuth connections that only you can do.
