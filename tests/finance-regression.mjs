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
