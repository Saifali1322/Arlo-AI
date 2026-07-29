/**
 * Registration capture + lead store.
 *
 * The field list mirrors the web form at freebusinessregistration.com/register
 * one-for-one, so anything the agent captures on the phone can be posted
 * straight into the existing intake pipeline with no mapping layer.
 *
 * Storage is in-memory and JSON-lines on disk — deliberately boring, so the
 * demo needs no database. `persist()` is the seam to swap for a real CRM.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const TITLES = ['Mr.', 'Mrs.', 'Ms.'] as const;
export type Title = (typeof TITLES)[number];

/** Exactly the fields the web form collects, plus what the phone channel adds. */
export interface Registration {
  // --- web form parity ---
  companyName?: string;
  businessDescription?: string;
  title?: Title;
  firstName?: string;
  middleNames?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  termsAccepted?: boolean;

  // --- added by the phone channel ---
  sicCode?: string;
  sicDescription?: string;
  /** Set once we've told the caller their name passed screening. */
  nameCheckVerdict?: string;
  /** Identity verification is mandatory for UK directors since 18 Nov 2025. */
  idvStatus?: 'not_sent' | 'sent_sms' | 'sent_email';
  interestedServices?: string[];
  callbackRequested?: string;
  notes?: string;
}

/** Fields Companies House cannot proceed without. */
export const REQUIRED_FIELDS = [
  'companyName',
  'title',
  'firstName',
  'lastName',
  'email',
  'phone',
  'termsAccepted',
] as const satisfies readonly (keyof Registration)[];

/** Human-readable labels used when the agent asks for what's missing. */
const FIELD_LABELS: Record<string, string> = {
  companyName: 'the company name',
  businessDescription: 'what the business does',
  title: 'their title — Mr, Mrs or Ms',
  firstName: 'first name',
  lastName: 'last name',
  email: 'email address',
  phone: 'best contact number',
  termsAccepted: 'confirmation they accept the terms and conditions',
};

export type CallDisposition =
  | 'registration_captured'
  | 'quote_given'
  | 'callback_booked'
  | 'transferred'
  | 'status_check'
  | 'out_of_scope'
  | 'abandoned';

export interface Lead {
  id: string;
  callSid: string;
  from: string;
  startedAt: string;
  endedAt?: string;
  registration: Registration;
  disposition?: CallDisposition;
  transcript: Array<{ role: 'caller' | 'agent'; text: string; at: string }>;
}

export function missingFields(reg: Registration): string[] {
  return REQUIRED_FIELDS.filter((f) => {
    const value = reg[f];
    if (f === 'termsAccepted') return value !== true;
    return value === undefined || value === null || String(value).trim() === '';
  });
}

/** Phrase the outstanding fields so the model can read them naturally. */
export function describeMissing(reg: Registration): string {
  const missing = missingFields(reg);
  if (missing.length === 0) return 'Nothing outstanding — the registration is complete.';
  return `Still needed: ${missing.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.`;
}

export function isComplete(reg: Registration): boolean {
  return missingFields(reg).length === 0;
}

// --- validation helpers ------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Normalise a phone number a caller reads aloud into E.164 where possible.
 * Handles the UK cases the STT will realistically produce.
 */
export function normalisePhone(input: string, defaultRegion: 'GB' = 'GB'): string | undefined {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.length < 7) return undefined;

  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (defaultRegion === 'GB') {
    if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
    if (digits.startsWith('44')) return `+${digits}`;
  }
  return undefined;
}

/** Coerce whatever the caller said into one of the three accepted titles. */
export function normaliseTitle(input: string): Title | undefined {
  const t = input.trim().toLowerCase().replace(/\./g, '');
  if (t === 'mr' || t === 'mister') return 'Mr.';
  if (t === 'mrs' || t === 'missus') return 'Mrs.';
  if (t === 'ms' || t === 'miss') return 'Ms.';
  return undefined;
}

// --- store -------------------------------------------------------------------

export class LeadStore {
  private readonly leads = new Map<string, Lead>();

  constructor(private readonly filePath?: string) {}

  start(callSid: string, from: string): Lead {
    const lead: Lead = {
      id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      callSid,
      from,
      startedAt: new Date().toISOString(),
      registration: { phone: normalisePhone(from) ?? undefined },
      transcript: [],
    };
    this.leads.set(callSid, lead);
    return lead;
  }

  get(callSid: string): Lead | undefined {
    return this.leads.get(callSid);
  }

  /** Merge a partial update, ignoring undefined so callers can patch freely. */
  update(callSid: string, patch: Partial<Registration>): Registration {
    const lead = this.leads.get(callSid);
    if (!lead) throw new Error(`No lead for call ${callSid}`);
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        (lead.registration as Record<string, unknown>)[key] = value;
      }
    }
    return lead.registration;
  }

  addTurn(callSid: string, role: 'caller' | 'agent', text: string): void {
    const lead = this.leads.get(callSid);
    if (!lead || !text.trim()) return;
    lead.transcript.push({ role, text: text.trim(), at: new Date().toISOString() });
  }

  async finish(callSid: string, disposition: CallDisposition): Promise<Lead | undefined> {
    const lead = this.leads.get(callSid);
    if (!lead) return undefined;
    lead.endedAt = new Date().toISOString();
    lead.disposition = disposition;
    await this.persist(lead);
    return lead;
  }

  all(): Lead[] {
    return [...this.leads.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /** Find a prior lead by email or phone — used by the order-status flow. */
  findByContact(needle: string): Lead | undefined {
    const q = needle.trim().toLowerCase();
    const phone = normalisePhone(needle);
    return this.all().find((lead) => {
      const reg = lead.registration;
      return (
        (reg.email && reg.email.toLowerCase() === q) ||
        (phone && reg.phone === phone) ||
        (reg.companyName && reg.companyName.toLowerCase() === q)
      );
    });
  }

  private async persist(lead: Lead): Promise<void> {
    if (!this.filePath) return;
    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(lead)}\n`, 'utf8');
    } catch (err) {
      console.error('[leads] persist failed', err);
    }
  }

  /** Reload persisted leads so a restart doesn't lose the demo's history. */
  async hydrate(): Promise<void> {
    if (!this.filePath) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        const lead = JSON.parse(line) as Lead;
        this.leads.set(lead.callSid, lead);
      }
    } catch {
      // No file yet — first run.
    }
  }
}
