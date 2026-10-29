"""Reproduce the approved statistical illustration from the normal PDF.
Run with Python + matplotlib; no application/runtime dependency.
"""
from pathlib import Path
from math import exp, pi, sqrt
import matplotlib
matplotlib.use("Agg")
from matplotlib import pyplot as plt
from matplotlib.font_manager import FontProperties

ROOT = Path(__file__).resolve().parents[3]
FONT = FontProperties(fname="/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
for dark in (False, True):
    background, text, accent, muted, grid = (
        ("#171d1b", "#eef2ee", "#91c9ba", "#9bb5ab", "#3d4b43") if dark
        else ("#edf2ee", "#18201f", "#185f59", "#5c8278", "#d8dfda")
    )
    for mobile in (False, True):
        fig = plt.figure(figsize=(7.68, 3.84) if mobile else (17.74, 8.87), dpi=100, facecolor=background)
        ax = fig.add_axes([.12, .22, .84, .58] if mobile else [.12, .20, .66, .60], facecolor=background)
        xs = [-3.4 + i * 6.8 / 680 for i in range(681)]
        def density(sigma):
            return [exp(-x*x/(2*sigma*sigma))/(sigma*sqrt(2*pi)) for x in xs]
        ax.plot(xs, density(1), color=accent, linewidth=1.7 if mobile else 2.3, label=r"$\sigma = 1$")
        ax.fill_between(xs, density(1), color=accent, alpha=.12)
        ax.plot(xs, density(1.5), color=muted, linewidth=1.6 if mobile else 2.1, dashes=(5,4), label=r"$\sigma = 1.5$")
        ax.set(xlim=(-3.4, 3.4), ylim=(0,.42), xticks=range(-3,4), yticks=[0,.1,.2,.3,.4])
        ax.grid(color=grid, linestyle="--", linewidth=.7)
        ax.set_axisbelow(True)
        for name, spine in ax.spines.items():
            spine.set_visible(name in ("left", "bottom"))
            spine.set_color(muted)
        ax.tick_params(labelsize=12 if mobile else 21, colors=text, length=3 if mobile else 5)
        ax.set_xlabel("标准化偏差 z", fontproperties=FONT, fontsize=13 if mobile else 22, color=text, labelpad=6 if mobile else 14)
        ax.set_ylabel("概率\n密度", fontproperties=FONT, fontsize=12 if mobile else 22, color=text, rotation=0, labelpad=14 if mobile else 36)
        legend = ax.legend(loc="upper right" if mobile else "upper left", bbox_to_anchor=(1.04,1.39) if mobile else (1.03,1.05), ncol=2 if mobile else 1, frameon=False, fontsize=12 if mobile else 23, handlelength=2)
        for label in legend.get_texts(): label.set_color(text)
        fig.text(.04,.92,"图 01 · 正态分布示意", fontproperties=FONT, fontsize=13 if mobile else 25, fontweight="bold", color=text)
        fig.text(.96,.025,"同均值，不同标准差 · 示意数据", ha="right", fontproperties=FONT, fontsize=10 if mobile else 19, color=("#bdc8c0" if dark else "#4d5b57"))
        suffix = ("-mobile" if mobile else "") + ("-dark" if dark else "")
        fig.savefig(ROOT / f"public/editorial-v10/process-distribution{suffix}.png", dpi=100, facecolor=background)
        plt.close(fig)
