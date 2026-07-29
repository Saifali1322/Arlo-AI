/**
 * The Claude turn loop.
 *
 * Written as a manual streaming loop rather than the SDK tool runner because a
 * voice agent needs to do two things the runner doesn't expose together:
 * forward text deltas to TTS the instant they arrive, and abort the whole turn
 * mid-generation when the caller starts talking. Time-to-first-audio is the
 * metric that decides whether this feels like a conversation, and buffering the
 * full response before speaking adds the entire generation time to it.
 *
 * Latency choices, in order of impact:
 *   - stream, and start TTS on the first clause (see SentenceChunker)
 *   - effort: low  — a scripted intake call does not need deep reasoning
 *   - prompt caching on the system prompt + tool definitions, which are the
 *     bulk of the input tokens and identical on every turn of every call
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { buildSystemPrompt } from './prompt.js';
import { TOOLS, runTool, type ToolContext } from './tools.js';

export interface BrainCallbacks {
  /** A speakable fragment is ready. Called many times per turn. */
  onText: (text: string) => void;
  /** A tool is about to run — a good moment to speak a filler phrase. */
  onToolStart?: (toolName: string) => void;
  /** The turn finished cleanly. */
  onTurnEnd?: () => void;
}

/** Guards against a tool loop that never converges while a caller waits. */
const MAX_TOOL_ROUNDS = 6;

export class Brain {
  private readonly client: Anthropic;
  private readonly system: Anthropic.TextBlockParam[];
  private messages: Anthropic.MessageParam[] = [];
  private abortController?: AbortController;

  constructor(private readonly ctx: ToolContext) {
    this.client = new Anthropic({
      ...(config.anthropic.apiKey ? { apiKey: config.anthropic.apiKey } : {}),
      ...(config.anthropic.baseUrl ? { baseURL: config.anthropic.baseUrl } : {}),
      maxRetries: 1, // a phone call cannot wait out a long retry chain
      timeout: 20_000,
    });

    // Single cache breakpoint on the last system block. Tools render before
    // system, so this one marker caches the tool definitions too.
    this.system = [
      {
        type: 'text',
        text: buildSystemPrompt(),
        cache_control: { type: 'ephemeral' },
      },
    ];
  }

  /** Conversation so far, for logging and the lead record. */
  get history(): readonly Anthropic.MessageParam[] {
    return this.messages;
  }

  /**
   * Abort the in-flight turn. Called when the caller barges in — the tokens
   * we've already generated are discarded along with the audio.
   */
  interrupt(): void {
    this.abortController?.abort();
    this.abortController = undefined;
  }

  /** Record something the agent said without invoking the model. */
  recordAgentUtterance(text: string): void {
    this.messages.push({ role: 'assistant', content: text });
  }

  /**
   * Run one turn: caller said `userText`, stream the reply out through
   * `callbacks.onText`, executing tools as needed.
   */
  async respond(userText: string, callbacks: BrainCallbacks): Promise<void> {
    this.messages.push({ role: 'user', content: userText });

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (signal.aborted) return;

        const message = await this.streamOnce(callbacks, signal);
        if (!message) return; // aborted mid-stream

        this.messages.push({ role: 'assistant', content: message.content });

        if (message.stop_reason === 'refusal') {
          // Opus 5 runs safety classifiers; a decline arrives as HTTP 200 with
          // an empty or partial content array. Say something human, don't hang.
          callbacks.onText(
            "I'm not able to help with that one. Let me put you through to a colleague.",
          );
          await this.ctx.transfer('model declined the request');
          return;
        }

        if (message.stop_reason !== 'tool_use') {
          callbacks.onTurnEnd?.();
          return;
        }

        const toolUses = message.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          callbacks.onToolStart?.(toolUse.name);
          const output = await runTool(
            toolUse.name,
            (toolUse.input ?? {}) as Record<string, unknown>,
            this.ctx,
          );
          results.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: output,
          });
        }

        if (signal.aborted) return;

        // All results go back in one user message — splitting them trains the
        // model out of making parallel tool calls.
        this.messages.push({ role: 'user', content: results });
      }

      // Ran out of tool rounds. Better to say something than to stall.
      callbacks.onText('Sorry, I got a bit tangled there. Could you say that again?');
      callbacks.onTurnEnd?.();
    } catch (err) {
      if (signal.aborted || (err as Error)?.name === 'AbortError') return;

      console.error('[brain] turn failed', err);
      callbacks.onText(
        "Sorry, I'm having a technical problem at my end. Let me put you through to a colleague.",
      );
      await this.ctx.transfer('technical error in the agent');
    } finally {
      this.abortController = undefined;
    }
  }

  /** One streaming request. Returns undefined if aborted. */
  private async streamOnce(
    callbacks: BrainCallbacks,
    signal: AbortSignal,
  ): Promise<Anthropic.Message | undefined> {
    const stream = this.client.messages.stream(
      {
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: this.system,
        messages: this.messages,
        tools: TOOLS,
        // Thinking stays on (adaptive is the Opus 5 default). Disabling it can
        // make the model emit a tool call as plain text — on a form-filling
        // agent that means silently losing the caller's details. Buy latency
        // with effort instead.
        output_config: { effort: config.anthropic.effort },
      },
      { signal },
    );

    // Forward raw deltas. Sanitisation happens once the chunker has assembled a
    // whole fragment — a delta can split "**bold**" down the middle, so
    // stripping markdown per-delta would leave stray asterisks behind.
    stream.on('text', (delta) => {
      if (!signal.aborted) callbacks.onText(delta);
    });

    try {
      return await stream.finalMessage();
    } catch (err) {
      if (signal.aborted || (err as Error)?.name === 'AbortError') return undefined;
      throw err;
    }
  }
}
