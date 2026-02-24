---
name: line
description: LINE未読メッセージを確認・分類し、返信案作成・送信を行う（Matrix Bridge経由）
---

# /line - LINE メッセージアシスタント

Matrix Bridge（mautrix-line）経由でLINEの未読メッセージを確認し、分類・返信案作成・送信を行う。

## 送信ポリシー（最重要）

**外部送信はユーザーの明示的な承認があった場合のみ。**

承認ワード: 「はい」「OK」「送って」「それで」「お願い」「進めて」「やって」
非承認: 「終わったら〜」「〜もやって」等の付随的発言、文脈的な推測

**迷ったら送らない。聞く。**

## ⚠️ Misdirected Message Prevention (4-layer defense)

**Background:** When processing replies to multiple people in one session, LLMs can mix up drafts and recipients — sending Person A's message to Person B. This is a critical failure mode for messaging assistants.

### Defense Layers

| Layer | Check | When | Implementation |
|-------|-------|------|----------------|
| 1 | **One person at a time** | During session | LLM rule (below) |
| 2 | **Preflight check** | At review time | `line-preflight.sh` (automatic) |
| 3 | **Preflight check** | At send time | `line-send.sh` (automatic) |
| 4 | **Approval table** | At send time | Status file (automatic) |

### One-at-a-time rule (mandatory)

When replying to multiple people, strictly follow this sequence:

1. **Create draft for person 1** → present to user
2. **Get approval**
3. **review → preflight → send → post-send tasks complete**
4. **Verify all flags are ✅ before moving to next person**

❌ Forbidden: Creating/presenting drafts for 2+ people simultaneously
❌ Forbidden: "Batch send" processing
✅ Required: Complete person 1 → then person 2

### Preflight check (`line-preflight.sh`)

Automatically runs before send. Validates:
- **Name check**: Draft doesn't contain another person's name
- **Context check**: Honorifics/nicknames in draft match this recipient's conversation
- **Duplicate check**: Not re-sending the same content

`PREFLIGHT: FAIL` → **Send blocked (no bypass)**

## コマンド

```
/line              # 未読チェック → トリアージ → 下書き生成
/line check        # 同上
/line send <名前> <メッセージ>  # 送信（検証＋後続タスク自動実行）
/line draft <名前> # 下書き用コンテキスト収集
/line read <名前>  # 特定チャットの最新メッセージを読む
/line rooms        # チャットルーム一覧
/line status       # 現在のトリアージファイルのステータス表示
```

## データ取得ルール（厳守）

**生のsync APIをその場でcurl/pythonで叩くことを禁止する。**

新着取得には必ず `line-sync.sh` を使う:
```bash
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-sync.sh          # 人間向け表示
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-sync.sh --json   # JSON出力
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-sync.sh --since 24  # 直近24時間
```

**理由:** 送信者分類（self/other）とグループ判定のロジックがスクリプトに固定されている。
その場でワンライナーを書くと分類ロジックが毎回変わり、マッピングミスが起きる。

`line-sync.sh` が出力する `needs_reply` は「最終メッセージが相手」という機械判定。
会話が完結しているか（挨拶の往復等）の最終判断はスキル側（LLM）が行う。

## アーキテクチャ（3層）

```
┌─────────────────────────────────────────────┐
│ スキル (SKILL.md)                            │
│ - 判断ルール（トリアージ分類、トーン選択）      │
│ - グループ送信禁止等のポリシー                  │
├─────────────────────────────────────────────┤
│ プログラム (scripts/)                         │
│ - line-draft.sh  → コンテキスト強制収集        │
│ - line-send.sh   → 送信+検証+ステータス更新    │
│ - check-messages.js → 新着チェック             │
├─────────────────────────────────────────────┤
│ データ (private/drafts/)                      │
│ - トリアージファイル（ステータス+後続タスクフラグ）│
│ - relationships.md（人物コンテキスト）          │
│ - memory/YYYY-MM-DD.md（送信ログ）             │
└─────────────────────────────────────────────┘
```

