import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalSchemaNames, validateSchema } from '../src/schema.mjs';

const agentRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const readJson=async relative=>JSON.parse(await readFile(path.join(agentRoot,relative),'utf8'));

test('locked Ajv Draft 2020-12 compiles every canonical schema and accepts every positive fixture',async()=>{
  assert.deepEqual([...canonicalSchemaNames].sort(),['backup','envelope','export','import','memory','store']);
  const fixtures={
    store:'fixtures/synthetic-store.valid.json',
    import:'fixtures/synthetic-import.valid.json',
    envelope:'fixtures/synthetic-envelope.valid.json',
    export:'fixtures/synthetic-export-manifest.valid.json',
    backup:'fixtures/synthetic-backup-manifest.valid.json',
    memory:'fixtures/synthetic-memory.valid.json'
  };
  for(const[name,file]of Object.entries(fixtures)){
    const result=validateSchema(name,await readJson(file));
    assert.equal(result.valid,true,`${name}: ${result.errors.join('; ')}`);
  }
});

test('Draft 2020-12 validators reject representative structural violations for every schema',async()=>{
  const invalid={
    store:{...(await readJson('fixtures/synthetic-store.valid.json')),store_version:1.5},
    import:{...(await readJson('fixtures/synthetic-import.valid.json')),rows:'not-an-array'},
    envelope:{...(await readJson('fixtures/synthetic-envelope.valid.json')),nonce_b64:'short'},
    export:{...(await readJson('fixtures/synthetic-export-manifest.valid.json')),format:'xml'},
    backup:{...(await readJson('fixtures/synthetic-backup-manifest.valid.json')),verification_status:'verified',verified_at:undefined},
    memory:{...(await readJson('fixtures/synthetic-memory.valid.json')),status:'deleted'}
  };
  delete invalid.backup.verified_at;
  for(const[name,value]of Object.entries(invalid))assert.equal(validateSchema(name,value).valid,false,name);
  assert.equal(validateSchema('store',await readJson('fixtures/synthetic-store.invalid-duplicate.json')).valid,true,'duplicate identifiers require semantic validation beyond JSON Schema');
});
