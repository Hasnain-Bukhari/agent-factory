import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyStore, propose, commit, derive, verifyAudit } from '../src/domain.mjs';
import { SyntheticKeyProvider } from '../src/keys.mjs';

const keys=new SyntheticKeyProvider(); const audit=keys.get('audit',1);
let seq=0;
function run(store,command){command={...command,idempotency_key:command.idempotency_key||`synthetic-${String(++seq).padStart(4,'0')}`};const p=propose(store,command,{owner:'profile-a',actor:'test',channel:'system'});assert.equal(p.status,'confirmation_required');return commit(store,p,p.proposal_hash,audit);}

test('proposal requires exact fresh confirmation',()=>{const s=emptyStore();const p=propose(s,{type:'create_account',idempotency_key:'synthetic-confirm',name:'Wallet',currency:'THB'});assert.throws(()=>commit(s,p,'wrong',audit));});
test('complete domain scenario is reproducible and audited',()=>{
 let s=emptyStore(); let r=run(s,{type:'create_account',name:'THB bank',currency:'THB',opening_balance:{minor_units:'100000',currency:'THB'}});s=r.store;const thb=s.accounts[0];
 r=run(s,{type:'create_account',name:'USD broker',currency:'USD'});s=r.store;const usd=s.accounts[1];
 r=run(s,{type:'archive_account',account_id:usd.id});s=r.store;r=run(s,{type:'reactivate_account',account_id:usd.id});s=r.store;
 r=run(s,{type:'record_income',account_id:thb.id,amount:{minor_units:'50000',currency:'THB'},category:'Synthetic salary'});s=r.store;
 r=run(s,{type:'record_expense',account_id:thb.id,amount:{minor_units:'-1000',currency:'THB'},posting_status:'pending',category:'Food'});s=r.store;const pending=s.ledger_entries.at(-1);
 r=run(s,{type:'post_entry',entry_id:pending.id});s=r.store;
 r=run(s,{type:'reverse_entry',entry_id:pending.id});s=r.store;
 r=run(s,{type:'correct_entry',entry_id:s.ledger_entries.find(x=>x.entry_type==='income').id,amount:{minor_units:'49000',currency:'THB'}});s=r.store;
 r=run(s,{type:'create_transfer',source_account_id:thb.id,destination_account_id:usd.id,source_amount:{minor_units:'35000',currency:'THB'},destination_amount:{minor_units:'1000',currency:'USD'},fee:{minor_units:'50',currency:'THB'},exchange_rate:{base_currency:'USD',quote_currency:'THB',rate:'35',source:'synthetic'}});s=r.store;
 r=run(s,{type:'record_investment',account_id:usd.id,instrument_id:'SYNTH',transaction_type:'buy',quantity:'2.5',cash_amount:{minor_units:'-1000',currency:'USD'},unit_price:{minor_units:'400',currency:'USD'}});s=r.store;
 r=run(s,{type:'record_investment',account_id:usd.id,instrument_id:'SYNTH',transaction_type:'dividend',cash_amount:{minor_units:'25',currency:'USD'}});s=r.store;
 r=run(s,{type:'record_investment',account_id:usd.id,instrument_id:'SYNTH',transaction_type:'fee',cash_amount:{minor_units:'-5',currency:'USD'}});s=r.store;
 r=run(s,{type:'record_investment',account_id:usd.id,instrument_id:'SYNTH',transaction_type:'split',quantity:'2',cash_amount:{minor_units:'0',currency:'USD'}});s=r.store;
 r=run(s,{type:'record_investment',account_id:usd.id,instrument_id:'SYNTH',transaction_type:'valuation',cash_amount:{minor_units:'0',currency:'USD'},unit_price:{minor_units:'450',currency:'USD'}});s=r.store;
 r=run(s,{type:'create_liability',name:'Synthetic loan',currency:'THB',liability_type:'personal_loan'});s=r.store;const loan=s.liabilities[0];
 for(const [event_type,minor] of [['draw','10000'],['interest','-100'],['fee','-50'],['principal','-1000']]){r=run(s,{type:'record_liability_event',liability_id:loan.id,account_id:thb.id,event_type,amount:{minor_units:minor,currency:'THB'}});s=r.store;}
 r=run(s,{type:'repay_liability',liability_id:loan.id,account_id:thb.id,amount:{minor_units:'-1000',currency:'THB'},allocation:{principal:{minor_units:'-800',currency:'THB'},interest:{minor_units:'-150',currency:'THB'},fee:{minor_units:'-50',currency:'THB'}}});s=r.store;
 r=run(s,{type:'create_budget',name:'Food',limit:{minor_units:'5000',currency:'THB'},starts_on:'2026-01-01',categories:['Food']});s=r.store;
 r=run(s,{type:'create_goal',name:'Reserve',target:{minor_units:'1000000',currency:'THB'},linked_account_ids:[thb.id]});s=r.store;
 r=run(s,{type:'record_goal_contribution',goal_id:s.goals[0].id,account_id:thb.id,amount:{minor_units:'5000',currency:'THB'}});s=r.store;
 r=run(s,{type:'create_net_worth_snapshot',valued_at:'2026-01-31T16:59:59.000Z',components:[{source_type:'account',source_id:thb.id,source_value:{minor_units:'120000',currency:'THB'},base_value:{minor_units:'120000',currency:'THB'}},{source_type:'liability',source_id:loan.id,source_value:{minor_units:'8850',currency:'THB'},base_value:{minor_units:'8850',currency:'THB'}}]});s=r.store;
 r=run(s,{type:'update_preferences',changes:{base_currency:'THB',time_zone:'Asia/Bangkok'}});s=r.store;
 const d=derive(s);assert.equal(s.transfers.length,1);assert.equal(s.investments.length,5);assert.equal(s.net_worth_snapshots[0].net_worth.minor_units,'111150');assert.equal(d.positions[`${usd.id}:SYNTH`],'500000000');assert.equal(d.goals[0].contributed_minor_units,'5000');assert.equal(verifyAudit(s,audit),true);assert.equal(s.audit_events.length,s.store_version);assert.equal(s.idempotency_receipts.length,s.store_version);
});
test('exact replay returns original receipt and changed body conflicts',()=>{let s=emptyStore();const c={type:'create_account',idempotency_key:'synthetic-replay',name:'Wallet',currency:'THB',occurred_at:'2026-01-01T00:00:00.000Z'};const p=propose(s,c,{owner:'a'});const done=commit(s,p,p.proposal_hash,audit);s=done.store;const replay=propose(s,c,{owner:'a'});assert.equal(replay.status,'already_applied');assert.equal(replay.receipt.store_version,1);assert.throws(()=>propose(s,{...c,name:'Changed'},{owner:'a'}));});
test('replay remains stable when caller omitted effective time',()=>{let s=emptyStore();const c={type:'create_account',idempotency_key:'synthetic-no-time',name:'Wallet',currency:'THB'};const p=propose(s,c,{owner:'a'});s=commit(s,p,p.proposal_hash,audit).store;assert.equal(propose(s,c,{owner:'a'}).status,'already_applied');});
test('retrying an accepted saved proposal returns its original receipt',()=>{let s=emptyStore();const p=propose(s,{type:'create_account',idempotency_key:'synthetic-lost-reply',name:'Wallet',currency:'THB'},{owner:'a'});const first=commit(s,p,p.proposal_hash,audit);const retry=commit(first.store,p,p.proposal_hash,audit);assert.equal(retry.replayed,true);assert.deepEqual(retry.receipt,first.receipt);assert.equal(retry.store.store_version,1);});
test('transfer conservation and exchange-rate direction are enforced',()=>{let s=emptyStore();let r=run(s,{type:'create_account',name:'THB',currency:'THB'});s=r.store;r=run(s,{type:'create_account',name:'THB2',currency:'THB'});s=r.store;r=run(s,{type:'create_account',name:'USD',currency:'USD'});s=r.store;assert.throws(()=>run(s,{type:'create_transfer',source_account_id:s.accounts[0].id,destination_account_id:s.accounts[1].id,source_amount:{minor_units:'2',currency:'THB'},destination_amount:{minor_units:'1',currency:'THB'}}));assert.throws(()=>run(s,{type:'create_transfer',source_account_id:s.accounts[0].id,destination_account_id:s.accounts[2].id,source_amount:{minor_units:'3500',currency:'THB'},destination_amount:{minor_units:'100',currency:'USD'},exchange_rate:{base_currency:'THB',quote_currency:'USD',rate:'35'}}));});
test('double reversal and malformed cross-currency transfer fail',()=>{let s=emptyStore();let r=run(s,{type:'create_account',name:'A',currency:'THB'});s=r.store;r=run(s,{type:'record_income',account_id:s.accounts[0].id,amount:{minor_units:'10',currency:'THB'}});s=r.store;const id=s.ledger_entries[0].id;r=run(s,{type:'reverse_entry',entry_id:id});s=r.store;assert.throws(()=>run(s,{type:'reverse_entry',entry_id:id}));});

