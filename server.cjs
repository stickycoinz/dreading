'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary', '.bin':'application/octet-stream', '.wasm':'application/wasm', '.woff2':'font/woff2', '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.svg':'image/svg+xml'};
function createServer({root = path.join(__dirname, 'game'), hostKey = crypto.randomBytes(24).toString('hex'), guestKey = crypto.randomBytes(24).toString('hex'), spectatorKey = crypto.randomBytes(24).toString('hex')} = {}) {
  const viewers=new Set();
  const slots = [null, null], sessions = new Map();
  let epoch = 0, latest = null;
  const send = (ws, data) => {if(ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256*1024) ws.send(JSON.stringify(data));};
  const presence = () => [...slots,...viewers].forEach(ws => send(ws, {type:'presence', players:slots.map(Boolean), epoch}));
  function role(req) {const m = /(?:^|;\s*)dreadingSession=([a-f0-9]+)/.exec(req.headers.cookie || ''); return m ? sessions.get(m[1]) : undefined;}
  const server = http.createServer((req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    let u; try {u = new URL(req.url,'http://localhost');} catch {res.writeHead(400).end(); return;}
    if(u.pathname === '/api/session' && req.method === 'POST') {
      let body = ''; req.on('data',chunk => {body += chunk; if(body.length > 1024) req.destroy();});
      req.on('end',() => {let key;try {key=JSON.parse(body).key;}catch {res.writeHead(400).end();return;}
        const slot = key === hostKey ? 0 : key === guestKey ? 1 : key === spectatorKey ? 2 : -1;
        if(slot < 0) {res.writeHead(403).end('Invalid invitation');return;}
        const session = crypto.randomBytes(24).toString('hex');
        if(sessions.size > 100) sessions.delete(sessions.keys().next().value);
        sessions.set(session,slot);res.setHeader('Set-Cookie',`dreadingSession=${session}; HttpOnly; SameSite=Strict; Path=/`);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({slot}));
      });return;
    }
    if(u.pathname === '/api/lobby' && req.method === 'GET') {const slot=role(req);if(slot===undefined){res.writeHead(403).end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({slot,players:slots.map(Boolean),spectators:viewers.size,...(slot===0?{guestKey,spectatorKey}:{})}));return;}
    if(req.method !== 'GET' && req.method !== 'HEAD') {res.writeHead(405).end();return;}
    if(u.pathname === '/') {res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(path.join(__dirname,'lobby.html')));return;}
    if(role(req) === undefined) {res.writeHead(403).end('Open your invitation link first.');return;}
    let rel; try {rel=decodeURIComponent(u.pathname);}catch {res.writeHead(400).end();return;}
    const filename = path.resolve(root,'.'+rel);
    if(!filename.startsWith(path.resolve(root)+path.sep)) {res.writeHead(403).end();return;}
    fs.stat(filename,(err,st) => {
      if(err || !st.isFile()) {res.writeHead(404).end();return;}
      const real=fs.realpathSync(filename);
      if(!real.startsWith(fs.realpathSync(root)+path.sep)) {res.writeHead(403).end();return;}
      res.setHeader('Content-Type', TYPES[path.extname(filename)] || 'application/octet-stream');
      res.setHeader('Content-Length',st.size);
      if(req.method === 'HEAD') res.end();else {const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
    });
  });
  const wss = new WebSocketServer({noServer:true,maxPayload:512*1024,perMessageDeflate:false});
  server.on('upgrade',(req,socket,head) => {
    let origin;try {origin=new URL(req.headers.origin).host;}catch {socket.destroy();return;}
    const slot=role(req);
    if(req.url !== '/room' || slot === undefined || origin !== req.headers.host || (slot<2&&slots[slot]) || (slot===2&&viewers.size>=8)) {socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws => {
      if(slot===2)viewers.add(ws);else slots[slot]=ws;ws.alive=true;
      if(slot === 0) {epoch++;latest=null;}
      send(ws,{type:'welcome',slot,epoch});presence();
      if(slot !== 0 && latest) send(ws,latest);
      let count=0,period=Date.now();
      ws.on('pong',()=>ws.alive=true);
      ws.on('message',raw => {
        if(Date.now()-period >= 1000) {period=Date.now();count=0;}
        if(++count > 100) {ws.close(1008,'Message limit');return;}
        let m;try {m=JSON.parse(raw);}catch {ws.close(1008,'Invalid JSON');return;}
        if(!m || typeof m !== 'object') return;
        if(m.type === 'ping') {send(ws,{type:'pong',at:m.at});return;}
        if(slot === 0 && m.type === 'state' && m.epoch === epoch && Array.isArray(m.players) && m.players.length<=64) {latest=m;send(slots[1],m);viewers.forEach(v=>send(v,m));}
        if(slot === 1 && m.type === 'command' && typeof m.method==='string' && Array.isArray(m.args) && raw.length<16000) send(slots[0],m);
        if(slot === 1 && m.type === 'control' && (m.uid===null||Number.isInteger(m.uid))) send(slots[0],{type:'control',uid:m.uid});
        if(slot === 1 && m.type === 'frame' && Number.isInteger(m.uid) && Number.isFinite(m.yaw) && Number.isFinite(m.pitch) && raw.length<4096) {
          const keys={};for(const k of ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ControlLeft'])keys[k]=!!m.keys?.[k];
          send(slots[0],{type:'frame',uid:m.uid,yaw:m.yaw,pitch:Math.max(-1.5,Math.min(1.5,m.pitch)),keys,ads:!!m.ads,fire:!!m.fire,pressed:!!m.pressed,actions:Array.isArray(m.actions)?m.actions.filter(a=>['KeyR','KeyC','Space','Digit1','Digit2','BracketLeft','BracketRight','KeyG','KeyZ','releaseG','KeyB','KeyU'].includes(a)).slice(0,8):[]});
        }
        if(slot === 1 && ['input','ready','respawn'].includes(m.type)) {
          if(m.type === 'input') {
            if(!Array.isArray(m.p) || m.p.length!==3 || !m.p.every(v=>Number.isFinite(v)&&Math.abs(v)<10000) || !Number.isFinite(m.yaw) || !Number.isFinite(m.pitch)) return;
            m={type:'input',p:m.p,yaw:m.yaw,pitch:Math.max(-1.5,Math.min(1.5,m.pitch)),crouch:!!m.crouch,ads:!!m.ads,fire:!!m.fire,reload:!!m.reload,seq:Number.isSafeInteger(m.seq)?m.seq:0};
          }
          send(slots[0],m);
        }
      });
      ws.on('close',()=>{viewers.delete(ws);if(slots[slot]===ws) slots[slot]=null;if(slot===0)latest=null;presence();});
      ws.on('error',()=>{});
    });
  });
  const heartbeat=setInterval(()=>[...slots,...viewers].forEach(ws=>{if(!ws)return;if(!ws.alive){ws.terminate();return;}ws.alive=false;ws.ping();}),10000);
  heartbeat.unref();
  return {server,hostKey,guestKey,spectatorKey,close:()=>{clearInterval(heartbeat);[...slots,...viewers].forEach(ws=>ws&&ws.terminate());wss.close();server.close();}};
}
module.exports={createServer};
if(require.main===module) {
  let saved={};try{const data=JSON.parse(fs.readFileSync(path.join(__dirname,'session-private.json'),'utf8'));for(const k of ['hostKey','guestKey','spectatorKey'])if(/^[a-f0-9]{48}$/.test(data[k]))saved[k]=data[k];}catch{}
  const room=createServer(saved);const port=Number(process.env.PORT||8780);
  room.server.listen(port,process.env.HOST||'127.0.0.1',()=>{
    fs.writeFileSync(path.join(__dirname,'session-private.json'),JSON.stringify({port,hostKey:room.hostKey,guestKey:room.guestKey,spectatorKey:room.spectatorKey},null,2));
    console.log(`Two-player room listening on 127.0.0.1:${port}. Invitations are in session-private.json.`);
  });
}
