import * as path from "path";
import { downloadEpub, uploadEpub } from "./s3";
import { extractPages, buildEpisodeEpub } from "./epub";
import { extractEpisodesFromToc, detectEpisodeBoundaries } from "./gpt";
import { BatchEvent } from "./types";

export async function handler(event: BatchEvent) {
  const { bucket, key } = event;
  console.log(`処理開始: s3://${bucket}/${key}`);

  // 1. S3からepubを取得
  console.log("Step 1: epubファイルをダウンロード中...");
  const epubBuffer = await downloadEpub(bucket, key);
  console.log(`ダウンロード完了: ${epubBuffer.length} bytes`);

  // 2. epubを展開してページ一覧を取得
  console.log("Step 2: epubを展開中...");
  const pages = extractPages(epubBuffer);
  console.log(`${pages.length} ページを検出`);

  // 3. 目次画像からエピソード一覧を抽出
  console.log("Step 3: 目次を解析中...");
  const episodes = await extractEpisodesFromToc(pages);
  if (episodes.length === 0) {
    throw new Error("目次からエピソードを検出できませんでした");
  }
  console.log(`エピソード一覧: ${episodes.map((e) => e.title).join(", ")}`);

  // 4. 各話のページ境界を特定
  console.log("Step 4: ページ境界を検出中...");
  const episodesWithPages = await detectEpisodeBoundaries(pages, episodes);
  for (const ep of episodesWithPages) {
    console.log(`  ${ep.title}: ページ ${ep.startPage + 1}〜${ep.endPage + 1}`);
  }

  // 5. エピソードごとにepubを生成してS3にアップロード
  console.log("Step 5: epubを分割・アップロード中...");
  const baseName = path.basename(key, path.extname(key));
  const outputDir = path.dirname(key) + "/output";

  for (const ep of episodesWithPages) {
    const episodeEpub = buildEpisodeEpub(pages, ep);
    const outputKey = `${outputDir}/${baseName}_ep${String(ep.number).padStart(2, "0")}.epub`;
    await uploadEpub(bucket, outputKey, episodeEpub);
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
