# -*- coding: utf-8 -*-
import fitz

src = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/JET.pdf"
doc = fitz.open(src)
page = doc[0]

rects = page.get_image_rects(24)
print("logo rects (pdf points):", rects)
rect = rects[0]

# render just that region at high zoom for a crisp, correctly-composited crop
zoom = 12
mat = fitz.Matrix(zoom, zoom)
pix = page.get_pixmap(matrix=mat, clip=rect)
print("cropped pixmap size:", pix.width, pix.height)
pix.save("assets/logo_hires_crop.png")
