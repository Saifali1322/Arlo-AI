#!/usr/bin/env python3
"""One-command setup for the Angel demo.

Reads credentials from .env in the repo root, then:

  1. Twilio  — creates an elastic SIP trunk, credential list, and associates
               the phone number with the trunk (required to hand the number
               to Retell).
  2. n8n     — imports n8n/angel-workflow.json via the n8n public API and
               activates it, giving us the production webhook URL.
  3. Retell  — creates the Retell LLM (prompt + custom functions pointing at
               the n8n webhook), creates the Angel agent, and imports the
               Twilio number so inbound calls reach Angel.

Safe to re-run: each step looks for existing resources by name first.

Required .env keys:
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
  N8N_API_KEY, N8N_INSTANCE_URL   (e.g. https://arlovoice.app.n8n.cloud)
  RETELL_API_KEY

After it finishes, the only manual steps left are the Google OAuth
connections inside n8n and a test call — see docs/SETUP.md.
"""

import base64
import json
import secrets
import string
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
TRUNK_NAME = "arlo-retell-trunk"
CREDLIST_NAME = "arlo-retell-creds"
AGENT_NAME = "Angel"
WORKFLOW_FILE = REPO_ROOT / "n8n" / "angel-workflow.json"
PROMPT_FILE = REPO_ROOT / "agent" / "system-prompt.md"
FUNCTIONS_FILE = REPO_ROOT / "agent" / "functions.json"
BEGIN_MESSAGE = "Thanks for calling Arlo, this is Angel — how can I help you today?"
VOICE_ID = "11labs-Amy"  # young British female, ElevenLabs — most humanlike
PLACEHOLDER_WEBHOOK = "https://placeholder.invalid/webhook/angel"


def load_env():
    env = {}
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        sys.exit("No .env found in repo root. Copy .env.example to .env and fill it in.")
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def save_env_key(key, value):
    env_path = REPO_ROOT / ".env"
    lines = env_path.read_text().splitlines()
    for i, line in enumerate(lines):
        if line.split("=", 1)[0].strip() == key:
            lines[i] = f"{key}={value}"
            break
    else:
        lines.append(f"{key}={value}")
    env_path.write_text("\n".join(lines) + "\n")


def request(method, url, *, headers=None, form=None, body=None):
    data = None
    headers = dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode()
            return resp.status, json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        try:
            return e.code, json.loads(text)
        except json.JSONDecodeError:
            return e.code, {"raw": text}
    except (urllib.error.URLError, OSError) as e:
        host = urllib.parse.urlparse(url).hostname
        sys.exit(f"Network error reaching {host}: {e.reason if hasattr(e, 'reason') else e}\n"
                 f"If you're running this inside a restricted environment, its network\n"
                 f"policy must allow: api.twilio.com, trunking.twilio.com,\n"
                 f"api.retellai.com, and your n8n domain. Or run this script locally.")


def die(step, status, payload):
    sys.exit(f"FAILED at {step} (HTTP {status}):\n{json.dumps(payload, indent=2)[:2000]}")


# ---------------------------------------------------------------- Twilio ----

