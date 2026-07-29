/**
 * Tool definitions and handlers.
 *
 * Design notes:
 *
 * - Every tool uses `strict: true`, so Claude cannot hand back a malformed
 *   argument object. On a voice call there is no way to recover gracefully from
 *   a bad tool payload — the caller just hears silence.
 *
 * - `save_registration` is intentionally incremental and idempotent. It returns
 *   what is still outstanding, which keeps the model on track without encoding
 *   a rigid state machine that a real conversation would immediately break.
 *
 * - Tool results are written to be *read aloud*. They are prose, not JSON, so
 *   the model doesn't have to translate a data structure into speech under
 *   latency pressure.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { checkNameLive } from '../domain/companyName.js';
import { suggestSicCodes, getSicByCode } from '../domain/sic.js';
import { findServices, formatPrice } from '../domain/catalogue.js';
import {
  describeMissing,
  isComplete,
  isValidEmail,
  normalisePhone,
  normaliseTitle,
  type CallDisposition,
  type LeadStore,
  type Registration,
} from '../domain/leads.js';

export interface ToolContext {
  callSid: string;
  callerNumber: string;
  leads: LeadStore;
  /** Ask the transport to hand the call to a human. */
  transfer: (reason: string) => Promise<void>;
  /** Ask the transport to hang up once the current audio finishes. */
  hangUp: (disposition: CallDisposition) => Promise<void>;
  /** Send an SMS. Undefined when Twilio isn't configured (browser demo). */
  sendSms?: (to: string, body: string) => Promise<void>;
}

type StrictTool = Anthropic.Tool & { strict?: boolean };

export const TOOLS: StrictTool[] = [
  {
    name: 'check_company_name',
    description:
      'Screen a proposed company name against Companies House rules: required Limited/Ltd ending, sensitive words needing approval, permitted characters, and whether it is "the same as" a name already on the register. Always call this before collecting the rest of the registration — a name problem found late wastes the whole call.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        proposed_name: {
          type: 'string',
          description: 'The company name exactly as the caller said it, including any Limited or Ltd ending they gave.',
        },
      },
      required: ['proposed_name'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_sic_code',
    description:
      'Map a plain-English description of what the business does onto Companies House SIC codes. Companies House requires at least one code at incorporation.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        business_description: {
          type: 'string',
          description: "What the business does, in the caller's own words.",
        },
      },
      required: ['business_description'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_registration',
    description:
      'Save one or more registration details. Call this as soon as you have each piece of information rather than batching at the end — if the call drops, whatever is saved is kept. Returns what is still outstanding.',
    // Deliberately NOT strict. Strict tool use expects a fully-specified schema,
    // and this tool is a partial patch — every field is optional by design so
    // the model can save one detail at a time as the conversation produces it.
    // The handler validates and normalises each field instead.
    input_schema: {
      type: 'object',
      properties: {
        company_name: { type: 'string', description: 'Full proposed company name including the Limited or Ltd ending.' },
        business_description: { type: 'string', description: "What the business does, in the caller's words." },
        sic_code: { type: 'string', description: 'Five-digit SIC code from suggest_sic_code.' },
        title: { type: 'string', description: 'Director title: Mr, Mrs or Ms.' },
        first_name: { type: 'string' },
        middle_names: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string', description: 'Director email address. Read it back to the caller before saving.' },
        phone: { type: 'string', description: 'Best contact number.' },
        nationality: { type: 'string' },
        terms_accepted: { type: 'boolean', description: 'Only true if the caller explicitly said yes to the terms and conditions.' },
        interested_services: {
          type: 'array',
          items: { type: 'string' },
          description: 'Any paid services the caller showed interest in.',
        },
        notes: { type: 'string', description: 'Anything the team should know before following up.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'send_verification_link',
    description:
      'Send the Companies House identity verification link. Mandatory for every UK director since 18 November 2025 — the filing cannot proceed without it. Only call this once the required registration details are captured.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          enum: ['sms', 'email'],
          description: 'How the caller wants the link. Default to sms unless they ask for email.',
        },
      },
      required: ['channel'],
      additionalProperties: false,
    },
  },
  {
    name: 'quote_services',
    description:
      'Look up prices for paid services. Use this instead of recalling a price from memory so the figure is always current.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        interest: {
          type: 'string',
          description: 'What the caller is asking about, e.g. "website", "social media", "logo and branding".',
        },
      },
      required: ['interest'],
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_order',
    description: 'Find an existing registration by email address, phone number, or company name.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Email address, phone number, or company name.' },
      },
      required: ['identifier'],
      additionalProperties: false,
    },
  },
  {
    name: 'book_callback',
    description: 'Book a callback from a human specialist when the caller wants one or you cannot answer their question.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        when: { type: 'string', description: 'When the caller would like to be called, in their own words.' },
        topic: { type: 'string', description: 'What the callback is about.' },
      },
      required: ['when', 'topic'],
      additionalProperties: false,
    },
  },
  {
    name: 'transfer_to_human',
    description:
      'Transfer the call to a human colleague. Use immediately if the caller asks for a person, is unhappy, or raises something outside what you can handle. Do not try to talk them out of it.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the transfer is needed — passed to the colleague picking up.' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'end_call',
    description: 'End the call once the conversation is finished. Say goodbye naturally before calling this.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        disposition: {
          type: 'string',
          enum: [
            'registration_captured',
            'quote_given',
            'callback_booked',
            'status_check',
            'out_of_scope',
            'abandoned',
          ],
          description: 'How the call concluded.',
        },
      },
      required: ['disposition'],
      additionalProperties: false,
    },
  },
];

