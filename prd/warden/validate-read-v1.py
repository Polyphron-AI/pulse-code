"""Validate read-v1 fixtures with jsonschema==4.23.0; no network or runtime I/O."""
from pathlib import Path
from importlib.metadata import version
import hashlib
import json
from jsonschema import Draft202012Validator

if version("jsonschema") != "4.23.0":
    raise SystemExit("Install jsonschema==4.23.0 in an isolated tooling environment")
root = Path(__file__).resolve().parent
fixture = json.loads((root / "fixtures/read-v1.json").read_text(encoding="utf-8"))
validators = []
for name in ["read-v1", "read-authority-v1"]:
    schema = json.loads((root / f"schemas/{name}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    validators.append(Draft202012Validator(schema))
request_validator, authority_validator = validators
for case in fixture["valid"]:
    request_validator.validate(case["request"])
    authority_validator.validate(case["authority"])
    req, auth = case["request"], case["authority"]
    values = [fixture["version"], req["requestId"], req["credentialRef"], req["action"], req["resource"], req["taskRef"], req["attemptRef"], req["payload"]["queryRef"], req["payload"]["lookbackSeconds"]]
    values += [auth[key] for key in ["tenantId", "principalId", "workloadId", "environmentRef", "runtime", "threadRef", "policyVersion", "credentialVersion", "queryVersion", "expiresAt"]]
    canonical = json.dumps(values, ensure_ascii=False, separators=(",", ":"))
    assert canonical == case["canonical"], case["name"]
    assert hashlib.sha256(canonical.encode("utf-8")).hexdigest() == case["sha256"], case["name"]
for case in fixture["invalid"]:
    assert not request_validator.is_valid(case["request"]), case["name"]
print(f"Validated {len(fixture['valid'])} bindings and {len(fixture['invalid'])} rejected requests with jsonschema==4.23.0")
