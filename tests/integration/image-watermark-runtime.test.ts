import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const exec = promisify(execFile);

test("article watermark survives Next image optimizer loader restrictions without enabling SVG", async () => {
  const script = `
    import sharp from 'sharp';
    import optimizer from 'next/dist/server/image-optimizer.js';
    import { watermarkImageBytes } from './src/modules/content-protection/image-watermark.ts';
    optimizer.getSharp(1);
    const original = await sharp({create:{width:640,height:360,channels:3,background:'white'}}).png().toBuffer();
    const output = await watermarkImageBytes(original, '天脉品集 Q-Nexus · 内部资料 · 测试<&>（member）· 2026-10-29');
    const metadata = await sharp(output).metadata();
    if (metadata.width !== 640 || metadata.height !== 360 || original.equals(output)) throw new Error('Watermark missing or dimensions changed');
    const different = await watermarkImageBytes(original, '天脉品集 Q-Nexus · 内部资料 · 另一成员（other）· 2026-10-29');
    if (output.equals(different)) throw new Error('Identity is not embedded');
    let blocked = false;
    try { await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>')).png().toBuffer(); } catch { blocked = true; }
    if (!blocked) throw new Error('SVG security restriction was removed');
    console.log('protected raster images work; SVG remains blocked');
  `;
  const result = await exec(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: process.cwd(), timeout: 20000 },
  );
  expect(result.stdout).toContain("SVG remains blocked");
});
