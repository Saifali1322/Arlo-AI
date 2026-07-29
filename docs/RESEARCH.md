# Research brief — Free Business Registration Ltd

Everything below comes from freebusinessregistration.com (home, `/shop`,
`/register`) plus current Companies House rules, gathered July 2026.

## What the business actually is

A **UK** company formation service — Companies House incorporations of private
limited companies. Not a US LLC service, which matters: the entity types,
regulator, naming rules, and the identity-verification regime are all different,
and a generic "business formation" agent script would be wrong on every one.

- Formation is **£0**. They cover the Companies House filing fee.
- Registration approved in **3–6 hours**, typically.
- Also free: a business bank account introduction, a UK phone number, and a
  starter website via their AI website builder.
- Claimed: 1,000+ companies registered, 10+ years, 99.2% satisfaction, 24/7
  support on 0203 432 8551.
- Registered at 128 City Road, London, EC1V 2NX.

Only limited companies. No LLPs, sole traders, charities, or overseas entities.

## Where the money is

Formation is a loss leader. The revenue is the launch package sold afterwards:

| Tier | Product | Price |
|---|---|---|
| Entry | Email & domain setup | £50 |
| | Promotional video | £99 |
| | Graphic design bundle | £199 |
| | Branding package | £299 |
| **Core** | **5-page website** | **£399** |
| | E-commerce website | £999 |
| Recurring | SEO | £99–£499/mo |
| | Social media | £199–£499/mo |
| | Appointment setting | £3,000/mo |
| **Bundles** | **Business Starter Pack** | **£799** |
| | Premium Starter Pack | £1,999 |
| | Ultimate Starter Pack | £4,999 |

**This is the case for the voice agent.** Every inbound formation call is a
£399–£4,999 opportunity attached to a £0 product. Today a human has to be on the
phone to capture it, and they claim 24/7 availability — so the cost of covering
nights and weekends is real. An agent that captures the registration *and*
qualifies for the launch package changes the unit economics of answering the
phone at 11pm.

## The web form is trivially voice-capturable

`/register` claims completion "in just 60 seconds" and collects only:

1. Company name (+ availability check)
2. About your business (free text → SIC code)
3. Title — Mr. / Mrs. / Ms.
4. First name, middle name(s), last name
5. Email
6. Phone
7. Nationality
8. Terms & conditions agreement

Eight fields, one of them optional. That is a five-minute phone conversation,
and it maps one-for-one onto tool calls. `src/domain/leads.ts` mirrors these
field names exactly so captured data drops into the existing intake pipeline
without a mapping layer.

## The constraint that shapes the whole design

**Since 18 November 2025, every UK company director and PSC must complete
identity verification with Companies House before appointment.** It is
statutory, not a company policy.

The consequence: **this agent cannot complete a formation on the phone**, and
any script implying otherwise produces callers who think they are registered
when they are not.

So the happy path ends at an IDV handoff — capture everything, send a
verification link by SMS, confirm it takes about two minutes. The prompt frames
this as the last quick step rather than an obstacle, and `send_verification_link`
refuses to fire until the required fields are actually present.

This is the detail a generic voice-agent vendor gets wrong, and it is worth
raising on the call.

## Company name checking

Worth building properly because it is the highest-value moment in the call — a
name rejected by Companies House *after* the caller thinks they are done wastes
the entire interaction.

`src/domain/companyName.ts` implements a practical subset of the rules:

- **Required suffix** — Limited / Ltd / Cyfyngedig / Cyf.
- **"Same as" normalisation** — Companies House disregards case, punctuation, a
  leading "the", and trailing words like *company, group, holdings, UK, .com*,
  and treats `&`/`and`, `+`/`plus` as equivalent. So "The Northwind Trading Co
  Limited" and "Northwind Ltd" are the *same name*. This is the rule most
  people are surprised by, and it demos well.
- **Sensitive words** — ~60 words needing approval or evidence (*royal, bank,
  trust, institute, British, NHS…*), each with the reason, so the agent can
  explain rather than just refuse.
- **Permitted characters** and the 160-character limit.

With a free Companies House API key it also checks live availability against the
real register, filtering out dissolved companies (which do not block a new
registration). Without a key it degrades to the offline rules — and the live
lookup has a 2.5s timeout with fallback, because the register being slow must
never stall a phone call.

Screening, not a legal determination — the prompt tells the agent to say "that
looks clear", never "that's approved".

## SIC codes

Companies House requires at least one at incorporation, and no caller knows
theirs. They describe what they do. `src/domain/sic.ts` maps free text onto ~60
of the codes new UK companies actually use, with contiguous-phrase and scattered
stemmed matching (so "we sell handmade candles online" resolves to online retail
rather than manufacturing). Anything unmatched falls to 82990 for a human to
confirm.

## Call types to design for

| Type | Frequency | Value |
|---|---|---|
| New formation | High | The core flow — capture + upsell |
| Pricing enquiry | Medium | Answer, then convert to a registration |
| Order status | Medium | Deflection — pure cost saving |
| Wants a human | Low | Transfer immediately, don't fight it |
| Out of scope | Low | Close politely |

All five are handled; see `docs/CALL-FLOWS.md`.

## Open questions for the client

Things worth confirming before this goes near production traffic:

1. **Which CRM does intake actually land in?** `LeadStore` is a deliberate seam
   — swapping it for their system is a small change, but it needs their API.
2. **Who receives transfers, and on what number/hours?** Currently one
   `HUMAN_HANDOFF_NUMBER`.
3. **Is the IDV link real yet?** The tool sends a placeholder URL. It needs
   their actual Companies House IDV flow.
4. **Call recording and data retention.** Recordings are personal data; the
   agent should announce recording if enabled. It is off by default.
5. **Which bank partner?** The site says "regulated partners" without naming
   them. The agent currently cannot answer "which bank?" — an easy win once
   confirmed.
6. **Do they want outbound too?** Everything here (prompt, tools, name checking)
   is transport-agnostic. Outbound follow-up on abandoned registrations is the
   obvious phase two.
