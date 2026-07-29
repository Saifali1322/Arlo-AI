/**
 * HTTP + WebSocket server.
 *
 * Routes:
 *   GET  /health        capability report — which vendors are actually wired up
 *   GET  /demo          browser demo (no telephony required)
 *   GET  /leads         captured-registration dashboard
 *   GET  /api/leads     the same data as JSON
 *   POST /voice         Twilio inbound-call webhook -> TwiML
 *   WS   /twilio        Twilio Media Streams
 *   WS   /browser       browser demo audio
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import { config, capabilities } from './config.js';
import { LeadStore } from './domain/leads.js';
import { CallSession } from './agent/session.js';
import {
  TwilioTransport,
  inboundCallTwiml,
  failureTwiml,
  verifyTwilioSignature,
} from './telephony/twilio.js';
import { BrowserTransport } from './telephony/browser.js';

// tsconfig sets rootDir=src, so this resolves to <repo>/public from both
// `tsx src/index.ts` and `node dist/index.js`.
const publicDir = join(dirname(fileURLToPath(import.meta.url)), '../public');

const leads = new LeadStore(config.leadsFile);
await leads.hydrate();

/**
 * Twilio's Media Stream `start` frame carries the callSid but not the caller's
 * number — that only appears on the webhook. Park it here between the two.
 */
const pendingCallers = new Map<string, { from: string; at: number }>();

function rememberCaller(callSid: string, from: string): void {
  pendingCallers.set(callSid, { from, at: Date.now() });
}

function takeCaller(callSid: string): string {
  const entry = pendingCallers.get(callSid);
  pendingCallers.delete(callSid);
  return entry?.from ?? 'unknown';
}

// Drop entries for calls whose stream never connected.
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [sid, entry] of pendingCallers) {
    if (entry.at < cutoff) pendingCallers.delete(sid);
  }
}, 30_000).unref();

// --- HTTP --------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
  res.end(body);
}

async function sendFile(res: ServerResponse, name: string, contentType: string): Promise<void> {
  try {
    send(res, 200, await readFile(join(publicDir, name), 'utf8'), contentType);
  } catch {
    send(res, 404, 'Not found');
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(
        res,
        200,
        JSON.stringify({ ok: true, capabilities: capabilities(), model: config.anthropic.model }, null, 2),
        'application/json',
      );
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/demo')) {
      return await sendFile(res, 'demo.html', 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/leads') {
      return await sendFile(res, 'leads.html', 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && url.pathname === '/api/leads') {
      return send(res, 200, JSON.stringify(leads.all(), null, 2), 'application/json');
    }

    // Twilio inbound-call webhook.
    if (req.method === 'POST' && url.pathname === '/voice') {
      const raw = await readBody(req);
      const params = Object.fromEntries(new URLSearchParams(raw));

      const publicBase = config.publicUrl ?? `https://${req.headers.host}`;
      const webhookUrl = `${publicBase}/voice`;

      if (!verifyTwilioSignature(req.headers['x-twilio-signature'] as string | undefined, webhookUrl, params)) {
        console.warn('[voice] rejected request with invalid Twilio signature');
        return send(res, 403, 'Invalid signature');
      }

      const caps = capabilities();
      if (!caps.claude || !caps.stt || !caps.tts) {
        console.error('[voice] missing capabilities', caps);
        return send(res, 200, failureTwiml(), 'text/xml');
      }

      // Stash the caller's number for the media stream, which doesn't get it.
      if (params.CallSid) rememberCaller(params.CallSid, params.From ?? 'unknown');

      const wsUrl = `${publicBase.replace(/^http/, 'ws')}/twilio`;
      return send(res, 200, inboundCallTwiml(wsUrl), 'text/xml');
    }

    send(res, 404, 'Not found');
  } catch (err) {
    console.error('[http] handler failed', err);
    send(res, 500, 'Internal error');
  }
});

// --- WebSocket ---------------------------------------------------------------

const twilioWss = new WebSocketServer({ noServer: true });
const browserWss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;

  if (pathname === '/twilio') {
    twilioWss.handleUpgrade(req, socket, head, (ws) => twilioWss.emit('connection', ws, req));
  } else if (pathname === '/browser') {
    browserWss.handleUpgrade(req, socket, head, (ws) => browserWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

twilioWss.on('connection', (ws: WebSocket) => {
  let session: CallSession | undefined;
  let transport: TwilioTransport | undefined;

  ws.on('message', (raw) => {
    const frame = TwilioTransport.parseFrame(raw.toString());

    switch (frame.type) {
      case 'start': {
        const callerNumber = takeCaller(frame.callSid);
        transport = new TwilioTransport(ws, frame.callSid, callerNumber);
        transport.bindStream(frame.streamSid);
        leads.start(frame.callSid, callerNumber);

        session = new CallSession(transport, { leads });
        void session.start();
        console.log(`[twilio] call ${frame.callSid} started from ${callerNumber}`);
        break;
      }
      case 'media':
        session?.pushAudio(frame.audio);
        break;
      case 'stop':
        void session?.close('abandoned');
        break;
    }
  });

  ws.on('close', () => void session?.close('abandoned'));
  ws.on('error', (err) => console.error('[twilio:ws]', err));
});

browserWss.on('connection', (ws: WebSocket) => {
  const callSid = `browser_${Date.now().toString(36)}`;
  const transport = new BrowserTransport(ws, callSid, 'browser-demo');
  leads.start(callSid, 'browser-demo');

  const session = new CallSession(transport, { leads });
  void session.start();
  console.log(`[browser] demo session ${callSid} started`);

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      session.pushAudio(Buffer.from(raw as Buffer));
      return;
    }
    try {
      const message = JSON.parse(raw.toString()) as { type?: string };
      if (message.type === 'stop') void session.close('abandoned');
    } catch {
      // Ignore malformed control frames.
    }
  });

  ws.on('close', () => void session.close('abandoned'));
  ws.on('error', (err) => console.error('[browser:ws]', err));
});

server.listen(config.port, () => {
  const caps = capabilities();
  console.log(`\n  ${config.business.name} — inbound voice agent`);
  console.log(`  listening on http://localhost:${config.port}\n`);
  console.log(`  model      ${config.anthropic.model} (effort: ${config.anthropic.effort})`);
  console.log(`  claude     ${caps.claude ? 'ready' : 'MISSING ANTHROPIC_API_KEY'}`);
  console.log(`  stt        ${caps.stt ? 'ready' : 'MISSING DEEPGRAM_API_KEY'}`);
  console.log(`  tts        ${caps.tts ? 'ready' : 'MISSING ELEVENLABS_API_KEY'}`);
  console.log(`  telephony  ${caps.telephony ? 'ready' : 'not configured (browser demo only)'}`);
  console.log(`  register   ${caps.companiesHouseLive ? 'live Companies House lookup' : 'offline name rules only'}`);
  console.log(`\n  demo       http://localhost:${config.port}/demo`);
  console.log(`  leads      http://localhost:${config.port}/leads\n`);
});
