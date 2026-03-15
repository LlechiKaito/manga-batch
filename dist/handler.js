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
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const path = __importStar(require("path"));
const s3_1 = require("./s3");
const epub_1 = require("./epub");
const gpt_1 = require("./gpt");
async function handler(event) {
    const { bucket, key } = event;
    console.log(`処理開始: s3://${bucket}/${key}`);
    // 1. S3からepubを取得
    console.log("Step 1: epubファイルをダウンロード中...");
    const epubBuffer = await (0, s3_1.downloadEpub)(bucket, key);
    console.log(`ダウンロード完了: ${epubBuffer.length} bytes`);
    // 2. epubを展開してページ一覧を取得
    console.log("Step 2: epubを展開中...");
    const pages = (0, epub_1.extractPages)(epubBuffer);
    console.log(`${pages.length} ページを検出`);
    // 3. 目次画像からエピソード一覧を抽出
    console.log("Step 3: 目次を解析中...");
    const episodes = await (0, gpt_1.extractEpisodesFromToc)(pages);
    if (episodes.length === 0) {
        throw new Error("目次からエピソードを検出できませんでした");
    }
    console.log(`エピソード一覧: ${episodes.map((e) => e.title).join(", ")}`);
    // 4. 各話のページ境界を特定
    console.log("Step 4: ページ境界を検出中...");
    const episodesWithPages = await (0, gpt_1.detectEpisodeBoundaries)(pages, episodes);
    for (const ep of episodesWithPages) {
        console.log(`  ${ep.title}: ページ ${ep.startPage + 1}〜${ep.endPage + 1}`);
    }
    // 5. エピソードごとにepubを生成してS3にアップロード
    console.log("Step 5: epubを分割・アップロード中...");
    const baseName = path.basename(key, path.extname(key));
    const outputDir = path.dirname(key) + "/output";
    for (const ep of episodesWithPages) {
        const episodeEpub = (0, epub_1.buildEpisodeEpub)(pages, ep);
        const outputKey = `${outputDir}/${baseName}_ep${String(ep.number).padStart(2, "0")}.epub`;
        await (0, s3_1.uploadEpub)(bucket, outputKey, episodeEpub);
    }
    const result = {
        message: "処理完了",
        sourceFile: key,
        episodesProcessed: episodesWithPages.length,
        episodes: episodesWithPages.map((ep) => ({
            title: ep.title,
            pages: `${ep.startPage + 1}-${ep.endPage + 1}`,
        })),
    };
    console.log("処理完了:", JSON.stringify(result, null, 2));
    return result;
}
