import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatShortDate,
} from "@/modules/shared/date-format";

describe("display date formatting", () => {
  // 容器时区是 UTC，页面必须显式按 Asia/Shanghai 渲染，否则时间会少 8 小时
  test("renders timestamps in Asia/Shanghai regardless of server timezone", () => {
    expect(formatDateTime(new Date("2026-09-24T02:40:34.664Z"))).toBe(
      "2026年9月24日 10:40",
    );
    expect(formatDate(new Date("2026-09-24T02:40:34.664Z"))).toBe(
      "2026年9月24日",
    );
    expect(formatShortDate(new Date("2026-09-24T02:40:34.664Z"))).toBe(
      "9月24日",
    );
  });

  test("crosses the day boundary the way a Shanghai reader expects", () => {
    // UTC 9/23 16:30 = 上海 9/24 00:30
    expect(formatDate(new Date("2026-09-23T16:30:00.000Z"))).toBe(
      "2026年9月24日",
    );
    expect(formatDateTime(new Date("2026-09-23T15:59:00.000Z"))).toBe(
      "2026年9月23日 23:59",
    );
  });

  test("falls back to the placeholder for empty values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatShortDate(null)).toBe("—");
  });
});

describe("display timezone guard", () => {
  test("no source file formats dates without an explicit time zone", () => {
    const offenders: string[] = [];

    function walk(directory: string) {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry)) continue;
        const source = readFileSync(path, "utf8");
        if (!source.includes("Intl.DateTimeFormat(")) continue;
        // 允许集中封装：唯一可以不带 timeZone 的地方是 shared/date-format.ts
        if (path.endsWith("shared/date-format.ts")) continue;
        const uses =
          source.match(/new Intl\.DateTimeFormat\([\s\S]*?\)/g) ?? [];
        for (const use of uses) {
          if (!use.includes("timeZone"))
            offenders.push(`${path}: ${use.replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }

    walk("src");
    expect(offenders).toEqual([]);
  });
});
