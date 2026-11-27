#!/usr/bin/env python3
"""Dependency-light syntax and semantic checks for Finance OS Phase 1 contracts."""

from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
MEMORY_SCHEMA = ROOT / "memory" / "memory-record.schema.json"
FIXTURES = ROOT / "fixtures"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
MONEY_RE = re.compile(r"^-?(0|[1-9][0-9]*)$")


class ValidationError(Exception):
    pass


def no_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValidationError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicate_pairs)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValidationError(f"{path.relative_to(ROOT)}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def money(value: Any, context: str, currency: str | None = None) -> int:
    require(isinstance(value, dict), f"{context}: money must be an object")
    require(set(value) == {"minor_units", "currency"}, f"{context}: invalid money fields")
    require(isinstance(value["minor_units"], str) and MONEY_RE.fullmatch(value["minor_units"]) is not None, f"{context}: minor_units must be an integer string")
    require(isinstance(value["currency"], str) and re.fullmatch(r"[A-Z]{3}", value["currency"]) is not None, f"{context}: invalid currency")
    if currency:
        require(value["currency"] == currency, f"{context}: expected {currency}, got {value['currency']}")
    return int(value["minor_units"])


def unique(values: list[Any], context: str) -> None:
    require(len(values) == len(set(values)), f"{context}: duplicate values")


def validate_store(store: dict[str, Any]) -> None:
    required = {
        "schema_version", "store_id", "store_version", "preferences", "accounts", "ledger_entries",
        "transfers", "investments", "liabilities", "budgets", "goals", "net_worth_snapshots",
        "exchange_rates", "audit_events", "idempotency_receipts",
    }
    require(required <= set(store), "store: missing required top-level fields")
    require(store["schema_version"] == "1.0.0", "store: unsupported schema_version")
    require(UUID_RE.fullmatch(store["store_id"]) is not None, "store: invalid store_id")
    prefs = store["preferences"]
    require(prefs.get("base_currency") == "THB", "fixture: base currency must exercise THB default")
    require(prefs.get("time_zone") == "Asia/Bangkok", "fixture: time zone must exercise Asia/Bangkok default")

    id_collections = ["accounts", "ledger_entries", "transfers", "investments", "liabilities", "budgets", "goals", "net_worth_snapshots", "exchange_rates", "audit_events"]
    all_ids: list[str] = []
    for collection in id_collections:
        ids = [item.get("id") for item in store[collection]]
        require(all(isinstance(item_id, str) and UUID_RE.fullmatch(item_id) for item_id in ids), f"{collection}: invalid id")
        unique(ids, f"{collection} ids")
        all_ids.extend(ids)
    unique(all_ids, "store-wide record ids")

    accounts = {item["id"]: item for item in store["accounts"]}
    entries = {item["id"]: item for item in store["ledger_entries"]}
    rates = {item["id"]: item for item in store["exchange_rates"]}
    liabilities = {item["id"]: item for item in store["liabilities"]}
    unique([item["idempotency_key"] for item in store["ledger_entries"]], "ledger idempotency keys")
    unique([item["idempotency_key"] for item in store["investments"]], "investment idempotency keys")

    for entry in store["ledger_entries"]:
        require(entry["account_id"] in accounts, f"ledger {entry['id']}: unknown account")
        amount = money(entry["amount"], f"ledger {entry['id']}.amount", accounts[entry["account_id"]]["currency"])
        if entry["entry_type"] in {"transfer_in", "transfer_out"}:
            require("transfer_id" in entry, f"ledger {entry['id']}: transfer_id required")
        if entry["entry_type"] == "reversal":
            require(entry.get("reverses_entry_id") in entries, f"ledger {entry['id']}: invalid reversal target")
        if entry["entry_type"] in {"liability_draw", "liability_principal"}:
            require(entry.get("liability_id") in liabilities, f"ledger {entry['id']}: invalid liability")
        if entry["entry_type"] in {"expense", "transfer_out"}:
            require(amount < 0, f"ledger {entry['id']}: outgoing amount must be negative")
        if entry["entry_type"] in {"income", "transfer_in"}:
            require(amount > 0, f"ledger {entry['id']}: incoming amount must be positive")

    for transfer in store["transfers"]:
        tid = transfer["id"]
        require(transfer["source_account_id"] != transfer["destination_account_id"], f"transfer {tid}: accounts must differ")
        require(transfer["source_account_id"] in accounts and transfer["destination_account_id"] in accounts, f"transfer {tid}: unknown account")
        out_leg = entries.get(transfer["out_entry_id"])
        in_leg = entries.get(transfer["in_entry_id"])
        require(out_leg is not None and in_leg is not None, f"transfer {tid}: missing ledger leg")
        require(out_leg.get("entry_type") == "transfer_out" and in_leg.get("entry_type") == "transfer_in", f"transfer {tid}: wrong leg types")
        require(out_leg.get("transfer_id") == tid and in_leg.get("transfer_id") == tid, f"transfer {tid}: leg linkage mismatch")
        require(out_leg["account_id"] == transfer["source_account_id"] and in_leg["account_id"] == transfer["destination_account_id"], f"transfer {tid}: account linkage mismatch")
        source_value = money(transfer["source_amount"], f"transfer {tid}.source_amount", accounts[transfer["source_account_id"]]["currency"])
        destination_value = money(transfer["destination_amount"], f"transfer {tid}.destination_amount", accounts[transfer["destination_account_id"]]["currency"])
        require(source_value > 0 and destination_value > 0, f"transfer {tid}: declared amounts must be positive")
        require(abs(money(out_leg["amount"], f"transfer {tid}.out_leg")) == source_value, f"transfer {tid}: source amount mismatch")
        require(money(in_leg["amount"], f"transfer {tid}.in_leg") == destination_value, f"transfer {tid}: destination amount mismatch")
        if transfer["source_amount"]["currency"] != transfer["destination_amount"]["currency"]:
            require(transfer.get("exchange_rate_id") in rates, f"transfer {tid}: multicurrency transfer needs exchange rate")

    for investment in store["investments"]:
        require(investment["account_id"] in accounts, f"investment {investment['id']}: unknown account")
        money(investment["cash_amount"], f"investment {investment['id']}.cash_amount", accounts[investment["account_id"]]["currency"])
    for budget in store["budgets"]:
        money(budget["limit"], f"budget {budget['id']}.limit")
    for goal in store["goals"]:
        money(goal["target"], f"goal {goal['id']}.target")
    for snapshot in store["net_worth_snapshots"]:
        base = snapshot["base_currency"]
        assets = money(snapshot["assets"], f"snapshot {snapshot['id']}.assets", base)
        debts = money(snapshot["liabilities"], f"snapshot {snapshot['id']}.liabilities", base)
        total = money(snapshot["net_worth"], f"snapshot {snapshot['id']}.net_worth", base)
        require(assets - debts == total, f"snapshot {snapshot['id']}: net worth arithmetic mismatch")

    accepted = [event for event in store["audit_events"] if event["outcome"] == "accepted"]
    for previous, current in zip(accepted, accepted[1:]):
        require(previous["new_store_version"] == current["previous_store_version"], "audit: non-contiguous store versions")
    if accepted:
        require(accepted[-1]["new_store_version"] == store["store_version"], "audit: final version does not match store")
    receipt_keys = [item["key"] for item in store["idempotency_receipts"]]
    unique(receipt_keys, "idempotency receipt keys")
    require(all(item["store_version"] <= store["store_version"] for item in store["idempotency_receipts"]), "receipt: future store version")


def validate_import(batch: dict[str, Any]) -> None:
    require(batch.get("schema_version") == "1.0.0", "import: unsupported schema_version")
    rows = batch.get("rows")
    require(isinstance(rows, list), "import: rows must be an array")
    unique([row.get("row_number") for row in rows], "import row numbers")
    unique([row.get("normalized_hash") for row in rows], "import normalized hashes")
    unique([row.get("idempotency_key") for row in rows], "import idempotency keys")
    required_payload = {
        "preferences": {"base_currency", "time_zone", "locale", "week_starts_on", "fiscal_year_start_month"},
        "account": {"id", "created_at", "updated_at", "status", "name", "account_type", "currency", "include_in_net_worth"},
        "ledger_entry": {"id", "created_at", "updated_at", "status", "entry_type", "account_id", "amount", "occurred_at", "posting_status", "idempotency_key"},
        "transfer": {"id", "created_at", "updated_at", "status", "source_account_id", "destination_account_id", "out_entry_id", "in_entry_id", "source_amount", "destination_amount", "occurred_at"},
    }
    allowed = {"preferences", "account", "ledger_entry", "transfer", "investment", "liability", "budget", "goal", "net_worth_snapshot", "exchange_rate"}
    for row in rows:
        require(row.get("record_type") in allowed, f"import row {row.get('row_number')}: unsupported record type")
        require(re.fullmatch(r"[a-f0-9]{64}", str(row.get("normalized_hash", ""))) is not None, f"import row {row.get('row_number')}: invalid hash")
        require(isinstance(row.get("idempotency_key"), str) and len(row["idempotency_key"]) >= 8, f"import row {row.get('row_number')}: invalid idempotency key")
        needed = required_payload.get(row["record_type"], {"id"})
        require(isinstance(row.get("payload"), dict) and needed <= set(row["payload"]), f"import row {row.get('row_number')}: incomplete payload")


def validate_envelope(item: dict[str, Any]) -> None:
    require(item.get("algorithm") in {"AES-256-GCM", "XCHACHA20-POLY1305"}, "envelope: unsupported algorithm")
    require(("wrapped_dek_b64" in item) != ("kdf" in item), "envelope: use exactly one key derivation mode")
    decoded: dict[str, bytes] = {}
    for field in ("nonce_b64", "aad_b64", "ciphertext_b64"):
        try:
            decoded[field] = base64.b64decode(item[field], validate=True)
        except Exception as exc:
            raise ValidationError(f"envelope: invalid {field}") from exc
    expected_nonce = 12 if item["algorithm"] == "AES-256-GCM" else 24
    require(len(decoded["nonce_b64"]) == expected_nonce, "envelope: nonce length does not match algorithm")
    require(len(decoded["ciphertext_b64"]) >= 16, "envelope: ciphertext must include an authentication tag")


def find_sensitive_key(value: Any, path: str = "content") -> str | None:
    forbidden = {"password", "passphrase", "secret", "token", "api_key", "account_number", "credential", "private_key", "recovery_code"}
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in forbidden:
                return f"{path}.{key}"
            found = find_sensitive_key(child, f"{path}.{key}")
            if found:
                return found
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found = find_sensitive_key(child, f"{path}[{index}]")
            if found:
                return found
    return None


def validate_memory(item: dict[str, Any]) -> None:
    required = {"schema_version", "memory_id", "profile_id", "memory_type", "status", "version", "purpose", "value", "source", "confirmation", "idempotency_key", "created_at", "updated_at"}
    require(required <= set(item), "memory: missing canonical fields")
    require(item.get("schema_version") == "1.0.0", "memory: unsupported schema version")
    require(UUID_RE.fullmatch(str(item.get("memory_id", ""))) is not None, "memory: invalid memory_id")
    require(UUID_RE.fullmatch(str(item.get("profile_id", ""))) is not None, "memory: invalid profile_id")
    require(item.get("memory_type") in {"preference", "alias", "categorization_rule", "import_mapping", "workflow_checkpoint"}, "memory: invalid memory_type")
    require(item.get("status") in {"active", "archived", "expired"}, "memory: invalid status")
    require(item.get("confirmation", {}).get("confirmed") is True, "memory: explicit confirmation required")
    require(isinstance(item.get("idempotency_key"), str) and len(item["idempotency_key"]) >= 8, "memory: invalid idempotency key")
    sensitive = find_sensitive_key(item.get("value"), "value")
    require(sensitive is None, f"memory: forbidden sensitive field {sensitive}")


def validate_export(item: dict[str, Any]) -> None:
    require(item.get("schema_version") == "1.0.0", "export: unsupported schema version")
    require(isinstance(item.get("encrypted"), bool), "export: encrypted must be boolean")
    require(item.get("format") in {"csv", "json"}, "export: invalid format")
    require(isinstance(item.get("record_counts"), dict), "export: record counts must be an object")
    require(isinstance(item.get("scope"), dict), "export: disclosure scope must be an object")
    if item["encrypted"]:
        require(isinstance(item.get("key_id"), str) and item["key_id"], "export: encrypted manifest requires key_id")
        require(item.get("envelope_version") == "1", "export: encrypted manifest requires supported envelope version")
    else:
        require("key_id" not in item and "envelope_version" not in item, "export: plaintext manifest must not claim encryption metadata")


def validate_backup(item: dict[str, Any]) -> None:
    require(isinstance(item.get("generation"), int) and item["generation"] >= 1, "backup: invalid generation")
    require(str(item.get("envelope_file", "")).endswith(".enc"), "backup: envelope file must end in .enc")
    require(re.fullmatch(r"[a-f0-9]{64}", str(item.get("ciphertext_sha256", ""))) is not None, "backup: invalid ciphertext hash")
    require(item.get("verification_status") in {"pending", "verified", "failed"}, "backup: invalid verification status")
    if item["verification_status"] == "verified":
        require(isinstance(item.get("verified_at"), str), "backup: verified_at required when verified")


def main() -> int:
    schema_ids: list[str] = []
    schema_paths = [*sorted(SCHEMAS.glob("*.json")), MEMORY_SCHEMA]
    for path in schema_paths:
        schema = load_json(path)
        require(schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema", f"{path.name}: wrong JSON Schema draft")
        require(isinstance(schema.get("$id"), str), f"{path.name}: missing $id")
        schema_ids.append(schema["$id"])
    unique(schema_ids, "schema ids")

    validate_store(load_json(FIXTURES / "synthetic-store.valid.json"))
    try:
        validate_store(load_json(FIXTURES / "synthetic-store.invalid-duplicate.json"))
    except ValidationError:
        pass
    else:
        raise ValidationError("negative store fixture was unexpectedly accepted")
    validate_import(load_json(FIXTURES / "synthetic-import.valid.json"))
    validate_envelope(load_json(FIXTURES / "synthetic-envelope.valid.json"))
    validate_memory(load_json(FIXTURES / "synthetic-memory.valid.json"))
    validate_export(load_json(FIXTURES / "synthetic-export-manifest.valid.json"))
    validate_backup(load_json(FIXTURES / "synthetic-backup-manifest.valid.json"))
    print(f"OK: {len(schema_ids)} schemas, 6 positive fixtures, 1 expected-negative fixture")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValidationError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
