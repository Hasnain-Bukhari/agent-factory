import { load, mutate } from '../../src/storage.mjs';
import { SyntheticKeyProvider } from '../../src/keys.mjs';

const dir = process.argv[2];
const keys = new SyntheticKeyProvider();
const store = await load(dir, keys);
await mutate(dir, keys, store.store_version, next => {
  next.store_version += 1;
  return next;
});
