import OpenAI from "openai";
import { Episode, EpisodeWithPages, EpubPage } from "./types";

const openai = new OpenAI();

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function callGptWithRetry(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await openai.chat.completions.create(params);
      return res.choices[0]?.message?.content ?? "";
    } catch (err) {
      console.error(`GPT API呼び出し失敗 (試行 ${attempt}/${MAX_RETRIES}):`, err);
      if (attempt === MAX_RETRIES) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  throw new Error("GPT API呼び出しに失敗しました");
}

function extractJson(content: string): string | null {
  // response_format指定なしの場合、コードブロックで返されることがある
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();

  // 最も外側の {} を非貪欲に抽出（ネスト対応）
  let depth = 0;
  let start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        return content.slice(start, i + 1);
      }
    }
  }
  return null;
}

/**
 * 先頭のページ群から目次ページを検出し、「話」の一覧を抽出する
 */
export async function extractEpisodesFromToc(pages: EpubPage[]): Promise<Episode[]> {
  const candidatePages = pages.slice(0, BATCH_SIZE);

  const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
    candidatePages.map((page) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${page.mimeType};base64,${page.base64}`,
        detail: "low" as const,
      },
    }));

  const content = await callGptWithRetry({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: "あなたは漫画のepubファイルを分析するアシスタントです。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `以下は漫画のepubファイルの先頭ページの画像です（1ページ目〜${candidatePages.length}ページ目）。
この中から「目次」ページを見つけ、収録されている「話」（エピソード）の一覧を抽出してください。

重要なルール:
- numberは目次に記載されている順番で1から連番にしてください
- 目次に記載されている全ての話を漏れなく抽出してください
- 話のタイトルは目次に書かれている通りに正確に記載してください

以下のJSON形式で回答してください。JSON以外は出力しないでください。
{
  "episodes": [
    { "number": 1, "title": "第1話のタイトル" },
    { "number": 2, "title": "第2話のタイトル" }
  ]
}

目次ページが見つからない場合は {"episodes": []} と返してください。`,
          },
          ...imageContents,
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0,
  });

  const jsonStr = extractJson(content);
  if (!jsonStr) {
    throw new Error(`GPT APIからのレスポンスをパースできません: ${content}`);
  }

  const parsed = JSON.parse(jsonStr) as { episodes: Episode[] };
  console.log(`目次から ${parsed.episodes.length} 話を検出しました`);
  for (const ep of parsed.episodes) {
    console.log(`  #${ep.number}: ${ep.title}`);
  }
  return parsed.episodes;
}

/**
 * ページ群をバッチでGPT APIに送り、各話の開始ページを特定する
 */
export async function detectEpisodeBoundaries(
  pages: EpubPage[],
  episodes: Episode[]
): Promise<EpisodeWithPages[]> {
  const episodeList = episodes
    .map((e) => `  #${e.number}: 「${e.title}」`)
    .join("\n");

  const boundaries: { episodeNumber: number; pageNumber: number; title: string }[] = [];

  for (let i = 0; i < pages.length; i += BATCH_SIZE) {
    const batch = pages.slice(i, i + BATCH_SIZE);
    const startPageNum = i + 1;
    const endPageNum = i + batch.length;
    console.log(`ページ境界検出中: ${startPageNum}〜${endPageNum} / ${pages.length}`);

    const imageContents: OpenAI.Chat.Completions.ChatCompletionContentPart[] =
      batch.map((page) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${page.mimeType};base64,${page.base64}`,
          detail: "low" as const,
        },
      }));

    let content: string;
    try {
      content = await callGptWithRetry({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "あなたは漫画のepubファイルを分析するアシスタントです。",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `以下は漫画のページ画像です（ページ番号 ${startPageNum} 〜 ${endPageNum}、画像は左から順番に対応）。

この漫画には以下の話が収録されています（目次の順番通り）:
${episodeList}

この${batch.length}枚の画像の中に、新しい話の「扉絵」や「タイトルページ」（話の最初のページ）があるか判定してください。

重要なルール:
- 扉絵やタイトルページとは、話のタイトルが大きく書かれたページや、明らかに新しいエピソードの始まりを示すページです
- 通常の漫画本編のページは境界ではありません
- 目次ページや奥付ページも境界ではありません
- episodeNumberは上記リストの#番号を使ってください
- 1つのバッチで複数の境界が見つかることもあります

以下のJSON形式で回答してください。JSON以外は出力しないでください。
{
  "boundaries": [
    { "episodeNumber": 1, "pageNumber": ${startPageNum} }
  ]
}

pageNumberは ${startPageNum} 〜 ${endPageNum} の範囲で指定してください。
新しい話の開始ページがない場合は {"boundaries": []} と返してください。`,
              },
              ...imageContents,
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0,
      });
    } catch (err) {
      console.error(`バッチ ${startPageNum}〜${endPageNum} のGPT API呼び出しに失敗。スキップします:`, err);
      continue;
    }

    console.log(`  GPT応答: ${content}`);
    const jsonStr = extractJson(content);
    if (!jsonStr) {
      console.warn(`  バッチ ${startPageNum}〜${endPageNum}: JSONパース失敗。応答: ${content}`);
      continue;
    }

    try {
      const parsed = JSON.parse(jsonStr) as {
        boundaries: { episodeNumber: number; pageNumber: number }[];
      };
      for (const b of parsed.boundaries) {
        const episode = episodes.find((e) => e.number === b.episodeNumber);
        if (!episode) {
          console.warn(`  不明なepisodeNumber: ${b.episodeNumber} をスキップ`);
          continue;
        }
        boundaries.push({
          episodeNumber: b.episodeNumber,
          pageNumber: b.pageNumber,
          title: episode.title,
        });
      }
    } catch (err) {
      console.warn(`  バッチ ${startPageNum}〜${endPageNum}: JSONパースエラー:`, err);
    }
  }

  // ページ番号順にソート
  boundaries.sort((a, b) => a.pageNumber - b.pageNumber);

  // 重複排除: 同じepisodeNumberが複数回出た場合は最初のもののみ残す
  const seen = new Set<number>();
  const uniqueBoundaries = boundaries.filter((b) => {
    if (seen.has(b.episodeNumber)) return false;
    seen.add(b.episodeNumber);
    return true;
  });

  console.log(`境界検出結果（重複排除後）:`);
  for (const b of uniqueBoundaries) {
    console.log(`  #${b.episodeNumber} 「${b.title}」 → ページ ${b.pageNumber}`);
  }

  // 各エピソードのページ範囲を決定（不明エピソードは既にフィルタ済み）
  const result: EpisodeWithPages[] = [];
  for (let i = 0; i < uniqueBoundaries.length; i++) {
    const boundary = uniqueBoundaries[i];
    const episode = episodes.find((e) => e.number === boundary.episodeNumber)!;

    const startPage = boundary.pageNumber - 1; // 0-based index
    const endPage =
      i < uniqueBoundaries.length - 1
        ? uniqueBoundaries[i + 1].pageNumber - 2
        : pages.length - 1;

    result.push({ ...episode, startPage, endPage });
  }

  console.log(`${result.length} 話のページ範囲を特定しました`);
  return result;
}
