# AI Chief of Staff

**Claude Codeを、あなた専用の参謀に。**

> **Before:** 毎朝45分のコンテキストスイッチ — 3つの受信トレイを確認、Slackスレッドをチェック、LINEとMessengerをスクロール、カレンダーと突き合わせ、返信を書き、Todoを更新。漏れが出る。フォローアップを忘れる。カレンダーに会議リンクがない。
>
> **After:** `/today` と打つ。5分で全チャンネルがトリアージされ、返信案ができ、カレンダーが更新され、何も漏れない — Hookが完了するまで次に進めないから。

朝、ターミナルで `/today` と打つ。それだけで:

- **未読メール20件を自動分類** — Bot通知やニュースレターは見せずにアーカイブ。本当に返信が必要なものだけ表示
- **Slackのメンション・DMを一覧化** — 未回答のスレッドだけ浮かび上がらせる
- **LINE・Messengerのメッセージをトリアージ** — 公式アカウントはスキップ、返信が必要な1対1チャットだけ表示
- **今日のカレンダーを表示** — 会議リンクが未登録なら、メールから自動補完。非定例会議には準備フラグ付き
- **滞留タスクと未返信を一括トリアージ** — 3日以上放置の返信待ちを検出、全項目に判断を下すまで終わらない
- **要返信メールに返信案を生成** — あなたの文体・署名・過去のやり取りを踏まえて
- **日程調整なら空き時間を自動計算** — カレンダーから候補を抽出、午前NGなどの好みも反映
- **送信後のカレンダー登録・Todo更新・記録を全自動** — Hookで強制するから、抜け漏れゼロ

やっていることは単純です。メール・Slack・LINE・Messenger・カレンダーという5つの入力を、**分類 → トリアージ → 判断支援 → 実行 → 記録**のパイプラインに通す。Claude Codeの `/command` をワークフローエンジンとして使い、Hookで信頼性を担保し、Gitでナレッジを永続化する。

コードは書きません。SDKもAPIラッパーも不要。**Markdownのプロンプトを編集するだけで動作が変わります。**

```
$ claude /today

# 今日のブリーフィング — 2026年2月18日（火）

## スケジュール (3件)
| 時間        | 予定                   | 場所/リンク        | 準備 |
|-------------|------------------------|--------------------|------|
| 10:00-11:00 | チームスタンドアップ    | Zoom: https://...  | —   |
| 14:00-15:00 | クライアントMTG        | 丸の内タワー        | ⚠️  |
| 19:00-      | 飲み @恵比寿           | たつや              | —   |

## メール — スキップ (5件) → 自動アーカイブ済み
## メール — 要返信 (2件)

### 1. 山田花子 <hanako@example.com>
**件名**: Q2プロジェクトのキックオフ日程
**要点**: 来週以降でキックオフMTGの候補日を聞いている

**返信案**:
ご連絡ありがとうございます。
以下の日程でいかがでしょうか。...

→ [送信] [編集] [スキップ]

## トリアージキュー
- 滞留/重要な返信待ち: 2件
- 期限超過タスク: 1件
→ Step 3 で全件判断します
```

---

## 仕組み

このキットは、全コミュニケーションチャネルに**4段階のトリアージシステム**を導入し、さらに**タスクトリアージ**で滞留タスクを一掃します:

| カテゴリ | 条件 | アクション |
|----------|------|-----------|
| **skip** | Bot通知、noreply、自動送信 | 自動アーカイブ（非表示） |
| **info_only** | CC受信、レシート、社内共有 | サマリー表示のみ |
| **meeting_info** | カレンダー招待、Zoom/Teamsリンク、場所共有 | カレンダー照合＆自動更新 |
| **action_required** | 直接宛先、質問・依頼を含む、日程調整 | 返信案を自動生成 |

返信送信後は、**Hookで強制されるチェックリスト**が抜け漏れを防ぎます:

1. カレンダー更新（提示した候補日をすべて仮登録）
2. 関係性ノート更新（誰と何の話をしたか）
3. Todoリスト更新
4. 返信待ちテーブル更新（フォローアップ送信日更新、解決済み削除、待機期限設定）
5. Git commit & push（ナレッジをバージョン管理）
6. 処理済みメールをアーカイブ
7. LINE/Messengerトリアージファイル更新

