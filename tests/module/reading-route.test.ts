import { beforeEach, expect, test, vi } from "vitest";
const { heartbeat, session } = vi.hoisted(() => ({
  heartbeat: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/app/session", () => ({ getCurrentSession: session }));
vi.mock("@/db/database", () => ({ getDatabase: () => ({}) }));
vi.mock("@/modules/learning-stats/tracking", () => ({
  createReadingTrackingService: () => ({ heartbeat }),
}));
import { POST } from "@/app/api/stats/reading/route";
const articleId = "00000000-0000-4000-8000-000000000001",
  tabId = "00000000-0000-4000-8000-000000000002";
const payload = { articleId, tabId, sequence: 1, active: true };
function request(body: unknown = payload, origin = "https://portal.example") {
  return new Request("https://portal.example/api/stats/reading", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({
    member: { id: "authenticated-user" },
    mustChangePassword: false,
  });
  heartbeat.mockResolvedValue({ accepted: true });
});
test("authenticates actor from session and validates same-origin requests", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(heartbeat).toHaveBeenCalledWith({
    ...payload,
    userId: "authenticated-user",
  });
  expect((await POST(request(payload, "https://foreign.example"))).status).toBe(
    403,
  );
  session.mockResolvedValue(null);
  expect((await POST(request())).status).toBe(401);
  session.mockResolvedValue({ member: { id: "x" }, mustChangePassword: true });
  expect((await POST(request())).status).toBe(401);
});
test("rejects client user identity, seconds, malformed ids and sequences", async () => {
  for (const value of [
    { ...payload, userId: "injected" },
    { ...payload, seconds: 999 },
    { ...payload, articleId: "bad" },
    { ...payload, sequence: 0 },
    { ...payload, sequence: 1.5 },
    { ...payload, active: "true" },
  ])
    expect((await POST(request(value))).status).toBe(400);
  expect(heartbeat).not.toHaveBeenCalled();
});
test("accepts the external Host behind standalone reverse proxy without accepting foreign origins", async () => {
  const proxied = (origin: string) =>
    new Request("http://0.0.0.0:3000/api/stats/reading", {
      method: "POST",
      headers: {
        Origin: origin,
        Host: "quality-server:8080",
        "X-Forwarded-Proto": "http",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  expect((await POST(proxied("http://quality-server:8080"))).status).toBe(200);
  expect((await POST(proxied("http://foreign.example"))).status).toBe(403);
  expect((await POST(proxied("https://quality-server:8080"))).status).toBe(403);
});
