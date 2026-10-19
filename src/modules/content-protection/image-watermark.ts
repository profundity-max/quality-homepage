import sharp from "sharp";
import { watermarkSvg } from "./index";

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
  const overlay = await sharp(Buffer.from(watermarkSvg(label, "light", 0.18)))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return image
    .autoOrient()
    .composite([{ input: overlay, tile: true, blend: "darken" }])
    .toBuffer();
}
