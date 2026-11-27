import { createHash } from 'node:crypto';

const UUID=/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const CONFIRM=/^Confirm proposal ([0-9a-f-]{36}) with hash ([a-f0-9]{64})$/;
const CANCEL=/^Cancel proposal ([0-9a-f-]{36})$/;
const normalize=text=>text.trim().replace(/\s+/g,' ');
const sourceEventId=text=>`chat:${createHash('sha256').update(normalize(text).toLowerCase()).digest('hex')}`;

export function classifyPrompt(message){
 const text=normalize(message).toLowerCase();
 if(!text)return'unsupported';
 if(CONFIRM.test(message)||CANCEL.test(message))return'pending-control';
 if(/\b(finance os|my accounts?|my balances?|my expenses?|my income|my budget|my net worth|record|create|archive|correct|transfer)\b/.test(text)){
  if(/\b(overview|summary|totals?|how am i doing)\b/.test(text))return'overview';
  if(/\b(list|show|which|what|choose|find)\b.*\baccounts?\b/.test(text))return'accounts';
  if(/\b(record|create|archive|reactivate|correct|post|reverse|transfer|update)\b/.test(text))return'write';
 }
 return'unsupported';
}

function parseMoney(text){
 const match=text.match(/(?:฿\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(THB|USD|EUR|GBP))/i);
 if(!match)return null;const decimal=match[1]||match[2],currency=(match[1]?'THB':match[3]).toUpperCase();const[whole,fraction='']=decimal.split('.');return{minor_units:(BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2))).toString(),currency};
}
function parseToolResult(result){if(result?.structuredContent)return result.structuredContent;try{return JSON.parse(result?.content?.[0]?.text||'{}');}catch{return{status:'error',code:'INVALID_TOOL_RESULT'};}}

export class SyntheticChatExperience{
 constructor({client,now=()=>new Date(),maxRetainedPending=1}){this.client=client;this.now=now;this.maxRetainedPending=maxRetainedPending;this.pending=null;this.calls=[];}
 retainedState(){return this.pending?{proposal_id:this.pending.proposal_id,confirmation_hash:this.pending.confirmation_hash,expires_at:this.pending.expires_at,source_event_id:this.pending.source_event_id}:null;}
 async call(name,args){this.calls.push({name,args:structuredClone(args)});return parseToolResult(await this.client.callTool({name,arguments:args}));}
 async turn(message,{source='user'}={}){
  if(source!=='user')return{status:'inert_untrusted_data',tool_calls:[],retained:this.retainedState()};
  const before=this.calls.length,cancel=message.match(CANCEL),confirm=message.match(CONFIRM);
  if(cancel){if(this.pending?.proposal_id===cancel[1]){this.pending=null;return{status:'cancelled',proposal_id:cancel[1],tool_calls:this.calls.slice(before)}}return{status:'no_matching_proposal',tool_calls:[]};}
  if(confirm){
   if(!this.pending||this.pending.proposal_id!==confirm[1]||this.pending.confirmation_hash!==confirm[2]||message!==this.pending.required_confirmation)return{status:'confirmation_not_accepted',tool_calls:[]};
   const result=await this.call('finance_commit_proposal',{proposal_id:confirm[1],confirmation_hash:confirm[2]});this.pending=null;
   if(result.status==='error')return{status:'error',code:result.code,tool_calls:this.calls.slice(before),retained:null};
   return{status:'receipt',action:result.receipt.command_type,accepted_at:result.receipt.accepted_at,result_ids:result.receipt.result_ids,store_version:result.store_version,balance_effects:result.receipt.balance_effects||[],audit_id:result.receipt.audit_id,replayed:result.replayed,tool_calls:this.calls.slice(before),retained:null};
  }
  if(/^\s*(yes|ok|okay|confirm|do it|looks good)\s*[.!]?\s*$/i.test(message))return{status:'confirmation_not_accepted',required_confirmation:this.pending?.required_confirmation||null,tool_calls:[]};
  const kind=classifyPrompt(message);
  if(kind==='overview'){
   const result=await this.call('finance_get_overview',{});if(result.status==='error')return{status:'error',code:result.code,tool_calls:this.calls.slice(before)};
   return{status:'read',kind:'overview',observed_at:result.observed_at,recorded:{store_version:result.store_version,base_currency:result.base_currency,time_zone:result.time_zone,counts:result.counts},derived:{account_balance_totals:result.account_balance_totals},labels:result.labels,tool_calls:this.calls.slice(before)};
  }
  if(kind==='accounts'){
   const result=await this.call('finance_list_accounts',{offset:0,limit:25});if(result.status==='error')return{status:'error',code:result.code,tool_calls:this.calls.slice(before)};
   return{status:'read',kind:'accounts',observed_at:result.observed_at,data_label:result.data_label,accounts:result.accounts,next_offset:result.next_offset,tool_calls:this.calls.slice(before)};
  }
  if(kind!=='write')return{status:'unsupported',professional_boundary:/\b(invest|tax|legal|guarantee|recommend)\b/i.test(message),tool_calls:[]};

  let command;const money=parseMoney(message),id=message.match(UUID)?.[0];
  if(/\bexpense\b/i.test(message)){
   const missing=[];if(!money)missing.push('amount and currency');if(!id)missing.push('account');
   if(missing.length){let accounts=[];if(!id){const listed=await this.call('finance_list_accounts',{offset:0,limit:25});accounts=listed.accounts||[];}return{status:'ambiguity',unresolved:missing,accounts,tool_calls:this.calls.slice(before)};}
   command={type:'record_expense',account_id:id,amount:{...money,minor_units:`-${money.minor_units}`},occurred_at:this.now().toISOString()};
  }else if(/\b(create|add)\b.*\baccount\b/i.test(message)){
   const currency=message.match(/\b(THB|USD|EUR|GBP)\b/i)?.[1]?.toUpperCase(),name=message.match(/\bnamed\s+["']([^"']+)["']/i)?.[1];const missing=[];if(!name)missing.push('account name');if(!currency)missing.push('currency');if(missing.length)return{status:'ambiguity',unresolved:missing,accounts:[],tool_calls:[]};command={type:'create_account',name,currency};
  }else return{status:'unsupported_write',tool_calls:[]};
  const eventId=sourceEventId(message),result=await this.call('finance_propose_command',{source_event_id:eventId,command});
  if(result.status==='error')return{status:'error',code:result.code,tool_calls:this.calls.slice(before)};
  if(result.status==='already_applied')return{status:'receipt',action:result.receipt.command_type,accepted_at:result.receipt.accepted_at,result_ids:result.receipt.result_ids,store_version:result.receipt.store_version,balance_effects:result.receipt.balance_effects||[],audit_id:result.receipt.audit_id,replayed:true,tool_calls:this.calls.slice(before),retained:null};
  const required_confirmation=`Confirm proposal ${result.proposal_id} with hash ${result.confirmation_hash}`;
  this.pending={proposal_id:result.proposal_id,confirmation_hash:result.confirmation_hash,expires_at:result.expires_at,source_event_id:eventId,required_confirmation};
  if(this.maxRetainedPending!==1)throw new Error('Synthetic ChatGPT evaluation permits exactly one pending proposal.');
  return{status:'proposal',proposal:{action:result.action,...result.summary,review:result.review,expected_store_version:result.expected_store_version,expires_at:result.expires_at,proposal_id:result.proposal_id,confirmation_hash:result.confirmation_hash},required_confirmation,tool_calls:this.calls.slice(before),retained:this.retainedState()};
 }
}
