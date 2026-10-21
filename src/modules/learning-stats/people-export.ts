import type { DatabaseConnection } from "@/db/client";
import { createContentAuditService } from "@/modules/content-audit";
import { createLearningReportService } from "./report";
import { buildPeopleWorkbook } from "./export";
import type { StatsFilter } from "./types";

export async function exportLearningPeople(
  database: DatabaseConnection,
  actorId: string,
  filter: StatsFilter,
) {
  const report = await createLearningReportService(database).getReport(
    actorId,
    filter,
  );
  const workbook = buildPeopleWorkbook(report);
  await createContentAuditService(database).record({
    actorUserId: actorId,
    eventType: "learning-statistics-export",
    targetType: "learning-statistics",
    metadata: {
      from: report.range.from,
      to: report.range.to,
      query: filter.q ?? "",
      sort: filter.sort ?? "activeDays",
      people: report.people.length,
    },
  });
  return workbook;
}
