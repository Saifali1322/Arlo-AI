/**
 * UK company-name checking.
 *
 * Implements a practical subset of the Companies House naming rules so the
 * voice agent can give a caller a useful answer in under a second, without a
 * network round-trip. An optional live availability check against the
 * Companies House public register runs on top of this (see `checkNameLive`).
 *
 * Scope note: this is a *screening* implementation, not a legal determination.
 * Companies House makes the final call at incorporation. The agent's script is
 * written to say so.
 *
 * Sources: Companies Act 2006 ss.53-57; The Company, Limited Liability
 * Partnership and Business (Names and Trading Disclosures) Regulations 2015.
 */

/** Private limited companies must end with one of these. */
const REQUIRED_SUFFIXES = [
  'limited',
  'ltd',
  'ltd.',
  'cyfyngedig', // Welsh
  'cyf',
  'cyf.',
];

/**
 * Words/expressions disregarded at the END of a name when testing whether two
 * names are "the same as" each other. Reg. 7 + Sch. 3 of the 2015 Regulations.
 */
const DISREGARDED_SUFFIX_WORDS = new Set([
  'company', 'co', 'corp', 'corporation', 'incorporated', 'inc',
  'limited', 'ltd', 'unlimited', 'plc', 'llp', 'lp', 'cic',
  'cyfyngedig', 'cyf', 'ccc',
  'uk', 'gb', 'gbr', 'greatbritain', 'unitedkingdom', 'england', 'wales',
  'scotland', 'ni', 'northernireland',
  'international', 'group', 'holdings', 'holding', 'services', 'service',
  'ventures', 'enterprises', 'trading',
  'com', 'couk', 'net', 'biz', 'org', 'online',
]);

/**
 * Characters/words treated as equivalent when testing "same as".
 * Applied before punctuation is stripped.
 */
const EQUIVALENCES: Array<[RegExp, string]> = [
  [/&/g, ' and '],
  [/\+/g, ' plus '],
  [/@/g, ' at '],
  [/%/g, ' percent '],
  [/£/g, ' pound '],
  [/\$/g, ' dollar '],
  [/€/g, ' euro '],
  [/\bplc\b/g, ' public limited company '],
];

/**
 * Words requiring approval or supporting evidence before Companies House will
 * accept them. Keyed by word -> the reason we surface to the caller.
 */
const SENSITIVE_WORDS: Record<string, string> = {
  accredited: 'implies official accreditation',
  assurance: 'regulated financial-services term',
  association: 'implies a representative body',
  assurer: 'regulated financial-services term',
  audit: 'implies statutory audit status',
  auditor: 'implies statutory audit status',
  authority: 'implies official or public-body status',
  bank: 'regulated — needs FCA/PRA approval',
  banking: 'regulated — needs FCA/PRA approval',
  benevolent: 'implies charitable status',
  british: 'implies national or pre-eminent status',
  charitable: 'implies charitable status',
  charity: 'implies charitable status',
  chartered: 'implies a royal charter',
  commission: 'implies official or public-body status',
  council: 'implies official or public-body status',
  duke: 'implies royal connection',
  england: 'implies national or pre-eminent status',
  english: 'implies national or pre-eminent status',
  federation: 'implies a representative body',
  foundation: 'implies charitable status',
  fund: 'regulated financial-services term',
  government: 'implies official or public-body status',
  hmrc: 'implies government connection',
  insurance: 'regulated — needs FCA/PRA approval',
  insurer: 'regulated — needs FCA/PRA approval',
  institute: 'implies an academic or professional body',
  institution: 'implies an academic or professional body',
  ireland: 'implies national or pre-eminent status',
  irish: 'implies national or pre-eminent status',
  king: 'implies royal connection',
  majesty: 'implies royal connection',
  national: 'implies national or pre-eminent status',
  nhs: 'protected — implies NHS connection',
  parliament: 'implies government connection',
  police: 'protected — implies police connection',
  prince: 'implies royal connection',
  princess: 'implies royal connection',
  queen: 'implies royal connection',
  reassurance: 'regulated financial-services term',
  regulator: 'implies official or public-body status',
  royal: 'implies royal connection',
  royalty: 'implies royal connection',
  scotland: 'implies national or pre-eminent status',
  scottish: 'implies national or pre-eminent status',
  sheffield: 'protected place name',
  society: 'implies a representative body',
  standards: 'implies official or public-body status',
  trust: 'implies fiduciary or charitable status',
  tribunal: 'implies official or public-body status',
  university: 'protected — needs Privy Council / OfS approval',
  wales: 'implies national or pre-eminent status',
  welsh: 'implies national or pre-eminent status',
  windsor: 'implies royal connection',
};

