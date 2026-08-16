import { KnowledgeEntryPage } from "../knowledge-entry";

export default async function QualityKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return (
    <KnowledgeEntryPage
      sectionStableId="quality-knowledge"
      destinationPath="/quality"
      topicStableId={topic}
    />
  );
}
