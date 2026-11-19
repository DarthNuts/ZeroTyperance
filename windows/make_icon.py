#!/usr/bin/env python3
# make_icon.py OUT.ico [OUT.png] : the ZeroTyperance icon - an original "ZT" monogram drawn as polygons (no font, no
# game art), multi-size .ico (16..256). Deterministic: the same bytes on every run.
import sys
from PIL import Image, ImageDraw

S = 1024  # drawn large, scaled down per size


def master():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((32, 32, S - 32, S - 32), radius=180, fill=(22, 26, 34, 255))
    d.rounded_rectangle((32, 32, S - 32, S - 32), radius=180, outline=(214, 64, 52, 255), width=36)
    w = 92  # stroke width
    # Z: top bar, diagonal, bottom bar (left half)
    x0, x1, y0, y1 = 150, 520, 250, 774
    d.rectangle((x0, y0, x1, y0 + w), fill=(236, 238, 242, 255))
    d.rectangle((x0, y1 - w, x1, y1), fill=(236, 238, 242, 255))
    d.polygon([(x1 - w * 1.15, y0 + w), (x1, y0 + w), (x0 + w * 1.15, y1 - w), (x0, y1 - w)], fill=(236, 238, 242, 255))
    # T: bar and stem (right half), in the accent colour
    t0, t1 = 520, 874
    d.rectangle((t0 + 20, y0, t1, y0 + w), fill=(214, 64, 52, 255))
    cx = (t0 + 20 + t1) // 2
    d.rectangle((cx - w // 2, y0, cx + w // 2, y1), fill=(214, 64, 52, 255))
    return im


def main():
    out = sys.argv[1]
    m = master()
    sizes = [16, 24, 32, 48, 64, 128, 256]
    m.resize((256, 256), Image.LANCZOS).save(out, format="ICO", sizes=[(s, s) for s in sizes])
    if len(sys.argv) > 2:
        m.resize((256, 256), Image.LANCZOS).save(sys.argv[2], format="PNG", optimize=False)
    print("icon:", out)


if __name__ == "__main__":
    main()
