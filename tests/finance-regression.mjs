import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = {
  '.html':'text/html; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.svg':'image/svg+xml'
};

const server = http.createServer(async (req,res)=>{
  try{
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const safe = normalize(rel).replace(/^([.][.][/\\])+/, '');
    const file = join(root, safe);
    const body = await readFile(file);
    res.writeHead(200, {'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(body);
  }catch(e){
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Not found');
  }
});

await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true});
const page = await browser.newPage();

try{
  const pageErrors = [];
  page.on('pageerror',e=>pageErrors.push(String(e?.message || e)));

  await page.goto('http://127.0.0.1:4173/index.html', {waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.__KAD_RUN_FINANCE_TESTS === 'function', null, {timeout:10000});

  const result = await page.evaluate(()=>window.__KAD_RUN_FINANCE_TESTS());
  console.log(JSON.stringify(result,null,2));

  const backupUi = await page.evaluate(async()=>{
    let anchorClicks=0;
    const originalAnchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){anchorClicks++};
    const originalApi=window.crmApiCall;
    window.crmApiCall=async(action,extra={})=>{
      if(action==='backup-history') return {files:[{
        path:'2026/09/20/KAD_Boks778_FULL_2026-09-20_12-00-00.json',
        created_at:'2026-09-20T12:00:00Z',
        metadata:{size:2048}
      }]};
      if(action==='backup-sign') return {signedUrl:'https://example.invalid/test-backup.json?download=1'};
      if(action==='backup-preview') return {summary:{
        path:extra.path,createdAt:'2026-09-20T12:00:00Z',appVersion:'v106',
        orders:1,appointments:1,consumables:0,hasCashLedger:true,checksum:'abc123'
      }};
      return originalApi(action,extra);
    };
    const history=document.getElementById('backupHistory');
    history.style.display='none';
    await window.kadShowBackupHistory();
    const download=history.querySelector('[data-backup-download]');
    const restore=history.querySelector('[data-backup-restore]');
    if(!download||!restore) return {ok:false,reason:'backup action buttons were not rendered'};
    download.click();
    await new Promise(r=>setTimeout(r,0));
    restore.click();
    await new Promise(r=>setTimeout(r,0));
    const dialog=!!document.getElementById('backupRestoreDialog');
    window.kadCloseBackupRestore?.();
    window.crmApiCall=originalApi;
    HTMLAnchorElement.prototype.click=originalAnchorClick;
    return {ok:anchorClicks===1&&dialog,anchorClicks,dialog};
  });
  console.log('Backup history action test:',JSON.stringify(backupUi));
  if(!backupUi?.ok){
    console.error('Backup history action test failed.');
    process.exitCode=1;
  }

  const orderDraftUi = await page.evaluate(async()=>{
    const storageKey='KAD_BOKS778_ORDER_DRAFTS_V1';
    const before=localStorage.getItem(storageKey);
    const testId='draft-ui-'+Date.now();
    try{
      window.db.appointments.push({
        id:testId,date:'2026-09-25',time:'12:00',client:'Черновик UI',car:'Draft Test',vin:'',mileage:'',year:'',phone:'',source:'',note:'',paymentReceived:false,paymentMethod:''
      });
      window.db.orders=window.db.orders.filter(o=>o.appointmentId!==testId);

      resetForm();
      const select=document.getElementById('fAppointment');
      select.value=testId;
      appointmentSelected();

      const row=document.querySelector('#new .oprow');
      if(!row)return {ok:false,reason:'no operation row'};
      const desc=row.querySelector('.desc');
      const work=row.querySelector('.workv');
      desc.value='Замена тестового узла';
      work.value='4321';
      desc.dispatchEvent(new Event('input',{bubbles:true}));
      work.dispatchEvent(new Event('input',{bubbles:true}));
      orderDraftSaveNow();

      const stored=JSON.parse(localStorage.getItem(storageKey)||'{}')?.drafts?.[testId];
      if(stored?.ops?.[0]?.desc!=='Замена тестового узла')return {ok:false,reason:'draft was not stored',stored};

      resetForm();
      const select2=document.getElementById('fAppointment');
      select2.value=testId;
      appointmentSelected();

      const restored=document.querySelector('#new .oprow');
      const restoredDesc=restored?.querySelector('.desc')?.value||'';
      const restoredWork=restored?.querySelector('.workv')?.value||'';
      const status=document.getElementById('orderDraftStatus')?.textContent||'';
      return {
        ok:restoredDesc==='Замена тестового узла'&&Number(restoredWork)===4321&&/восстановлен/i.test(status),
        restoredDesc,restoredWork,status
      };
    }catch(e){
      return {ok:false,reason:String(e?.stack||e)};
    }finally{
      window.db.appointments=window.db.appointments.filter(a=>a.id!==testId);
      window.db.orders=window.db.orders.filter(o=>o.appointmentId!==testId);
      if(before===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,before);
    }
  });
  console.log('Order draft UI restore test:',JSON.stringify(orderDraftUi));
  if(!orderDraftUi?.ok){
    console.error('Order draft UI restore test failed.');
    process.exitCode=1;
  }

  const orderDraftReloadSetup = await page.evaluate(()=>{
    const storageKey='KAD_BOKS778_ORDER_DRAFTS_V1';
    const mainKey='kadbox778_v11';
    const testId='draft-reload-test';
    window.db.appointments=window.db.appointments.filter(a=>a.id!==testId);
    window.db.orders=window.db.orders.filter(o=>o.appointmentId!==testId);
    window.db.appointments.push({
      id:testId,date:'2026-09-25',time:'13:00',client:'Черновик Reload',car:'Reload Test',vin:'',mileage:'',year:'',phone:'',source:'',note:'',paymentReceived:false,paymentMethod:''
    });
    localStorage.setItem(mainKey,JSON.stringify(window.db));
    const store={version:1,drafts:{}};
    store.drafts[testId]={
      appointmentId:testId,
      updatedAt:new Date().toISOString(),
      ops:[{type:'Работа',category:'Слесарка',department:'Автосервис',desc:'Пережил F5',supplier:'',purchase:'',client:'',work:'9876',performer:'',manager:'',partLink:'',partNumber:'',schemeName:''}]
    };
    localStorage.setItem(storageKey,JSON.stringify(store));
    return {testId};
  });
  await page.reload({waitUntil:'load'});
  await page.waitForFunction(()=>typeof window.orderDraftRestore==='function'&&!!window.db, null, {timeout:10000});
  const orderDraftReload = await page.evaluate(({testId})=>{
    try{
      resetForm();
      const select=document.getElementById('fAppointment');
      select.value=testId;
      appointmentSelected();
      const row=document.querySelector('#new .oprow');
      const restoredDesc=row?.querySelector('.desc')?.value||'';
      const restoredWork=row?.querySelector('.workv')?.value||'';
      const status=document.getElementById('orderDraftStatus')?.textContent||'';
      return {ok:restoredDesc==='Пережил F5'&&Number(restoredWork)===9876&&/восстановлен/i.test(status),restoredDesc,restoredWork,status};
    }catch(e){return {ok:false,reason:String(e?.stack||e)}}
  },orderDraftReloadSetup);
  console.log('Order draft reload restore test:',JSON.stringify(orderDraftReload));
  if(!orderDraftReload?.ok){
    console.error('Order draft reload restore test failed.');
    process.exitCode=1;
  }
  await page.evaluate(()=>{
    window.db.appointments=window.db.appointments.filter(a=>a.id!=='draft-reload-test');
    window.db.orders=window.db.orders.filter(o=>o.appointmentId!=='draft-reload-test');
    localStorage.removeItem('KAD_BOKS778_ORDER_DRAFTS_V1');
    localStorage.setItem('kadbox778_v11',JSON.stringify(window.db));
  });

  const orderDraftAutoResume = await page.evaluate(()=>{
    const storageKey='KAD_BOKS778_ORDER_DRAFTS_V1';
    const before=localStorage.getItem(storageKey);
    const firstId='draft-auto-a';
    const secondId='draft-auto-b';
    try{
      window.db.appointments=window.db.appointments.filter(a=>![firstId,secondId].includes(a.id));
      window.db.orders=window.db.orders.filter(o=>![firstId,secondId].includes(o.appointmentId));
      window.db.appointments.push(
        {id:firstId,date:'2026-09-25',time:'14:00',client:'Черновик A',car:'Auto Resume A',vin:'',mileage:'',year:'',phone:'',source:'',note:'',paymentReceived:false,paymentMethod:''},
        {id:secondId,date:'2026-09-25',time:'15:00',client:'Черновик B',car:'Auto Resume B',vin:'',mileage:'',year:'',phone:'',source:'',note:'',paymentReceived:false,paymentMethod:''}
      );
      const store={version:1,drafts:{}};
      store.drafts[firstId]={
        appointmentId:firstId,
        updatedAt:new Date().toISOString(),
        ops:[{type:'Работа',category:'Слесарка',department:'Автосервис',desc:'Автовосстановление',supplier:'',purchase:'',client:'',work:'2468',performer:'',manager:'',partLink:'',partNumber:'',schemeName:''}]
      };
      localStorage.setItem(storageKey,JSON.stringify(store));

      startNewOrder();
      const selected=document.getElementById('fAppointment')?.value||'';
      const row=document.querySelector('#new .oprow');
      const restoredDesc=row?.querySelector('.desc')?.value||'';
      const restoredWork=row?.querySelector('.workv')?.value||'';
      const autoOk=selected===firstId&&restoredDesc==='Автовосстановление'&&Number(restoredWork)===2468;

      const select=document.getElementById('fAppointment');
      select.value=secondId;
      appointmentSelected();
      const switched=document.querySelector('#new .oprow');
      const switchedDesc=switched?.querySelector('.desc')?.value||'';
      const switchedWork=switched?.querySelector('.workv')?.value||'';
      const switchOk=switchedDesc===''&&Number(switchedWork||0)===0;

      return {ok:autoOk&&switchOk,selected,restoredDesc,restoredWork,switchedDesc,switchedWork};
    }catch(e){
      return {ok:false,reason:String(e?.stack||e)};
    }finally{
      window.db.appointments=window.db.appointments.filter(a=>![firstId,secondId].includes(a.id));
      window.db.orders=window.db.orders.filter(o=>![firstId,secondId].includes(o.appointmentId));
      if(before===null)localStorage.removeItem(storageKey);else localStorage.setItem(storageKey,before);
    }
  });
  console.log('Order draft auto-resume/context-switch test:',JSON.stringify(orderDraftAutoResume));
  if(!orderDraftAutoResume?.ok){
    console.error('Order draft auto-resume/context-switch test failed.');
    process.exitCode=1;
  }

  if(pageErrors.length){
    console.error('Browser page errors:',pageErrors);
    process.exitCode=1;
  }
  if(!result?.ok){
    console.error('Finance regression tests failed.');
    process.exitCode=1;
  }else{
    console.log('Finance regression tests passed:',result.passed+'/'+result.total);
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

if(process.exitCode) process.exit(process.exitCode);