def twilio_setup(env):
    sid, token = env["TWILIO_ACCOUNT_SID"], env["TWILIO_AUTH_TOKEN"]
    number = env["TWILIO_PHONE_NUMBER"]
    auth = {"Authorization": "Basic " + base64.b64encode(f"{sid}:{token}".encode()).decode()}
    api = "https://api.twilio.com/2010-04-01/Accounts/" + sid
    trunking = "https://trunking.twilio.com/v1"

    status, nums = request("GET", api + "/IncomingPhoneNumbers.json?PageSize=50", headers=auth)
    if status != 200:
        die("Twilio auth / list numbers", status, nums)
    match = [n for n in nums["incoming_phone_numbers"] if n["phone_number"] == number]
    if not match:
        available = [n["phone_number"] for n in nums["incoming_phone_numbers"]]
        sys.exit(f"Number {number} not found on this Twilio account. Available: {available}")
    number_sid = match[0]["sid"]
    print(f"✓ Twilio auth OK, found {number} ({number_sid})")

    status, trunks = request("GET", trunking + "/Trunks?PageSize=50", headers=auth)
    if status != 200:
        die("list trunks", status, trunks)
    trunk = next((t for t in trunks.get("trunks", []) if t["friendly_name"] == TRUNK_NAME), None)
    if trunk is None:
        domain = f"arlo-{secrets.token_hex(4)}.pstn.twilio.com"
        status, trunk = request("POST", trunking + "/Trunks", headers=auth,
                                form={"FriendlyName": TRUNK_NAME, "DomainName": domain})
        if status != 201:
            die("create trunk", status, trunk)
        print(f"✓ Created SIP trunk {trunk['domain_name']}")
    else:
        print(f"✓ Reusing SIP trunk {trunk['domain_name']}")
    trunk_sid = trunk["sid"]

    status, orig = request("GET", f"{trunking}/Trunks/{trunk_sid}/OriginationUrls", headers=auth)
    if status != 200:
        die("list origination urls", status, orig)
    if not orig.get("origination_urls"):
        status, r = request("POST", f"{trunking}/Trunks/{trunk_sid}/OriginationUrls", headers=auth,
                            form={"FriendlyName": "Retell", "SipUrl": "sip:sip.retellai.com",
                                  "Weight": "1", "Priority": "1", "Enabled": "true"})
        if status != 201:
            die("create origination url", status, r)
        print("✓ Origination URL → sip:sip.retellai.com")
    else:
        print("✓ Origination URL already set")

    sip_user = env.get("TWILIO_SIP_USERNAME") or "arlo_retell"
    sip_pass = env.get("TWILIO_SIP_PASSWORD")
    status, cls = request("GET", api + "/SIP/CredentialLists.json?PageSize=50", headers=auth)
    if status != 200:
        die("list credential lists", status, cls)
    cl = next((c for c in cls["credential_lists"] if c["friendly_name"] == CREDLIST_NAME), None)
    if cl is None:
        if not sip_pass:
            alphabet = string.ascii_letters + string.digits
            sip_pass = "Ar1" + "".join(secrets.choice(alphabet) for _ in range(13))
        status, cl = request("POST", api + "/SIP/CredentialLists.json", headers=auth,
                             form={"FriendlyName": CREDLIST_NAME})
        if status != 201:
            die("create credential list", status, cl)
        status, r = request("POST", api + f"/SIP/CredentialLists/{cl['sid']}/Credentials.json",
                            headers=auth, form={"Username": sip_user, "Password": sip_pass})
        if status != 201:
            die("create credential", status, r)
        save_env_key("TWILIO_SIP_USERNAME", sip_user)
        save_env_key("TWILIO_SIP_PASSWORD", sip_pass)
        print(f"✓ Created SIP credential list (user {sip_user}, password saved to .env)")
    else:
        if not sip_pass:
            sys.exit("Credential list exists but TWILIO_SIP_PASSWORD missing from .env — "
                     "delete the 'arlo-retell-creds' credential list in Twilio and re-run.")
        print("✓ Reusing SIP credential list")

    status, tcls = request("GET", f"{trunking}/Trunks/{trunk_sid}/CredentialLists", headers=auth)
    if status == 200 and not any(c["sid"] == cl["sid"] for c in tcls.get("credential_lists", [])):
        status, r = request("POST", f"{trunking}/Trunks/{trunk_sid}/CredentialLists", headers=auth,
                            form={"CredentialListSid": cl["sid"]})
        if status != 201:
            die("associate credential list with trunk", status, r)
    print("✓ Credential list attached to trunk")

    status, tnums = request("GET", f"{trunking}/Trunks/{trunk_sid}/PhoneNumbers", headers=auth)
    if status == 200 and not any(p["sid"] == number_sid for p in tnums.get("phone_numbers", [])):
        status, r = request("POST", f"{trunking}/Trunks/{trunk_sid}/PhoneNumbers", headers=auth,
                            form={"PhoneNumberSid": number_sid})
        if status != 201:
            die("associate number with trunk", status, r)
    print(f"✓ {number} attached to trunk")

    return {"termination_uri": trunk["domain_name"], "sip_user": sip_user, "sip_pass": sip_pass}