test('investment FIFO lots, splits, sales, dividends, fees, and timestamped valuation derive exactly',()=>{
  let s=emptyStore(); let r=run(s,{type:'create_account',name:'Broker',account_type:'brokerage',currency:'USD'}); s=r.store; const account=s.accounts[0];
  for (const command of [
    {transaction_type:'buy',quantity:'10',cash_amount:{minor_units:'-1000',currency:'USD'},unit_price:{minor_units:'100',currency:'USD'},fee_amount:{minor_units:'10',currency:'USD'},occurred_at:'2026-01-01T00:00:00.000Z'},
    {transaction_type:'buy',quantity:'5',cash_amount:{minor_units:'-600',currency:'USD'},unit_price:{minor_units:'120',currency:'USD'},occurred_at:'2026-01-02T00:00:00.000Z'},
    {transaction_type:'split',quantity:'2',cash_amount:{minor_units:'0',currency:'USD'},occurred_at:'2026-01-03T00:00:00.000Z'},
    {transaction_type:'sell',quantity:'12',cash_amount:{minor_units:'900',currency:'USD'},unit_price:{minor_units:'75',currency:'USD'},fee_amount:{minor_units:'20',currency:'USD'},occurred_at:'2026-01-04T00:00:00.000Z'},
    {transaction_type:'dividend',cash_amount:{minor_units:'50',currency:'USD'},occurred_at:'2026-01-05T00:00:00.000Z'},
    {transaction_type:'fee',cash_amount:{minor_units:'-7',currency:'USD'},occurred_at:'2026-01-06T00:00:00.000Z'},
    {transaction_type:'valuation',cash_amount:{minor_units:'0',currency:'USD'},unit_price:{minor_units:'100',currency:'USD'},occurred_at:'2026-01-07T00:00:00.000Z'}
  ]) { r=run(s,{type:'record_investment',account_id:account.id,instrument_id:'SYNTH-FUND',...command}); s=r.store; }
  const position=derive(s,{asOf:'2026-01-08T00:00:00.000Z'}).investment_positions[0];
  assert.equal(position.quantity_units,'1800000000');
  assert.equal(position.cost_basis_minor_units,'1004');
  assert.equal(position.realized_gain_minor_units,'274');
  assert.equal(position.dividends_minor_units,'50');
  assert.equal(position.fees_minor_units,'7');
  assert.equal(position.valuation.market_value_minor_units,'1800');
  assert.equal(position.valuation.unrealized_gain_minor_units,'796');
  assert.equal(position.valuation.observed_at,'2026-01-07T00:00:00.000Z');
  assert.deepEqual(position.lots.map(lot=>[lot.quantity_units,lot.remaining_cost_minor_units]),[['800000000','404'],['1000000000','600']]);
  assert.throws(()=>run(s,{type:'record_investment',account_id:account.id,instrument_id:'SYNTH-FUND',transaction_type:'buy',quantity:'0.000000001',cash_amount:{minor_units:'-1',currency:'USD'},unit_price:{minor_units:'1',currency:'USD'}}));
});

