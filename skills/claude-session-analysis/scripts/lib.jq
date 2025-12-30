# Utility functions

# Recursively remove specified keys
# Usage: omit(["signature", "usage", "id"])
def omit($keys):
  walk(if type == "object" then with_entries(select(.key | IN($keys[]) | not)) else . end);

# Format byte size in human readable format
def format_size:
  if . >= 1048576 then "\(. / 1048576 | . * 10 | floor / 10)M"
  elif . >= 1024 then "\(. / 1024 | . * 10 | floor / 10)K"
  else "\(.)B"
  end;

# Recursively replace specified keys with placeholder showing size
# Usage: redact(["data", "secret"])
def redact($keys):
  walk(if type == "object" then with_entries(
    if .key | IN($keys[]) then
      .value = "[omitted:\(.value | tostring | length | format_size)]"
    else . end
  ) else . end);

# Redact with hint for --no-redact option (use with --raw)
def redact_with_hint($keys):
  walk(if type == "object" then with_entries(
    if .key | IN($keys[]) then
      .value = "[omitted:\(.value | tostring | length | format_size) --raw --no-redact]"
    else . end
  ) else . end);

# Keep only specified keys (top level only)
# Usage: pick(["type", "uuid", "content"])
def pick($keys):
  with_entries(select(.key | IN($keys[])));
