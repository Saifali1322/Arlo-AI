#!/usr/bin/env python3
"""Deploy the Free Business Registration inbound agent (Ellie) to Retell.

Creates (or updates) a Retell LLM + agent from:
  agent/clients/free-business-registration/inbound-prompt.md
  agent/clients/free-business-registration/functions.json
  agent/clients/free-business-registration/retell-config.json

Safe to re-run: stores the created IDs in .env as FBR_LLM_ID / FBR_AGENT_ID and
updates in place on subsequent runs rather than creating duplicates.

Usage:
    python3 scripts/deploy_fbr_agent.py
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLIENT_DIR = ROOT / "agent" / "clients" / "free-business-registration"
ENV_PATH = ROOT / ".env"
API = "https://api.retellai.com"


def load_env() -> dict:
    env = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def save_env_var(key: str, value: str) -> None:
    """Add or replace a key in .env, preserving everything else."""
    lines = ENV_PATH.read_text().splitlines() if ENV_PATH.exists() else []
    for i, line in enumerate(lines):
        if line.strip().startswith(f"{key}="):
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(lines) + "\n")


def call(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:500]
        raise SystemExit(f"✗ {method} {path} failed [{e.code}]: {detail}")
    except urllib.error.URLError as e:
        raise SystemExit(f"✗ {method} {path} unreachable: {e.reason}")


def build_tools(webhook_url: str) -> list:
    spec = json.loads((CLIENT_DIR / "functions.json").read_text())
    tools = []
    for t in spec["tools"]:
        tool = {k: v for k, v in t.items() if not k.startswith("_")}
        tool["url"] = webhook_url
        tools.append(tool)
    return tools


def main() -> None:
    env = {**load_env(), **os.environ}
    token = env.get("RETELL_API_KEY")
    if not token:
        raise SystemExit("✗ RETELL_API_KEY missing from .env")

    cfg = json.loads((CLIENT_DIR / "retell-config.json").read_text())
    prompt = (CLIENT_DIR / "inbound-prompt.md").read_text()
    webhook = env.get("FBR_WEBHOOK_URL") or cfg["webhook_url"]
    tools = build_tools(webhook)

    print(f"→ prompt: {len(prompt):,} chars   tools: {len(tools)}")
    print(f"→ webhook: {webhook}")

    llm_body = {
        "model": cfg["response_engine"]["model"],
        "general_prompt": prompt,
        "begin_message": cfg["response_engine"]["begin_message"],
        "general_tools": tools,
    }

    llm_id = env.get("FBR_LLM_ID")
    if llm_id:
        call("PATCH", f"/update-retell-llm/{llm_id}", token, llm_body)
        print(f"✓ updated LLM {llm_id}")
    else:
        llm = call("POST", "/create-retell-llm", token, llm_body)
        llm_id = llm["llm_id"]
        save_env_var("FBR_LLM_ID", llm_id)
        print(f"✓ created LLM {llm_id}")

    agent_body = {
        "agent_name": cfg["agent_name"],
        "voice_id": cfg["voice_id"],
        "language": cfg["voice_language"],
        "voice_speed": cfg.get("voice_speed", 1.0),
        "voice_temperature": cfg.get("voice_temperature", 1.0),
        "response_engine": {"type": "retell-llm", "llm_id": llm_id},
        "ambient_sound": None if cfg.get("ambient_sound") == "off" else cfg.get("ambient_sound"),
        "interruption_sensitivity": cfg["interruption_sensitivity"],
        "responsiveness": cfg["responsiveness"],
        "enable_backchannel": cfg["enable_backchannel"],
        "backchannel_frequency": cfg.get("backchannel_frequency", 0.7),
        "normalize_for_speech": cfg["normalize_for_speech"],
        "end_call_after_silence_ms": cfg.get("end_call_after_silence_ms", 20000),
        "max_call_duration_ms": cfg.get("max_call_duration_ms", 900000),
        "webhook_url": webhook,
    }

    agent_id = env.get("FBR_AGENT_ID")
    if agent_id:
        call("PATCH", f"/update-agent/{agent_id}", token, agent_body)
        print(f"✓ updated agent {agent_id}")
    else:
        agent = call("POST", "/create-agent", token, agent_body)
        agent_id = agent["agent_id"]
        save_env_var("FBR_AGENT_ID", agent_id)
        print(f"✓ created agent {agent_id}")

    number = env.get("FBR_PHONE_NUMBER") or env.get("TWILIO_PHONE_NUMBER")
    if number:
        # Retell removed the single-agent fields on 2026-03-31 in favour of
        # weighted agent lists — one entry at weight 1 is the single-agent case.
        call(
            "PATCH",
            f"/update-phone-number/{urllib.parse.quote(number)}",
            token,
            {"inbound_agents": [{"agent_id": agent_id, "weight": 1}]},
        )
        print(f"✓ {number} now answers with {cfg['agent_name']}")
        print(f"\nRing {number} to try it.")
    else:
        print("\nNo number in .env — point one at the agent in Retell → Phone Numbers.")


if __name__ == "__main__":
    sys.exit(main())
