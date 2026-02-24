---
name: messenger
description: Facebook Messengerの未読メッセージを確認・分類し、返信案作成・送信を行う（Chrome CDP / AppleScript経由）
---

# /messenger - Facebook Messengerアシスタント

Chrome CDP（Playwright）またはChrome AppleScript経由でFacebook Messengerの未読メッセージを確認し、分類・返信案作成・送信を行う。

## 送信ポリシー（最重要）

**外部送信はユーザーの明示的な承認があった場合のみ。**

承認ワード: 「はい」「OK」「送って」「それで」「お願い」「進めて」「やって」
非承認: 「終わったら〜」「〜もやって」等の付随的発言、文脈的な推測

**迷ったら送らない。聞く。**

## コマンド

```
/messenger              # 未読チェック → トリアージ → 下書き生成
/messenger check        # 同上
/messenger send <名前> <メッセージ>  # 送信（検証＋後続タスク自動実行）
/messenger draft <名前> # 下書き用コンテキスト収集
/messenger read <名前>  # 特定チャットの最新メッセージを読む
/messenger rooms        # チャットルーム一覧
/messenger status       # 現在のトリアージファイルのステータス表示
```

## アーキテクチャ（3層）

```
┌─────────────────────────────────────────────┐
│ スキル (SKILL.md)                            │
│ - 判断ルール（トリアージ分類、トーン選択）      │
│ - グループ送信禁止等のポリシー                  │
│ - 送信経路選択（Chrome）                       │
├─────────────────────────────────────────────┤
│ プログラム (scripts/)                         │
│ - messenger-checker/local-check.js → 未読取得  │
│   (Chrome CDP + Playwright)                    │
│ - messenger-draft.sh → コンテキスト強制収集    │
│ - messenger-send.sh  → 送信+検証+ステータス更新│
│   (Chrome AppleScript経由)                     │
├─────────────────────────────────────────────┤
│ データ (private/drafts/)                      │
│ - トリアージファイル（ステータス+後続タスクフラグ）│
│ - relationships.md（人物コンテキスト）          │
│ - memory/YYYY-MM-DD.md（送信ログ）             │
└─────────────────────────────────────────────┘
```

**原則: スキルだけに頼らない。プログラムとデータで担保する。**

## 送信経路

| 経路 | 条件 | メリット | デメリット |
|------|------|---------|-----------|
| **Chrome CDP/AppleScript** | MacのChromeでMessengerログイン中 | ブリッジ不要、確実 | Mac必須 |

**経路選択ルール:**
1. Chrome経由で送信（`messenger-send.sh <名前> <メッセージ> --chrome`）
2. Chrome経由もダメ → ユーザーに手動送信を依頼

### Chrome AppleScript操作の詳細

詳細手順は `procedures/by-domain/messenger/fb-messenger-chrome-control.proc.md` を参照。

**要点:**
- `document.execCommand('insertText', false, text)` でテキスト入力（React対応）
- `KeyboardEvent('keydown', {key:'Enter'})` で送信
- URL直ナビゲーション `window.location.href` でチャット切り替え
- `delay 5` 必須（Messengerのreactive更新が遅い）
- **`keystroke` で日本語を打たない**（IME壊れる）

## 環境

- **未読チェック**: `scripts/messenger-checker/local-check.js`（Chrome CDP）
- **スクリプト**: `scripts/messenger-draft.sh`, `scripts/messenger-send.sh`
- **操作手順書**: `procedures/by-domain/messenger/fb-messenger-chrome-control.proc.md`
- **時刻**: すべてJST表記（UTC禁止）

---

## 処理フロー

### Phase 1: 新着取得＋トリアージ

**Chrome CDP（Playwright）で未読チェック:**
```bash
node scripts/messenger-checker/local-check.js [--debug] [--headed]
```

出力: 分類済みJSON（`actionRequired` / `review` / `skip`）

**自律実行時（today.sh）:** 上記スクリプトが自動実行され、結果が統合ブリーフィングに含まれる。

#### 既存トリアージファイル確認（必須）

```bash
ls -lt private/*messenger* private/drafts/*messenger* 2>/dev/null
```
→ 既存ファイルがあればマージする。重複対応を防ぐ。

#### 分類

| カテゴリ            | 条件                                               | アクション         |
| ------------------- | -------------------------------------------------- | ------------------ |
| **skip**            | ページ通知、広告、マーケットプレイス通知、営業スパム | 無視（ブロック検討）|
| **info_only**       | グループの雑談、スタンプのみ、既読確認              | サマリー表示のみ   |
| **action_required** | 個人からの質問、約束の確認、日程調整、返事を求める内容 | 返信案作成         |

#### トリアージファイル出力

`private/drafts/messenger-replies-YYYY-MM-DD.md` に以下を生成：

