import { EpubPage, EpisodeWithPages } from "./types";
/**
 * epubバッファを展開し、spine順に並んだ画像ページ一覧を返す。
 * spine（content.opf）が読めない場合はファイル名のソート順にフォールバックする。
 */
export declare function extractPages(epubBuffer: Buffer): EpubPage[];
/**
 * 指定されたエピソードのページ範囲で新しいepubファイルを生成する
 */
export declare function buildEpisodeEpub(pages: EpubPage[], episode: EpisodeWithPages): Buffer;
