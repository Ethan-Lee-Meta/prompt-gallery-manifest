from __future__ import annotations

import re


_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN1_RE = re.compile(r"[\u00A0-\u00FF]")


def _score(s: str) -> int:
    if not s:
        return -10_000
    cjk = len(_CJK_RE.findall(s))
    lat = len(_LATIN1_RE.findall(s))
    rep = s.count("\ufffd")
    # prefer more CJK, fewer latin1 mojibake chars, no replacement chars
    return cjk * 10 - lat * 2 - rep * 20


def normalize_text(s: str) -> str:
    """
    Attempt to fix common mojibake:
      - GBK bytes decoded as latin-1/cp1252 (e.g. '²âÊÔ' should be '测试', '×îÖÕ...' -> '最终...')
    Strategy:
      - if string contains many latin1-range chars and few CJK, try latin1->utf8 and latin1->gbk.
      - choose the best scored candidate.
    """
    if s is None:
        return s
    s = str(s)

    base_score = _score(s)
    best = s
    best_score = base_score

    # quick heuristic: only attempt repair when likely mojibake
    if len(_LATIN1_RE.findall(s)) < 2 and len(_CJK_RE.findall(s)) > 0:
        return s

    raw = None
    try:
        raw = s.encode("latin1")
    except Exception:
        raw = None

    if raw:
        for enc in ("utf-8", "gbk", "cp936"):
            try:
                cand = raw.decode(enc)
            except Exception:
                continue
            sc = _score(cand)
            if sc > best_score:
                best, best_score = cand, sc

    return best


def normalize_list(xs: list[str]) -> list[str]:
    out = []
    for x in xs or []:
        t = normalize_text(x).strip()
        if t:
            out.append(t)
    # de-dup stable
    seen = set()
    res = []
    for t in out:
        if t not in seen:
            seen.add(t)
            res.append(t)
    return res
