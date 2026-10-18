"""Builds the app icon set from the owner's "Orange Package Search Icon.png".

Owner: plain orange, no gradient. So the white parcel + magnifier glyph is lifted from the image
and placed, at exactly the same position, on flat Rein Orange (#FF6B35, brand palette).

Outputs (repo-relative):
- packages/brand-assets/app-icon/app-icon-package-search-original.png  the owner's file, untouched
- packages/brand-assets/app-icon/app-icon-package-search.png           flat orange, rounded corners (favicon, web)
- packages/brand-assets/app-icon/app-icon-package-search-square.png    flat orange, full-bleed 1024 square
  (iOS / Android / apple-touch icons must not be transparent - the OS rounds them itself)
- apps/mobile/assets/icon.png (1024 RGB), android-icon-{background,foreground,monochrome}.png, favicon.png
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

REIN_ORANGE = (255, 107, 53)
WHITE = (255, 255, 255)

src = Path(sys.argv[1])
repo = Path(sys.argv[2])
brand = repo / "packages/brand-assets/app-icon"
mobile = repo / "apps/mobile/assets"

orig = Image.open(src).convert("RGBA")
shutil.copyfile(src, brand / "app-icon-package-search-original.png")
size = orig.size

# The white glyph: blue is ~20 on the orange and ~240 on the glyph - a soft mask keeps smooth edges.
_, _, blue, tile_alpha = orig.split()
glyph_mask = blue.point(lambda v: max(0, min(255, round((v - 40) * 255 / 190))))
glyph = Image.new("RGBA", size, WHITE + (0,))
glyph.putalpha(glyph_mask)

# Full-bleed square: flat orange + glyph.
square = Image.new("RGBA", size, REIN_ORANGE + (255,))
square = Image.alpha_composite(square, glyph).convert("RGB")
square_1024 = square.resize((1024, 1024), Image.LANCZOS)
square_1024.save(brand / "app-icon-package-search-square.png", optimize=True)
square_1024.save(mobile / "icon.png", optimize=True)

# Rounded tile (the original's own corner shape), flat orange + glyph.
rounded = Image.new("RGBA", size, REIN_ORANGE + (0,))
rounded.putalpha(tile_alpha)
rounded = Image.alpha_composite(rounded, glyph)
rounded.save(brand / "app-icon-package-search.png", optimize=True)
rounded.resize((48, 48), Image.LANCZOS).save(mobile / "favicon.png", optimize=True)

# Android adaptive icon: flat orange background + the glyph alone as the foreground, at the same
# relative position (it spans ~19-82% of the tile, inside the 66% safe zone of a 108dp layer).
Image.new("RGB", (512, 512), REIN_ORANGE).save(mobile / "android-icon-background.png", optimize=True)
glyph.resize((512, 512), Image.LANCZOS).save(mobile / "android-icon-foreground.png", optimize=True)
# Monochrome (Android 13 themed icons): the same glyph; the system tints it.
glyph.resize((432, 432), Image.LANCZOS).save(mobile / "android-icon-monochrome.png", optimize=True)
print("done")
