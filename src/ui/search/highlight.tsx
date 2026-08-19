import { Fragment } from "react";

export function HighlightText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const tokens = query.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;
  const pattern = tokens
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "iu"));
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark className="search-highlight" key={index}>
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
