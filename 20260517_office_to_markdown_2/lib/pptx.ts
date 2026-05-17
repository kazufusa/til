import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { imagePlaceholder, mimeFromExt } from "./common";
import type { Conversion, Image } from "./types";

// pptx → markdown. Walks ppt/slides/slideN.xml directly. Each slide becomes a
// `## Slide N` section. Inside, the shape tree (p:spTree) is traversed in
// document order to interleave text, tables, and image placeholders.
export async function convertPptx(inputPath: string): Promise<Conversion> {
  const bytes = await Bun.file(inputPath).arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);

  const slideOrder = await slideOrderFromPresentation(zip);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    trimValues: false,
    // Critical: keep <a:t> values as strings. parseTagValue=true (default)
    // would coerce "2011.10" into a number → truncates trailing zero → data
    // loss.
    parseTagValue: false,
  });

  const images: Image[] = [];
  const seenFiles = new Set<string>();

  const sections: string[] = [];
  for (let i = 0; i < slideOrder.length; i++) {
    const slidePath = slideOrder[i]!;
    const slideXml = await zip.file(slidePath)?.async("text");
    if (!slideXml) continue;

    const relsPath = slidePath.replace(
      /ppt\/slides\/(slide\d+)\.xml$/,
      "ppt/slides/_rels/$1.xml.rels",
    );
    const relsXml = (await zip.file(relsPath)?.async("text")) ?? "";
    const rIdToImg = parseImageRels(relsXml);

    const tree = parser.parse(slideXml);
    const spTree = findFirst(tree, "p:sld", "p:cSld", "p:spTree");
    const body: string[] = [];
    let title: string | null = null;
    if (spTree) {
      title = extractTitle(spTree);
      walkShapes(spTree, rIdToImg, body, /*skipTitle=*/ title !== null);
    }

    // Only write image files that the emitted body actually references —
    // skipping group-internal pics and other unused entries in the rels list.
    // Otherwise the .media/ dir collects orphans the LLM pipeline has no
    // placeholder for.
    const referenced = collectReferencedFilenames(body);
    for (const path of new Set(rIdToImg.values())) {
      if (!path.startsWith("ppt/media/")) continue;
      const filename = path.slice("ppt/media/".length);
      if (!referenced.has(filename)) continue;
      if (seenFiles.has(filename)) continue;
      seenFiles.add(filename);
      const buf = await zip.file(path)?.async("uint8array");
      if (!buf) continue;
      images.push({
        filename,
        mimeType: mimeFromExt("." + (filename.split(".").pop() ?? "bin")),
        base64: Buffer.from(buf).toString("base64"),
      });
    }

    // If the slide has an explicit title placeholder, use its text as the
    // section heading — that preserves the "this is the title of the slide"
    // semantic. Otherwise fall back to a generic `## Slide N`.
    sections.push(title ? `## ${title}` : `## Slide ${i + 1}`);
    sections.push(body.join("\n\n"));
  }

  return {
    markdown: sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n",
    images,
  };
}

// ---------- presentation order ----------

async function slideOrderFromPresentation(zip: JSZip): Promise<string[]> {
  const rels = await zip.file("ppt/_rels/presentation.xml.rels")?.async("text");
  const pres = await zip.file("ppt/presentation.xml")?.async("text");
  if (!rels || !pres) {
    // fallback: numeric order of slide files
    return Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => slideNum(a) - slideNum(b));
  }

  const rIdToPath = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]+)\/?>/g)) {
    const attrs = m[1]!;
    const id = attrs.match(/\bId="(rId\d+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1];
    if (!id || !target || !type) continue;
    if (!/\/slide$/.test(type)) continue;
    rIdToPath.set(id, normalizeSlidePath(target));
  }
  // Reverse — the order in rels may not match presentation.xml.
  const order: string[] = [];
  for (const m of pres.matchAll(/<p:sldId\b[^>]*r:id="(rId\d+)"/g)) {
    const path = rIdToPath.get(m[1]!);
    if (path) order.push(normalizeSlidePath(path));
  }
  return order;
}

function normalizeSlidePath(p: string): string {
  if (p.startsWith("ppt/")) return p;
  if (p.startsWith("slides/")) return `ppt/${p}`;
  return `ppt/slides/${p.split("/").pop()}`;
}

function slideNum(path: string): number {
  return parseInt(path.match(/slide(\d+)\.xml$/)?.[1] ?? "0", 10);
}

// ---------- rels ----------

function collectReferencedFilenames(blocks: string[]): Set<string> {
  const out = new Set<string>();
  const re = /\*\*\[画像\]\*\* \(画像: ([^)]+)\)/g;
  for (const b of blocks) {
    for (const m of b.matchAll(re)) out.add(m[1]!);
  }
  return out;
}

