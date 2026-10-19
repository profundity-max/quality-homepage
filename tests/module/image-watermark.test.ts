import sharp from "sharp";
import { expect, test } from "vitest";
import { watermarkImageBytes } from "@/modules/content-protection/image-watermark";

const label = "天脉品集 Q-Nexus · 内部资料 · Lou（Lou）· 2026-10-19";

test("images above 64 megapixels still respect the processing bound", async () => {
  const oversized = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8001" height="8000"><rect width="100%" height="100%" fill="white"/></svg>',
  );
  await expect(watermarkImageBytes(oversized, label)).rejects.toThrow(
    /pixel limit/,
  );
});
for (const format of ["png", "jpeg", "webp", "gif"] as const) {
  test(`saved ${format} has changed pixels, preserves dimensions and original bytes`, async () => {
    const original = await sharp({
      create: { width: 640, height: 360, channels: 4, background: "white" },
    })
      .toFormat(format)
      .toBuffer();
    const before = Buffer.from(original);
    const delivered = await watermarkImageBytes(original, label);
    const info = await sharp(delivered).metadata();
    expect(info).toMatchObject({ width: 640, height: 360, format });
    expect(await sharp(delivered).removeAlpha().raw().toBuffer()).not.toEqual(
      await sharp(original).removeAlpha().raw().toBuffer(),
    );
    expect(original.equals(before)).toBe(true);
  });
}
test("tiny images and hostile account text remain valid images", async () => {
  const original = await sharp({
    create: { width: 16, height: 8, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  expect(
    await sharp(
      await watermarkImageBytes(original, label + '<script>&\"'),
    ).metadata(),
  ).toMatchObject({ width: 16, height: 8 });
});
test("EXIF orientation is retained visually after embedding watermark", async () => {
  const original = await sharp({
    create: { width: 640, height: 64, channels: 3, background: "white" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  expect(
    await sharp(await watermarkImageBytes(original, label)).metadata(),
  ).toMatchObject({ width: 64, height: 640 });
});

test("watermark behaves as an underprint: dark ink is never washed out and light background carries identity", async () => {
  const original = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="white"/><rect x="320" width="320" height="360" fill="#101010"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const delivered = await watermarkImageBytes(original, label);
  const pixels = await sharp(delivered).removeAlpha().raw().toBuffer();
  let changedBackground = 0;
  let maxInkDifference = 0;
  let lightenedInkPixels = 0;
  for (let y = 0; y < 360; y++)
    for (let x = 0; x < 640; x++) {
      const offset = (y * 640 + x) * 3;
      if (x >= 320) {
        if (
          pixels[offset] > 16 ||
          pixels[offset + 1] > 16 ||
          pixels[offset + 2] > 16
        )
          lightenedInkPixels++;
        for (let channel = 0; channel < 3; channel++)
          maxInkDifference = Math.max(
            maxInkDifference,
            Math.abs(pixels[offset + channel] - 16),
          );
      } else if (pixels[offset] < 255) changedBackground++;
    }
  expect(lightenedInkPixels).toBe(0);
  // libvips alpha rounding may darken a channel by up to three of 255 levels.
  expect(maxInkDifference).toBeLessThanOrEqual(3);
  expect(changedBackground).toBeGreaterThan(100);
});
