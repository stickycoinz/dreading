/* DREADING real-recording weapon + explosion sounds (CC0 / Sonniss GDC pack, see audio/real_sfx/cc0_pack_sources.md). 2026-11-19, v2.
   Local (first-person) automatic fire plays the burst recording itself, unaltered (playbackRate 1, no slicing, no filters):
     - trigger held: the file runs at its own recorded rate; when it reaches its final shot while still held it loops back to an earlier shot
       with a 10 ms equal-power crossfade placed just before a shot's attack (never through a shot body);
     - release (no new round within 1.5 shot intervals, or the left mouse button goes up): the shot that is sounding plays to its end, then the
       recording's own release tail takes over (10 ms crossfade in the quiet just before the next attack), so the burst ends naturally;
     - tap (one round): the first recorded shot plus the natural tail. A second round arriving later resumes the burst from shot 2.
   Suppressed fire and single-take files play the whole file per round. Semi-auto keeps the existing single-shot real_sfx (fps_*).
   Remote shooters beyond 65 m use distant_* recordings. Everything goes to the Weapons bus. */
(function(){'use strict';
const FILES=['close_auto_rifle_A','close_auto_rifle_B','close_auto_rifle_C','close_auto_smg_A','close_auto_smg_B','close_auto_smg_C','close_auto_mg_A','close_auto_mg_B','close_auto_mg_C',
 'suppressed_close_rifle_A','suppressed_close_rifle_B','suppressed_rifle_A','suppressed_rifle_B','suppressed_rifle_C',
 'distant_rifle_A','distant_rifle_B','distant_rifle_C','distant_auto_A','distant_auto_B','distant_auto_C','distant_pistol_A','distant_pistol_B','distant_pistol_C',
 'explosion_grenade_A','explosion_grenade_B','explosion_grenade_C','explosion_distant_A','explosion_distant_B','explosion_vehicle_A','explosion_vehicle_B'];
// Explicit first-person automatic mapping (Cody: M4 -> close_auto_rifle_C). Anything automatic not listed falls back by category below.
// Name clash: the older Sako take already lives at real_sfx/suppressed_rifle_A.mp3 (used by fps_suppressed), so the pack's De Lisle take sits in real_sfx/cc0_pack/.
const PATH={suppressed_rifle_A:'cc0_pack/suppressed_rifle_A'};
const AUTO={m4:'close_auto_rifle_C',m4_worn:'close_auto_rifle_C',ak47:'close_auto_rifle_B',ak_rust:'close_auto_rifle_B',scarh:'close_auto_rifle_B',famas:'close_auto_rifle_A',
 mp5:'close_auto_smg_A',mp7:'close_auto_smg_A',ump45:'close_auto_smg_B',vector:'close_auto_smg_C',glock18:'close_auto_smg_C',m249:'close_auto_mg_C'};
const HEAVY_MG=/(^|_)(m2|m2hb|browning|hmg|cal50|50cal)($|_)/i,MG=/m249|saw|lmg|(^|_)mg\d*($|_)|m60|m240|pkm|rpk|negev/i,AUTO_SHOTGUN=/aa12|shotgun|m1014/i;
const XF=.010,PRE=.004,LOOK=.04,curve=(n,f)=>{const c=new Float32Array(n);for(let i=0;i<n;i++)c[i]=f(i/(n-1)*Math.PI/2);return c;},C_IN=curve(64,Math.sin),C_OUT=curve(64,Math.cos);
const W=window.DreadingWeaponAudio={ready:false,buffers:new Map(),info:{},bursts:new Map(),localKeys:new Set(),stats:{rounds:0,bursts:0,loops:0,releases:0,resumes:0,jumps:0,distant:0,explosions:0,singles:0},AUTO,FILES,XF,PRE,
 onsets(b){const sr=b.sampleRate,w=Math.round(sr*.002),n=Math.floor(b.length/w),db=new Float32Array(n);let mx=-200;
  for(let i=0;i<n;i++){let e=0;for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let j=i*w;j<(i+1)*w;j++)e+=d[j]*d[j];}db[i]=10*Math.log10(e/(w*b.numberOfChannels)+1e-18);if(db[i]>mx)mx=db[i];}
  let out=[],last=-1e9;for(let i=5;i<n;i++){let prev=1e9;for(let j=Math.max(0,i-8);j<i-1;j++)prev=Math.min(prev,db[j]);if(db[i]>mx-18&&db[i]-prev>7&&(i-last)*w/sr>.045){out.push(i*w/sr);last=i;}}
  if(out.length>2){const g=out.slice(1).map((v,i)=>v-out[i]).sort((a,b)=>a-b),med=g[g.length>>1];out=out.filter((v,i,a)=>i===0||v-a[i-1]>=med*.6);}return out;},
 async load(ctx,A){this.ctx=ctx;this.A=A;await Promise.all(FILES.map(async f=>{const r=await fetch('audio/real_sfx/'+(PATH[f]||f)+'.mp3');if(!r.ok)throw Error(f+': '+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());this.buffers.set(f,b);
  const on=/^close_auto/.test(f)?this.onsets(b):[0],gaps=on.slice(1).map((v,i)=>v-on[i]),med=gaps.length?[...gaps].sort((a,b)=>a-b)[gaps.length>>1]:null;(this._onCache=this._onCache||{})[f]=on;
  this.info[f]={seconds:+b.duration.toFixed(2),channels:b.numberOfChannels,onsets:on.length,cycleMs:med?Math.round(1000*med):null,medianGap:med,firstShot:on.length>1?+(on[1]-on[0]).toFixed(3):null,lastOnset:+on[on.length-1].toFixed(3)};}));
  addEventListener('mouseup',e=>{if(e.button===0)this.releaseLocal();},true);addEventListener('blur',()=>this.releaseLocal());this.ready=true;},
 _on(file){return this._onCache?.[file]||((this._onCache=this._onCache||{})[file]=this.onsets(this.buffers.get(file)));},
 level(k,d){const v=this.A?.mix?.[k];return Number.isFinite(v)?v:d;},
 // whole file, untouched, through a DreadingAudio chain (distance/panning/occlusion/bus)
 play(file,p,gain,max,opts={}){const A=this.A,ctx=this.ctx,b=this.buffers.get(file);if(!b)return null;const ch=A.chain(p,gain,max,{...opts,name:file,bus:'weapons'});if(!ch)return null;
  const s=ctx.createBufferSource();s.buffer=b;s.connect(ch.input);s.onended=()=>{try{s.disconnect();}catch(e){}ch.release();};s.start();return {ch,src:s};},
 // ---- burst engine (local automatic fire) ----
 seg(B,from,at,fade){const ctx=this.ctx,s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=B.buf;s.connect(g);g.connect(B.ch.input);from=Math.max(0,from);
  if(fade){g.gain.setValueAtTime(0,at);g.gain.setValueCurveAtTime(C_IN,at,XF);}else{g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(1,at+.002);}
  s.start(at,from);B.live++;const S={s,g,at,from,ready:at+(fade?XF:.002)+.001};B.log.push({at:+(at-B.t0).toFixed(3),from:+from.toFixed(3),rate:s.playbackRate.value});if(B.log.length>64)B.log.shift();
  s.onended=()=>{try{s.disconnect();g.disconnect();}catch(e){}if(--B.live<=0)this.end(B);};return S;},
 fadeOut(S,at){at=Math.max(at,S.ready);try{S.g.gain.cancelScheduledValues(at);S.g.gain.setValueCurveAtTime(C_OUT,at,XF);}catch(e){S.g.gain.setTargetAtTime(0,at,XF/3);}S.s.stop(at+XF+.01);},
 pos(B,t){return B.cur.from+(t-B.cur.at);},
 // crossfade from the current segment into buffer offset `to` so that the switch completes at audio time `at` (offset `to` reached at `at`)
 swap(B,to,at){const x0=at-XF;this.fadeOut(B.cur,x0);B.cur=this.seg(B,to-XF,x0,true);},
 end(B){if(B.ended)return;B.ended=true;B.state='done';B.ch.release();if(this.bursts.get(B.key)===B)this.bursts.delete(B.key);},
 release(key){const B=this.bursts.get(key);if(B&&B.state==='play')B.holdUntil=Math.min(B.holdUntil,this.ctx.currentTime);},
 releaseLocal(){if(!this.ctx)return;for(const k of this.localKeys)this.release(k);},
 tailFrom(B,n){const on=B.on,last=on.length-1;return on[last]+Math.max(.02,on[n]-PRE-on[n-1]);},
 burst(key,file,gain,rpm,local){const A=this.A,ctx=this.ctx,now=ctx.currentTime,iv=rpm?60/rpm:.1,hold=Math.max(.1,iv*1.5);let B=this.bursts.get(key);this.stats.rounds++;if(local)this.localKeys.add(key);
  if(B&&B.state==='play'&&B.file===file){B.rounds++;B.holdUntil=now+hold;
   // the recording has a long pause before its next shot (e.g. a lead single shot): jump straight to that shot
   const n=B.next,last=B.on.length-1;if(n<=last){const tb=B.cur.at+(B.on[n]-PRE-B.cur.from);if(tb-now>Math.max(2.5*B.med,hold)&&now+.006>=B.cur.ready){this.swap(B,B.on[n]-PRE,now+.006+XF);B.next=n+1;this.stats.jumps++;}}
   A.lastMix={...A.lastMix,name:file};return true;}
  if(B&&B.state==='tail'&&B.file===file&&!B.ended&&now-B.tailAt<.35&&B.on.length>2&&now+.006>=B.cur.ready){B.state='play';B.rounds++;B.holdUntil=now+hold;this.swap(B,B.on[1]-PRE,now+.006+XF);B.next=2;this.stats.resumes++;this.tickOn();return true;}
  const buf=this.buffers.get(file);if(!buf)return false;const ch=A.chain(null,gain,220,{direct:true,name:file,bus:'weapons'});if(!ch)return false;const on=this._on(file),info=this.info[file];
  B={key,file,buf,on,med:info.medianGap||.08,ch,live:0,rounds:1,holdUntil:now+hold,state:on.length>1?'play':'tail',tailAt:now,next:1,t0:now,log:[]};B.cur=this.seg(B,on[0]-PRE,now,false);
  this.bursts.set(key,B);this.stats.bursts++;this.lastBurst=B;if(B.state==='play')this.tickOn();return true;},
 tickOn(){if(!this._tick)this._tick=setInterval(()=>this.tick(),8);},
 tick(){const now=this.ctx.currentTime;let busy=false;for(const B of this.bursts.values()){if(B.state!=='play')continue;busy=true;const on=B.on,last=on.length-1;
  for(let guard=0;guard<8&&B.state==='play';guard++){const n=B.next;if(n>last){B.state='tail';B.tailAt=now;break;}
   const tb=B.cur.at+(on[n]-PRE-B.cur.from);if(tb-now>LOOK)break;
   // too late to place a clean crossfade before this attack (timer stall): let that shot play and decide at the next one
   if(tb-XF<now+.003||tb-XF<B.cur.ready){B.next++;continue;}
   const held=now<B.holdUntil&&(n>1||B.rounds>=2);
   if(held&&n<last){B.next++;continue;}
   if(held){const j=1+Math.floor(Math.random()*Math.max(1,Math.floor(last/2)));this.swap(B,on[j]-PRE,tb);B.next=j+1;this.stats.loops++;continue;}
   const tf=this.tailFrom(B,n);if(tf<B.buf.duration-.05)this.swap(B,tf,tb);else this.fadeOut(B.cur,tb-XF);B.state='tail';B.tailAt=tb;this.stats.releases++;}}
  if(!busy){clearInterval(this._tick);this._tick=null;}},
 // ---- routing ----
 suppressed(s,id){const def=s?.arms?.def||window.TacticalNS?.WEAPONS?.[id]||{},atts=s?.armsIdx===1?s?.secondaryAttachments:s?.attachments;return /suppress|silenc/i.test(id)||!!def.silent||(atts||[]).some(x=>/suppress|silenc/i.test(x));},
 def(s,id){return (s?.arms?.def&&(!id||s.arms.def.id===id||!s.arms.def.id))?s.arms.def:(window.TacticalNS?.WEAPONS?.[id]||s?.arms?.def||{});},
 // what a local (first-person) shot of this weapon plays: {file, mode:'stream'|'legacy'}
 resolve(id,def,suppressed){def=def||window.TacticalNS?.WEAPONS?.[id]||{};const cat=def.cat||'',fam=def.fam||'';
  if(suppressed)return {file:(cat==='pistol'||cat==='smg'||fam==='pistol'||fam==='smg')?'suppressed_close_rifle_B':'suppressed_close_rifle_A',mode:'stream'};
  if(!def.auto||AUTO_SHOTGUN.test(id)||cat==='shotgun')return {file:null,mode:'legacy'};
  if(AUTO[id])return {file:AUTO[id],mode:'stream'};if(HEAVY_MG.test(id))return {file:'close_auto_mg_A',mode:'stream'};if(MG.test(id)||cat==='lmg'||cat==='mg')return {file:'close_auto_mg_C',mode:'stream'};
  if(cat==='smg'||fam==='smg'||cat==='pistol')return {file:'close_auto_smg_C',mode:'stream'};return {file:/ak/i.test(id)?'close_auto_rifle_B':'close_auto_rifle_A',mode:'stream'};},
 distantFor(id,def){def=def||{};if(def.cat==='pistol'||def.fam==='pistol')return 'pistol';return def.auto?'auto':'rifle';},
 pick(prefix,n){return prefix+'_'+'ABC'[Math.floor(Math.random()*n)];},
 // returns true if handled; false lets dreading-audio.js use its existing sounds
 shot(s,p,id,local,dist){const def=this.def(s,id),key='w-'+(s?.uid??id),sup=this.suppressed(s,id);
  if(local){const r=this.resolve(id,def,sup);if(r.mode!=='stream')return false;this.lastResolve={id,...r};const g=this.level('gunLevel',1.42);
   if(sup){this.stats.singles++;this.stats.rounds++;return !!this.play(r.file,null,g,220,{direct:true})||true;}
   return this.burst(key,r.file,g,def.rpm,true)||true;}
  const st=this.distantState||(this.distantState=new Map());
  if(dist>65){const kind=this.distantFor(id,def),now=this.ctx.currentTime;let d=st.get(key);const cont=d&&now-d.t<Math.max(.3,(def.rpm?60/def.rpm:.12)*1.8);if(!cont){d={count:0};st.set(key,d);}d.count++;d.t=now;if(st.size>256)for(const [k,v]of st)if(now-v.t>5)st.delete(k);
   if(kind==='auto'){if(d.count===1){this.play(this.pick('distant_rifle',3),p,.5,400,{loud:true});}else if(d.count>=3&&now>=(d.busyUntil||0)){const f=this.pick('distant_auto',3);this.play(f,p,.5,400,{loud:true});d.busyUntil=now+this.buffers.get(f).duration-.4;}}
   else this.play(this.pick(kind==='pistol'?'distant_pistol':'distant_rifle',3),p,.5,400,{loud:true});this.stats.distant++;return true;}
  if(sup){this.play(this.pick('suppressed_rifle',3),p,.5,120,{});return true;}return false;},
 explosion(p,opt={}){const A=this.A,at=A.listener(),d=Math.hypot(...p.map((v,i)=>v-at[i]));const large=!!(opt.large||opt.vehicle||/vehicle|car|truck|tank|fuel|barrel/i.test(opt.name||''));
  const f=large?this.pick('explosion_vehicle',2):d>80?this.pick('explosion_distant',2):this.pick('explosion_grenade',3),g=this.level('blastLevel',1);this.stats.explosions++;this.lastExplosion={file:f,distance:d,large};return !!this.play(f,p,large?g*1.1:g,500,{loud:true})||true;},
 vehicleExplosion(p){return this.explosion(p,{large:true});}};
})();
