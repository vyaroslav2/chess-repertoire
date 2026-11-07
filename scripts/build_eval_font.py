"""Build Eval Mono: JetBrains Mono Light with a plain zero, for the evals (UI.26).

JetBrains Mono has no plain zero: its `0` is dotted, its one alternate slashed.
This takes the official variable font, fixes the weight at 300, drops the dot
from `0`, keeps only the characters an eval uses, and renames the font, as
the SIL Open Font License asks of a changed copy.

Needs fontTools and brotli (pip install fonttools brotli). Source:
https://github.com/JetBrains/JetBrainsMono/raw/master/fonts/webfonts/JetBrainsMono%5Bwght%5D.woff2

    python scripts/build_eval_font.py <JetBrainsMono[wght].woff2> app/_fonts/EvalMono-Light.woff2

With "slashed" as a third argument it builds Eval Mono Slashed instead, whose zero
is JetBrains Mono's slashed one. Only /grid uses it, for comparison.
"""

import copy
import sys

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FAMILY = "Eval Mono"
TEXT = "0123456789+-.# "  # everything formatEval in LichessMoveList.tsx can print


def contours(font, name):
    """The glyph's outline, split into its closed contours."""
    pen = DecomposingRecordingPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    result, current = [], []
    for op, args in pen.value:
        current.append((op, args))
        if op in ("closePath", "endPath"):
            result.append(current)
            current = []
    return result


def area(contour):
    points = [p for _, args in contour for p in args]
    xs, ys = [x for x, _ in points], [y for _, y in points]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def drop_dot(font):
    """The zero is three contours: outside, inside and the dot, the smallest."""
    parts = contours(font, "zero")
    assert len(parts) == 3, f"expected a dotted zero, got {len(parts)} contours"
    dot = min(parts, key=area)
    pen = TTGlyphPen(font.getGlyphSet())
    for part in parts:
        if part is dot:
            continue
        for op, args in part:
            getattr(pen, op)(*args)
    font["glyf"]["zero"] = pen.glyph()


def slash(font):
    """Swap in the alternate zero that JetBrains Mono's `zero` feature gives."""
    font["glyf"]["zero"] = copy.deepcopy(font["glyf"]["zero.zero"])


def rename(font, family):
    names = font["name"]
    for record in list(names.names):
        if record.nameID in (16, 17, 21, 22, 25):
            names.removeNames(nameID=record.nameID)
    names.setName(family, 1, 3, 1, 0x409)
    names.setName("Regular", 2, 3, 1, 0x409)
    names.setName(f"{family} Light; built from JetBrains Mono 2.304", 3, 3, 1, 0x409)
    names.setName(family, 4, 3, 1, 0x409)
    names.setName(family.replace(" ", "") + "-Light", 6, 3, 1, 0x409)
    names.removeNames(platformID=1)  # Mac names, old and unused


def main(source, target, variant="plain"):
    font = TTFont(source)
    font = instantiateVariableFont(font, {"wght": 300})
    if variant == "slashed":
        slash(font)
    else:
        drop_dot(font)
    options = Options()
    options.layout_features = []
    options.flavor = "woff2"
    subsetter = Subsetter(options)
    subsetter.populate(text=TEXT)
    subsetter.subset(font)
    rename(font, FAMILY + (" Slashed" if variant == "slashed" else ""))
    font.flavor = "woff2"
    font.save(target)


if __name__ == "__main__":
    main(*sys.argv[1:])
