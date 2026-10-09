import { h } from "../dom";

/** QR code as an <img>; renders a plain link label until (or if never) the encoder loads. */
export function qrBox(url: string, caption: string, size = 180, dark = "#003399"): HTMLElement {
  const box = h("div", { class: "qr" }, h("span", null, "QR"), h("small", null, caption));
  import("qrcode")
    .then((q) => q.toDataURL(url, { margin: 1, width: size, color: { dark, light: "#ffffff" } }))
    .then((src) => box.replaceChildren(h("img", { src, alt: `QR code: ${url}` }), h("small", null, caption)))
    .catch(() => undefined);
  return box;
}
