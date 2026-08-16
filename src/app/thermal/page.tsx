import { KnowledgeEntryPage } from "../knowledge-entry";

export default async function ThermalKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return (
    <KnowledgeEntryPage
      sectionStableId="thermal-knowledge"
      destinationPath="/thermal"
      topicStableId={topic}
    />
  );
}