/** Companies House rejects these outright in a company name. */
const PERMITTED_CHARACTERS = /^[A-Za-z0-9 .,()\/&'"!«»?*=#%+\-:;\[\]{}@£$€À-ɏ]+$/;

export const MAX_NAME_LENGTH = 160;

export type NameVerdict =
  | 'ok'
  | 'missing_suffix'
  | 'too_long'
  | 'empty'
  | 'invalid_characters'
  | 'sensitive_word'
  | 'same_as_existing';

export interface NameCheckResult {
  input: string;
  verdict: NameVerdict;
  /** One-sentence explanation written to be read aloud. */
  message: string;
  /** Normalised form used for the "same as" comparison. */
  normalised: string;
  /** Populated when verdict === 'sensitive_word'. */
  sensitiveWords?: Array<{ word: string; reason: string }>;
  /** Populated when verdict === 'same_as_existing'. */
  conflictsWith?: string;
  /** Alternatives the agent can offer, populated on any non-'ok' verdict. */
  suggestions: string[];
}

/**
 * Reduce a company name to the canonical form Companies House uses when
 * deciding whether two names are "the same as" one another.
 *
 * Order matters: expand equivalences -> lowercase -> strip punctuation ->
 * drop a leading "the" -> repeatedly drop disregarded trailing words.
 */
export function normaliseForSameAs(name: string): string {
  let s = ` ${name.toLowerCase()} `;

  for (const [pattern, replacement] of EQUIVALENCES) {
    s = s.replace(pattern, replacement);
  }

  // Strip everything that is not a letter or digit, collapsing to spaces.
  s = s.replace(/[^a-z0-9]+/g, ' ').trim();

  let words = s.split(/\s+/).filter(Boolean);

  // A leading "the" is disregarded.
  if (words[0] === 'the') words = words.slice(1);

  // Repeatedly drop disregarded words from the end, but never empty the name.
  while (words.length > 1) {
    const last = words[words.length - 1]!;
    if (DISREGARDED_SUFFIX_WORDS.has(last)) {
      words = words.slice(0, -1);
    } else {
      break;
    }
  }

  return words.join('');
}

/** True when two names would be treated as "the same as" each other. */
export function isSameAs(a: string, b: string): boolean {
  const na = normaliseForSameAs(a);
  const nb = normaliseForSameAs(b);
  return na.length > 0 && na === nb;
}

/** Does the name carry a valid private-limited-company suffix? */
export function hasRequiredSuffix(name: string): boolean {
  const trimmed = name.trim().toLowerCase().replace(/[.,]+$/, '');
  return REQUIRED_SUFFIXES.some((suffix) => {
    const bare = suffix.replace(/\.$/, '');
    return trimmed === bare || trimmed.endsWith(` ${bare}`);
  });
}

/** Strip any trailing legal suffix so we can re-suffix cleanly. */
function stripSuffix(name: string): string {
  let s = name.trim().replace(/[.,]+$/, '');
  for (const suffix of REQUIRED_SUFFIXES) {
    const bare = suffix.replace(/\.$/, '');
    const re = new RegExp(`\\s+${bare}$`, 'i');
    if (re.test(s)) {
      s = s.replace(re, '');
      break;
    }
  }
  return s.trim();
}

function findSensitiveWords(name: string): Array<{ word: string; reason: string }> {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const seen = new Set<string>();
  const hits: Array<{ word: string; reason: string }> = [];
  for (const word of words) {
    const reason = SENSITIVE_WORDS[word];
    if (reason && !seen.has(word)) {
      seen.add(word);
      hits.push({ word, reason });
    }
  }
  return hits;
}

function buildSuggestions(name: string, verdict: NameVerdict): string[] {
  const base = stripSuffix(name).trim();
  if (!base) return [];

  if (verdict === 'missing_suffix') {
    return [`${base} Limited`, `${base} Ltd`];
  }

  // For clashes and sensitive words, vary the distinctive part so the
  // normalised form actually changes.
  return [
    `${base} Group Limited`,
    `${base} Studio Limited`,
    `${base} & Co Limited`,
  ];
}

/**
 * Offline screening of a proposed company name.
 *
 * @param proposed   The name the caller said.
 * @param register   Existing names to test the "same as" rule against. In
 *                   production this is seeded from the Companies House search
 *                   API; offline it can be empty or a fixture list.
 */
export function checkCompanyName(proposed: string, register: readonly string[] = []): NameCheckResult {
  const input = proposed.trim().replace(/\s+/g, ' ');
  const normalised = normaliseForSameAs(input);

  const fail = (
    verdict: Exclude<NameVerdict, 'ok'>,
    message: string,
    extra: Partial<NameCheckResult> = {},
  ): NameCheckResult => ({
    input,
    verdict,
    message,
    normalised,
    suggestions: buildSuggestions(input, verdict),
    ...extra,
  });

  if (!input) {
    return fail('empty', "I didn't catch a name there — what would you like the company to be called?");
  }

  if (input.length > MAX_NAME_LENGTH) {
    return fail('too_long', `That name is ${input.length} characters. Companies House caps it at ${MAX_NAME_LENGTH}.`);
  }

  if (!PERMITTED_CHARACTERS.test(input)) {
    return fail('invalid_characters', 'That name uses a character Companies House will not accept.');
  }

  const sensitiveWords = findSensitiveWords(input);
  if (sensitiveWords.length > 0) {
    const first = sensitiveWords[0]!;
    return fail(
      'sensitive_word',
      `"${first.word}" is a sensitive word — it ${first.reason}, so Companies House needs supporting evidence before approving it.`,
      { sensitiveWords },
    );
  }

  const clash = register.find((existing) => isSameAs(existing, input));
  if (clash) {
    return fail(
      'same_as_existing',
      `That is treated as the same as "${clash}", which is already on the register.`,
      { conflictsWith: clash },
    );
  }

  if (!hasRequiredSuffix(input)) {
    return fail(
      'missing_suffix',
      'A private limited company name has to end in "Limited" or "Ltd".',
    );
  }

  return {
    input,
    verdict: 'ok',
    message: `"${input}" looks clear — no sensitive words, correct ending, and nothing identical on the register.`,
    normalised,
    suggestions: [],
  };
}

/**
 * Live availability check against the Companies House public register.
 * Falls back to the offline check when no API key is configured.
 *
 * Get a free key at https://developer.company-information.service.gov.uk/
 */
export async function checkNameLive(
  proposed: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<NameCheckResult> {
  if (!apiKey) return checkCompanyName(proposed);

  // Search on the distinctive part — the register stores full legal names.
  const query = stripSuffix(proposed);
  const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(query)}&items_per_page=40`;

  try {
    const res = await fetchImpl(url, {
      headers: {
        // Companies House uses HTTP Basic with the key as the username.
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return checkCompanyName(proposed);

    const body = (await res.json()) as { items?: Array<{ title?: string; company_status?: string }> };
    const register = (body.items ?? [])
      // Dissolved companies do not block a new registration of the same name.
      .filter((item) => item.company_status !== 'dissolved')
      .map((item) => item.title ?? '')
      .filter(Boolean);

    return checkCompanyName(proposed, register);
  } catch {
    // Never let the register being slow or down block the call.
    return checkCompanyName(proposed);
  }
}
