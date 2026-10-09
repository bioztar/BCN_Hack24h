/** Minimal escape-first Markdown → HTML for model prose: headings, lists, paragraphs, **bold**, *em*, `code`. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a: string | undefined, b: string | undefined) => `<strong>${a ?? b}</strong>`)
    .replace(/(^|[^*\w])[*_](?!\s)(.+?)[*_](?!\w)/g, "$1<em>$2</em>");

export function mdToHtml(src: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`);
    para = [];
    list = null;
  };
  for (const line of src.replace(/\r/g, "").split("\n")) {
    const t = line.trim();
    if (!t || /^([-*_])\1{2,}$/.test(t)) {
      flush();
      continue;
    }
    const h = /^#{1,6}\s+(.+)$/.exec(t);
    if (h) {
      flush();
      out.push(`<h4>${inline(h[1]!.replace(/\s*#+$/, ""))}</h4>`);
      continue;
    }
    const li = /^(?:[-*•+]|(\d+)[.)])\s+(.+)$/.exec(t);
    if (li) {
      const tag = li[1] ? "ol" : "ul";
      if (para.length || (list && list.tag !== tag)) flush();
      list ??= { tag, items: [] };
      list.items.push(li[2]!);
      continue;
    }
    if (list) flush();
    para.push(t);
  }
  flush();
  return out.join("");
}
