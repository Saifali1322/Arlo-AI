# Angel Demo — Setup Checklist

Everything in `agent/` and `n8n/` is written and ready. The steps below are
the parts that need your own accounts and logins — nobody else can do these
for you, since they need payment details and personal OAuth consent.

## 1. n8n Cloud (do this first)

1. Sign up at n8n.io (Cloud plan, ~£18/mo per the business plan).
2. Create a new workflow, then use "Import from File" and select
   `n8n/angel-workflow.json`.
3. Open **Create Calendar Event** and **Notify Saif** / **Send Confirmation
   Email** nodes — connect your Google account via OAuth for each (Calendar
   scope on the first, Gmail scope on the other two).
4. In **Create Calendar Event**, replace `YOUR_CALENDAR_ID` with the Google
   Calendar you want demo bookings to land in (usually your own email
   address).
5. Open the **Angel Webhook** node and copy its **Production URL** — you'll
   need this in step 3 below.
6. Activate the workflow (toggle top-right).

## 2. Retell AI

1. Sign up at retellai.com.
2. Create a new agent named "Angel".
3. Voice: search for "Nova" under OpenAI voices, British English.
4. LLM: GPT-4.1 (or Retell's current equivalent).
5. Paste the contents of `agent/system-prompt.md` into the general prompt
   field.
6. Add the three custom functions from `agent/functions.json`
   (`book_appointment`, `send_confirmation_email`, `take_message`) — paste
   each one's schema in, and set every function's webhook URL to the n8n
   Production URL from step 1.5.
7. Buy a UK phone number inside Retell and attach it to the Angel agent.
8. Set `post-call webhook` (if Retell offers one) to the same n8n URL, or
   leave it off for now — not required for the core flow.

## 3. Test it end to end

1. Call the Retell number.
2. Have a full conversation as if you're a prospective customer (try
   objecting on price, asking "is this AI?", and booking a slot).
3. Confirm: a calendar event appears, a confirmation email lands in your
   test inbox, and if you don't book, a "Notify Saif" email arrives at
   saifarshad674@gmail.com instead.
4. Fix anything that misfires by editing the prompt/functions and re-testing
   — no code changes needed, everything lives in the Retell dashboard once
   pasted in.

## What's NOT in this repo yet

- The Lovable/website landing page (separate tool, per the business doc).
- Outbound campaigns (quote follow-up, recall, reminders) — inbound-only
  flow is what's built here, matching the Starter tier.
- Any client-specific vertical templates — this is Angel, Arlo's own sales
  agent, not a client deployment.
