"use server";

import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createSearchService } from "@/modules/search";

import { requirePortalSession } from "../authorization";

export async function submitGapNoteAction(formData: FormData) {
  const session = await requirePortalSession("/search");
  const query = String(formData.get("query") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (query && note) {
    await createSearchService(getDatabase()).addSearchNote({
      userId: session.member.id,
      query,
      note,
    });
  }
  redirect(`/search?q=${encodeURIComponent(query)}`);
}