**Hookは全ステップが完了するまで処理をブロックします。** 送信後処理をうっかりスキップすることはできません。

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│  Commands (.claude/commands/*.md)                │
│  /mail  /slack  /today  /schedule-reply          │
│  ↳ ユーザー向けエントリポイント（対話型）       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Skills (skills/*/SKILL.md)                      │
│  /line  /messenger  /schedule-reply              │
│  ↳ 再利用可能なマルチフェーズワークフロー       │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Rules (.claude/rules/*.md)                      │
│  ↳ 信頼性のための行動制約                       │
│  ↳ 送信前/後チェックリスト、セッション起動      │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Hooks (hooks/post-send.sh)                      │
│  ↳ PostToolUse 強制レイヤー                     │
│  ↳ チェックリスト完了まで処理をブロック         │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Scripts (scripts/)                              │
│  calendar-suggest.js, line-*.sh, messenger-*.sh  │
│  core/msg-core.sh（共有メッセージングユーティリティ）│
│  ↳ 決定的ロジック（LLM不要）                    │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Autonomous Layer (scripts/autonomous/)           │
│  dispatcher.sh → today.sh, morning-briefing.sh   │
│  slack-bridge.sh, notify.sh                      │
│  ↳ launchd/cronでスケジュール実行 — 無人動作    │
│  ↳ claude -p（非対話モード）で動作              │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│  Knowledge Files (private/)                      │
│  ↳ relationships.md, todo.md, preferences.md    │
│  ↳ Gitでバージョン管理された永続メモリ          │
└─────────────────────────────────────────────────┘
```

### なぜこの設計か？

**Commandはコードではなくプロンプト。** 各 `.md` ファイルは、Claude Codeに手順を伝える構造化プロンプトです。SDK不要、APIラッパー不要、ビルド不要。Markdownを編集して保存すれば、次の呼び出しから即座に動作が変わります。

**Hookが信頼性を保証する。** LLMはステップを飛ばします。後処理を忘れます。`PostToolUse` Hookは `gmail send` コマンドを検知し、チェックリストが完了するまでブロックします。これがシステム全体で最も重要なパーツです — これがなければ、成功率は99%ではなく80%になります。

**Ruleがllmの振る舞いを制約する。** `.claude/rules/` のルールは毎セッション自動で読み込まれます。送信前チェックリスト、送信後の強制処理、セッション起動シーケンスなどを強制します。プロンプトの指示と違い、ルールはシステムが注入するため — LLMがスキップすることはできません。

**Scriptが決定的ロジックを担当。** カレンダーの空き時間計算にLLMは不要です。`calendar-suggest.js` がカレンダーを取得し、空きスロットを見つけ、好み（午前NG、移動バッファ等）を反映し、フォーマット済みの候補を出力します。LINE・Messengerスクリプトは共有メッセージングコアを通じてメッセージの同期・コンテキスト収集・送信を処理します。

**自律レイヤーが無人で動作する。** `scripts/autonomous/` には、launchd/cronでスケジュール実行されるスクリプトがあります。`claude -p`（非対話モード）を使用。dispatcherが各ハンドラに振り分けます: `today.sh` は5チャンネルを並列トリアージ、`slack-bridge.sh` はSlack DMを双方向Claudeインターフェースに変換、`notify.sh` は結果をSlack DMで通知します。

**Knowledge Filesがあなたの記憶。** Claude Codeのセッションはステートレスです。関係性、好み、Todoはマークダウンファイルに永続化され、Gitでバージョン管理されます。毎セッション開始時にこれらを読み込むことで、継続性が保たれます。

---

## 自律実行

`scripts/autonomous/` ディレクトリで**無人動作**を実現 — ターミナルを開かなくてもClaudeがスケジュールで動きます。

### 仕組み

1. **`dispatcher.sh`** がエントリポイント。モード（`triage`, `morning`, `bridge`, `today`）を受け取り、対応するハンドラを起動
2. **`today.sh`** が5チャンネル（メール、Slack、LINE、Messenger、カレンダー）を並列取得し、チャンネル別のプロンプトでAI分類を実行、結果をSlack DMに投稿
3. **`morning-briefing.sh`** がカレンダー・Todo・夜間トリアージ結果・承認待ちを統合してモーニングブリーフィングを生成
4. **`slack-bridge.sh`** がSlack DMをポーリングし、`claude -p` にルーティング。双方向のClaude ↔ Slackインターフェースを実現
5. **`notify.sh`** がフォーマット済み通知をSlack DMに送信

すべての自律スクリプトは `claude -p`（パイプ/非対話モード）を使用し、`--append-system-prompt` でコンテキストを注入。結果はSlack Web APIで通知されます。

### HITL（Human-in-the-Loop）承認フロー

`lib/approval.sh` がSlackベースの承認フローを実装。自律エージェントがメッセージ送信やカレンダー更新を行う前に、Slackにプレビューを投稿し、あなたのリアクション（チェックマークで承認、Xで拒否）を待ちます。

---

## スケジューリング（launchd / cron）

`examples/launchd/` にplistテンプレートがあります:

| ファイル | スケジュール | 内容 |
|---------|------------|------|
| `com.chief-of-staff.today.plist` | 毎時 | 5チャンネルトリアージ、結果をSlackに投稿 |
| `com.chief-of-staff.morning.plist` | 毎日 07:30 | カレンダー + Todoのモーニングブリーフィング |

### セットアップ（macOS）

```bash
# 1. plistをコピーして編集（YOUR_HOME, YOUR_WORKSPACEを置換）
cp examples/launchd/com.chief-of-staff.today.plist ~/Library/LaunchAgents/

# 2. パスを編集 — launchdは$HOMEや~を展開しません
vim ~/Library/LaunchAgents/com.chief-of-staff.today.plist

# 3. ロード
launchctl load ~/Library/LaunchAgents/com.chief-of-staff.today.plist

# 4. ステータス確認
launchctl list | grep chief-of-staff
```

### セットアップ（Linux / cron）

```bash
# crontabに追加
crontab -e

# 毎時
0 * * * * /path/to/scripts/autonomous/dispatcher.sh today >> /tmp/chief-of-staff.log 2>&1

# 毎日07:30
30 7 * * * /path/to/scripts/autonomous/dispatcher.sh morning >> /tmp/chief-of-staff.log 2>&1
```

---

## ルールシステム

`.claude/rules/` のルールは、Claude Codeが毎セッション自動で読み込む行動制約です。プロンプトの指示と違い、ルールは**システムが注入**するため — LLMが無視することはできません。

`examples/rules/` にサンプルルールがあります:

| ルール | 目的 |
|--------|------|
| `pre-send-checklist.md` | 送信前にCC宛先を確認 |
| `post-send-checklist.md` | 送信後にカレンダー/Todo/関係性の更新を強制 |
| `session-start.md` | セッション開始時にナレッジファイルを読み込み |
| `calendar-update.md` | カレンダー変更前にエビデンス（メール/Slack）の確認を要求 |
| `self-awareness.md` | LLM自己修正パターン（反ハルシネーション、反スキップ） |
| `parallel-execution.md` | 独立タスクの並列実行 |
| `trigger-workflows.md` | キーワードからワークフローへのマッピング |

使い方: 必要なルールを `.claude/rules/` にコピーするだけです。

---

## LINE・Messengerスクリプト

LINEはMatrixブリッジ、MessengerはChrome CDP/AppleScript経由のメッセージングスクリプト。

### 前提条件

**LINE:**
- [Matrix](https://matrix.org/) ホームサーバー（例: Synapse）
- [mautrix-line](https://github.com/mautrix/line) ブリッジ
- 環境変数: `MATRIX_SERVER`, `MATRIX_ADMIN_TOKEN`

**Messenger:**
- Messengerにログイン済みのGoogle Chrome（macOS）
- Node.js + Playwright（Chrome CDPによる未読チェック用）

### スクリプト一覧

| スクリプト | チャネル | 目的 |
|-----------|---------|------|
| `core/msg-core.sh` | 共有 | ユーティリティ（関係性検索、ステータス管理、LINE用Matrix API） |
| `line-sync.sh` | LINE | Matrixブリッジ経由のメッセージ同期 |
| `line-draft.sh` | LINE | 返信ドラフトのコンテキスト収集 |
| `line-review.sh` | LINE | ドラフト検証（絵文字、トーン、長さ） |
| `line-send.sh` | LINE | Matrix経由で送信 + 配信確認 |
| `line-rooms.sh` | LINE | VPS Matrixブリッジ経由のルーム検索 |
| `messenger-draft.sh` | Messenger | Chrome CDP経由のコンテキスト収集（Matrixフォールバック） |
| `messenger-send.sh` | Messenger | Chrome AppleScript経由で送信 |

### スキル

LINE・Messengerのスキル例が `examples/skills/` にあります:
- `line-skill.md` — フェーズ、ルール、トラブルシューティングを含む完全なLINEワークフロー
- `messenger-skill.md` — Chrome CDP/AppleScriptによる完全なMessengerワークフロー

---

## クイックスタート（5分 — メール + カレンダー）

メールトリアージとカレンダー連携の日程調整を5分でセットアップ。Slack・LINE・Messenger・自律実行は不要。

### 前提条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) がインストール済み
- Gmail CLIツール（[`gog`](https://github.com/pterm/gog) 等、Gmail検索・送信・アーカイブができるCLI）
- Node.js 18+

### 1. 必須ファイルをコピー

```bash
# コマンド
cp commands/mail.md ~/.claude/commands/

# ワークスペース
mkdir -p ~/your-workspace/{skills/schedule-reply,hooks,scripts,private}
cp skills/schedule-reply/SKILL.md ~/your-workspace/skills/schedule-reply/
cp hooks/post-send.sh ~/your-workspace/hooks/
cp scripts/calendar-suggest.js ~/your-workspace/scripts/
cp examples/SOUL.md ~/your-workspace/
```

### 2. プレースホルダーを置換

```bash
grep -r "YOUR_" commands/mail.md skills/ hooks/ scripts/calendar-suggest.js
```

| プレースホルダー | 例 |
|------------------|-----|
| `YOUR_EMAIL` | `alice@gmail.com` |
| `YOUR_WORK_EMAIL` | `alice@company.com` |
| `YOUR_SIGNATURE` | `Alice` |
| `YOUR_WORKSPACE` | `~/workspace` |
| `YOUR_CALENDAR_ID` | `primary` |

### 3. ナレッジファイルを作成

```bash
cd ~/your-workspace

cat > private/relationships.md << 'EOF'
# Relationships

## 田中太郎（Acme社）
- 役職: 開発部VP
- 文脈: API連携プロジェクト進行中
- 最終: 2/15 Q2ローンチのタイムラインを議論
EOF

cat > private/preferences.md << 'EOF'
# Preferences

## スケジューリング
- 午後優先（11:00以降）
- 平日のみ、9:00-18:00
- 候補は3〜5個提示
EOF

cat > private/todo.md << 'EOF'
# Todo

## 直近の予定
| 日付 | 予定 | ステータス |
|------|------|-----------|
EOF
```

### 4. Hook + 権限を設定

プロジェクトの `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/your-workspace/hooks/post-send.sh"
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(gog gmail search*)",
      "Bash(gog gmail send*)",
      "Bash(gog gmail thread*)",
      "Bash(gog calendar*)",
      "Bash(node */scripts/calendar-suggest.js*)"
    ]
  }
}
```

### 5. 試してみる

```bash
claude /mail          # メールのトリアージ
claude /schedule-reply "来週の田中さんとのMTGについて返信して"
```

これでメールトリアージとHook強制の送信後処理が動きます。さらにチャンネルを追加するには↓

---

## 追加セットアップ

### Slackを追加

1. Claude Codeに[Slack MCPサーバー](https://github.com/anthropics/claude-code)を設定
2. `commands/slack.md` を `~/.claude/commands/` にコピー
3. コマンドファイル内の `YOUR_NAME`, `YOUR_SLACK_MENTIONS` を置換
4. 権限に `"Skill(slack)"` を追加

```bash
claude /slack         # Slackメンション・DMのトリアージ
```

### LINEを追加

Matrixホームサーバー + [mautrix-line](https://github.com/mautrix/line) が必要。

```bash
cp scripts/core/msg-core.sh ~/your-workspace/scripts/core/
cp scripts/line-*.sh ~/your-workspace/scripts/
```

スクリプト内の `YOUR_MATRIX_SERVER`, `YOUR_MATRIX_ADMIN_TOKEN`, `YOUR_MATRIX_USER_PARTIAL`, `YOUR_VPS_HOST` を置換。完全なワークフローは `examples/skills/line-skill.md` を参照。

### Messengerを追加

Messengerにログイン済みのGoogle Chrome（macOS）が必要。

```bash
cp scripts/messenger-*.sh ~/your-workspace/scripts/
```

スクリプト内の `YOUR_MATRIX_USER_PARTIAL` を置換。Chrome CDP/AppleScriptワークフローは `examples/skills/messenger-skill.md` を参照。

### 統合 `/today` コマンドを追加

使いたいチャンネルの設定が完了したら:

```bash
cp commands/today.md ~/.claude/commands/
```

`YOUR_LINE_*`, `YOUR_MESSENGER_*`, `YOUR_WORK_DOMAIN` プレースホルダーを置換。未設定のチャンネルは自動スキップ。

```bash
claude /today         # 朝のブリーフィング — 設定済み全チャンネル
```

### 自律実行を追加

スケジュールで無人トリアージを実行:

```bash
cp -r scripts/autonomous/ ~/your-workspace/scripts/autonomous/
```

自律スクリプト内の `YOUR_SLACK_USER_ID`, `YOUR_SLACK_BOT_TOKEN`, `YOUR_WORK_EMAIL`, `YOUR_EMAIL` を置換。launchd plist（`examples/launchd/` 参照）またはcronジョブを設定。

### ルールを追加

毎セッション自動で適用される行動制約:

```bash
mkdir -p ~/your-workspace/.claude/rules
cp examples/rules/*.md ~/your-workspace/.claude/rules/
```

### 全プレースホルダー一覧

| プレースホルダー | 例 | 使用箇所 |
|------------------|-----|---------|
| `YOUR_EMAIL` | `alice@gmail.com` | mail.md, today.md |
| `YOUR_WORK_EMAIL` | `alice@company.com` | mail.md, today.md |
| `YOUR_NAME` | `Alice` | slack.md, today.md |
| `YOUR_SIGNATURE` | `Alice` | mail.md, schedule-reply |
| `YOUR_WORKSPACE` | `~/workspace` | hooks, scripts |
| `YOUR_CALENDAR_ID` | `primary` | calendar-suggest.js |
| `YOUR_SKIP_DOMAINS` | `@company-internal.com` | mail.md |
| `YOUR_SLACK_USER_ID` | `U1234567890` | config.json, slack-api.sh, slack-bridge.sh |
| `YOUR_SLACK_BOT_TOKEN` | `xoxb-...` | .env |
| `YOUR_SLACK_MENTIONS` | `@alice, @Alice` | triage-slack.md |
| `YOUR_MATRIX_USER_PARTIAL` | `ualice` | msg-core.sh, line-sync.sh |
| `YOUR_VPS_HOST` | `root@your-server.com` | line-rooms.sh |
| `YOUR_MATRIX_SERVER` | `http://localhost:8008` | today.md, msg-core.sh |
| `YOUR_MATRIX_ADMIN_TOKEN` | (env var) | today.md, msg-core.sh |
| `YOUR_WORK_DOMAIN` | `company.com` | today.md, triage-email.md |
| `YOUR_TODO_FILE` | `private/todo.md` | today.sh, morning-briefing.sh |

---

## カスタマイズガイド

### スキップルールの追加

`commands/mail.md` のskipセクションにパターンを追加:

```markdown
### skip（自動アーカイブ）
- From に `noreply`, `no-reply`, `notification` を含む
- From に `@github.com`, `@slack.com` を含む
- Subject に `[GitHub]`, `[Jira]` を含む
+ - From に `@your-noisy-service.com` を含む
+ - Subject に `[社内ツール名]` を含む
```

### トーンの変更

`SOUL.md` を自分のコミュニケーションスタイルに合わせて編集。トリアージコマンドは返信案生成時に `SOUL.md` を参照します:

```markdown
## 対・外部（ビジネス）
- 丁寧だが温かみのある文体
- 簡潔、余計な前置きなし
- 必ず署名で締める

## 対・内部（チーム）
- カジュアルだが敬意を持って
- 絵文字OK
- 形式張らない
```

### 新チャンネルの追加（Discord、Linearなど）

1. `commands/slack.md` をコピーしてテンプレートとして使用
2. Slack MCPのツール呼び出しを対象サービスの連携に置き換え
3. 4段階分類はそのまま維持（メッセージソースに依存しない）
4. 送信機能がある場合は送信後Hookも追加

### マルチアカウント対応

mailコマンドは複数アカウントに対応しています。検索ステップにアカウントを追加するだけ:

```markdown
### Step 1: 未読取得

```bash
# アカウント1
gog gmail search "is:unread ..." --account YOUR_EMAIL

# アカウント2
gog gmail search "is:unread ..." --account YOUR_WORK_EMAIL

# アカウント3（必要な分だけ追加）
gog gmail search "is:unread ..." --account YOUR_OTHER_EMAIL
```

---

## ファイル構成

```
ai-chief-of-staff/
├── commands/
│   ├── mail.md                    # /mail — メールトリアージ
│   ├── slack.md                   # /slack — Slackトリアージ
│   ├── today.md                   # /today — 朝のブリーフィング
│   └── schedule-reply.md          # /schedule-reply — 日程調整ワークフロー
├── skills/
│   └── schedule-reply/
│       └── SKILL.md               # マルチフェーズ日程調整スキル
├── hooks/
│   └── post-send.sh               # PostToolUse送信後強制Hook
├── scripts/
│   ├── calendar-suggest.js        # 空き時間検索スクリプト
│   ├── core/
│   │   └── msg-core.sh            # 共有Matrixメッセージングユーティリティ
│   ├── line-sync.sh               # LINEメッセージ同期（Matrix経由）
│   ├── line-draft.sh              # LINEドラフトコンテキスト収集
│   ├── line-review.sh             # LINEドラフト検証
│   ├── line-send.sh               # LINE送信 + 配信確認
│   ├── line-rooms.sh              # LINEルーム検索
│   ├── messenger-draft.sh         # Messengerドラフトコンテキスト
│   ├── messenger-send.sh          # Messenger送信（Chrome AppleScript）
│   └── autonomous/
│       ├── dispatcher.sh          # 全自律モードのエントリポイント
│       ├── today.sh               # 5チャンネル統合トリアージ
│       ├── morning-briefing.sh    # モーニングブリーフィング生成
│       ├── slack-bridge.sh        # 双方向Slack ↔ Claudeブリッジ
│       ├── notify.sh              # Slack DM通知送信
│       ├── config.json            # 自律モード設定
│       ├── lib/
│       │   ├── common.sh          # 共有ユーティリティ（ログ、ロック）
│       │   ├── slack-api.sh       # Slack Web APIラッパー
│       │   └── approval.sh        # HITL承認フロー（Slackリアクション）
│       └── prompts/
│           ├── triage-email.md    # メール分類プロンプト
│           ├── triage-slack.md    # Slack分類プロンプト
│           ├── triage-line.md     # LINE分類プロンプト
│           ├── triage-messenger.md # Messenger分類プロンプト
│           └── today-briefing.md  # ブリーフィング生成プロンプト
├── examples/
│   ├── SOUL.md                    # ペルソナ設定テンプレート
│   ├── rules/
│   │   ├── pre-send-checklist.md  # 送信前チェックリスト
│   │   ├── post-send-checklist.md # 送信後強制処理
│   │   ├── session-start.md       # セッション起動シーケンス
│   │   ├── calendar-update.md     # エビデンスベースのカレンダー更新
│   │   ├── self-awareness.md      # LLM自己修正パターン
│   │   ├── parallel-execution.md  # 並列タスク実行
│   │   └── trigger-workflows.md   # キーワード → ワークフロー
│   ├── skills/
│   │   ├── line-skill.md          # LINEメッセージングスキル
│   │   └── messenger-skill.md     # Messengerメッセージングスキル
│   └── launchd/
│       ├── com.chief-of-staff.today.plist    # 毎時トリアージ
│       └── com.chief-of-staff.morning.plist  # 毎朝ブリーフィング
├── README.md                      # 英語版
└── README.ja.md                   # このファイル
```

---

## 設計思想

### なぜMarkdownプロンプトなのか？コードではなく。

プロンプトベースのシステムは、**ビルド不要、デプロイ不要、即時反映**を意味します。`mail.md` を編集して保存すれば、次の `/mail` 呼び出しから新しい動作になります。従来のメール自動化ツールを作るなら — APIサーバー、OAuthフロー、Webhookハンドラ、データベース、デプロイパイプラインが必要です。ここでは、**LLMそのものがランタイム**です。

### なぜHookで信頼性を担保するのか？

LLM駆動ワークフローの最大の失敗モードは**ステップの忘却**です。Claudeはメールを送信して、カレンダーも関係性ノートも更新せずに次に進みます。PostToolUse Hookは `send` コマンドを検知し、リマインダーを注入して応答を**ブロック**します。プロンプトに「忘れるな」と書くより安価で確実です。

### なぜGitで永続化するのか？

関係性ノート、好み設定、Todoは価値あるデータです。Gitが提供するもの:
- **変更履歴** — 関係性の変遷を時系列で確認
- **マルチデバイス同期** — プライベートリポジトリにpush、どこからでもpull
- **ロールバック** — 誤った変更を取り消し
- **監査証跡** — AIが生成したすべての更新がコミットログに残る

### なぜカレンダーロジックを別スクリプトに分離するのか？

LLMは時間計算が苦手です。「今後2週間で、午前を避けて、1時間の空きスロットを3つ見つけて」には日付算術、タイムゾーン処理、交差計算が必要です。`calendar-suggest.js` はこれを決定的に100msで処理します。LLMの仕事は出力をフォーマットしてメールを書くことであり、空き時間を計算することではありません。

### なぜプロンプト指示ではなくルールなのか？

プロンプトの指示は忘れられます。システムプロンプトに「送信後は必ずカレンダーを更新すること」と書いても、Claudeは20%の確率でスキップします。`.claude/rules/` のルールはシステムが毎セッション注入するため — LLMが無視を選択することはできません。Hook（ツールレベルでの強制）と合わせて、二重の信頼性レイヤーを実現します。

### なぜ自律レイヤーが必要なのか？

対話モードではターミナルを開いてコマンドを入力する必要があります。自律レイヤー（`scripts/autonomous/`）はlaunchd/cronでスケジュール実行され、`claude -p`（非対話モード）を使用。デスクを離れていてもトリアージが実行されます。結果はSlackに投稿され、HITL承認フローであなたのコントロールを維持します。

---

## FAQ

**Q: Outlook/Exchangeでも使えますか？**
A: 分類ロジックはメールプロバイダに依存しません。`gog gmail` コマンドをOutlook CLIツール（`microsoft-graph-cli` やカスタムスクリプト等）に置き換えてください。

**Q: Slackなしでも使えますか？**
A: はい。`/mail` と `/schedule-reply` だけ使えます。Slackコマンドは独立しています。

**Q: メールデータはAnthropicに送信されますか？**
A: はい — Claude CodeはAnthropic APIを通じてメールを処理します。センシティブなデータをClaudeに渡す場合と同様のプライバシー考慮が必要です。懸念がある場合は、セルフホストモデルでの運用を検討してください。

**Q: 1日あたりのコストは？**
A: 典型的な `/today` ブリーフィング（メール20件 + Slack + カレンダー）で約5〜10万トークン。Opus料金で約$1-2/日。Sonnetなら約$0.15-0.30/日です。

---

## クレジット

[あなたの名前] が [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（Anthropic）を使って構築。

AIアシスタントは、コミュニケーションの*退屈な部分* — 分類、日程調整、アーカイブ — を処理し、あなたは本当に頭を使うべき部分に集中できるべきだ、という考えから生まれました。

---

## ライセンス

MIT