**原則: スキルだけに頼らない。プログラムとデータで担保する。**

## 環境

- **Matrix Server**: http://127.0.0.1:8008
- **Admin Token**: `$MATRIX_ADMIN_TOKEN`
- **スクリプト**: `scripts/line-draft.sh`, `scripts/line-send.sh`
- **Cron**: `line-message-check`（5分おき、新着チェック→通知）
- **Docker**: `sudo docker compose -f $WORKSPACE/projects/matrix-bridge/docker-compose.yml ps`
- **時刻**: すべてJST表記（UTC禁止）

---

## 処理フロー

### Phase 1: 新着取得＋トリアージ

```bash
# 新着チェック（必ずこのスクリプトを使う。生APIを叩くな）
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-sync.sh
```

#### 既存トリアージファイル確認（必須）

新着取得前に `private/` 配下に別セッションで作られたファイルがないか確認：
```bash
ls -lt private/*line* private/*triage* private/drafts/*line* 2>/dev/null
```
→ 既存ファイルがあればマージする。重複対応を防ぐ。

#### 分類

| カテゴリ            | 条件                                               | アクション         |
| ------------------- | -------------------------------------------------- | ------------------ |
| **skip**            | 公式アカウント（店舗・ブランド・サービス）          | 無視               |
| **info_only**       | グループの雑談、スタンプのみ、既読確認              | サマリー表示のみ   |
| **action_required** | 個人からの質問、約束の確認、日程調整、返事を求める内容 | 返信案作成         |

#### skip対象（公式アカウント）

```
# Add your skip accounts here
# Examples: brand accounts, store notifications, service bots
```

#### トリアージファイル出力

`private/drafts/line-replies-YYYY-MM-DD.md` に以下を生成：

```markdown
# LINE返信 — YYYY-MM-DD

## 送信フロー（厳守）
1. `line-draft.sh <名前>` でコンテキスト収集
2. 下書き作成・承認
3. `line-send.sh <名前> <メッセージ>` で送信
4. 後続タスクフラグをすべて完了にする
※ すべて完了になるまで次に進まない

## ステータス

| # | 相手 | 承認 | 送信 | status | cal | rel | mem | 送信日時 |
|---|------|------|------|--------|-----|-----|-----|---------|
| 1 | Name | - | - | - | - | - | - | |
```

### Phase 2: 下書き生成

**必ず `line-draft.sh` を実行してから下書きを書く。**

```bash
bash scripts/line-draft.sh <名前>
```

出力内容:
1. **relationships.md** の該当人物セクション
2. **チャット履歴** 直近20件（JST表記）
3. **ユーザーの文体サンプル** 同ルーム内の過去送信

→ この出力を読んでから下書きを作成する。出力なしで下書きを書くことは禁止。

#### 下書きルール

- 相手の呼び方を過去のやり取りから確認（「〜さん」「〜ちゃん」「〜くん」）
- 敬語/タメ口をユーザーの過去文体に合わせる
- 絵文字の頻度・種類を相手のトーンに合わせる
- ビジネス相手 → 敬語ベース
- 友人/カジュアル → SOUL.md「対・外部（カジュアル／友人）」参照
- **不要な謝罪を入れない**

### Phase 2.5: 下書きレビュー（必須）

**下書き完成後、送信前に必ず `line-review.sh` を実行する。FAILなら送信禁止。**

```bash
MATRIX_ADMIN_TOKEN="$MATRIX_ADMIN_TOKEN" bash scripts/line-review.sh <名前> <下書きテキスト>
```

チェック内容:
1. **絵文字数** — ユーザーの平均+1を超えたらFAIL
2. **NG絵文字** — 文脈に不適切な絵文字をチェック
3. **文長** — ユーザーの平均の2.5倍超でWARN
4. **トーン** — 敬語/タメ口の不一致でFAIL
5. **方針矛盾** — relationships.mdの方針と下書き内容の矛盾でFAIL

| 結果 | アクション |
|------|-----------|
| PASS | 送信可 |
| WARN | ユーザーに確認してから送信 |
| FAIL | 修正必須。FAILのまま送信禁止 |

