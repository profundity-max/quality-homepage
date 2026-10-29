import sharp from "sharp";
import { watermarkText } from "./index";

/** Embed a faint underprint: dark ink stays in front of the watermark. Originals stay untouched. */
export async function watermarkImageBytes(buffer: Buffer, label: string) {
  // Existing slide exports are 8640×4860 (42 MP). Keep a finite decode bound
  // while allowing those original uploads to retain their resolution.
  const image = sharp(buffer, { animated: true, limitInputPixels: 64_000_000 });
  const metadata = await image.metadata();
  const swapped = (metadata.orientation ?? 1) >= 5;
  const sourceWidth = metadata.width ?? 320;
  const sourceHeight = metadata.pageHeight ?? metadata.height ?? 180;
  const width = Math.min(320, swapped ? sourceHeight : sourceWidth);
  const height = Math.min(180, swapped ? sourceWidth : sourceHeight);
  // Next's image optimizer blocks all foreign loaders except supported rasters
  // process-wide. Text rendering keeps SVG blocked while retaining identity pixels.
  const text = await sharp({
    text: {
      text: watermarkText(label),
      font: "sans-serif 12",
      width: 290,
      height: 42,
      align: "centre",
      rgba: true,
      spacing: 4,
      wrap: "word-char",
    },
  })
    .png()
    .toBuffer();
  const tile = await sharp(text)
    .rotate(-22, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(320, 180, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const overlay = await sharp(tile)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return image
    .autoOrient()
    .composite([{ input: overlay, tile: true, blend: "darken" }])
    .toBuffer();
}
