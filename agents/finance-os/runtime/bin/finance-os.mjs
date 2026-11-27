#!/usr/bin/env node
import { readFile, writeFile, rm, mkdir, chmod, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyntheticKeyProvider, MacOSKeychainProvider } from '../src/keys.mjs';
import { initialize, load, mutate, health, backup, restorePrepare, activateRestore, rotate, retireStoreKey, migratePersistent, startupRecovery, assertSupported } from '../src/storage.mjs';
import { propose, commit, derive, verifyAudit } from '../src/domain.mjs';
import { recoverExportArtifacts } from '../src/import-export.mjs';
import { FinanceError } from '../src/errors.mjs';

const runtime=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const flag=name=>process.argv.includes(name); const command=process.argv[2]||'help';
const dataDir=path.resolve(arg('--data-dir')||path.join(runtime,'.synthetic-data'));
const keys=flag('--keychain')?new MacOSKeychainProvider():new SyntheticKeyProvider();
const output=value=>process.stdout.write(`${JSON.stringify(value,null,2)}\n`);

async function main(){
 switch(command){
  case'install':assertSupported();output({status:'ready',runtime:'Node.js 22',dependencies:'locked (Ajv, official MCP SDK, Zod, and transitive packages)',data_policy:'synthetic-only until explicit real-data pilot approval'});break;
  case'init':if(!flag('--synthetic'))throw new FinanceError('SYNTHETIC_ONLY','Initialization is limited to synthetic data.');try{await access(path.join(dataDir,'store.encrypted.json'));throw new FinanceError('ALREADY_INITIALIZED','The store is already initialized.');}catch(e){if(e.code!=='ENOENT')throw e;}if(flag('--keychain')){for(const purpose of ['store','audit'])try{keys.get(purpose,1);}catch{keys.create(purpose,1);}}output({status:'initialized',store_id:(await initialize(dataDir,keys)).store.store_id});break;
  case'health':output(await health(dataDir,keys));break;
  case'doctor':assertSupported();output({status:'runtime-ready',platform:`${process.platform}-${process.arch}`,node:process.versions.node,crypto:process.versions.openssl,key_provider:'available by explicit mode'});break;
  case'start':await mkdir(dataDir,{recursive:true,mode:0o700});await startupRecovery(dataDir,keys);await recoverExportArtifacts(dataDir,keys);await writeFile(path.join(dataDir,'.service.state.json'),JSON.stringify({state:'ready',at:new Date().toISOString()}),{mode:0o600});await chmod(dataDir,0o700);output({status:'ready',mode:'on-demand local command runtime'});break;
  case'stop':await rm(path.join(dataDir,'.service.state.json'),{force:true});output({status:'stopped'});break;
  case'upgrade':assertSupported();output(await migratePersistent(dataDir,keys));break;
  case'uninstall':if(arg('--confirm')!=='REMOVE-SYNTHETIC-RUNTIME')throw new FinanceError('CONFIRMATION_REQUIRED','Exact uninstall confirmation is required.');await rm(dataDir,{recursive:true,force:true});output({status:'removed',scope:'synthetic runtime data only',keychain_entries:'preserved'});break;
  case'propose':{const store=await load(dataDir,keys);const c=JSON.parse(await readFile(path.resolve(arg('--command')),'utf8'));output(propose(store,c,{owner:arg('--owner')||'synthetic-profile',actor:'local-agent',channel:'local'}));break;}
  case'commit':{const store=await load(dataDir,keys);const p=JSON.parse(await readFile(path.resolve(arg('--proposal')),'utf8'));let result;const next=await mutate(dataDir,keys,store.store_version,s=>{result=commit(s,p,arg('--confirm'),keys.get('audit',1));return result.store;});output({receipt:result.receipt,replayed:result.replayed,store_version:next.store_version});break;}
  case'summary':{const store=await load(dataDir,keys);output({store_version:store.store_version,...derive(store)});break;}
  case'audit-verify':{const store=await load(dataDir,keys);output({status:verifyAudit(store,keys.get('audit',1))?'valid':'invalid',events:store.audit_events.length});break;}
  case'backup':output(await backup(dataDir,path.resolve(arg('--destination')),keys));break;
  case'restore-prepare':output(await restorePrepare(path.resolve(arg('--backup')),path.resolve(arg('--destination')),keys,arg('--store-id'),path.resolve(arg('--activate-to')||dataDir)));break;
  case'restore-activate':{const comparison=JSON.parse(await readFile(path.resolve(arg('--comparison')),'utf8'));output(await activateRestore(path.resolve(arg('--staged')),dataDir,arg('--confirm'),comparison,keys));break;}
  case'rotate-key':{if(!flag('--keychain'))throw new FinanceError('PERSISTENT_KEY_PROVIDER_REQUIRED','Rotation requires the persistent macOS Keychain provider.');const v=Number(arg('--new-version'));keys.create('store',v);output(await rotate(dataDir,keys,v-1,v));break;}
  case'retire-key':{if(!flag('--keychain'))throw new FinanceError('PERSISTENT_KEY_PROVIDER_REQUIRED','Key retirement requires the persistent macOS Keychain provider.');const v=Number(arg('--old-version'));if(arg('--confirm')!==`RETIRE-KEY-v${v}`)throw new FinanceError('CONFIRMATION_REQUIRED','Exact key-retirement confirmation is required.');const backupRoot=arg('--backup-root');output(await retireStoreKey(dataDir,keys,v,{additionalRoots:backupRoot?[path.resolve(backupRoot)]:[]}));break;}
  default:output({commands:['install','doctor','init --synthetic','start','health','propose','commit','summary','audit-verify','backup','restore-prepare','restore-activate','rotate-key','retire-key','stop','upgrade','uninstall']});
 }
}
main().catch(e=>{const code=e instanceof FinanceError?e.code:'INTERNAL_ERROR';process.stderr.write(`${JSON.stringify({status:'error',code,message:e instanceof FinanceError?e.message:'The local operation failed.'})}\n`);process.exitCode=1;});
