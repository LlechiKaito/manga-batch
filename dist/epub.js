"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPages = extractPages;
exports.buildEpisodeEpub = buildEpisodeEpub;
const adm_zip_1 = __importDefault(require("adm-zip"));
const path = __importStar(require("path"));
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
function isImageFile(name) {
    const ext = path.extname(name).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}
function getMimeType(name) {
    const ext = path.extname(name).toLowerCase();
    const map = {
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
function extractPages(epubBuffer) {
    const zip = new adm_zip_1.default(epubBuffer);
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
    }
    else {
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
function getSpineOrder(zip) {
    const opfEntry = zip.getEntries().find((e) => e.entryName.endsWith(".opf"));
    if (!opfEntry)
        return [];
    const opfContent = opfEntry.getData().toString("utf-8");
    // manifest: id -> href のマッピング
    const manifestItems = new Map();
    const itemRegex = /<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"[^>]*\/?\s*>/g;
    let match;
    while ((match = itemRegex.exec(opfContent)) !== null) {
        manifestItems.set(match[1], match[2]);
    }
    // spine: itemref の idref 順に href を取得
    const spineRefs = [];
    const itemrefRegex = /<itemref\s+[^>]*idref="([^"]+)"[^>]*\/?\s*>/g;
    while ((match = itemrefRegex.exec(opfContent)) !== null) {
        const href = manifestItems.get(match[1]);
        if (href)
            spineRefs.push(href);
    }
    return spineRefs;
}
/**
 * 指定されたエピソードのページ範囲で新しいepubファイルを生成する
 */
function buildEpisodeEpub(pages, episode) {
    const zip = new adm_zip_1.default();
    // mimetype (非圧縮で最初に追加)
    zip.addFile("mimetype", Buffer.from("application/epub+zip"));
    // META-INF/container.xml
    zip.addFile("META-INF/container.xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`));
    // エピソードに該当するページを抽出
    const episodePages = pages.filter((p) => p.index >= episode.startPage && p.index <= episode.endPage);
    // 画像ファイルを追加
    for (const page of episodePages) {
        const fileName = `page_${String(page.index).padStart(4, "0")}${path.extname(page.entryName)}`;
        zip.addFile(`OEBPS/images/${fileName}`, Buffer.from(page.base64, "base64"));
    }
    // content.opf を生成
    const manifestItems = episodePages
        .map((p) => {
        const fileName = `page_${String(p.index).padStart(4, "0")}${path.extname(p.entryName)}`;
        const id = `img_${p.index}`;
        return `    <item id="${id}" href="images/${fileName}" media-type="${p.mimeType}"/>`;
    })
        .join("\n");
    const spineItems = episodePages
        .map((p) => `    <itemref idref="img_${p.index}"/>`)
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
