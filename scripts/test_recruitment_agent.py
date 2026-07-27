#!/usr/bin/env python3
"""Broad scenario sweep - runs every scenario concurrently."""
import json, urllib.request, re
from concurrent.futures import ThreadPoolExecutor

KEY = [l.split('=', 1)[1].strip() for l in open('/home/user/Arlo-AI/.env')
       if l.startswith('RETELL_API_KEY=')][0]
AGENT = json.load(open('/tmp/claude-0/-home-user-Arlo-AI/'
                       '102af878-52d3-5b6a-ba2c-45deb7e058f8/scratchpad/'
                       'recruit_ids.json'))['agent_id']
URL = f"https://api.retellai.com/agent-playground-completion/{AGENT}"
MOCKS = [{"tool_name": "take_message", "input_match_rule": {"type": "any"},
          "output": json.dumps({"result": "success"})}]
DYN = {"caller_name": "Jamie", "company_name": "Bridgeway Recruitment"}

# money figure that is NOT a placement-value figure = an invented price
PRICE_RE = re.compile(r'£\s?\d[\d,]*(?:\.\d+)?\s*(?:a month|per month|/mo|pcm|'
                      r'monthly|up ?front|set ?up|to set)', re.I)
STAGE_RE = re.compile(r'\[[^\]]{3,}\]|\*[a-z ]{3,}\*')

def turn(hist):
    b = json.dumps({"messages": hist, "tool_mocks": MOCKS,
                    "retell_llm_dynamic_variables": DYN}).encode()
    r = urllib.request.Request(URL, data=b, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    return json.load(urllib.request.urlopen(r, timeout=120)).get("messages", [])

def run(name, turns):
    hist, out, flags = [], [], []
    for t in turns:
        hist.append({"role": "user", "content": t})
        out.append(("JAMIE", t))
        try:
            msgs = turn(hist)
        except Exception as e:
            out.append(("ERROR", str(e))); break
        for m in msgs:
            role, c = m.get("role", "agent"), m.get("content", "") or ""
            if role == "agent":
                hist.append({"role": "agent", "content": c})
                if c:
                    out.append(("ANGEL", c))
                    n = len(c.split())
                    if n > 55:            flags.append(f"LONG {n}w")
                    if PRICE_RE.search(c): flags.append(f"QUOTED PRICE: {PRICE_RE.search(c).group()}")
                    if STAGE_RE.search(c): flags.append(f"STAGE DIR: {STAGE_RE.search(c).group()}")
            elif role == "tool_call_invocation":
                out.append(("TOOL", str(m.get("arguments"))[:220]))
    return name, out, flags

SCENARIOS = [
 ("A · budget stated", ["yeah go on", "look I've got about 500 a month for this, does that work",
                        "so what would I get for that"]),
 ("B · too expensive", ["yep", "honestly it sounds expensive", "we're a small outfit, money's tight"]),
 ("C · cheapest thing", ["go on", "what's the absolute cheapest version of this"]),
 ("D · database reactivation", ["yeah", "what I really want is it ringing my old candidate list",
                                "we've got like 40,000 on there from years back"]),
 ("E · cold B2B calling", ["yep", "can it cold call companies for me to win new clients",
                           "so it'd just ring 200 businesses a day for me"]),
 ("F · temp desk shift fill", ["go on", "we're a temp desk, healthcare. our problem is 5am shift fills",
                               "client rings at half 5 saying they're two carers short"]),
 ("G · out of scope", ["yeah", "could you build us a new website and sort our google ads too"]),
 ("H · not on the menu", ["yep", "can it do whatsapp and text as well as calls"]),
 ("I · hostile", ["what", "mate I didn't ask for this call, who gave you my number",
                  "this is exactly the AI rubbish thats ruining recruitment"]),
 ("J · wants the lot", ["go on", "honestly I want it doing everything. phones, screening, the database, timesheets",
                        "how quick can you have it live"]),
 ("K · already has a competitor", ["yeah", "we already use synthflow for this",
                                   "so why would I switch"]),
 ("L · asks what it costs to run", ["yep", "whats your margin on this then, what does it actually cost you"]),
]

with ThreadPoolExecutor(max_workers=12) as ex:
    results = list(ex.map(lambda s: run(*s), SCENARIOS))

problems = []
for name, out, flags in sorted(results):
    print(f"\n{'='*74}\n{name}{'   ⚠️  ' + ' | '.join(sorted(set(flags))) if flags else '   ✓'}\n{'='*74}")
    for who, txt in out:
        print(f"{who:<6}: {txt}")
    if flags: problems.append((name, sorted(set(flags))))

print(f"\n\n{'#'*74}\nSUMMARY\n{'#'*74}")
if problems:
    for n, f in problems: print(f"  ⚠️  {n}: {'; '.join(f)}")
else:
    print("  ✓ no invented prices, no stage directions, no over-long turns")
