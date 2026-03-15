import AdmZip from "adm-zip";
import * as path from "path";
import { EpubPage, EpisodeWithPages } from "./types";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

function isImageFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function getMimeType(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * epubバッファを展開し、spine順に並んだ画像ページ一覧を返す。
 * spine（content.opf）が読めない場合はファイル名のソート順にフォールバックする。
 */
export function extractPages(epubBuffer: Buffer): EpubPage[] {
  const zip = new AdmZip(epubBuffer);
  const entries = zip.getEntries();

  // content.opf を探してspine順序を取得する
  const pageOrder = getSpineOrder(zip);

  // 画像エントリのみ抽出
  const imageEntries = entries.filter((e) => !e.isDirectory && isImageFile(e.entryName));

  // spine順またはファイル名順でソート
  if (pageOrder.length > 0) {
    imageEntries.sort((a, b) => {
      const idxA = pageOrder.findIndex((p) => a.entryName.includes(p));
      const idxB = pageOrder.findIndex((p) => b.entryName.includes(p));
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  } else {
    imageEntries.sort((a, b) => a.entryName.localeCompare(b.entryName));
  }

  return imageEntries.map((entry, index) => ({
    index,
    entryName: entry.entryName,
    base64: entry.getData().toString("base64"),
    mimeType: getMimeType(entry.entryName),
  }));
}

/**
 * content.opf の spine からページ順序を取得する
 */
function getSpineOrder(zip: AdmZip): string[] {
  const opfEntry = zip.getEntries().find((e) => e.entryName.endsWith(".opf"));
  if (!opfEntry) return [];

  const opfContent = opfEntry.getData().toString("utf-8");

  // manifest: id -> href のマッピング
  const manifestItems = new Map<string, string>();
  const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/?\s*>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(opfContent)) !== null) {
    manifestItems.set(match[1], match[2]);
  }

  // spine: itemref の idref 順に href を取得
  const spineRefs: string[] = [];
  const itemrefRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?\s*>/g;
  while ((match = itemrefRegex.exec(opfContent)) !== null) {
    const href = manifestItems.get(match[1]);
    if (href) spineRefs.push(href);
  }

  return spineRefs;
}

/**
 * 指定されたエピソードのページ範囲で新しいepubファイルを生成する
 */
export function buildEpisodeEpub(
  pages: EpubPage[],
  episode: EpisodeWithPages
): Buffer {
  const zip = new AdmZip();

  // mimetype (非圧縮で最初に追加)
  zip.addFile("mimetype", Buffer.from("application/epub+zip"));

  // META-INF/container.xml
  zip.addFile(
    "META-INF/container.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
  );

  // エピソードに該当するページを抽出
  const episodePages = pages.filter(
    (p) => p.index >= episode.startPage && p.index <= episode.endPage
  );

  // 画像ファイルとXHTMLラッパーを追加
  for (const page of episodePages) {
    const imgFileName = `page_${String(page.index).padStart(4, "0")}${path.extname(page.entryName)}`;
    zip.addFile(`OEBPS/images/${imgFileName}`, Buffer.from(page.base64, "base64"));

    const xhtmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Page ${page.index}</title></head>
<body style="margin:0;padding:0;text-align:center;">
  <img src="images/${imgFileName}" style="max-width:100%;max-height:100vh;" alt="page"/>
</body>
</html>`;
    zip.addFile(`OEBPS/page_${String(page.index).padStart(4, "0")}.xhtml`, Buffer.from(xhtmlContent));
  }

  // content.opf を生成
  const manifestItems = episodePages
    .map((p) => {
      const imgFileName = `page_${String(p.index).padStart(4, "0")}${path.extname(p.entryName)}`;
      const pageId = `page_${p.index}`;
      const imgId = `img_${p.index}`;
      return [
        `    <item id="${pageId}" href="page_${String(p.index).padStart(4, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
        `    <item id="${imgId}" href="images/${imgFileName}" media-type="${p.mimeType}"/>`,
      ].join("\n");
    })
    .join("\n");

  const spineItems = episodePages
    .map((p) => `    <itemref idref="page_${p.index}"/>`)
    .join("\n");

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${episode.title}</dc:title>
    <dc:language>ja</dc:language>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`;

  zip.addFile("OEBPS/content.opf", Buffer.from(contentOpf));

  return zip.toBuffer();
}
