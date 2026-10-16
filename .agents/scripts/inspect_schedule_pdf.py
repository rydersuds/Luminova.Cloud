"""Render a schedule and print its text/coloured-vector geometry for verification."""
import json
import sys
from pathlib import Path

import fitz

source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
document = fitz.open(source)
for number, page in enumerate(document):
    print(f"PAGE {number + 1}: {page.rect}")
    page.get_pixmap(matrix=fitz.Matrix(2, 2)).save(out / f"page-{number + 1}.png")
    vectors = [
        {"rect": list(shape["rect"]), "fill": shape["fill"], "type": shape["type"]}
        for shape in page.get_drawings()
        if shape["fill"] is not None
        and max(shape["fill"]) - min(shape["fill"]) > 0.15
    ]
    (out / f"vectors-{number + 1}.json").write_text(json.dumps(vectors, indent=2))
    words = page.get_text("words")
    (out / f"words-{number + 1}.json").write_text(json.dumps(words, indent=2))
    print(f"Rendered {out / f'page-{number + 1}.png'}; {len(vectors)} coloured vectors.")
