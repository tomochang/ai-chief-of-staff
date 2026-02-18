# Claude Code Triage Kit

**Claude Codeを、あなた専用のコミュニケーションOSに。**

朝、ターミナルで `/today` と打つ。それだけで:

- **未読メール20件を自動分類** — Bot通知やニュースレターは見せずにアーカイブ。本当に返信が必要なものだけ表示
- **Slackのメンション・DMを一覧化** — 未回答のスレッドだけ浮かび上がらせる
- **今日のカレンダーを表示** — 会議リンクが未登録なら、メールから自動補完
- **要返信メールに返信案を生成** — あなたの文体・署名・過去のやり取りを踏まえて
- **日程調整なら空き時間を自動計算** — カレンダーから候補を抽出、午前NGなどの好みも反映
- **送信後のカレンダー登録・Todo更新・記録を全自動** — Hookで強制するから、抜け漏れゼロ

やっていることは単純です。メール・Slack・カレンダーという3つの入力を、**分類 → 判断支援 → 実行 → 記録**のパイプラインに通す。Claude Codeの `/command` をワークフローエンジンとして使い、Hookで信頼性を担保し、Gitでナレッジを永続化する。

コードは書きません。SDKもAPIラッパーも不要。**Markdownのプロンプトを編集するだけで動作が変わります。**

```
$ claude /today

# 今日のブリーフィング — 2026年2月18日（火）

## スケジュール (3件)
| 時間        | 予定                   | 場所/リンク        |
|-------------|------------------------|--------------------|
| 10:00-11:00 | チームスタンドアップ    | Zoom: https://...  |
| 14:00-15:00 | クライアントMTG        | 丸の内タワー        |
| 19:00-      | 飲み @恵比寿           | たつや              |

## メール — スキップ (5件) → 自動アーカイブ済み
## メール — 要返信 (2件)

### 1. 山田花子 <hanako@example.com>
**件名**: Q2プロジェクトのキックオフ日程
**要点**: 来週以降でキックオフMTGの候補日を聞いている

**返信案**:
ご連絡ありがとうございます。
以下の日程でいかがでしょうか。...

→ [送信] [編集] [スキップ]
```

---

## 仕組み

このキットは、メールとSlackに**4段階のトリアージシステム**を導入します:

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
4. Git commit & push（ナレッジをバージョン管理）
5. 処理済みメールをアーカイブ

**Hookは全ステップが完了するまで処理をブロックします。** 送信後処理をうっかりスキップすることはできません。

---

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│  Commands (.claude/commands/*.md)            │
│  /mail  /slack  /today  /schedule-reply      │
│  ↳ ユーザー向けエントリポイント              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Skills (skills/*/SKILL.md)                  │
│  ↳ 再利用可能なマルチフェーズワークフロー    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Hooks (hooks/post-send.sh)                  │
│  ↳ PostToolUse 強制レイヤー                  │
│  ↳ チェックリスト完了まで処理をブロック      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Scripts (scripts/calendar-suggest.js)       │
│  ↳ 決定的ロジック（LLM不要）                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│  Knowledge Files (private/)                  │
│  ↳ relationships.md, todo.md, preferences.md│
│  ↳ Gitでバージョン管理された永続メモリ       │
└─────────────────────────────────────────────┘
```

### なぜこの設計か？

**Commandはコードではなくプロンプト。** 各 `.md` ファイルは、Claude Codeに手順を伝える構造化プロンプトです。SDK不要、APIラッパー不要、ビルド不要。Markdownを編集して保存すれば、次の呼び出しから即座に動作が変わります。

**Hookが信頼性を保証する。** LLMはステップを飛ばします。後処理を忘れます。`PostToolUse` Hookは `gmail send` コマンドを検知し、チェックリストが完了するまでブロックします。これがシステム全体で最も重要なパーツです — これがなければ、成功率は99%ではなく80%になります。

**Scriptが決定的ロジックを担当。** カレンダーの空き時間計算にLLMは不要です。`calendar-suggest.js` がカレンダーを取得し、空きスロットを見つけ、好み（午前NG、移動バッファ等）を反映し、フォーマット済みの候補を出力します。LLMの仕事は出力を整形してメールを書くことであり、時間計算ではありません。

**Knowledge Filesがあなたの記憶。** Claude Codeのセッションはステートレスです。関係性、好み、Todoはマークダウンファイルに永続化され、Gitでバージョン管理されます。毎セッション開始時にこれらを読み込むことで、継続性が保たれます。

---

## クイックスタート

### 前提条件

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) がインストール・設定済み
- Gmail CLIツール（本キットは [`gog`](https://github.com/pterm/gog) を使用。Gmail検索・送信・アーカイブができるCLIなら何でも可）
- Node.js 18+（`calendar-suggest.js` 用）
- （オプション）Claude CodeにSlack MCPサーバーを設定済み

### 1. テンプレートファイルをコピー

```bash
# CommandsはClaude Codeのコマンドディレクトリへ
cp commands/mail.md ~/.claude/commands/
cp commands/slack.md ~/.claude/commands/
cp commands/today.md ~/.claude/commands/
cp commands/schedule-reply.md ~/.claude/commands/

