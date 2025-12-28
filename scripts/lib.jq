# 汎用ユーティリティ関数

# 指定したキーを再帰的に削除
# Usage: omit("signature", "usage", "id")
def omit($keys):
  walk(if type == "object" then with_entries(select(.key | IN($keys[]) | not)) else . end);

# 指定したキーだけを残す（トップレベルのみ）
# Usage: pick("type", "uuid", "content")
def pick($keys):
  with_entries(select(.key | IN($keys[])));
