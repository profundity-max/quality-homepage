import { expect, test } from "vitest";
import type { SectionNode } from "@/modules/knowledge-publishing";
import { resolveKnowledgeContext } from "@/ui/knowledge-navigation-model";

function section(
  stableId: string,
  children: SectionNode[] = [],
  topicIds: string[] = [],
): SectionNode {
  return {
    id: stableId,
    stableId,
    name: stableId,
    parentId: null,
    children,
    topics: topicIds.map((id) => ({ id, stableId: id, name: id })),
  };
}

const tree = [
  section("quality-knowledge", [
    section("statistics", [section("advanced", [], ["anova"])], ["sigma"]),
  ]),
  section("thermal-knowledge", [section("thermal-basics", [], ["heat-flow"])]),
];

test("nested quality topic resolves to its root and preserves source order", () => {
  const before = JSON.stringify(tree);
  expect(resolveKnowledgeContext(tree, "anova")).toEqual({
    root: tree[0],
    destinationPath: "/quality",
    topicStableId: "anova",
  });
  expect(JSON.stringify(tree)).toBe(before);
});

test("thermal topic uses its own entry even if names are renamed", () => {
  expect(resolveKnowledgeContext(tree, "heat-flow")).toEqual({
    root: tree[1],
    destinationPath: "/thermal",
    topicStableId: "heat-flow",
  });
});

test("missing or unsupported root cannot create a guessed topic link", () => {
  expect(resolveKnowledgeContext(tree, "private-draft")).toBeNull();
  expect(
    resolveKnowledgeContext([section("other-root", [], ["other"])], "other"),
  ).toBeNull();
});
