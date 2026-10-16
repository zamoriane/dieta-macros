// Leitor mínimo de ficheiros .xlsx (só valores das células), sem dependências externas.
// Um .xlsx é um ZIP com XML: lê-se o diretório central, descomprime-se cada parte e
// extraem-se as células de cada folha. Corre no servidor (usa node:zlib).
import { inflateRawSync } from "node:zlib";

export type Cell = string | number | boolean | null;
export type Sheet = { name: string; rows: Cell[][] };

const MAX_ENTRY = 50 * 1024 * 1024; // proteção contra ficheiros "bomba"

function readZip(buf: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Fim do diretório central: assinatura 0x06054b50 nos últimos ~64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("O ficheiro não é um Excel (.xlsx) válido.");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Excel corrompido (diretório).");
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (dv.getUint32(local, true) !== 0x04034b50) throw new Error("Excel corrompido (entrada).");
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = buf.subarray(start, start + csize);
    if (usize > MAX_ENTRY) throw new Error("Excel demasiado grande.");
    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, new Uint8Array(inflateRawSync(data, { maxOutputLength: MAX_ENTRY })));
    else throw new Error(`Compressão não suportada (${method}).`);
  }
  return files;
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    return String.fromCodePoint(k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}

/** Texto de um <si> ou <is>: junta os <t>, ignorando a fonética (<rPh>). */
function richText(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export function readXlsx(input: ArrayBuffer | Uint8Array): Sheet[] {
  const files = readZip(input instanceof Uint8Array ? input : new Uint8Array(input));
  const dec = new TextDecoder();
  const text = (path: string) => {
    const f = files.get(path);
    return f ? dec.decode(f) : null;
  };

  const wb = text("xl/workbook.xml");
  if (!wb) throw new Error("O ficheiro não é um Excel (.xlsx) válido.");
  const rels = new Map<string, string>();
  for (const m of (text("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, resolve("xl/workbook.xml", target));
  }

  const shared: string[] = [];
  for (const m of (text("xl/sharedStrings.xml") ?? "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(richText(m[1]));

  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], "name") ?? "";
    const rid = attr(m[0], "r:id");
    const path = rid ? rels.get(rid) : null;
    const xml = path ? text(path) : null;
    if (!xml) continue;
    const rows: Cell[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rn = Number(attr(r[1], "r") ?? rows.length + 1) - 1;
      const row: Cell[] = [];
      for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1], "r");
        const idx = ref ? colIndex(ref) : row.length;
        const type = attr(c[1], "t");
        const inner = c[2] ?? "";
        const v = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        let val: Cell = null;
        if (type === "s") val = v != null ? (shared[Number(v)] ?? null) : null;
        else if (type === "inlineStr") val = richText(inner.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else if (type === "str" || type === "e") val = v != null ? decodeXml(v) : null;
        else if (type === "b") val = v === "1";
        else if (v != null) {
          const num = Number(v);
          val = Number.isFinite(num) ? num : decodeXml(v);
        }
        row[idx] = val;
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
      rows[rn] = row;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}
