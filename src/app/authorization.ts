import { redirect } from "next/navigation";

import { loginPath, passwordChangePath } from "./return-path";
import { getCurrentSession } from "./session";

export async function requirePortalSession(requestedPath: string) {
  const session = await getCurrentSession();
  if (!session) redirect(loginPath(requestedPath));
  if (session.mustChangePassword) redirect(passwordChangePath(requestedPath));
  return session;
}
