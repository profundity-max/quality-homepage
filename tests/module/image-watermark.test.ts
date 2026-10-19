import sharp from "sharp";
import { expect, test } from "vitest";
import { watermarkImageBytes } from "@/modules/content-protection/image-watermark";

const label = "天脉品集 Q-Nexus · 内部资料 · Lou（Lou）· 2026-10-19";
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
