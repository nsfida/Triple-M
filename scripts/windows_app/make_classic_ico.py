#!/usr/bin/env python3
"""Rewrite a Windows .ico so every size below 256 px is a classic 32-bit
bitmap (BGRA + AND mask) and only the 256 px image stays PNG-compressed.

Windows can draw PNG-compressed small icons in most places, but parts of the
shell (icon cache, pinned taskbar items, older extraction paths) are only
reliable with classic bitmaps for the small sizes. This is the layout Visual
Studio and the Windows SDK produce.

    python3 make_classic_ico.py IN.ico OUT.ico [--add 20,30,40]

Existing images keep their exact pixels; --add creates extra sizes from the
largest image (high-quality downscale). Requires Pillow.
"""
import io
import struct
import sys
from pathlib import Path

from PIL import Image


def read_ico(path):
    b = Path(path).read_bytes()
    reserved, typ, count = struct.unpack_from("<HHH", b, 0)
    if reserved != 0 or typ != 1 or count < 1:
        raise SystemExit("not an .ico file")
    images = {}
    for i in range(count):
        w, h, _c, _r, _p, _bpp, size, off = struct.unpack_from("<BBBBHHII", b, 6 + 16 * i)
        data = b[off:off + size]
        img = Image.open(io.BytesIO(data)) if data[:8] == b"\x89PNG\r\n\x1a\n" else None
        if img is None:
            # Already a bitmap entry: let Pillow decode the single image.
            one = struct.pack("<HHH", 0, 1, 1) + struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, size, 22) + data
            img = Image.open(io.BytesIO(one))
        img = img.convert("RGBA")
        images[img.size[0]] = img
    return images


def dib(img):
    w, h = img.size
    px = img.tobytes("raw", "BGRA")
    stride = w * 4
    rows = [px[y * stride:(y + 1) * stride] for y in range(h)]
    color = b"".join(reversed(rows))  # bottom-up
    mask_stride = ((w + 31) // 32) * 4
    alpha = img.getchannel("A").tobytes()
    mask_rows = []
    for y in range(h):
        row = bytearray(mask_stride)
        for x in range(w):
            if alpha[y * w + x] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask_rows.append(bytes(row))
    mask = b"".join(reversed(mask_rows))
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, len(color) + len(mask), 0, 0, 0, 0)
    return header + color + mask


def png(img):
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    add = []
    for a in sys.argv[1:]:
        if a.startswith("--add="):
            add = [int(x) for x in a[6:].split(",") if x]
    if len(args) != 2:
        raise SystemExit(__doc__)
    images = read_ico(args[0])
    largest = images[max(images)]
    for s in add:
        if s not in images:
            images[s] = largest.resize((s, s), Image.LANCZOS)
    sizes = sorted(images)
    blobs = [png(images[s]) if s >= 256 else dib(images[s]) for s in sizes]
    out = bytearray(struct.pack("<HHH", 0, 1, len(sizes)))
    offset = 6 + 16 * len(sizes)
    for s, blob in zip(sizes, blobs):
        dim = 0 if s >= 256 else s
        out += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    for blob in blobs:
        out += blob
    Path(args[1]).write_bytes(out)
    print(f"{args[1]}: sizes {sizes} (PNG only at 256)")


if __name__ == "__main__":
    main()
