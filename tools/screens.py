#!/usr/bin/env python3
"""Phone-size screenshots of the exported web app, stitched into one sheet.
Usage: screens.py <dist dir> <out.png>   (serves dist on a spare port)"""
import os, socket, subprocess, sys, time
from PIL import Image

DIST, OUT = sys.argv[1], sys.argv[2]
PAGES = ["", "shop", "learn", "tools", "account", "tools/wound-advisor", "reel/S0Dgmo9wwcg"]
HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = os.environ.get("PAGES_SERVER", os.path.join(HERE, "pages_server.py"))


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-I", SCRATCH, DIST, str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        from playwright.sync_api import sync_playwright
        shots = []
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, reduced_motion="no-preference")
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            for path in PAGES:
                page.goto(f"http://127.0.0.1:{port}/emis-plus-app/{path}", wait_until="networkidle")
                page.wait_for_timeout(1800)
                f = f"/tmp/emis-shot-{path.replace('/', '_') or 'home'}.png"
                page.screenshot(path=f, full_page=False)
                shots.append(f)
            b.close()
        ims = [Image.open(f) for f in shots]
        w, h = ims[0].size
        sheet = Image.new("RGB", (w * len(ims) + 16 * (len(ims) + 1), h + 32), (245, 248, 247))
        for i, im in enumerate(ims):
            sheet.paste(im, (16 + i * (w + 16), 16))
        sheet.thumbnail((4200, 1400), Image.LANCZOS)
        sheet.save(OUT, "PNG", optimize=True)
        print("saved", OUT, "errors:", errors)
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
