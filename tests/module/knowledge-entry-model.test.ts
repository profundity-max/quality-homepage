import { describe, expect, test } from "vitest";

import type { SectionNode } from "@/modules/knowledge-publishing";
import {
  findTopicInSection,
  selectKnowledgeSection,
} from "@/app/knowledge-entry-model";

const tree: SectionNode[] = [
  {
    id: "s1",
    stableId: "quality-knowledge",
    name: "品质知识",
    parentId: null,
    topics: [],
    children: [
      {
        id: "s2",
        stableId: "data-and-statistics",
        name: "数据与统计基础",
        parentId: "s1",
        children: [],
        topics: [
          { id: "t1", stableId: "anova", name: "ANOVA" },
          { id: "t2", stableId: "spc", name: "SPC" },
        ],
      },
      {
        id: "s3",
        stableId: "measurement-and-data-credibility",
        name: "测量与数据可信度",
        parentId: "s1",
        children: [],
        topics: [{ id: "t3", stableId: "msa", name: "MSA" }],
      },
    ],
  },
  {
    id: "s4",
    stableId: "thermal-knowledge",
    name: "散热知识",
    parentId: null,
    topics: [],
    children: [
      {
        id: "s5",
        stableId: "thermal-principles",
        name: "原理知识",
        parentId: "s4",
        children: [],
        topics: [],
      },
    ],
  },
];

describe("knowledge entry model", () => {
  test("selects the requested top-level knowledge section", () => {
    const quality = selectKnowledgeSection(tree, "quality-knowledge");
    expect(quality?.name).toBe("品质知识");
    const thermal = selectKnowledgeSection(tree, "thermal-knowledge");
    expect(thermal?.name).toBe("散热知识");
    expect(selectKnowledgeSection(tree, "missing")).toBeUndefined();
  });

  test("finds a topic by stable id anywhere in the section", () => {
    const quality = selectKnowledgeSection(tree, "quality-knowledge")!;
    const anova = findTopicInSection(quality, "anova");
    expect(anova?.name).toBe("ANOVA");
    const msa = findTopicInSection(quality, "msa");
    expect(msa?.name).toBe("MSA");
    // 失效标识回退到第一个可见主题（IA-03 稳定链接精神）
    expect(findTopicInSection(quality, "unknown")?.stableId).toBe("anova");
  });

  test("keeps the first topic as the default selection", () => {
    const quality = selectKnowledgeSection(tree, "quality-knowledge")!;
    const defaultTopic = findTopicInSection(quality, undefined);
    expect(defaultTopic?.stableId).toBe("anova");
  });

  test("has no default topic when the section is empty", () => {
    const thermal = selectKnowledgeSection(tree, "thermal-knowledge")!;
    expect(findTopicInSection(thermal, undefined)).toBeUndefined();
  });
});