# Skills、Hooks、Scriptsはワークスペースへ
mkdir -p ~/your-workspace/{skills/schedule-reply,hooks,scripts,private}
cp skills/schedule-reply/SKILL.md ~/your-workspace/skills/schedule-reply/
cp hooks/post-send.sh ~/your-workspace/hooks/
cp scripts/calendar-suggest.js ~/your-workspace/scripts/
cp examples/SOUL.md ~/your-workspace/
```

### 2. 自分の情報を設定

各ファイル内のプレースホルダーを書き換えます。`YOUR_` で検索すると全箇所が見つかります:

```bash
grep -r "YOUR_" commands/ skills/ hooks/ scripts/
```

主なプレースホルダー:

| プレースホルダー | 例 | 使用箇所 |
|------------------|-----|---------|
| `YOUR_EMAIL` | `alice@gmail.com` | mail.md, today.md |
| `YOUR_WORK_EMAIL` | `alice@company.com` | mail.md, today.md |
| `YOUR_NAME` | `Alice` | slack.md, today.md |
| `YOUR_SIGNATURE` | `Alice` | mail.md, schedule-reply |
| `YOUR_WORKSPACE` | `~/workspace` | hooks, scripts |
| `YOUR_CALENDAR_ID` | `primary` | calendar-suggest.js |
| `YOUR_SKIP_DOMAINS` | `@company-internal.com` | mail.md |

### 3. ナレッジファイルを初期化

```bash
cd ~/your-workspace

# 関係性ノート（知り合い、返信時のコンテキスト）
cat > private/relationships.md << 'EOF'
# Relationships

## 田中太郎（Acme社）
- 役職: 開発部VP
- 文脈: API連携プロジェクト進行中
- 最終: 2/15 Q2ローンチのタイムラインを議論
EOF

# 好み設定
cat > private/preferences.md << 'EOF'
# Preferences

## スケジューリング
- 午後優先（11:00以降）
- 平日のみ、9:00-18:00
- 候補は3〜5個提示
- 署名: YOUR_SIGNATURE
EOF

# Todoリスト
cat > private/todo.md << 'EOF'
# Todo

## 直近の予定
| 日付 | 予定 | ステータス |
|------|------|-----------|
EOF
```

### 4. Hookを設定

プロジェクトの `.claude/settings.local.json` に送信後Hookを追加:

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
  }
}
```

### 5. 権限を設定

よく使うGmail CLIコマンドの事前承認を `.claude/settings.local.json` に追加:

```json
{
  "permissions": {
    "allow": [
      "Bash(gog gmail search*)",
      "Bash(gog gmail thread*)",
      "Bash(gog gmail send*)",
      "Bash(gog gmail thread modify*)",
      "Bash(gog calendar*)",
      "Bash(node */scripts/calendar-suggest.js*)",
      "Skill(mail)",
      "Skill(slack)",
      "Skill(today)",
      "Skill(schedule-reply)"
    ]
  }
}
```

### 6. 試してみる

```bash
claude /mail          # メールのトリアージ
claude /slack         # Slackのトリアージ
claude /today         # 朝のブリーフィング（メール + Slack + カレンダー）
claude /schedule-reply "来週の田中さんとのMTGについて返信して"
```

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
claude-code-triage/
├── commands/
│   ├── mail.md              # /mail — メールトリアージ
│   ├── slack.md             # /slack — Slackトリアージ
│   ├── today.md             # /today — 朝のブリーフィング
│   └── schedule-reply.md    # /schedule-reply — 日程調整ワークフロー
├── skills/
│   └── schedule-reply/
│       └── SKILL.md         # マルチフェーズ日程調整スキル
├── hooks/
│   └── post-send.sh         # PostToolUse送信後強制Hook
├── scripts/
│   └── calendar-suggest.js  # 空き時間検索スクリプト
├── examples/
│   └── SOUL.md              # ペルソナ設定テンプレート
└── README.md                # 英語版
└── README.ja.md             # このファイル
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