test('budget periods, Bangkok boundaries, account/category filters, pending entries, reversals, and corrections are exact',()=>{
  let s=emptyStore(); let r=run(s,{type:'create_account',name:'Primary',currency:'THB'}); s=r.store; const primary=s.accounts[0];
  r=run(s,{type:'create_account',name:'Excluded',currency:'THB'}); s=r.store; const excluded=s.accounts[1];
  const expense=(account_id,minor_units,occurred_at,category='Food',posting_status='posted')=>{const result=run(s,{type:'record_expense',account_id,amount:{minor_units,currency:'THB'},occurred_at,category,posting_status});s=result.store;return s.ledger_entries.at(-1);};
  expense(primary.id,'-100','2026-01-31T16:59:59.000Z');
  const corrected=expense(primary.id,'-200','2026-01-31T17:00:00.000Z');
  expense(primary.id,'-300','2026-02-10T00:00:00.000Z','Travel');
  expense(excluded.id,'-400','2026-02-10T00:00:00.000Z');
  expense(primary.id,'-500','2026-02-10T00:00:00.000Z','Food','pending');
  r=run(s,{type:'correct_entry',entry_id:corrected.id,amount:{minor_units:'-250',currency:'THB'},category:'Food',occurred_at:'2026-02-11T00:00:00.000Z'});s=r.store;
  for (const [name,period,starts_on,ends_on] of [['Monthly','monthly','2026-01-01'],['Weekly','weekly','2026-02-01'],['Quarterly','quarterly','2026-01-01'],['Yearly','yearly','2026-01-01'],['Custom','custom','2026-02-01','2026-02-28']]) { r=run(s,{type:'create_budget',name,period,starts_on,ends_on,limit:{minor_units:'1000',currency:'THB'},categories:['Food'],account_ids:[primary.id]});s=r.store; }
  const budgets=derive(s,{asOf:'2026-02-15T05:00:00.000Z'}).budgets;
  const monthly=budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Monthly').id);
  assert.deepEqual([monthly.period_start,monthly.period_end,monthly.spent_minor_units,monthly.remaining_minor_units],['2026-02-01','2026-02-28','250','750']);
  assert.equal(monthly.eligible_entry_ids.length,1);
  assert.deepEqual([budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Weekly').id).period_start,budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Weekly').id).period_end],['2026-02-15','2026-02-21']);
  assert.deepEqual([budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Quarterly').id).period_start,budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Quarterly').id).period_end],['2026-01-01','2026-03-31']);
  assert.deepEqual([budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Yearly').id).period_start,budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Yearly').id).period_end],['2026-01-01','2026-12-31']);
  assert.deepEqual([budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Custom').id).period_start,budgets.find(x=>x.id===s.budgets.find(b=>b.name==='Custom').id).period_end],['2026-02-01','2026-02-28']);
});

