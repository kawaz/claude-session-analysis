# `/btw` コマンドと fork のセッションファイル記録挙動

Claude Code の `/btw`（脇道質問）と fork（`/btw` 内 fork / `/fork`）が、セッションの
jsonl・history.jsonl・その他永続ファイルにどう記録されるかを実セッションで実測した結果。
CSA はこれらの永続ファイルを解析対象とするため、「何が残り何が残らないか」「fork の親子関係を
どう判定するか」を確定させる。

## 判明した事実

### fork しない `/btw` は完全にエフェメラル（どこにも残らない）

- `/btw` を実行して回答させ、fork せずに Esc で閉じると、会話 jsonl・history.jsonl・
  その他いかなる永続ファイルにも一切記録されない。
- 脇道の内容は UI の btw 履歴パネル（↑/↓ でスクロール、`x` で clear）の**メモリ上だけ**に存在し、
  resume すると btw 履歴パネルは空になる（実機確認: 単発 btw 後に resume → 履歴は復元されない）。
- 一意文字列 `aaaaiiiiuuuueeeeoooo` と `1+1は？` で検証。会話 jsonl・history.jsonl・
  `~/.claude-personal/.claude.json`・`~/.claude.json` のどこにも btw 実行痕跡なし。
- **CSA の解析対象には fork しない btw は存在しない。** 分析できるのは fork した脇道のみ。

### fork した分（`/btw` 内 fork または `/fork`）だけが永続化される

fork すると **fork 先の新セッション jsonl が生成**され、以下が残る:

- fork 先の各「親からのコピー entry」に `"forkedFrom":{"sessionId":"<親sessionId>"}` が付与される
  （親からコピーされた entry の証）。
- 親からのコピーが N 件、その後に fork 後の新規 entry が続く。**fork 後最初の新規 entry の uuid =
  forkFirstNewUuid**。その entry は `type:"user"` で、内容は fork 時の args（`/btw <args>` / `/fork <args>`）が
  そのまま最初の user prompt になる。
- fork 先に `type:"system", subtype:"local_command"` の
  `<command-name>/btw</command-name><command-args>...</command-args>`（`/fork` の場合は `/fork`）が記録される。
- fork 先の `agentName` / `customTitle` が `"btw: <args>"`（`/btw` の場合）に設定される。
- history.jsonl（↑キーのプロンプト入力履歴）にも `/btw <args>` / `/fork <args>` が残る
  （**fork したものだけ**。fork しない btw は history にも残らない）。

### `/btw` fork と `/fork` で「Branched conversation」stdout の有無が異なる

- **`/btw` fork のみ** fork 先に次の `local_command` stdout が記録される:

  ```
  Branched conversation "btw: <args>". You are now in the new branch (session <fork先id>).
  Use /resume <親id> to return to the original, or run `claude -r <親id>` in a new terminal.
  ```

- **素の `/fork`** には "Branched conversation" 文字列は記録されない
  （`<command-name>/fork</command-name>` の `local_command` + `forkedFrom` のみ）。
- 両者とも `forkedFrom` 機構は共通（= 同一の fork 機構の上に btw のラッパが乗っている）。
  判別したい場合は "Branched conversation"（system/local_command entry 内）の有無が指標になる。

### fork は片方向（子→親のみ）。fork 元（親）には痕跡ゼロ

- 親セッションには `forkedFrom` も "Branched conversation" 記録（system/local_command）も
  一切残らない。親が fork 後も動き続けても、子の存在は親側に記録されない。
- 「あるセッションに子（fork）があるか」は親単独では判定不能。
  → 子の `forkedFrom` を全セッション横断で逆引きするしかない。

### 自己参照ノイズの注意（CSA 固有の落とし穴）

- セッションを「そのセッション自身の中で」解析すると、解析出力（grep 結果や `forkedFrom` の文字列）が
  会話ログに tool_result（user entry）/ assistant entry として追記され、後続の grep が自分の出力を拾う。
- 実際、ある親セッションに `forkedFrom` / "Branched conversation" が多数あるように見えたが、
  すべて自分の解析出力の混入だった（本検証でも 1 サンプルで再現、後述）。
- **見分け方**: 真の fork 記録は `type:"system", subtype:"local_command"` entry に入る。
  ノイズは `user`（tool_result）/ `assistant`（text）entry に入る。entry type で弾ける。
- 解析は別セッション / 別ツール（jsonl を直接読む外部スクリプト等）で行うのが安全。

