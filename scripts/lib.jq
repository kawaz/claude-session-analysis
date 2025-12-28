# Utility functions

# Recursively remove specified keys
# Usage: omit("signature", "usage", "id")
def omit($keys):
  walk(if type == "object" then with_entries(select(.key | IN($keys[]) | not)) else . end);

# Keep only specified keys (top level only)
# Usage: pick("type", "uuid", "content")
def pick($keys):
  with_entries(select(.key | IN($keys[])));
