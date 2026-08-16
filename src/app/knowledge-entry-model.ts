import type { SectionNode, TopicSummary } from "@/modules/knowledge-publishing";

/** 从主题树中选出指定的一级知识栏目（品质知识 / 散热知识）。 */
export function selectKnowledgeSection(
  tree: SectionNode[],
  stableId: string,
): SectionNode | undefined {
  return tree.find((section) => section.stableId === stableId);
}

/** 在栏目中按稳定标识查找主题；未指定或标识已失效时回退到第一个可见主题。 */
export function findTopicInSection(
  section: SectionNode,
  topicStableId: string | undefined,
): TopicSummary | undefined {
  const candidates = collectTopics(section);
  if (topicStableId) {
    return (
      candidates.find((topic) => topic.stableId === topicStableId) ??
      candidates[0]
    );
  }
  return candidates[0];
}

function collectTopics(section: SectionNode): TopicSummary[] {
  const topics = [...section.topics];
  for (const child of section.children) {
    topics.push(...collectTopics(child));
  }
  return topics;
}
