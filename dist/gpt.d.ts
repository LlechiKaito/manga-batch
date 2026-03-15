import { Episode, EpisodeWithPages, EpubPage } from "./types";
/**
 * 先頭のページ群から目次ページを検出し、「話」の一覧を抽出する
 */
export declare function extractEpisodesFromToc(pages: EpubPage[]): Promise<Episode[]>;
/**
 * ページ群をバッチでGPT APIに送り、各話の開始ページを特定する
 */
export declare function detectEpisodeBoundaries(pages: EpubPage[], episodes: Episode[]): Promise<EpisodeWithPages[]>;
