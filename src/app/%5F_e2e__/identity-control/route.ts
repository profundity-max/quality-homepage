import { getIdentityModule } from "@/modules/identity";

import { getCurrentSession } from "../../session";

export async function POST(request: Request) {
  if (
    process.env.Q_NEXUS_E2E !== "1" ||
    process.env.NODE_ENV === "production" ||
    !process.env.Q_NEXUS_E2E_CONTROL_TOKEN ||
    request.headers.get("x-q-nexus-e2e-control") !==
      process.env.Q_NEXUS_E2E_CONTROL_TOKEN
  ) {
    return new Response(null, { status: 404 });
  }

  const session = await getCurrentSession();
  if (!session) return new Response(null, { status: 401 });

  const input: unknown = await request.json();
  const action =
    typeof input === "object" && input && "action" in input
      ? input.action
      : null;
  const identity = getIdentityModule();
  if (action === "revoke-target") {
    const target = await identity.authenticate({
      username: "member",
      password: "member secure password",
    });
    if (target.kind !== "authenticated") {
      return Response.json(
        { error: "E2E target member is unavailable." },
        { status: 409 },
      );
    }
    await identity.revokeAllSessions({
      userId: target.member.id,
      requestingUserId: session.member.id,
    });
  } else if (action === "revoke-current") {
    await identity.revokeSession({
      sessionId: session.sessionId,
      requestingUserId: session.member.id,
    });
  } else if (action === "disable-current") {
    await identity.disableCurrentMemberForEndToEndTest(session.member.id);
  } else {
    return Response.json(
      { error: "Unknown E2E control action." },
      { status: 400 },
    );
  }
  return new Response(null, { status: 204 });
}
