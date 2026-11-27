import path from 'node:path';
import { SyntheticKeyProvider } from '../../src/keys.mjs';
import { load } from '../../src/storage.mjs';
import { commitExport, previewExport } from '../../src/import-export.mjs';

const [dataDir, destination] = process.argv.slice(2);
const keys = new SyntheticKeyProvider();
const store = await load(path.resolve(dataDir), keys);
const proposal = await previewExport(store, { format: 'json', destination: path.resolve(destination), encrypted: false });
await commitExport(path.resolve(dataDir), keys, proposal, proposal.confirmation_hash);
