import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { fail } from './errors.mjs';

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaFiles = {
  store: 'schemas/finance-store.schema.json',
  import: 'schemas/import-batch.schema.json',
  envelope: 'schemas/encryption-envelope.schema.json',
  export: 'schemas/export-manifest.schema.json',
  backup: 'schemas/backup-manifest.schema.json',
  memory: 'memory/memory-record.schema.json'
};
const schemas = Object.fromEntries(Object.entries(schemaFiles).map(([name, relative]) => [name, JSON.parse(readFileSync(path.join(agentRoot, relative), 'utf8'))]));

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, validateFormats: true });
ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat('date-time', value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)));
ajv.addFormat('date', value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number), parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
});
for (const schema of Object.values(schemas)) ajv.addSchema(schema);
const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.getSchema(schema.$id)]));

export function validateSchema(name, value) {
  const validate = validators[name];
  if (!validate) throw new Error(`Unknown canonical schema: ${name}`);
  const valid = validate(value);
  return { valid, errors: valid ? [] : (validate.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`) };
}

export function assertSchema(name, value) {
  const result = validateSchema(name, value);
  if (!result.valid) fail('SCHEMA_VALIDATION_FAILED', `Canonical ${name} validation failed: ${result.errors.slice(0, 5).join('; ')}`);
  return value;
}

export const canonicalSchemaNames = Object.freeze(Object.keys(schemaFiles));
