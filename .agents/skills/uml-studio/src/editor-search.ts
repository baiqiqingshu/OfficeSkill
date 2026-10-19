// Search values rather than JSON property names; keep ancestors as context.
export function matchesContent(value: unknown, query: string, labels: Record<string, string> = {}): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  function content(item: unknown): string {
    if (Array.isArray(item)) return item.map(content).join(" ");
    if (item && typeof item === "object") return Object.values(item).map(content).join(" ");
    return item == null ? "" : `${item} ${labels[String(item)] ?? ""}`;
  }
  return content(value).toLocaleLowerCase().includes(needle);
}
