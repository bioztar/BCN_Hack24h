/**
 * Document intake. Everything happens on the in-memory Buffer: no temp files, nothing logged.
 */
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import type { Intake } from "../types.js";
import { IntakeError } from "./errors.js";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;
export const DOCUMENT_TYPES = [".pdf", ".docx", ".md", ".txt"] as const;

export function extensionOf(name: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(name);
  return m ? m[0].toLowerCase() : "";
}

export async function extractText(name: string, data: Buffer): Promise<string> {
  const ext = extensionOf(name);
  if (ext === ".md" || ext === ".txt") return data.toString("utf8");
  if (ext === ".pdf") {
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new IntakeError("file is not a valid PDF");
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      return (await parser.getText()).text;
    } catch {
      throw new IntakeError("could not read text from the PDF");
    } finally {
      await parser.destroy();
    }
  }
  if (ext === ".docx") {
    if (data.subarray(0, 2).toString("latin1") !== "PK") throw new IntakeError("file is not a valid .docx");
    try {
      return (await mammoth.extractRawText({ buffer: data })).value;
    } catch {
      throw new IntakeError("could not read text from the .docx");
    }
  }
  throw new IntakeError(`unsupported file type — use ${DOCUMENT_TYPES.join(", ")}`, 415);
}

export function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function documentIntake(name: string, data: Buffer): Promise<Intake> {
  if (!data.length) throw new IntakeError("the uploaded file is empty");
  if (data.length > MAX_DOCUMENT_BYTES) throw new IntakeError("file is larger than 10 MB", 413);
  const full = normalise(await extractText(name, data));
  if (full.length < 40) throw new IntakeError("the document has too little extractable text to analyse");
  const warnings = full.length > MAX_TEXT_CHARS ? [`Document truncated to the first ${MAX_TEXT_CHARS.toLocaleString("en")} characters for analysis.`] : [];
  const safeName = name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return {
    kind: "document",
    title: safeName,
    text: full.slice(0, MAX_TEXT_CHARS),
    facts: [`Design document "${safeName}" (${extensionOf(name).slice(1).toUpperCase()}, ${data.length.toLocaleString("en")} bytes, ${full.length.toLocaleString("en")} characters of text).`],
    warnings,
    sensitiveFiles: [],
    files: [],
    source: { filename: safeName, bytes: data.length },
  };
}

export function ideaIntake(text: string): Intake {
  const t = normalise(text ?? "");
  if (t.length < 20) throw new IntakeError("describe the idea in at least a sentence (20+ characters)");
  if (t.length > 20_000) throw new IntakeError("idea text is longer than 20,000 characters — upload it as a document instead");
  const firstLine = t.split("\n")[0]!.slice(0, 80);
  return { kind: "idea", title: firstLine, text: t, facts: [`Product idea (${t.length.toLocaleString("en")} characters).`], warnings: [], sensitiveFiles: [], files: [] };
}
