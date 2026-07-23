#!/usr/bin/env python3
"""Generate images via the MuAPI API (submit + poll + download)."""
import json, sys, time, urllib.request, urllib.error
from pathlib import Path

KEY = None
for line in (Path(__file__).resolve().parent.parent.parent / ".env").read_text().splitlines():
    if line.startswith("MUAPI_API_KEY="):
        KEY = line.split("=", 1)[1].strip()
BASE = "https://api.muapi.ai/api/v1"


def _req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json", "x-api-key": KEY})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"raw": e.read().decode()[:400]}


def generate(model, prompt, out_path, aspect_ratio="3:4"):
    print(f"[{model}] submitting…")
    st, sub = _req("POST", f"{BASE}/{model}",
                   {"prompt": prompt, "aspect_ratio": aspect_ratio, "image_url": None})
    if st not in (200, 201):
        print(f"  submit failed HTTP {st}: {sub}"); return False
    rid = sub.get("request_id") or sub.get("id")
    if not rid:
        # maybe direct result
        url = (sub.get("outputs") or [None])[0] or sub.get("url")
        if url:
            return _download(url, out_path)
        print(f"  no request_id: {sub}"); return False
    print(f"  request_id={rid}, polling…")
    for i in range(90):
        time.sleep(2)
        st, data = _req("GET", f"{BASE}/predictions/{rid}/result")
        status = (data.get("status") or "").lower()
        if status in ("completed", "succeeded", "success"):
            url = (data.get("outputs") or [None])[0] or data.get("url") or (data.get("output") or {}).get("url")
            print(f"  done: {url}")
            return _download(url, out_path)
        if status in ("failed", "error"):
            print(f"  generation failed: {data}"); return False
        if i % 5 == 0:
            print(f"  …status={status} ({i*2}s)")
    print("  timed out"); return False


def _download(url, out_path):
    if not url:
        print("  no url to download"); return False
    urllib.request.urlretrieve(url, out_path)
    print(f"  saved -> {out_path}")
    return True


if __name__ == "__main__":
    model = sys.argv[1]
    prompt = sys.argv[2]
    out = sys.argv[3]
    ar = sys.argv[4] if len(sys.argv) > 4 else "3:4"
    ok = generate(model, prompt, out, ar)
    sys.exit(0 if ok else 1)
