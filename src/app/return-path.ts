const applicationOrigin = "https://q-nexus.internal";
const publicDestinations = new Set(["/login", "/change-password"]);

export function resolveSafeReturnPath(
  candidate: string | null | undefined,
): string {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(candidate)
  ) {
    return "/";
  }

  try {
    const url = new URL(candidate, applicationOrigin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      url.origin !== applicationOrigin ||
      decodedPath.startsWith("//") ||
      decodedPath.includes("\\") ||
      publicDestinations.has(url.pathname)
    ) {
      return "/";
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function passwordChangePath(candidate: string | null | undefined) {
  return returnPathUrl("/change-password", candidate);
}

export function loginPath(candidate: string | null | undefined) {
  return returnPathUrl("/login", candidate);
}

function returnPathUrl(basePath: string, candidate: string | null | undefined) {
  const returnPath = resolveSafeReturnPath(candidate);
  return returnPath === "/"
    ? basePath
    : `${basePath}?next=${encodeURIComponent(returnPath)}`;
}
