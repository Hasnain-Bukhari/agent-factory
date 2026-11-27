#!/usr/bin/env node
import path from 'node:path';
import { MacOSKeychainProvider } from '../src/keys.mjs';
import { createMcpHttpServer, loadCredentialFile } from '../src/mcp.mjs';
import { assertSupported } from '../src/storage.mjs';
const arg=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:undefined;};
async function main(){assertSupported();const dataDir=arg('--data-dir'),credentialFile=arg('--credential-file'),port=Number(arg('--port')||8400);if(!dataDir||!credentialFile)throw new Error('Both paths are required.');if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port.');const credentials=await loadCredentialFile(path.resolve(credentialFile)),keys=new MacOSKeychainProvider(),service=createMcpHttpServer({dataDir:path.resolve(dataDir),keys,...credentials,port}),running=await service.start();process.stdout.write(`${JSON.stringify({status:'ready',url:running.url,transport:'streamable-http',response_mode:'json',binding:'loopback',authentication:'bearer-required'})}\n`);const stop=async()=>{await running.close();process.exitCode=0;};process.once('SIGINT',stop);process.once('SIGTERM',stop);}
main().catch(()=>{process.stderr.write(`${JSON.stringify({status:'error',code:'MCP_START_FAILED'})}\n`);process.exitCode=1;});
