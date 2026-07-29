# Demo Brief — Ellie, the AI receptionist for Free Business Registration

One page. Read it before you ring the demo line.

---

## What she is

Ellie answers your line the way your best salesperson would, on every call,
at any hour. She knows your business — the free formation, the £100 you cover,
the 3–6 hour turnaround, the bank account, the free number, the free website,
and all nineteen items in your shop with the exact prices.

She doesn't take messages. She starts registrations.

---

## Why this is worth building

Your formation is free. That means it isn't the product — it's the hook. The
money is in what the founder needs *next*: the site, the branding, the socials,
the SEO, the appointment setting.

Which means a missed call costs you twice. You lose the formation, and you lose
every pound of the ascension behind it.

Ellie is built around exactly that. Two jobs, in this order:

1. **Nobody hangs up without their registration started.** No "visit the
   website", no callback, no voicemail. She takes the name, the director
   details, the email, and passes it to the team to file.
2. **Every registration gets the next-need question asked.** Right after she
   logs it — the single highest-intent moment a founder will ever have — she
   asks one question: *"How are people going to find you? Got a website
   sorted?"* Then she listens and routes it: free one-pager, £399 five-page,
   £999 ecommerce, £299 branding, £199/mo socials, £799 starter pack.

She always offers the free thing first. A caller who feels sold to on a free
service doesn't come back.

---

## The arithmetic (your numbers, not mine)

You've registered 1,000+ companies. Every one of those was somebody starting a
business who needed a website, a logo and a way to get found.

Take a hundred registrations. If Ellie asks the next-need question on all of
them and one in ten takes the £399 five-page site, that's **£3,990**. One in
twenty on Social Bronze at £199/mo is **£995 a month, recurring**. One Ultimate
Starter Pack is **£4,999** on its own.

That's before counting the registrations you currently lose because the phone
rang at 8pm on a Sunday and nobody was there. Those are pure recovery.

I'm not claiming those conversion rates — you know your numbers better than I
do. Put your own in. The point is that the ask is one question, and it currently
doesn't get asked on most calls.

---

## Ring it and try to break it

Don't be gentle. Here's what to throw at her:

| Try this | What good looks like |
|---|---|
| "I want to register a company" | Leads with the outcome — *registered by tonight, costs you nothing* — then takes your details on the call. Doesn't send you to the website. |
| **"What's the catch?"** | Straight answer, no waffle: you cover the £100 because most people also want a bank account, a website, socials. Then she moves on — doesn't immediately sell. |
| "How much is a website?" | Tells you what's in it *before* the number. Says £399 one-off, then goes quiet and lets you react. |
| "That's too expensive" | Does **not** discount. Moves you down to the free one-pager. Prices are prices. |
| "Should I be a limited company or a sole trader?" | Refuses to advise. Books you a callback. This is the line she must not cross. |
| "Will I definitely get the bank account?" | Says the partner bank decides, not FBR. Never promises approval. |
| "I'm not a UK resident" | Confirms non-residents can register, then hands to a human for address and banking. |
| "Is my company name available?" | Won't guarantee it. Says it's checked at filing, takes a second choice. |
| "Can I pay by card now?" | Refuses to take card details on the phone. Secure link from the team instead. |
| "Are you a real person?" | Says she's an AI, plainly, no embarrassment, then carries on. |
| "This is a shambles, I want a refund" | Stops selling instantly, escalates to a manager, takes your number. |
| Interrupt her mid-sentence | She stops and listens. She shouldn't talk over you. |
| Say nothing for ten seconds | She waits, then re-engages once. Doesn't panic-fill. |

**Deliberate limits, so you know they're on purpose, not bugs:** no legal, tax
or accounting advice; no promise of bank approval; no name-availability
guarantee; no card details; no discounting; no invented prices or services; no
claim that FBR is FCA regulated (the partners are).

---

## What lands in your inbox after every call

A summary with the caller's name, number, email, what they wanted, and — the
part that matters — **what they said they need next, in their own words**. Not
paraphrased into marketing language. That's the line your sales team opens on.

Registrations route to formations. Service interest routes to sales, tagged with
how ready they are: *ready now*, *interested*, *just asking*. Complaints go
straight to a human with a "ring immediately" flag.

---

## Where it's built

| File | What it is |
|---|---|
| `inbound-prompt.md` | Everything Ellie knows and every line she won't cross |
| `functions.json` | The seven actions she can take (start registration, log service interest, book callback, check status, support, escalate, message) |
| `retell-config.json` | Voice, greeting, sensitivity, webhook |

Change a price in the shop and it's one line in the prompt and one enum value in
`functions.json`. Nothing is hardcoded anywhere else.
