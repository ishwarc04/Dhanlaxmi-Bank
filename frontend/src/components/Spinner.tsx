export function Spinner({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="loading-center">
      <div className="spinner" role="status" aria-label={text} />
      <span className="text-sm text-muted">{text}</span>
    </div>
  );
}
