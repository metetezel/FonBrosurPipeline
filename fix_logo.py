# -*- coding: utf-8 -*-
import fitz

src = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/JET.pdf"
doc = fitz.open(src)

info = doc.extract_image(24)
print("keys:", list(info.keys()))
print("smask:", info.get("smask"))
print("colorspace:", info.get("colorspace"), info.get("cs-name"))

pix = fitz.Pixmap(doc, 24)
print("pixmap alpha:", pix.alpha, "n:", pix.n, "size:", pix.width, pix.height)
pix.save("assets/logo_test_pixmap.png")
