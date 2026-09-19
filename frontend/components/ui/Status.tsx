/** Transaction status line; a trailing URL renders as a "View transaction" link. */
export function Status({ text }: { text: string | null }) {
  if (!text) return null;
  const at = text.search(/https?:\/\//);
  if (at < 0) return <p className="status">{text}</p>;
  return (
    <p className="status">
      {text.slice(0, at)}
      <a href={text.slice(at)} target="_blank" rel="noreferrer">
        View transaction <span aria-hidden="true">→</span>
      </a>
    </p>
  );
}
