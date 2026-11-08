"""Theme palettes mapping the canonical spec color tokens to target colors.

Components may only use the canonical hex values below (see
references/library-format.md "规范色板"). A theme maps every token to a target
hex; the renderer swaps hex values inside component HTML before parsing, and
the demo page performs the same swap in the browser.
"""
from __future__ import annotations

# 规范色板：组件中允许出现、且参与主题换色的全部 hex（大写带 #）。
CANONICAL = {
    "INK": "#17324D",
    "BODY": "#263C50",
    "MUTED": "#52687A",
    "FAINT": "#8496A8",
    "ACCENT_D": "#145D92",
    "ACCENT_FILL_D": "#145D93",
    "ACCENT": "#1476B8",
    "ACCENT_FILL": "#1476B9",
    "ACCENT_L": "#3F92CC",
    "SOFT_A": "#E4EFF8",
    "BG_SOFT": "#F0F5FA",
    "BG_SOFT2": "#F5F8FB",
    "BORDER": "#C5D3DF",
    "BORDER_L": "#D8E4EF",
    "WHITE": "#FFFFFF",
    "SURFACE": "#FDFDFD",
    "OK": "#1E7A46",
    "OK_BG": "#E5F3EA",
    "WARN": "#A86A00",
    "WARN_BG": "#FBF0DC",
    "DANGER": "#B3372F",
    "DANGER_BG": "#F9E9E7",
}


DEFAULT_THEME = "crimson"


def _derived(**overrides):
    colors = dict(CANONICAL)
    colors.update(overrides)
    return colors


THEMES = {
    "blue": {
        "name": "政务蓝",
        "canvas": "#FFFFFF",
        "colors": _derived(SURFACE="#FFFFFF"),
    },
    "emerald": {
        "name": "墨绿",
        "canvas": "#FFFFFF",
        "colors": _derived(
            ACCENT_D="#0F5C43",
            ACCENT="#15805E",
            ACCENT_L="#3E9E7E",
            ACCENT_FILL="#15805E",
            ACCENT_FILL_D="#0F5C43",
            SOFT_A="#E1F1EB",
            BG_SOFT="#F0F7F4",
            BG_SOFT2="#F5FAF7",
            BORDER="#C2D8D0",
            BORDER_L="#D7E8E1",
            SURFACE="#FFFFFF",
        ),
    },
    "crimson": {
        "name": "深红",
        "canvas": "#FFFFFF",
        "colors": _derived(
            ACCENT_D="#7A1F1E",
            ACCENT="#A02C25",
            ACCENT_L="#C0584D",
            ACCENT_FILL="#A02C25",
            ACCENT_FILL_D="#7A1F1E",
            SOFT_A="#F6E9E7",
            BG_SOFT="#F9F1F0",
            BG_SOFT2="#FBF6F5",
            BORDER="#DFC8C4",
            BORDER_L="#ECDBD8",
            SURFACE="#FFFFFF",
        ),
    },
    "mono": {
        "name": "黑白灰",
        "canvas": "#FFFFFF",
        "colors": _derived(
            INK="#1C1C1C",
            BODY="#2E2E2E",
            MUTED="#5C5C5C",
            FAINT="#8A8A8A",
            ACCENT_D="#222222",
            ACCENT="#383838",
            ACCENT_L="#6B6B6B",
            ACCENT_FILL="#383838",
            ACCENT_FILL_D="#222222",
            SOFT_A="#EDEDED",
            BG_SOFT="#F3F3F3",
            BG_SOFT2="#F8F8F8",
            BORDER="#C9C9C9",
            BORDER_L="#DCDCDC",
            SURFACE="#FFFFFF",
        ),
    },
    "graphite": {
        "name": "石墨黑",
        "canvas": "#0F151C",
        "colors": _derived(
            INK="#EAF1F8",
            BODY="#C6D3DF",
            MUTED="#93A5B8",
            FAINT="#6B7C8D",
            ACCENT_D="#8FBEE4",
            ACCENT="#5BA3D9",
            ACCENT_L="#3E7FAF",
            ACCENT_FILL="#2F6E97",
            ACCENT_FILL_D="#24536F",
            SOFT_A="#1E3040",
            BG_SOFT="#1B2632",
            BG_SOFT2="#16202B",
            BORDER="#34465A",
            BORDER_L="#2A3A4B",
            OK="#4FB07E",
            OK_BG="#1C3A2C",
            WARN="#DE9F3C",
            WARN_BG="#3D3018",
            DANGER="#DE6A5E",
            DANGER_BG="#3E2422",
            SURFACE="#1B2632",
        ),
    },
}


def theme_ids():
    """All selectable theme ids, in display order."""
    return list(THEMES)


def palette(theme_id):
    """Return {规范色板 hex（大写带 #）: 目标 hex} for load_libraries(palette=...)."""
    if theme_id not in THEMES:
        raise ValueError(f"未知主题：{theme_id}；可选值：{', '.join(THEMES)}")
    colors = THEMES[theme_id]["colors"]
    return {source: colors[token] for token, source in CANONICAL.items()}
