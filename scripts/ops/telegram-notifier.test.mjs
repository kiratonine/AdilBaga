import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTelegramNotifier, validateTelegramConfig, parseTelegramEntries } from './telegram-notifier.mjs';

// Intentionally synthetic, assembled to avoid resembling a real stored secret.
const token = '123456789:' + 'S'.repeat(35), admin = '123456789';
const config = { token, admin };
const event = { type: 'incident_opened', atUTC: 100000, id: 'a'.repeat(32) };
const success = { ok: true, result: { message_id: 12, chat: { id: Number(admin), type: 'private' } } };
test('literal dotenv selects only two entries, strict duplicate/substitution rejection', () => {
  assert.deepEqual(parseTelegramEntries(['BOT_TOKEN="' + token + '"', 'ADMIN_ID=' + admin]), config);
  for (const lines of [[], ['BOT_TOKEN='+token], ['BOT_TOKEN='+token,'BOT_TOKEN='+token,'ADMIN_ID='+admin],
    ['BOT_TOKEN=$(command)','ADMIN_ID='+admin], ['BOT_TOKEN='+token,'ADMIN_ID="123\\n456"'], ['OTHER=value']]) assert.throws(()=>parseTelegramEntries(lines), /telegram_configuration/);
});
for (const patch of [{ token: '' },{ token: token+'\n' },{ token: token+'/x' },{ token: '0:'+ 'S'.repeat(35) },
  { admin: '-123' },{ admin: '0' },{ admin: '+123' },{ admin: '0123' },{ admin: admin+'\n' },{ admin: '9007199254740992' },{ admin: '1e3' }]) {
  test('strict configuration rejects '+Object.keys(patch)[0],()=>assert.throws(()=>validateTelegramConfig({...config,...patch}), /telegram_configuration/));
}
for (const kind of ['ok','no_chat','bad_chat','group','no_message','zero_message','false','nonboolean','invalid_json','utf8','partial','incomplete','length_mismatch','html','oversize','length','204','302','400','401','429','500','503','tls','throw','timeout','abort']) {
  test('fixed Telegram transport '+kind, async () => {
    let calls=0, sent, destroyed=0;
    const request=(url,options,callback)=>{
      calls++; assert.equal(url,'https://api.telegram.org/bot'+token+'/sendMessage');
      if(kind==='throw')throw Error('SECRET_URL_TOKEN');
      assert.equal(options.method,'POST');assert.equal(options.agent,false);assert.equal(options.rejectUnauthorized,true);
      assert.deepEqual(Object.keys(options.headers).sort(),['Accept','Content-Length','Content-Type']);
      const req=new EventEmitter();req.destroy=()=>{destroyed++};req.end=body=>{
        sent=JSON.parse(body);assert.deepEqual(Object.keys(sent).sort(),['chat_id','text']);assert.equal(sent.chat_id,admin);
        assert.match(sent.text,/^ALERT — Aktau Market Go API\nСервис недоступен\nUTC /);assert.ok(!body.includes(event.id));
        assert.equal(options.headers['Content-Length'],Buffer.byteLength(body));
        if(['timeout','abort'].includes(kind))return;
        queueMicrotask(()=>{
          if(kind==='tls'){req.emit('error',Error('SECRET_URL_TOKEN'));return;}
          const res=new EventEmitter();res.destroy=()=>{destroyed++};res.complete=true;
          res.statusCode=/^\d+$/.test(kind)?Number(kind):200;res.headers={'content-type':'application/json'};
          if(kind==='html')res.headers['content-type']='text/html';
          if(kind==='incomplete')res.complete=false;
          if(kind==='length_mismatch')res.headers['content-length']='1';
          if(kind==='length')res.headers['content-length']='999999';callback(res);
          if(kind==='partial'){res.emit('aborted');return;}
          let value=structuredClone(success);
          if(kind==='no_chat')delete value.result.chat;
          if(kind==='bad_chat')value.result.chat.id=123;
          if(kind==='group')value.result.chat.type='group';
          if(kind==='no_message')delete value.result.message_id;
          if(kind==='zero_message')value.result.message_id=0;
          if(kind==='false')value.ok=false;
          if(kind==='nonboolean')value.ok='true';
          res.emit('data',kind==='utf8'?Buffer.from([255]):kind==='oversize'?Buffer.alloc(32769):Buffer.from(kind==='invalid_json'?'{':JSON.stringify(value)));
          res.emit('end');
        });
      };return req;
    };
    const notify=createTelegramNotifier(config,{request,timeoutMs:10});
    const c=new AbortController();const p=notify(event,c.signal);if(kind==='abort')c.abort();
    assert.equal(await p,['ok','no_chat'].includes(kind));assert.equal(calls,1);if(kind!=='throw')assert.ok(destroyed>0);
  });
}
test('invalid event and pre-cancelled operation perform no request',async()=>{
  const notify=createTelegramNotifier(config,{request:()=>assert.fail('network')});
  for(const value of [{}, {...event,type:'arbitrary'}, {...event,atUTC:NaN}, {...event,id:'bad'}])assert.equal(await notify(value),false);
  const c=new AbortController();c.abort();assert.equal(await notify(event,c.signal),false);
});