function parseImageRels(relsXml: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of relsXml.matchAll(
    /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g,
  )) {
    if (!/image|media/i.test(m[0])) continue;
    map.set(m[1]!, m[2]!.replace(/^\.\.\//, "ppt/"));
  }
  return map;
}

// ---------- shape walking ----------

// fast-xml-parser preserveOrder shape: array of single-key objects.
// e.g. [{"p:sp": [...]}, {"p:graphicFrame": [...]}, {"p:pic": [...]}]
type PreservedNode = Record<string, PreservedNode[] | string> & {
  ":@"?: Record<string, string>;
  "#text"?: string;
};

function findFirst(tree: any, ...path: string[]): any {
  let cur = tree;
  for (const key of path) {
    if (!Array.isArray(cur)) return null;
    const m = cur.find((n) => n[key] !== undefined);
    if (!m) return null;
    cur = m[key];
  }
  return cur;
}

function walkShapes(
  spTree: PreservedNode[],
  rIdToImg: Map<string, string>,
  out: string[],
  skipTitle = false,
  insideGroup = false,
): void {
  for (const node of spTree) {
    if (node["p:sp"]) {
      const sp = node["p:sp"] as PreservedNode[];
      if (skipTitle && !insideGroup && isTitleShape(sp)) continue;
      const text = extractTextFromSp(sp);
      if (text) out.push(text);
    } else if (node["p:graphicFrame"]) {
      const md = renderGraphicFrame(node["p:graphicFrame"] as PreservedNode[]);
      if (md) out.push(md);
    } else if (node["p:pic"]) {
      // Skip pictures nested inside a group shape: they're parts of a
      // composite drawing (icons / diagram pieces), not standalone images.
      // The composite as a whole isn't rendered — pandoc behaves the same way.
      if (insideGroup) continue;
      const md = renderPic(node["p:pic"] as PreservedNode[], rIdToImg);
      if (md) out.push(md);
    } else if (node["p:grpSp"]) {
      walkShapes(
        node["p:grpSp"] as PreservedNode[],
        rIdToImg,
        out,
        skipTitle,
        /*insideGroup=*/ true,
      );
    }
  }
}

// Find <p:ph type="title|ctrTitle"> on any <p:sp> in the tree. Returns the
// shape's concatenated text, or null if no title placeholder exists. Walks
// into <p:grpSp> too — group nests aren't common but cheap to handle.
function extractTitle(spTree: PreservedNode[]): string | null {
  for (const node of spTree) {
    if (node["p:sp"]) {
      const sp = node["p:sp"] as PreservedNode[];
      if (isTitleShape(sp)) {
        const text = extractTextFromSp(sp).replace(/\n+/g, " ").trim();
        if (text) return text;
      }
    } else if (node["p:grpSp"]) {
      const t = extractTitle(node["p:grpSp"] as PreservedNode[]);
      if (t) return t;
    }
  }
  return null;
}

function isTitleShape(sp: PreservedNode[]): boolean {
  const nvSpPr = sp.find((n) => n["p:nvSpPr"]);
  if (!nvSpPr) return false;
  const nvPr = (nvSpPr["p:nvSpPr"] as PreservedNode[]).find(
    (n) => n["p:nvPr"],
  );
  if (!nvPr) return false;
  const ph = (nvPr["p:nvPr"] as PreservedNode[]).find((n) => n["p:ph"]);
  if (!ph) return false;
  const attrs = (ph as PreservedNode)[":@"];
  const type = (attrs as Record<string, string> | undefined)?.["@_type"];
  return type === "title" || type === "ctrTitle";
}

// ---------- text shape ----------

function extractTextFromSp(sp: PreservedNode[]): string {
  const txBody = sp.find((n) => n["p:txBody"]);
  if (!txBody) return "";
  return renderTxBody(txBody["p:txBody"] as PreservedNode[]);
}

function renderTxBody(txBody: PreservedNode[]): string {
  // Group consecutive list items (bullet or ordered) into a single tight
  // markdown list so reader-side parsers recognize them as one list.
  // Adjacent list items with blank lines between them get rendered as
  // multiple single-item lists by some parsers — a semantic regression we
  // avoid by tight-joining the run with single newlines.
  const blocks: string[] = [];
  type RunKind = "bullet" | "ordered";
  let runKind: RunKind | null = null;
  let runItems: string[] = [];
  const flush = () => {
    if (runItems.length === 0) return;
    if (runKind === "ordered") {
      blocks.push(runItems.map((t, i) => `${i + 1}. ${t}`).join("\n"));
    } else {
      blocks.push(runItems.map((t) => `- ${t}`).join("\n"));
    }
    runItems = [];
    runKind = null;
  };
  for (const node of txBody) {
    if (!node["a:p"]) continue;
    const r = renderPara(node["a:p"] as PreservedNode[]);
    if (!r) {
      flush();
      continue;
    }
    if (r.kind === "bullet" || r.kind === "ordered") {
      if (runKind && runKind !== r.kind) flush();
      runKind = r.kind;
      runItems.push(r.text);
    } else {
      flush();
      blocks.push(r.text);
    }
  }
  flush();
  return blocks.join("\n\n");
}

type ParaResult = { kind: "plain" | "bullet" | "ordered"; text: string } | null;

function renderPara(p: PreservedNode[]): ParaResult {
  const runs: string[] = [];
  let kind: "plain" | "bullet" | "ordered" = "plain";
  for (const node of p) {
    if (node["a:pPr"]) {
      const ppr = node["a:pPr"] as PreservedNode[];
      // Bullet markers: <a:buChar/> → `- `, <a:buAutoNum/> → `N. `, <a:buNone/>
      // → no marker. Preserve the source list semantic; flattening to plain
      // paragraphs would lose "this is a list" information.
      if (ppr.some((n) => n["a:buChar"] !== undefined)) kind = "bullet";
      else if (ppr.some((n) => n["a:buAutoNum"] !== undefined)) kind = "ordered";
    } else if (node["a:r"]) {
      runs.push(extractRunText(node["a:r"] as PreservedNode[]));
    } else if (node["a:fld"]) {
      runs.push(extractRunText(node["a:fld"] as PreservedNode[]));
    } else if (node["a:br"]) {
      runs.push("\n");
    }
  }
  const text = runs.join("").trim();
  if (text === "") return null;
  return { kind, text };
}

function extractRunText(run: PreservedNode[]): string {
  for (const node of run) {
    if (node["a:t"] !== undefined) {
      const t = node["a:t"];
      if (Array.isArray(t)) {
        const first = t[0];
        return typeof first === "object" && first && "#text" in first
          ? String(first["#text"])
          : "";
      }
      return typeof t === "string" ? t : "";
    }
  }
  return "";
}

// ---------- table ----------

function renderGraphicFrame(gf: PreservedNode[]): string {
  // graphic → graphicData → tbl
  const graphic = gf.find((n) => n["a:graphic"]);
  if (!graphic) return "";
  const gData = (graphic["a:graphic"] as PreservedNode[]).find(
    (n) => n["a:graphicData"],
  );
  if (!gData) return "";
  const tbl = (gData["a:graphicData"] as PreservedNode[]).find(
    (n) => n["a:tbl"],
  );
  if (!tbl) return "";
  return renderTable(tbl["a:tbl"] as PreservedNode[]);
}

function renderTable(tbl: PreservedNode[]): string {
  const rows: string[][] = [];
  for (const node of tbl) {
    if (!node["a:tr"]) continue;
    const tr = node["a:tr"] as PreservedNode[];
    const cells: string[] = [];
    for (const cellNode of tr) {
      if (!cellNode["a:tc"]) continue;
      const tc = cellNode["a:tc"] as PreservedNode[];
      const txBodyNode = tc.find((n) => n["a:txBody"]);
      const text = txBodyNode
        ? renderTxBody(txBodyNode["a:txBody"] as PreservedNode[])
            .replace(/\n+/g, " ")
            .trim()
        : "";
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";
  return renderGfmTable(rows);
}

function renderGfmTable(rows: string[][]): string {
  const cols = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) =>
    "| " +
    Array.from({ length: cols }, (_, i) => r[i] ?? "").join(" | ") +
    " |";
  const sep = "| " + Array.from({ length: cols }, () => "---").join(" | ") + " |";
  return [pad(rows[0]!), sep, ...rows.slice(1).map(pad)].join("\n");
}

// ---------- picture ----------

function renderPic(pic: PreservedNode[], rIdToImg: Map<string, string>): string {
  const blipFill = pic.find((n) => n["p:blipFill"]);
  if (!blipFill) return "";
  const blip = (blipFill["p:blipFill"] as PreservedNode[]).find(
    (n) => n["a:blip"],
  );
  if (!blip) return "";
  const attrs = (blip as PreservedNode)[":@"] ?? {};
  const blipChildren = blip["a:blip"];
  const rId =
    (Array.isArray(blipChildren) && (blipChildren as any)[":@"]?.["@_r:embed"]) ||
    (typeof blipChildren === "object" && blipChildren && (blipChildren as any)[":@"]?.["@_r:embed"]) ||
    attrs["@_r:embed"];
  if (!rId) {
    // fall through; some files put the attrs differently
    const direct = findBlipEmbed(blip);
    if (!direct) return "";
    return imagePlaceholder(filenameFor(rIdToImg, direct), "block");
  }
  const path = rIdToImg.get(rId);
  if (!path) return "";
  return imagePlaceholder(filenameFor(rIdToImg, rId), "block");
}

function filenameFor(rIdToImg: Map<string, string>, rId: string): string {
  const path = rIdToImg.get(rId) ?? "image.bin";
  return path.split("/").pop()!;
}

function findBlipEmbed(blipNode: PreservedNode): string | null {
  // fast-xml-parser with preserveOrder stores attrs in ":@" on the PARENT
  // wrapper. blipNode is `{ "a:blip": [...children...], ":@": { "@_r:embed": "rId3" }}`.
  const attrs = blipNode[":@"];
  if (attrs && typeof attrs === "object") {
    const v = (attrs as Record<string, string>)["@_r:embed"];
    if (v) return v;
  }
  return null;
}