type Args = Record<string, unknown>;

const str = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

/**
 * Execute a tool. Always resolves — a thrown error inside a tool would leave
 * the caller listening to silence, so failures come back as speakable text.
 */
export async function runTool(name: string, args: Args, ctx: ToolContext): Promise<string> {
  try {
    return await dispatch(name, args, ctx);
  } catch (err) {
    console.error(`[tool:${name}] failed`, err);
    return 'That lookup failed on our side. Apologise briefly, and either continue without it or offer a callback.';
  }
}

async function dispatch(name: string, args: Args, ctx: ToolContext): Promise<string> {
  switch (name) {
    case 'check_company_name': {
      const proposed = str(args, 'proposed_name') ?? '';
      const result = await checkNameLive(proposed, config.companiesHouse.apiKey);
      ctx.leads.update(ctx.callSid, { nameCheckVerdict: result.verdict });

      if (result.verdict === 'ok') {
        ctx.leads.update(ctx.callSid, { companyName: result.input });
        return `AVAILABLE. ${result.message} Tell the caller it looks clear, then move on to what the business does. Do not say it is guaranteed or approved — Companies House makes the final decision.`;
      }

      const alternatives = result.suggestions.length
        ? ` Suggest one of these instead: ${result.suggestions.join(', ')}.`
        : '';
      return `PROBLEM (${result.verdict}). ${result.message}${alternatives} Explain the issue in one sentence and offer an alternative.`;
    }

    case 'suggest_sic_code': {
      const description = str(args, 'business_description') ?? '';
      const matches = suggestSicCodes(description, 3);
      const best = matches[0]!;
      ctx.leads.update(ctx.callSid, { businessDescription: description });

      const others = matches.slice(1).map((m) => `${m.code} ${m.description}`).join('; ');
      return [
        `Best match: ${best.code} — ${best.description}.`,
        others ? `Alternatives: ${others}.` : '',
        'Confirm this with the caller in plain language — describe the activity, do not read the number out unless they ask.',
      ].filter(Boolean).join(' ');
    }

    case 'save_registration': {
      const patch: Registration = {};

      const companyName = str(args, 'company_name');
      if (companyName) patch.companyName = companyName;

      const businessDescription = str(args, 'business_description');
      if (businessDescription) patch.businessDescription = businessDescription;

      const sicCode = str(args, 'sic_code');
      if (sicCode) {
        patch.sicCode = sicCode;
        patch.sicDescription = getSicByCode(sicCode)?.description;
      }

      const title = str(args, 'title');
      if (title) {
        const normalised = normaliseTitle(title);
        if (!normalised) return `"${title}" is not one of the accepted titles. Ask whether it is Mr, Mrs or Ms.`;
        patch.title = normalised;
      }

      const firstName = str(args, 'first_name');
      if (firstName) patch.firstName = firstName;
      const middleNames = str(args, 'middle_names');
      if (middleNames) patch.middleNames = middleNames;
      const lastName = str(args, 'last_name');
      if (lastName) patch.lastName = lastName;
      const nationality = str(args, 'nationality');
      if (nationality) patch.nationality = nationality;

      const email = str(args, 'email');
      if (email) {
        if (!isValidEmail(email)) {
          return `"${email}" does not look like a valid email address. Ask the caller to repeat it, and spell it back to them letter by letter before saving.`;
        }
        patch.email = email.toLowerCase();
      }

      const phone = str(args, 'phone');
      if (phone) {
        const normalised = normalisePhone(phone);
        if (!normalised) {
          return `"${phone}" is not a usable phone number. Ask the caller to repeat it digit by digit.`;
        }
        patch.phone = normalised;
      }

      if (args.terms_accepted === true) patch.termsAccepted = true;

      const services = args.interested_services;
      if (Array.isArray(services) && services.length > 0) {
        patch.interestedServices = services.filter((s): s is string => typeof s === 'string');
      }

      const notes = str(args, 'notes');
      if (notes) patch.notes = notes;

      const registration = ctx.leads.update(ctx.callSid, patch);

      if (isComplete(registration)) {
        return 'Saved. Everything required is now captured. Next step is the identity verification link — send it with send_verification_link.';
      }
      return `Saved. ${describeMissing(registration)} Ask for the next one — one at a time.`;
    }

    case 'send_verification_link': {
      const lead = ctx.leads.get(ctx.callSid);
      const registration = lead?.registration ?? {};

      const missing = describeMissing(registration);
      if (!isComplete(registration)) {
        return `Cannot send yet. ${missing} Collect those first.`;
      }

      const channel = str(args, 'channel') === 'email' ? 'email' : 'sms';
      const link = `${config.publicUrl ?? 'https://www.freebusinessregistration.com'}/verify/${lead!.id}`;

      if (channel === 'sms') {
        const to = registration.phone;
        if (!to) return 'No mobile number saved. Ask for one, or offer to send the link by email instead.';

        if (ctx.sendSms) {
          await ctx.sendSms(
            to,
            `${config.business.name}: complete your Companies House identity check here — ${link}. Takes about 2 minutes.`,
          );
          ctx.leads.update(ctx.callSid, { idvStatus: 'sent_sms' });
          return `Sent by text to ${to}. Tell the caller it is on its way, that it takes about two minutes, and that the filing goes in as soon as it is done.`;
        }

        ctx.leads.update(ctx.callSid, { idvStatus: 'sent_sms' });
        return `Queued for sending by text to ${to} (SMS is not configured in this environment, so nothing was actually sent). Tell the caller it is on its way and takes about two minutes.`;
      }

      ctx.leads.update(ctx.callSid, { idvStatus: 'sent_email' });
      return `Queued for sending by email to ${registration.email}. Tell the caller to check their inbox, including spam.`;
    }

    case 'quote_services': {
      const interest = str(args, 'interest') ?? '';
      const matches = findServices(interest, 3);
      if (matches.length === 0) {
        return 'Nothing in the catalogue matches that. Say you will have a specialist confirm and offer a callback.';
      }
      const lines = matches.map((item) => `${item.name}: ${formatPrice(item)} — ${item.summary}`).join(' ');
      return `${lines} Recommend the single best fit rather than listing all of them.`;
    }

    case 'lookup_order': {
      const identifier = str(args, 'identifier') ?? '';
      const found = ctx.leads.findByContact(identifier);
      if (!found) {
        return `Nothing found for "${identifier}". Ask them to confirm the email address used at sign-up, or offer to transfer them to a colleague who can search further.`;
      }
      const reg = found.registration;
      const idv = reg.idvStatus && reg.idvStatus !== 'not_sent'
        ? 'The identity verification link has been sent but not yet completed.'
        : 'The identity verification step has not started yet.';
      return `Found: ${reg.companyName ?? 'unnamed registration'}, started ${new Date(found.startedAt).toLocaleDateString('en-GB')}. Status: ${found.disposition ?? 'in progress'}. ${idv}`;
    }

    case 'book_callback': {
      const when = str(args, 'when') ?? 'as soon as possible';
      const topic = str(args, 'topic') ?? 'general enquiry';
      ctx.leads.update(ctx.callSid, { callbackRequested: `${when} — ${topic}` });
      return `Callback booked for ${when} about ${topic}. Confirm it back to the caller and check the number to ring is the one they are calling from.`;
    }

    case 'transfer_to_human': {
      const reason = str(args, 'reason') ?? 'caller requested a person';
      ctx.leads.update(ctx.callSid, { notes: `Transferred: ${reason}` });
      await ctx.transfer(reason);
      return 'Transferring now. Say one short line letting them know you are putting them through, then stop.';
    }

    case 'end_call': {
      const disposition = (str(args, 'disposition') ?? 'abandoned') as CallDisposition;
      await ctx.hangUp(disposition);
      return 'Call ending. Do not say anything further.';
    }

    default:
      return `Unknown tool "${name}". Continue the conversation without it.`;
  }
}
