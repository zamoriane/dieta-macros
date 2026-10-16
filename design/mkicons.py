# Gera todos os ícones a partir de design/logo-original.png: python3 design/mkicons.py design/logo-original.png .
import sys, numpy as np
from PIL import Image, ImageDraw
SRC, OUT = sys.argv[1], sys.argv[2]
TEAL = (1, 97, 98)
im = np.array(Image.open(SRC).convert("RGB")).astype(float)
h, w, _ = im.shape
# alfa do símbolo branco sobre o verde (canal R: 1 no verde, 255 no branco)
alpha = np.clip((im[:, :, 0] - TEAL[0]) / (255 - TEAL[0]), 0, 1)
cy, cx = 627, 627
yy, xx = np.mgrid[0:h, 0:w]
alpha[(yy - cy) ** 2 + (xx - cx) ** 2 > 420 ** 2] = 0   # fora do quadrado arredondado
ys, xs = np.where(alpha > 0.05)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
print("símbolo", x0, x1, y0, y1)
side = max(x1 - x0, y1 - y0) + 1
mx, my = (x0 + x1) // 2, (y0 + y1) // 2
box = (mx - side // 2, my - side // 2, mx - side // 2 + side, my - side // 2 + side)
a = Image.fromarray((alpha * 255).astype("uint8")).crop(box)
glyph = Image.merge("RGBA", (Image.new("L", a.size, 255),) * 3 + (a,))
SQ = 1006  # lado do quadrado original
FRAC = side / SQ  # proporção original do símbolo (~0.71)
print("proporção", round(FRAC, 3))

def place(size, frac, bg):
    c = Image.new("RGBA", (size, size), bg)
    g = glyph.resize((round(size * frac),) * 2, Image.LANCZOS)
    c.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    return c

def rounded(size, frac=FRAC, radius=0.225):
    big = size * 4
    c = place(big, frac, TEAL + (255,))
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius), fill=255)
    c.putalpha(m)
    return c.resize((size, size), Image.LANCZOS)

pub, mob = OUT + "/public/", OUT + "/mobile/assets/"
rounded(512).save(pub + "icon-512.png")
rounded(192).save(pub + "icon-192.png")
rounded(48).save(pub + "icon-48.png")
place(512, 0.60, TEAL + (255,)).save(pub + "icon-maskable-512.png")
place(180, FRAC, TEAL + (255,)).convert("RGB").save(pub + "apple-touch-icon.png")
# App iOS: 1024 sem transparência (exigido pela App Store); a Apple arredonda os cantos
place(1024, FRAC, TEAL + (255,)).convert("RGB").save(mob + "icon-only.png")
place(1024, 0.50, (0, 0, 0, 0)).save(mob + "icon-foreground.png")   # Android adaptativo
Image.new("RGB", (1024, 1024), TEAL).save(mob + "icon-background.png")
for name, bg in (("splash.png", (245, 247, 250)), ("splash-dark.png", (11, 18, 32))):
    s = Image.new("RGBA", (2732, 2732), bg + (255,))
    ic = rounded(560)
    s.alpha_composite(ic, ((2732 - 560) // 2, (2732 - 560) // 2))
    s.convert("RGB").save(mob + name)
print("ok")
