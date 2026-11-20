/* DREADING ambience beds (2026-11-19). Outdoors: steady wind (a/b slow crossfade) + gentle gust layer with occasional slow swells + distant city + dead-town bed.
   First-person inside a building: 1.5 s crossfade to interior room tone, outdoor beds ducked ~-15 dB and lowpassed. RTS always outdoor.
   Everything goes to the Ambience mixer bus; per-layer levels are DreadingAudio.mix.ambWind / ambGusts / ambTown / ambInterior (editor Audio tab). */
(function(){'use strict';
const FILES={wind_a:'wind_steady_loop_a',wind_b:'wind_steady_loop_b',gust_a:'wind_gusts_loop_v2_a',gust_b:'wind_gusts_loop_v2_b',city:'town_distant_city_loop',dead_a:'town_dead_bed_loop_v2_a',dead_b:'town_dead_bed_loop_v2_b',int_a:'interior_building_loop_v2_a',int_b:'interior_building_loop_v2_b'};
// Base level of each layer after loudness normalisation (all loops to -20 dBFS RMS, peaks capped). Mixer sliders multiply these (1 = default).
const BASE={wind:.32,gust:.16,town:.13,interior:.3},GUST_SWELL_MAX=1.6,DUCK=.178/* -15 dB */,DUCK_HZ=650,FADE=1.5,TARGET_RMS=.1;
const AM=window.DreadingAmbience={buffers:new Map(),started:false,indoor:false,forced:null,stats:{checks:0,indoorChecks:0,switches:0,swells:0},nodes:null,
 // seamless loop: trim leading/trailing digital silence (mp3 padding), then bake an equal-power crossfade of the tail into the head.
 prepare(ctx,b){const sr=b.sampleRate,ch=b.numberOfChannels;let s0=0,s1=b.length;const quiet=1e-4,limit=Math.floor(sr*.08);const loud=i=>{for(let c=0;c<ch;c++)if(Math.abs(b.getChannelData(c)[i])>quiet)return true;return false;};
  while(s0<limit&&!loud(s0))s0++;while(b.length-s1<limit&&s1>s0+1&&!loud(s1-1))s1--;const L=s1-s0,X=Math.min(Math.floor(sr*1.5),Math.floor(L/6)),N=L-X,out=ctx.createBuffer(ch,N,sr);let sum=0,peak=0;
  for(let c=0;c<ch;c++){const a=b.getChannelData(c),o=out.getChannelData(c);for(let i=0;i<N;i++){let v=a[s0+i];if(i<X){const t=i/X;v=v*Math.sin(t*Math.PI/2)+a[s0+N+i]*Math.cos(t*Math.PI/2);}o[i]=v;sum+=v*v;const m=Math.abs(v);if(m>peak)peak=m;}}
  const rms=Math.sqrt(sum/(N*ch))||1e-9,k=Math.min(TARGET_RMS/rms,.7/(peak||1));for(let c=0;c<ch;c++){const o=out.getChannelData(c);for(let i=0;i<N;i++)o[i]*=k;}
  return {buffer:out,info:{seconds:+(N/sr).toFixed(2),rmsDb:+(20*Math.log10(rms)).toFixed(1),gainDb:+(20*Math.log10(k)).toFixed(1),crossfade:+(X/sr).toFixed(2)}};},
 async load(ctx,A){this.ctx=ctx;this.A=A;this.info={};await Promise.all(Object.entries(FILES).map(async([id,name])=>{const r=await fetch('audio/ambience/'+name+'.mp3');if(!r.ok)throw Error(name+': '+r.status);const p=this.prepare(ctx,await ctx.decodeAudioData(await r.arrayBuffer()));this.buffers.set(id,p.buffer);this.info[name]=p.info;}));},
 loop(id,dest,gain){const ctx=this.ctx,b=this.buffers.get(id),s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=b;s.loop=true;g.gain.value=gain;s.connect(g);g.connect(dest);s.start(0,Math.random()*b.duration);return {s,g};},
 start(){const A=this.A,ctx=this.ctx;if(this.started||!ctx||!A?.buses?.ambience||this.buffers.size<9)return false;this.started=true;const dest=A.buses.ambience,n={};
  n.out=ctx.createGain();n.outFilter=ctx.createBiquadFilter();n.outFilter.type='lowpass';n.outFilter.frequency.value=20000;n.outFilter.Q.value=.5;n.out.connect(n.outFilter);n.outFilter.connect(dest);
  n.inside=ctx.createGain();n.inside.gain.value=0;n.inside.connect(dest);
  for(const k of ['wind','gust','town','interior']){n[k]=ctx.createGain();n[k].connect(k==='interior'?n.inside:n.out);}
  n.swell=ctx.createGain();n.swell.gain.value=1;n.swell.connect(n.gust);
  n.pairs={wind:[this.loop('wind_a',n.wind,.8),this.loop('wind_b',n.wind,.5)],gust:[this.loop('gust_a',n.swell,.75),this.loop('gust_b',n.swell,.5)],town:[this.loop('dead_a',n.town,.7),this.loop('dead_b',n.town,.45)],interior:[this.loop('int_a',n.interior,.75),this.loop('int_b',n.interior,.5)]};
  n.city=this.loop('city',n.town,.7);this.nodes=n;this.apply(true);this.clock=0;this.nextSwap=8;this.nextSwell=12+Math.random()*20;this.nextCheck=0;return true;},
 levels(){const m=this.A?.mix||{};return {wind:BASE.wind*(m.ambWind??1),gust:BASE.gust*(m.ambGusts??1),town:BASE.town*(m.ambTown??1),interior:BASE.interior*(m.ambInterior??1)};},
 apply(now){const n=this.nodes;if(!n)return;const t=this.ctx.currentTime,l=this.levels();for(const k in l){if(now)n[k].gain.value=l[k];else n[k].gain.setTargetAtTime(l[k],t,.1);}},
 ramp(param,to,t,dur,exp){param.cancelScheduledValues(t);param.setValueAtTime(param.value,t);if(exp)param.exponentialRampToValueAtTime(Math.max(1,to),t+dur);else param.linearRampToValueAtTime(to,t+dur);},
 setIndoor(v){if(!this.nodes||v===this.indoor)return;this.indoor=v;this.stats.switches++;const n=this.nodes,t=this.ctx.currentTime;this.ramp(n.out.gain,v?DUCK:1,t,FADE);this.ramp(n.outFilter.frequency,v?DUCK_HZ:20000,t,FADE,true);this.ramp(n.inside.gain,v?1:0,t,FADE);this.switchedAt=t;},
 // Indoors (first person only) uses the same perception blockers + TacticalCommon.rayWorld as sound occlusion:
 //   walls within 14 m in >=5 of 8 horizontal directions AND (an upper floor/slab overhead within 25 m, OR the ear is inside a building's footprint and >=6 directions hit walls).
 //   Single-storey roofs are not sight blockers in this map, hence the footprint fallback.
 detect(p){const T=window.tactical?.T,C=window.TacticalCommon;if(!T?.perception||!C?.rayWorld)return false;const B=T.perception.blockers;let walls=0;
  for(let i=0;i<8;i++){const a=i*Math.PI/4;if(C.rayWorld(p,[Math.cos(a),0,Math.sin(a)],14,B))walls++;}if(walls<5)return false;if(C.rayWorld(p,[0,1,0],25,B))return true;if(walls<6)return false;
  return B.some(b=>b.cluster&&p[0]>b.min[0]+.3&&p[0]<b.max[0]-.3&&p[2]>b.min[2]+.3&&p[2]<b.max[2]-.3&&p[1]>b.min[1]-.5&&p[1]<b.max[1]);},
 tick(dt){const A=this.A;if(!this.started){if(A?.ready)this.start();return;}this.clock+=dt;const n=this.nodes,t=this.ctx.currentTime;
  if(this.clock>=this.nextCheck){this.nextCheck=this.clock+.25;const T=window.tactical?.T;let want=false;if(this.forced!==null)want=this.forced;else if(T?.input?.fps&&T.camera){const c=T.camera.getPosition();want=this.detect([c.x,c.y,c.z]);}
   this.stats.checks++;if(want)this.stats.indoorChecks++;this.pending=want===this.lastWant?(this.pending||0)+1:0;this.lastWant=want;if(this.forced!==null||this.pending>=1)this.setIndoor(want);}
  // slow a/b crossfades hide the loop points: every 14-26 s swap which variant leads, over 7 s
  if(this.clock>=this.nextSwap){this.nextSwap=this.clock+14+Math.random()*12;for(const pair of Object.values(n.pairs)){const lead=Math.random()<.5?0:1;this.ramp(pair[lead].g.gain,.8,t,7);this.ramp(pair[1-lead].g.gain,.4+Math.random()*.2,t,7);}}
  // gentle gust swells: up to x1.6 (+4 dB) over 4-6 s, hold 1-3 s, back over 6-9 s; every 18-45 s
  if(this.clock>=this.nextSwell){this.nextSwell=this.clock+18+Math.random()*27;this.stats.swells++;const up=4+Math.random()*2,hold=1+Math.random()*2,down=6+Math.random()*3,peak=1.2+Math.random()*(GUST_SWELL_MAX-1.2),g=n.swell.gain;
   g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(peak,t+up);g.setValueAtTime(peak,t+up+hold);g.linearRampToValueAtTime(1,t+up+hold+down);}},
 snapshot(){const n=this.nodes;if(!n)return null;return {started:this.started,indoor:this.indoor,outdoorGain:n.out.gain.value,outdoorLowpassHz:n.outFilter.frequency.value,interiorGain:n.inside.gain.value,swell:n.swell.gain.value,levels:this.levels(),stats:{...this.stats},info:this.info};}};
AM.BASE=BASE;
const wait=setInterval(()=>{if(!window.tactical?.T?.ready)return;clearInterval(wait);tactical.app.on('update',dt=>{try{AM.tick(dt);}catch(e){(AM.errors=AM.errors||[]).push(e.message);}});},250);
})();
