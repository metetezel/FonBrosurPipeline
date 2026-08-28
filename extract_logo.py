import fitz
import os

src = r"\\atafiles\Ata.Portföy\Mete Tezel\Fon Broşür [Cursor & Claude]\JET.pdf"
out_dir = r"C:\Users\metete\FonBrosurPipeline\assets"
os.makedirs(out_dir, exist_ok=True)

doc = fitz.open(src)
page = doc[0]
images = page.get_images(full=True)
print(f"Found {len(images)} images")
for i, img in enumerate(images):
    xref = img[0]
    base = doc.extract_image(xref)
    ext = base["ext"]
    w, h = base.get("width"), base.get("height")
    fname = os.path.join(out_dir, f"img_{i}_{xref}.{ext}")
    with open(fname, "wb") as f:
        f.write(base["image"])
    print(f"  saved {fname} ({w}x{h}, {ext})")

# Also render full page at high res to sample colors precisely
pix = page.get_pixmap(matrix=fitz.Matrix(3, 3))
pix.save(os.path.join(out_dir, "jet_page_hires.png"))
print("saved hi-res page render")
