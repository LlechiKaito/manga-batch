"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEpisodesFromToc = extractEpisodesFromToc;
exports.detectEpisodeBoundaries = detectEpisodeBoundaries;
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default();
const BATCH_SIZE = 10;
/**
 * 先頭のページ群から目次ページを検出し、「話」の一覧を抽出する
 */
async function extractEpisodesFromToc(pages) {
    // 先頭10ページを目次候補として送信
    const candidatePages = pages.slice(0, BATCH_SIZE);
    const imageContents = candidatePages.map((page) => ({
        type: "image_url",
        image_url: {
            url: `data:${page.mimeType};base64,${page.base64}`,
            detail: "low",
        },
    }));
    const res = await openai.chat.completions.create({
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
                        text: `以下は漫画のepubファイルの先頭ページの画像です。
この中から「目次」ページを見つけ、収録されている「話」（エピソード）の一覧を抽出してください。

以下のJSON形式で回答してください。JSON以外は出力しないでください。
{
  "episodes": [
    { "number": 1, "title": "第1話 タイトル名" },
    { "number": 2, "title": "第2話 タイトル名" }
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
    const content = res.choices[0]?.message?.content ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`GPT APIからのレスポンスをパースできません: ${content}`);
    }
    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`目次から ${parsed.episodes.length} 話を検出しました`);
    return parsed.episodes;
}
/**
 * ページ群をバッチでGPT APIに送り、各話の開始ページを特定する
 */
async function detectEpisodeBoundaries(pages, episodes) {
    const episodeTitles = episodes.map((e) => e.title).join(", ");
    const boundaries = [];
    // 10ページずつバッチで処理
    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
        const batch = pages.slice(i, i + BATCH_SIZE);
        console.log(`ページ境界検出中: ${i + 1}〜${i + batch.length} / ${pages.length}`);
        const imageContents = batch.map((page) => ({
            type: "image_url",
            image_url: {
                url: `data:${page.mimeType};base64,${page.base64}`,
                detail: "low",
            },
        }));
        const res = await openai.chat.completions.create({
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
                            text: `以下は漫画のページ画像です（ページ番号 ${i + 1} 〜 ${i + batch.length}）。
この漫画には以下の話が収録されています: ${episodeTitles}

この中に新しい話の開始ページ（扉絵やタイトルページ）があるか判定してください。

以下のJSON形式で回答してください。JSON以外は出力しないでください。
{
  "boundaries": [
    { "episodeNumber": 1, "pageNumber": 3 }
  ]
}

pageNumberは画像の並び順（${i + 1}から始まる番号）で指定してください。
新しい話の開始ページがない場合は {"boundaries": []} と返してください。`,
                        },
                        ...imageContents,
                    ],
                },
            ],
            max_tokens: 500,
            temperature: 0,
        });
        const content = res.choices[0]?.message?.content ?? "";
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            for (const b of parsed.boundaries) {
                boundaries.push({
                    episodeNumber: b.episodeNumber,
                    startPageIndex: b.pageNumber - 1, // 0-based index に変換
                });
            }
        }
    }
    // 境界情報をもとに各エピソードのページ範囲を決定
    boundaries.sort((a, b) => a.startPageIndex - b.startPageIndex);
    const result = [];
    for (let i = 0; i < boundaries.length; i++) {
        const boundary = boundaries[i];
        const episode = episodes.find((e) => e.number === boundary.episodeNumber);
        if (!episode)
            continue;
        const startPage = boundary.startPageIndex;
        const endPage = i < boundaries.length - 1
            ? boundaries[i + 1].startPageIndex - 1
            : pages.length - 1;
        result.push({ ...episode, startPage, endPage });
    }
    console.log(`${result.length} 話のページ範囲を特定しました`);
    return result;
}