## 実用的な示唆

- **PR②（`sessions --format jsonl`）の `forkedFrom` / `forkFirstNewUuid` 設計**は、
  子側の自己完結情報だけで算出できる（親に問い合わせ不要）。親→子の逆引きは消費側の責務とする。
- **ノイズ分類（`classifyUserTurnKind`）の `effectiveUserTurns` と合わせると**、
  「fork した脇道のみが解析対象、fork しない btw は分析対象に存在しない」という前提が成立する。
  解析パイプラインで「失われた脇道」を取り戻そうとしても、fork なし btw は原理的に復元不可。
- **親子判定を実装する際は entry type でフィルタする**こと（`forkedFrom` / "Branched conversation" は
  `system/local_command` entry のみ信頼する）。`grep` 文字列マッチだけだと自己参照ノイズを拾う。
- **`/btw` fork と `/fork` を区別したい**消費側は "Branched conversation"（system entry）の有無で判定できる。
  両者とも `forkedFrom` を持つので、`forkedFrom` だけでは btw 由来か素の fork かは判別できない。

## 検証の詳細

### 親→子 fork ペアの横断確認（fork の片方向性）

`~/.claude-personal/projects/` 配下を `grep -rl '"forkedFrom":{' --include='*.jsonl'` で
fork 先ファイル（子）に絞り、各子から親 sessionId を逆引き。親ファイルを探して
`forkedFrom` / "Branched conversation"（system/local_command）の不在を確認した。
（sessionId は先頭 8 桁に短縮表記。）

| 子 (8桁)   | プロジェクト             | コマンド | 子の forkedFrom entry 数 | 親 (8桁)   | 親の forkedFrom | 親の真の fork 記録 (system/local_command) |
| ---------- | ------------------------ | -------- | ------------------------ | ---------- | --------------- | ----------------------------------------- |
| `c1e81ed5` | ある個人リポ             | `/fork`  | 607                      | `93c8e74a` | 0               | なし                                       |
| `ff2888a4` | ある個人リポ             | `/fork`  | 1641                     | `e753ea58` | 0               | なし                                       |
| `781046d9` | claude-session-analysis  | `/btw`   | 108                      | `844b6d2b` | 0               | なし（後述のノイズのみ）                   |

3 ペアすべてで親側の `forkedFrom` は 0。よって **fork は子→親の片方向**で、
親には fork の痕跡が残らないことを 3 サンプルで裏取りした。

- うち 2 ペア（`c1e81ed5`, `ff2888a4`）は素の `/fork`。fork 先に
  `<command-name>/fork</command-name>` の local_command + `forkedFrom` を持つが、
  "Branched conversation" 文字列は持たない。→ 「`/btw` fork と `/fork` が同一機構（forkedFrom 共通）／
  ただし btw のみ Branched stdout を持つ」の裏取りになった。
- 残り 1 ペア（`781046d9`）が `/btw` fork。fork 先に
  `<command-name>/btw</command-name>` + args `柏市の今日の最高気温` の local_command、
  `agentName`/`customTitle` = `"btw: 柏市の今日の最高気温"`、および "Branched conversation"
  stdout を持つ。forkFirstNewUuid = `4bc4576a...`（`type:"user"`、内容 = `柏市の今日の最高気温`）。

### 自己参照ノイズの再現（親 `844b6d2b`）

親 `844b6d2b`（= CSA 自身を CSA で解析していたセッション）では、表面上
"Branched conversation" が 14 回、`<command-name>/btw</command-name>` が 17 回出現した。
しかし entry type で分類すると:

| 文字列                          | 出現 entry type             | 件数 | 真の fork 記録か |
| ------------------------------- | --------------------------- | ---- | ---------------- |
| `Branched conversation`         | `user`（tool_result）       | 4    | ✗ ノイズ         |
| `Branched conversation`         | `assistant`（text）         | 10   | ✗ ノイズ         |
| `<command-name>/btw</command-name>` | `user`（tool_result）   | 4    | ✗ ノイズ         |
| `<command-name>/btw</command-name>` | `assistant`（text）     | 6    | ✗ ノイズ         |
| （`system`/`local_command` entry） | —                        | 0    | （真の記録は 0） |

真の fork 記録が入るべき `system`/`local_command` entry には 1 件も無く、
すべて自身の解析出力が会話ログに混入したもの。**親に fork 痕跡があるように見えても、
entry type が `system`/`local_command` でなければ偽**、という見分け方が確定した。
