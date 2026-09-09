"""Accept a JSON value or a single enclosing Markdown code span/block."""
import json
import re

def parse_json_output(text):
    value = text.strip()
    block = re.fullmatch(r'```(?:json)?\s*\n(.*?)\n```', value, flags=re.DOTALL | re.IGNORECASE)
    if block:
        value = block.group(1).strip()
    elif value.startswith('`') and value.endswith('`') and not value.startswith('``'):
        value = value[1:-1].strip()
    # Reject broken JSON instead of guessing missing fields, quotes or values.
    return json.loads(value)