# ------------------------------------------------------------------- n8n ----

def n8n_setup(env):
    base = env["N8N_INSTANCE_URL"].rstrip("/")
    headers = {"X-N8N-API-KEY": env["N8N_API_KEY"]}
    wf = json.loads(WORKFLOW_FILE.read_text())

    status, existing = request("GET", base + "/api/v1/workflows?limit=100", headers=headers)
    if status != 200:
        die("n8n auth / list workflows", status, existing)
    found = next((w for w in existing.get("data", []) if w["name"] == wf["name"]), None)
    if found:
        wf_id = found["id"]
        print(f"✓ n8n workflow already imported (id {wf_id})")
    else:
        payload = {"name": wf["name"], "nodes": wf["nodes"],
                   "connections": wf["connections"], "settings": wf.get("settings", {})}
        status, created = request("POST", base + "/api/v1/workflows", headers=headers, body=payload)
        if status not in (200, 201):
            die("import n8n workflow", status, created)
        wf_id = created["id"]
        print(f"✓ Imported n8n workflow (id {wf_id})")

    status, r = request("POST", f"{base}/api/v1/workflows/{wf_id}/activate", headers=headers)
    if status in (200, 201):
        print("✓ Workflow activated")
    else:
        print(f"! Could not activate workflow via API (HTTP {status}) — "
              "open n8n and flip the Active toggle manually. Continuing.")

    webhook_url = f"{base}/webhook/angel"
    save_env_key("N8N_WEBHOOK_URL", webhook_url)
    print(f"✓ Production webhook: {webhook_url}")
    return webhook_url


# ---------------------------------------------------------------- Retell ----

def build_tools(webhook_url):
    fns = json.loads(FUNCTIONS_FILE.read_text())["functions"]
    return [{"type": "custom", "name": f["name"], "description": f["description"],
             "url": webhook_url, "parameters": f["parameters"],
             "speak_during_execution": True, "speak_after_execution": True}
            for f in fns]


