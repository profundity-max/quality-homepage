/** Separate the protected response from images cached publicly by releases before V4.0. */
export function protectedImageUrl(value: string): string {
  if (!/^\/uploads\/[0-9a-f-]{36}\.(png|jpe?g|gif|webp)(?:[?#]|$)/.test(value))
    return value;
  const url = new URL(value, "http://internal.invalid");
  url.searchParams.set("protected", "4.1");
  return `${url.pathname}${url.search}${url.hash}`;
}
