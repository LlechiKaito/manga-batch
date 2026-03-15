/** 目次から抽出された「話」の情報 */
export interface Episode {
  number: number;
  title: string;
}

/** ページ範囲が特定された「話」の情報 */
export interface EpisodeWithPages extends Episode {
  startPage: number;
  endPage: number;
}

/** epub内のページ（画像）情報 */
export interface EpubPage {
  index: number;
  /** epub内の画像ファイルパス */
  entryName: string;
  /** Base64エンコードされた画像データ */
  base64: string;
  /** MIMEタイプ (image/jpeg, image/png等) */
  mimeType: string;
}

/** Lambda イベント */
export interface BatchEvent {
  bucket: string;
  key: string;
}
