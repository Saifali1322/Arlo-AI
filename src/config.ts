/**
 * Configuration. Everything is env-driven so the same build runs the browser
 * demo (Anthropic key only) and the full telephony path (all four vendors).
 */

// Node 22 loads .env natively — no dotenv dependency. Absent file is fine:
// in production the environment is set by the platform, not a file.
try {
  process.loadEnvFile();
} catch {
  // No .env present.
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function required(name: string): string {
  const value = optional(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function num(name: string, fallback: number): number {
  const raw = optional(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num('PORT', 3000),

  /** Public HTTPS origin Twilio dials back into, e.g. an ngrok URL. */
  publicUrl: optional('PUBLIC_URL'),

  anthropic: {
    apiKey: optional('ANTHROPIC_API_KEY'),
    baseUrl: optional('ANTHROPIC_BASE_URL'),
    /**
     * Opus 5 is the default. For a latency-sensitive voice loop you can drop to
     * `claude-haiku-4-5` and usually save 200-400 ms on time-to-first-token —
     * measure on your own script before deciding, the quality gap shows up most
     * on messy, interrupted callers.
     */
    model: optional('ANTHROPIC_MODEL') ?? 'claude-opus-5',
    /**
     * `low` keeps the turn snappy. Thinking stays ON (adaptive): on Opus 5,
     * disabling thinking can cause tool calls to be emitted as plain text,
     * which for a form-filling agent means silently losing the caller's data.
     * Lower effort is the safe way to buy latency here.
     */
    effort: (optional('ANTHROPIC_EFFORT') ?? 'low') as 'low' | 'medium' | 'high',
    maxTokens: num('ANTHROPIC_MAX_TOKENS', 1024),
  },

  deepgram: {
    apiKey: optional('DEEPGRAM_API_KEY'),
    model: optional('DEEPGRAM_MODEL') ?? 'nova-3',
    /** Silence before Deepgram finalises an utterance. 800 ms is a good start. */
    endpointingMs: num('DEEPGRAM_ENDPOINTING_MS', 800),
    utteranceEndMs: num('DEEPGRAM_UTTERANCE_END_MS', 1000),
  },

  elevenlabs: {
    apiKey: optional('ELEVENLABS_API_KEY'),
    voiceId: optional('ELEVENLABS_VOICE_ID') ?? 'EXAVITQu4vr4xnSDxMaL',
    /** Flash is the low-latency model; turbo trades ~80 ms for a bit more nuance. */
    model: optional('ELEVENLABS_MODEL') ?? 'eleven_flash_v2_5',
  },

  twilio: {
    accountSid: optional('TWILIO_ACCOUNT_SID'),
    authToken: optional('TWILIO_AUTH_TOKEN'),
    /** The number callers dial. Also the From for the ID-verification SMS. */
    phoneNumber: optional('TWILIO_PHONE_NUMBER'),
    /** Reject webhooks that aren't signed by Twilio. Leave on in production. */
    validateSignature: optional('TWILIO_VALIDATE_SIGNATURE') !== 'false',
  },

  companiesHouse: {
    /** Free key: https://developer.company-information.service.gov.uk/ */
    apiKey: optional('COMPANIES_HOUSE_API_KEY'),
  },

  /** Where a "put me through to a person" transfer lands. */
  humanHandoffNumber: optional('HUMAN_HANDOFF_NUMBER'),

  business: {
    name: 'Free Business Registration Ltd',
    agentName: optional('AGENT_NAME') ?? 'Robin',
    supportEmail: 'hello@freebusinessregistration.com',
    supportPhone: '0203 432 8551',
    address: '128 City Road, London, EC1V 2NX',
  },

  leadsFile: optional('LEADS_FILE') ?? 'data/leads.jsonl',
  /** Write per-call WAVs for tuning. Off by default — recordings are personal data. */
  recordCalls: optional('RECORD_CALLS') === 'true',
  recordingsDir: optional('RECORDINGS_DIR') ?? 'data/recordings',

  logLevel: (optional('LOG_LEVEL') ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
};

export type Config = typeof config;

/** Which capabilities are actually wired up, for the /health endpoint. */
export function capabilities() {
  return {
    claude: Boolean(config.anthropic.apiKey),
    stt: Boolean(config.deepgram.apiKey),
    tts: Boolean(config.elevenlabs.apiKey),
    telephony: Boolean(config.twilio.accountSid && config.twilio.authToken),
    companiesHouseLive: Boolean(config.companiesHouse.apiKey),
  };
}

export { required, optional };