def retell_setup(env, webhook_url, trunk):
    headers = {"Authorization": "Bearer " + env["RETELL_API_KEY"]}
    api = "https://api.retellai.com"

    status, agents = request("GET", api + "/list-agents", headers=headers)
    if status != 200:
        die("Retell auth / list agents", status, agents)
    existing = next((a for a in agents if a.get("agent_name") == AGENT_NAME), None) \
        if isinstance(agents, list) else None
    if existing:
        agent_id = existing["agent_id"]
        print(f"✓ Retell agent '{AGENT_NAME}' already exists ({agent_id})")
        llm_id = (existing.get("response_engine") or {}).get("llm_id")
        if webhook_url != PLACEHOLDER_WEBHOOK and llm_id:
            status, r = request("PATCH", f"{api}/update-retell-llm/{llm_id}",
                                headers=headers,
                                body={"general_tools": build_tools(webhook_url)})
            if status in (200, 201):
                print(f"✓ Updated function webhook URLs → {webhook_url}")
            else:
                print(f"! Could not update LLM tool URLs (HTTP {status}): "
                      f"{json.dumps(r)[:300]}")
    else:
        prompt = PROMPT_FILE.read_text()
        status, llm = request("POST", api + "/create-retell-llm", headers=headers,
                              body={"model": "gpt-4.1", "general_prompt": prompt,
                                    "begin_message": BEGIN_MESSAGE,
                                    "general_tools": build_tools(webhook_url)})
        if status not in (200, 201):
            die("create Retell LLM", status, llm)
        print(f"✓ Created Retell LLM ({llm['llm_id']})")

        agent_body = {"agent_name": AGENT_NAME, "voice_id": VOICE_ID, "language": "en-GB",
                      "response_engine": {"type": "retell-llm", "llm_id": llm["llm_id"]},
                      "enable_backchannel": True, "backchannel_frequency": 0.8,
                      "backchannel_words": ["mm-hmm", "right", "okay", "I see"],
                      "interruption_sensitivity": 1, "responsiveness": 1,
                      "voice_temperature": 1, "normalize_for_speech": True}
        status, agent = request("POST", api + "/create-agent", headers=headers, body=agent_body)
        if status not in (200, 201) and "voice" in json.dumps(agent).lower():
            status_v, voices = request("GET", api + "/list-voices", headers=headers)
            fallback = next((v["voice_id"] for v in voices
                             if "openai" in v.get("voice_id", "").lower()), None) \
                if status_v == 200 and isinstance(voices, list) else None
            if fallback:
                print(f"! Voice '{VOICE_ID}' rejected, retrying with '{fallback}'")
                agent_body["voice_id"] = fallback
                status, agent = request("POST", api + "/create-agent", headers=headers,
                                        body=agent_body)
        if status not in (200, 201):
            die("create agent", status, agent)
        agent_id = agent["agent_id"]
        print(f"✓ Created agent '{AGENT_NAME}' ({agent_id})")

    save_env_key("RETELL_AGENT_ID", agent_id)

    number = env["TWILIO_PHONE_NUMBER"]
    status, r = request("POST", api + "/import-phone-number", headers=headers,
                        body={"phone_number": number,
                              "termination_uri": trunk["termination_uri"],
                              "sip_trunk_auth_username": trunk["sip_user"],
                              "sip_trunk_auth_password": trunk["sip_pass"],
                              "transport": "UDP",
                              "inbound_agents": [{"agent_id": agent_id, "weight": 1}],
                              "outbound_agents": [{"agent_id": agent_id, "weight": 1}],
                              "nickname": "Arlo Angel line"})
    if status in (200, 201):
        print(f"✓ Imported {number} into Retell, inbound → {AGENT_NAME}")
    elif "already" in json.dumps(r).lower():
        print(f"✓ {number} already imported into Retell")
    else:
        die("import phone number into Retell", status, r)


def main():
    env = load_env()
    missing = [k for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER",
                           "RETELL_API_KEY") if not env.get(k)]
    if missing:
        sys.exit("Missing from .env: " + ", ".join(missing))
    have_n8n = bool(env.get("N8N_API_KEY") and env.get("N8N_INSTANCE_URL"))

    print("--- 1/3 Twilio ---")
    trunk = twilio_setup(env)
    print("\n--- 2/3 n8n ---")
    if have_n8n:
        webhook_url = n8n_setup(env)
    elif env.get("N8N_WEBHOOK_URL"):
        webhook_url = env["N8N_WEBHOOK_URL"]
        print(f"! No n8n API key — assuming the workflow was imported manually in the")
        print(f"  n8n UI and its webhook is live at: {webhook_url}")
        print("  (If you haven't imported n8n/angel-workflow.json yet, do it before")
        print("  testing calls — Angel's bookings will fail until it's active.)")
    else:
        webhook_url = PLACEHOLDER_WEBHOOK
        print("! N8N_API_KEY / N8N_INSTANCE_URL not set — skipping n8n.")
        print("  Angel's functions will point at a placeholder URL, so booking and")
        print("  emails won't fire yet. Re-run this script after adding the n8n keys")
        print("  (or N8N_WEBHOOK_URL for a manually imported workflow) to .env and")
        print("  it will fix the URLs in place.")
    print("\n--- 3/3 Retell ---")
    retell_setup(env, webhook_url, trunk)

    print("\nDone. Remaining manual steps (see docs/SETUP.md):")
    if not have_n8n:
        print("  0. Add N8N_API_KEY + N8N_INSTANCE_URL to .env and re-run this script.")
    print("  1. In n8n, open the Calendar + both Gmail nodes and connect Google (OAuth),")
    print("     and set your real calendar ID in 'Create Calendar Event'.")
    print("  2. Call " + env["TWILIO_PHONE_NUMBER"] + " and test the full flow.")
    print("  3. Rotate your Twilio auth token (Console → Account → API keys & tokens).")


if __name__ == "__main__":
    main()
