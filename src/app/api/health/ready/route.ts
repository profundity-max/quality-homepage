import { getDatabase } from "@/db/database";
import { databaseIsReady } from "@/db/readiness";

export async function GET() {
  try {
    if (await databaseIsReady(getDatabase())) {
      return Response.json({ status: "ready" });
    }
  } catch {
    // A readiness response intentionally exposes no database details.
  }
  return Response.json({ status: "unavailable" }, { status: 503 });
}
