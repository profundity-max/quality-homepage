import sharp from "sharp";
import { watermarkSvg } from "./index";

/** Compose into delivered pixels; stored originals and authorized exports stay untouched. */
export async function watermarkImageBytes(buffer: Buffer, label: string) {
  const image = sharp(buffer, { animated: true, limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  const swapped = (metadata.orientation ?? 1) >= 5;
  const sourceWidth = metadata.width ?? 320;
  const sourceHeight = metadata.pageHeight ?? metadata.height ?? 180;
  const width = Math.min(320, swapped ? sourceHeight : sourceWidth);
  const height = Math.min(180, swapped ? sourceWidth : sourceHeight);
  const overlay = await sharp(Buffer.from(watermarkSvg(label, "light", 0.4)))
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();
  return image
    .autoOrient()
    .composite([{ input: overlay, tile: true }])
    .toBuffer();
}
