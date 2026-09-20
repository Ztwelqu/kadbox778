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
