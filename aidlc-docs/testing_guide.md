# テスト手順ガイド

## 前提条件
- `cdk deploy` が完了していること
- AWS CLIが設定済み、またはAWSコンソールにログイン済みであること
- Lambda の環境変数 `OPENAI_API_KEY` が設定済みであること

---

## 1. テストデータの準備

### AWS CLI の場合
```bash
aws s3 cp /path/to/your/manga.epub s3://<バケット名>/manga/manga.epub
```

### AWSコンソールの場合
1. AWSコンソール → S3 → 作成されたバケットを開く
2. 「フォルダの作成」→ `manga` を作成
3. `manga` フォルダに入って「アップロード」→ epubファイルを選択

> バケット名は `cdk deploy` 時の Outputs `BucketName` に表示されます。

---

## 2. Lambda の実行

### AWSコンソールの場合
1. AWSコンソール → Lambda → `manga-batch-splitter` を開く
2. 「テスト」タブを選択
3. テストイベントに以下を入力:

```json
{
  "bucket": "<バケット名>",
  "key": "manga/manga.epub"
}
```

4. 「テスト」ボタンをクリック

### AWS CLI の場合
```bash
aws lambda invoke \
  --function-name manga-batch-splitter \
  --payload '{"bucket":"<バケット名>","key":"manga/manga.epub"}' \
  output.json
```

実行後 `output.json` に結果が書き出されます。

---

## 3. 結果確認

### 出力先
入力ファイルと同じバケット内の `/output/` 配下に分割されたepubが格納されます。

```
入力: manga/manga.epub
出力: manga/output/manga_ep01.epub
      manga/output/manga_ep02.epub
      ...
```

### AWS CLI で確認
```bash
aws s3 ls s3://<バケット名>/manga/output/
```

### AWSコンソールで確認
S3 → バケット → `manga/output/` フォルダを開く

### ログ確認
- Lambda コンソールの「テスト」タブに実行結果が表示されます
- 詳細ログは CloudWatch Logs → `/aws/lambda/manga-batch-splitter` で確認できます