```markdown
# Messenger返信 — YYYY-MM-DD

## 送信フロー（厳守）
1. `messenger-draft.sh <名前> --chrome` でコンテキスト収集
2. 下書き作成・承認
3. `messenger-send.sh <名前> <メッセージ> --chrome` で送信
4. 後続タスクフラグをすべて完了にする
※ すべて完了になるまで次に進まない

## ステータス

| # | 相手 | 承認 | 送信 | status | cal | rel | mem | 送信日時 |
|---|------|------|------|--------|-----|-----|-----|---------|
| 1 | Name | - | - | - | - | - | - | |
```

### Phase 2: 下書き生成

**必ず `messenger-draft.sh` を実行してから下書きを書く。**

```bash
bash scripts/messenger-draft.sh <名前> --chrome
```

出力内容:
1. **relationships.md** の該当人物セクション
2. **チャット履歴** 直近20件（JST表記）
3. **ユーザーの文体サンプル** 同チャット内の過去送信
4. **トリアージ情報** 既存ファイルの該当エントリ

→ この出力を読んでから下書きを作成する。出力なしで下書きを書くことは禁止。

#### 下書きルール

- 相手の呼び方を過去のやり取りから確認
- トーン: SOUL.md参照
  - ビジネス相手 → 「対・外部（ビジネス）」
  - 友人 → 「対・外部（カジュアル／友人）」
- **不要な謝罪を入れない**
- Messengerは**LINEよりフォーマル寄り**な傾向（ビジネス相手が多い）

### Phase 3: 送信

```bash
bash scripts/messenger-send.sh <名前> <メッセージ> --chrome
```

スクリプトが自動実行すること:
1. 承認チェック（ステータスファイル確認）
2. 送信（Chrome AppleScript）
3. **レスポンス検証**（入力欄の空確認 + エラーチェック）
4. **ステータスファイル自動更新**
5. 後続タスクリスト表示

### Phase 4: 後続タスク

送信成功後、以下をすべて完了する。ステータステーブルの各フラグを完了にする。

| タスク | 内容 | 自動/手動 |
|--------|------|-----------|
| **status** | ステータステーブル更新 | 自動: messenger-send.sh |
| **cal** | カレンダー仮押さえ（日程関連の場合） | 手動 |
| **rel** | relationships.md やり取り履歴追記 | 手動 |
| **mem** | memory/YYYY-MM-DD.md 送信記録 | 手動 |

**全フラグが完了になるまで次のメッセージに進まない。**

### Phase 5: エラー処理

- Chrome送信失敗 → ユーザーに手動送信を依頼
- リカバリ成功 → **ユーザーに「送信完了しました」と即座に報告**

---

## データ検証ルール

- sync APIの結果は**タイムスタンプで鮮度を確認**してから「最新」と報告する
- 送信コマンド実行後、**エラーレスポンスがないか必ず確認**する
- Chrome経由送信時、**入力欄が空になったことを確認**して成功判定する

---

## グループチャットへの送信ルール（厳守）

**グループチャットへの自動返信・送信は原則禁止。**

ユーザーが明示的に「このグループに〇〇と送って」と指示した場合のみ送信可。

**特に以下は絶対に送信禁止:**
- ビジネス系グループ全般
- 複数人が参加しているスレッド（個人チャットのみ対応）

---

## Messenger特有の注意点

- **E2EEチャット**: URLが `/e2ee/t/{id}/` パターン。通常は `/t/{id}/`。DOM構造は同一
- **メッセージリクエスト**: 未承認のチャットは「承認」ボタンを先にクリック
- **スタンプ/リアクション**: Matrix上では限定的に表示。返信案には含めない
- **既読**: ブリッジがメッセージを受信した時点で既読がつく可能性あり
- **画像/動画**: E2EE暗号化されたメディアは復号できない場合あり
- **通知**: ブリッジ経由の送信は相手に通常のMessenger通知として届く
- **営業スパム**: ブロック&削除で対応
- **時刻**: すべてJST。UTCで記録しない

---

## トラブルシューティング

### Chrome CDPで未読チェックできない

1. Chromeを完全終了して再起動
2. `node scripts/messenger-checker/local-check.js --debug --headed` でデバッグ
3. ログイン切れの場合: ChromeでMessengerに手動ログイン

### Chrome AppleScriptで操作できない

1. Messengerタブが開いているか確認
2. タブ番号が正しいか確認（Step 1で再取得）
3. `delay` を増やす（5→10秒）
4. Chrome DevToolsを閉じる（競合する場合あり）

---

## 関連ファイル

| ファイル | 用途 |
|---------|------|
| `scripts/messenger-checker/local-check.js` | 未読チェック（Chrome CDP / Playwright） |
| `scripts/messenger-draft.sh` | 下書き用コンテキスト強制収集 |
| `scripts/messenger-send.sh` | 送信+検証+ステータス更新（Chrome AppleScript） |
| `procedures/by-domain/messenger/fb-messenger-chrome-control.proc.md` | Chrome AppleScript操作の詳細手順 |
| `private/relationships.md` | 人物コンテキスト |
| `private/drafts/messenger-replies-*.md` | トリアージ＋ステータス管理 |
| `SOUL.md` | 返信トーン設定 |
