#!/usr/bin/env python3
"""Render the EMIS+ art manifest one job at a time.

Safety rules (from the 2026-10-02 batch-limit incident):
- one job lock; a second runner exits at once
- jobs whose output already exists are skipped (logged successes)
- every job runs once (gen.py --retries 0); no automatic retry, no model fallback
- stdout and stderr are inspected even on exit 0; the first provider, auth,
  limit, timeout or invalid-response failure stops the whole batch and is
  persisted to art/raw/BLOCKED.json, which later runs refuse to pass
Usage: batch.py [--only id,id] [--list]"""
import json, os, subprocess, sys, time, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(ROOT, "art", "raw")
LOCK = os.path.join(RAW, ".batch.lock")
BLOCK = os.path.join(RAW, "BLOCKED.json")
LOG = os.path.join(RAW, "batch.log")
sys.path.insert(0, HERE)
from manifest import JOBS  # noqa: E402

BAD = re.compile(r"(usage|quota|limit|rate|credit|insufficient|unauthor|forbidden|auth|expired|timeout|timed out|"
                 r"InvalidParameter|BadRequest|error|IncompleteRead|connection)", re.I)


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def main():
    os.makedirs(RAW, exist_ok=True)
    if "--list" in sys.argv:
        for j in JOBS:
            done = os.path.exists(os.path.join(RAW, j["id"] + ".png"))
            print(("done " if done else "todo ") + j["id"])
        return
    if os.path.exists(BLOCK):
        print("BLOCKED: " + open(BLOCK).read()); sys.exit(9)
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode()); os.close(fd)
    except FileExistsError:
        print("another batch holds the lock: " + LOCK); sys.exit(8)
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    try:
        for j in JOBS:
            if only and j["id"] not in only:
                continue
            out = os.path.join(RAW, j["id"] + ".png")
            if os.path.exists(out):
                log(f"skip {j['id']} (exists)"); continue
            cmd = [sys.executable, os.path.join(HERE, "gen.py"), j["prompt"], "--out", out, "--size", j["size"],
                   "--retries", "0", "--url", "--fmt", "png"]
            for r in j.get("ref", []):
                ref = os.path.join(RAW, r + ".png")
                if not os.path.exists(ref):
                    raise SystemExit(f"missing reference {r} for {j['id']}")
                cmd += ["--ref", ref]
            t0 = time.time()
            try:
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=200)
            except subprocess.TimeoutExpired as e:
                json.dump({"job": j["id"], "exit": "timeout", "seconds": 200,
                           "stdout": str(e.stdout or "")[-600:], "stderr": str(e.stderr or "")[-600:],
                           "at": time.strftime("%Y-%m-%d %H:%M:%S")}, open(BLOCK, "w"), indent=1)
                log(f"STOP at {j['id']} timeout -> {BLOCK}")
                sys.exit(7)
            secs = round(time.time() - t0, 1)
            ok = p.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 20000
            noise = BAD.search(p.stderr or "") or (BAD.search(p.stdout or "") and '"out"' not in (p.stdout or ""))
            if not ok or noise:
                info = {"job": j["id"], "exit": p.returncode, "seconds": secs,
                        "stdout": (p.stdout or "")[-600:], "stderr": (p.stderr or "")[-600:],
                        "at": time.strftime("%Y-%m-%d %H:%M:%S")}
                if ok and noise:
                    info["note"] = "image written but output carried a failure keyword; batch stopped for review"
                json.dump(info, open(BLOCK, "w"), indent=1)
                log(f"STOP at {j['id']} exit={p.returncode} {secs}s -> {BLOCK}")
                sys.exit(7)
            log(f"ok {j['id']} {secs}s {os.path.getsize(out)//1024} KB")
    finally:
        if os.path.exists(LOCK):
            os.remove(LOCK)


if __name__ == "__main__":
    main()
