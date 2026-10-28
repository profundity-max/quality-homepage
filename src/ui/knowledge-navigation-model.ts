import type { SectionNode } from "@/modules/knowledge-publishing";

export type KnowledgeContext = {
  root: SectionNode;
  destinationPath: "/quality" | "/thermal";
  topicStableId: string;
};

export function resolveKnowledgeContext(
  tree: SectionNode[],
  topicStableId: string,
): KnowledgeContext | null {
  function contains(section: SectionNode): boolean {
    return (
      section.topics.some((topic) => topic.stableId === topicStableId) ||
      section.children.some(contains)
    );
  }
  for (const root of tree) {
    const destinationPath =
      root.stableId === "quality-knowledge"
        ? "/quality"
        : root.stableId === "thermal-knowledge"
          ? "/thermal"
          : null;
    if (destinationPath && contains(root))
      return { root, destinationPath, topicStableId };
  }
  return null;
}
