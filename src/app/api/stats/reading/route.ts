import { getDatabase } from "@/db/database";
import { getCurrentSession } from "@/app/session";
import { createReadingTrackingService } from "@/modules/learning-stats/tracking";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Standalone request.url uses the container address. nginx preserves external Host
  // and overwrites X-Forwarded-Proto, so validate that authority instead.
  const internal = new URL(request.url);
  const host = request.headers.get("host") ?? internal.host;
  const protocol =
    request.headers.get("x-forwarded-proto") ?? internal.protocol.slice(0, -1);
  let externalOrigin: string | undefined;
  if (
    (protocol === "http" || protocol === "https") &&
    !/[\s,@/\\]/.test(host)
  ) {
    try {
      externalOrigin = new URL(`${protocol}://${host}`).origin;
    } catch {
      /* reject malformed authority */
    }
  }
  if (
    !origin ||
    origin !== externalOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return Response.json({ error: "Forbidden" }, { status: 403 });
  const session = await getCurrentSession();
  if (!session || session.mustChangePassword)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!value || typeof value !== "object")
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  const body = value as Record<string, unknown>;
  if (
    Object.keys(body).some(
      (key) => !["articleId", "tabId", "sequence", "active"].includes(key),
    ) ||
    typeof body.articleId !== "string" ||
    !uuid.test(body.articleId) ||
    typeof body.tabId !== "string" ||
    !uuid.test(body.tabId) ||
    !Number.isSafeInteger(body.sequence) ||
    Number(body.sequence) < 1 ||
    Number(body.sequence) > 2147483647 ||
    typeof body.active !== "boolean"
  )
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  const result = await createReadingTrackingService(getDatabase()).heartbeat({
    userId: session.member.id,
    articleId: body.articleId,
    tabId: body.tabId,
    sequence: body.sequence as number,
    active: body.active,
  });
  return result
    ? Response.json(result)
    : Response.json({ error: "Unavailable" }, { status: 403 });
}