test('probable content duplicates require review but distinct idempotency keys remain legitimate',()=>{
  let s=emptyStore(); let r=run(s,{type:'create_account',name:'Wallet',currency:'THB'}); s=r.store; const account=s.accounts[0];
  const first={type:'record_expense',idempotency_key:'synthetic-duplicate-a',account_id:account.id,amount:{minor_units:'-1250',currency:'THB'},category:'Food',occurred_at:'2026-03-01T00:00:00.000Z'};
  let proposal=propose(s,first,{owner:'profile-a',actor:'test',channel:'system'}); s=commit(s,proposal,proposal.proposal_hash,audit).store;
  proposal=propose(s,{...first,idempotency_key:'synthetic-duplicate-b',occurred_at:'2026-03-02T00:00:00.000Z'},{owner:'profile-a',actor:'test',channel:'system'});
  assert.equal(proposal.review.likely_duplicate,true); assert.deepEqual(proposal.review.candidate_ids,[s.ledger_entries[0].id]);
  s=commit(s,proposal,proposal.proposal_hash,audit).store; assert.equal(s.ledger_entries.length,2);
  const distinct=propose(s,{...first,idempotency_key:'synthetic-duplicate-c',category:'Transport'},{owner:'profile-a',actor:'test',channel:'system'});
  assert.equal(distinct.review.likely_duplicate,false);
});
