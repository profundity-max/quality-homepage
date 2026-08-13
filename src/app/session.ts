import { cookies } from "next/headers";

import { getIdentityModule } from "@/modules/identity";

export async function getCurrentSession() {
  const token = (await cookies()).get("q_nexus_session")?.value;
  return token ? getIdentityModule().resolveSession(token) : null;
}
