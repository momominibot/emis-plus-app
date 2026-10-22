#!/usr/bin/env python3
"""WCAG contrast check for every text-on-surface token pair the app uses,
in light and dark mode. Exit 1 if any pair fails. Run every build loop:
    python3 tools/contrast.py
Pairs list: (foreground token, background token, minimum ratio)."""
import re, sys, pathlib

SRC = pathlib.Path(__file__).resolve().parent.parent / "constants" / "Colors.ts"
PAIRS = [
    # body text
    ("text", "background", 4.5), ("text", "surface", 4.5), ("textSecondary", "background", 4.5),
    ("textSecondary", "surface", 4.5), ("textTertiary", "background", 4.5), ("textTertiary", "surface", 4.5),
    ("textSecondary", "primaryLight", 4.5), ("textSecondary", "surfaceSunken", 4.5),
    # brand text and fills
    ("primary", "surface", 4.5), ("primary", "background", 4.5), ("onPrimary", "primary", 4.5),
    ("primaryInk", "primaryLight", 4.5), ("primary", "primaryLight", 3.0),
    # status
    ("danger", "dangerBg", 4.5), ("danger", "surface", 4.5), ("warning", "warningBg", 4.5),
    ("info", "infoBg", 4.5), ("info", "secondaryLight", 4.5), ("accent", "surface", 4.5), ("success", "successBg", 4.5),
    # tiers on their badge
    ("silver", "surfaceSunken", 4.5), ("gold", "surfaceSunken", 4.5), ("diamond", "surfaceSunken", 4.5),
    # controls (non-text, 3:1)
    ("controlBorder", "surface", 3.0), ("controlBorder", "background", 3.0),
]


def block(src, name):
    m = re.search(r"const " + name + r"(?:: typeof light)? = \{(.*?)\n\};", src, re.S)
    return dict(re.findall(r"(\w+): '(#[0-9A-Fa-f]{6})'", m.group(1)))


def lum(h):
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main():
    src = SRC.read_text()
    bad = 0
    for mode in ("light", "dark"):
        c = block(src, mode)
        for fg, bg, need in PAIRS:
            if fg not in c or bg not in c:
                print(f"MISSING {mode} {fg}/{bg}"); bad += 1; continue
            r = ratio(c[fg], c[bg])
            if r < need:
                print(f"FAIL {mode:5} {fg:14} on {bg:14} {r:5.2f} < {need}"); bad += 1
    total = len(PAIRS) * 2
    print(f"contrast: {total - bad}/{total} pairs pass")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