### Phase 3: 送信

```bash
bash scripts/line-send.sh <名前> <メッセージ>
```

スクリプトが自動実行すること:
1. ルーム検索
2. 送信
3. **レスポンス検証**（event_id確認 + エラーチェック）
4. **ステータスファイル自動更新**
5. 後続タスクリスト表示

### Phase 4: 後続タスク

送信成功後、以下をすべて完了する。ステータステーブルの各フラグを完了にする。

| タスク | 内容 | 自動/手動 |
|--------|------|-----------|
| **status** | ステータステーブル更新 | 自動: line-send.sh |
| **cal** | カレンダー仮押さえ（日程関連の場合） | 手動 |
| **rel** | relationships.md やり取り履歴追記 | 手動 |
| **mem** | memory/YYYY-MM-DD.md 送信記録 | 手動 |

**全フラグが完了になるまで次のメッセージに進まない。**

### Phase 5: エラー処理

- 送信失敗 → line-send.sh がエラー出力 → リカバリ試行
- リカバリ成功 → **ユーザーに「送信完了しました」と即座に報告**
- エラー通知は自動で飛ぶが、リカバリ成功通知は飛ばない → 手動報告必須

---

## データ検証ルール

- sync APIの結果は**タイムスタンプで鮮度を確認**してから「最新」と報告する
- 送信コマンド実行後、**エラーレスポンスがないか必ず確認**する
- `Unknown command`, `M_FORBIDDEN` 等 → 即リカバリ → 結果報告

---

## グループチャットへの送信ルール（厳守）

**グループチャットへの自動返信・送信は原則禁止。**

ユーザーが明示的に「このグループに〇〇と送って」と指示した場合のみ送信可。
新着通知でグループの内容を報告するのはOKだが、返信案の生成もしない。

特に以下のグループは**絶対に送信禁止**:
- ビジネス系グループ全般
- # Add your restricted groups here

---

## LINE特有の注意点

- **スタンプ**: Matrix上では `sticker.png` として表示。返信案には含めない
- **既読**: ブリッジがメッセージを受信した時点で既読がつく
- **グループ**: **返信禁止**（上記ルール参照）
- **画像/動画**: E2EE暗号化されたメディアは復号できない場合あり
- **通知**: ブリッジ経由の送信は相手に通常のLINE通知として届く
- **時刻**: すべてJST。UTCで記録しない

---

## トラブルシューティング

### ブリッジが落ちた

```bash
cd $WORKSPACE/projects/matrix-bridge
sudo docker compose ps
sudo docker compose up -d
sudo docker compose logs matrix-line --tail 20
```

### セッション切れ（LINE再ログイン）

```bash
TOKEN="$MATRIX_ADMIN_TOKEN"
LINE_ROOM='YOUR_LINE_BRIDGE_ROOM_ID'

curl -s -X PUT "http://127.0.0.1:8008/_matrix/client/v3/rooms/$(python3 -c "import urllib.parse; print(urllib.parse.quote('$LINE_ROOM'))")/send/m.room.message/relogin_$(date +%s)" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"msgtype":"m.text","body":"login"}'
# → Follow the re-authentication flow on your phone
```

### メッセージが届かない

1. `sudo docker compose logs matrix-line --tail 30` でエラー確認
2. SSE接続切れ → コンテナ再起動
3. E2EE関連のWARNは無視してOK

---

## 関連ファイル

| ファイル | 用途 |
|---------|------|
| `scripts/line-draft.sh` | 下書き用コンテキスト強制収集 |
| `scripts/line-preflight.sh` | 送信前の宛先-内容整合性チェック |
| `scripts/line-send.sh` | 送信+検証+ステータス更新 |
| `scripts/check-messages.js` | 新着チェック |
| `private/relationships.md` | 人物コンテキスト |
| `private/drafts/line-replies-*.md` | トリアージ＋ステータス管理 |
| `SOUL.md` | 返信トーン設定 |
