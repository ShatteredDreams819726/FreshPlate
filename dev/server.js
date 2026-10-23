import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createServer as createViteServer } from 'vite';
import { createExtractHandler } from '../server/extract.js';

// A permanent local adapter for the very same Vercel handler; no mock-success mode.
export async function createDevServer({port=5173,env=process.env,fetchImpl}={}) {
  let vite;
  const extract=createExtractHandler({env,fetchImpl});
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(pathname==='/api/extract') {void extract(req,res);return;}
    if(pathname.startsWith('/api/')) {res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{code:'NOT_FOUND',message:'API route not found.'}}));return;}
    if(/^\/(server|dev)\//.test(pathname)) {res.writeHead(404);res.end();return;}
    vite.middlewares(req,res);
  });
  // Attach HMR to this same HTTP server; avoid a separate global WebSocket port.
  // Node loads .env.local at startup; Vite never needs to read the server key file.
  vite=await createViteServer({envDir:false,server:{middlewareMode:true,hmr:{server}},appType:'spa'});
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){await vite.close();throw error;}
  return {server,vite,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await vite.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {values}=parseArgs({options:{port:{type:'string',default:'5173'}}});
  const port=Number(values.port);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a local port from 1024 to 65535.');
  const app=await createDevServer({port});
  console.log(`FreshPlate + /api/extract: http://127.0.0.1:${port}`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
}
