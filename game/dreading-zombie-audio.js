/* Zombie voices. 2026-11-19 rewrite ("most zombies make no noise / muted"):
   - every alive zombie near the ear now vocalises on a per-state timer (wander/investigate = quiet teeth-grind idle, chase = growl/snarl, feed = feeding),
     not only on a few state changes; wave zombies spend most of their life in 'investigate', which previously never made a sound;
   - event sounds (alert, scream, every bite, death) use their own keys so the 1.2 s idle gap can no longer swallow them;
   - buffers are peak-normalised on load (idle was -30 dBFS, horde -17, snarl -13) and given per-sound levels; voices come from head height;
   - nearest zombies win a voice budget (DreadingAudio.mix.zombieVoices) so they cannot starve gunfire of the 32 shared voices;
   - long loops play as 2.5-4.5 s faded slices; the horde bed plays whenever enough zombies are near. All routed to the Zombies / Ambience mixer buses. */
(function(){'use strict';
const names=['horde_distant_loop','runner_chase_snarl','runner_scream','screamer_alert','walker_alert_growl','walker_idle_loop','zombie_attack_bite','zombie_death_gurgle','zombie_feeding_loop'];
// Level of each sound after normalisation to -1 dBFS peak. Keeps Cody's choices: quiet idle, bites not too loud, runner scream a little lower than the screamer.
const LEVEL={walker_idle_loop:.32,zombie_feeding_loop:.4,walker_alert_growl:.6,runner_chase_snarl:.55,runner_scream:.6,screamer_alert:.75,zombie_attack_bite:.5,zombie_death_gurgle:.65,horde_distant_loop:.45};
const SLICE={walker_idle_loop:[2.5,4],zombie_feeding_loop:[3,4.5],runner_chase_snarl:[1.8,2.8],horde_distant_loop:[6,9]};
const Z=window.DreadingZombieAudio={LEVEL,stats:{played:{},events:0,periodic:0,skippedBudget:0,attempts:0,last:[]},active:0,
async load(ctx,A){await Promise.all(names.map(async name=>{const r=await fetch('audio/zombies/'+name+'.mp3');if(!r.ok)throw Error(name+': '+r.status);const b=await ctx.decodeAudioData(await r.arrayBuffer());
  let peak=0;for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);if(v>peak)peak=v;}}
  const k=peak>1e-5?Math.min(40,.89/peak):1;if(k!==1)for(let c=0;c<b.numberOfChannels;c++){const d=b.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=k;}
  A.buffers.set(name,b);A.metrics[name]={peakDb:20*Math.log10(peak||1e-9),normalisedBy:20*Math.log10(k),seconds:b.duration};}));},
voice(A,z,name,d,kind){const mix=A.mix||{},cap=(mix.zombieVoices||10)+(kind==='event'?4:0);this.stats.attempts++;if(this.active>=cap){this.stats.skippedBudget++;return null;}
  const b=A.buffers.get(name);if(!b)return null;const sl=SLICE[name];let opt={bus:'zombies',ref:mix.zombieRef,rolloff:mix.zombieRolloff};
  if(sl&&b.duration>sl[1]+.5){const dur=sl[0]+((z.uid*7+this.stats.attempts)%10)/10*(sl[1]-sl[0]),offset=((z.uid*1.37+this.clock*.61)%Math.max(.1,b.duration-dur));opt.offset=offset;opt.duration=dur;}
  const p=z.pos(),at=[p[0],p[1]+1.5,p[2]];
  const src=A.play(name,at,LEVEL[name]??.5,Math.max(60,mix.zombieHearDistance||45)+5,(kind==='event'?'zev-':'zvoice-')+z.uid,kind==='event'?.15:.5,opt);
  if(!src)return null;this.active++;src.addEventListener('ended',()=>{this.active=Math.max(0,this.active-1);});
  if(kind==='periodic'&&z._voiceSource)try{z._voiceSource.stop();}catch(e){}if(kind==='periodic')z._voiceSource=src;
  this.stats.played[name]=(this.stats.played[name]||0)+1;this.stats[kind==='event'?'events':'periodic']++;const m=A.lastMix||{};this.stats.last.push({name,kind,distance:+d.toFixed(1),gain:m.gain,occluded:m.occluded,bus:m.bus,refDistance:m.refDistance});if(this.stats.last.length>60)this.stats.last.shift();return src;},
interval(z,state){const c=Math.max(.1,(window.DreadingAudio?.mix?.zombieChatter)||1),j=((z.uid*13)%17)/17;return (state==='chase'?2.2+j*2:state==='feed'?3.5+j*2:4+j*4)/c;},
tick(T,dt){const A=window.DreadingAudio;if(!A?.ready||T.paused)return;this.clock=(this.clock||0)+dt;if(this.clock<(this.next||0))return;this.next=this.clock+.1;
 const mix=A.mix||{},hear=mix.zombieHearDistance||45,ear=A.listener?A.listener():(()=>{const c=T.camera.getPosition();return [c.x,c.y,c.z];})();
 const near=[];for(const z of T.zombies||[]){if(!z.active)continue;const p=z.pos();if(!p.every(Number.isFinite))continue;const d=Math.hypot(p[0]-ear[0],p[1]-ear[1],p[2]-ear[2]);
  const state=z.alive?z.state:'dead',old=z._voiceState;z._voiceState=state;
  // events: detected on every tick for every zombie in range, before the distance budget
  if(d<=hear+10&&old!==undefined&&state!==old){let name=null;if(state==='dead')name='zombie_death_gurgle';else if(state==='scream')name=z.type==='run'?'runner_scream':'screamer_alert';else if(state==='chase'&&old!=='attack'&&old!=='scream')name=z.type==='run'?'runner_chase_snarl':'walker_alert_growl';
   if(name&&this.voice(A,z,name,d,'event'))z._voiceNext=this.clock+this.interval(z,state)*.7;}
  if(state==='attack'){const at=z.attackT||0;if(d<=hear&&(old!=='attack'||at<(z._lastAttackT??0)))this.voice(A,z,'zombie_attack_bite',d,'event');z._lastAttackT=at;}
  if(z.alive&&d<=hear)near.push({z,d,state});}
 near.sort((a,b)=>a.d-b.d);
 for(const {z,d,state} of near){if(state==='attack'||state==='scream')continue;if(z._voiceNext===undefined){z._voiceNext=this.clock+((z.uid*0.73)%4);continue;}if(this.clock<z._voiceNext)continue;
  const name=state==='feed'?'zombie_feeding_loop':state==='chase'?(z.type==='run'?'runner_chase_snarl':'walker_alert_growl'):'walker_idle_loop';
  if(this.voice(A,z,name,d,'periodic'))z._voiceNext=this.clock+this.interval(z,state);else z._voiceNext=this.clock+.5;}
 const crowd=near.filter(o=>o.d<60);if(crowd.length>=(mix.hordeCount||6)&&this.clock>(this.hordeNext||0)){const c=[0,0,0];for(const o of crowd){const p=o.z.pos();c[0]+=p[0];c[1]+=p[1];c[2]+=p[2];}const at=c.map(v=>v/crowd.length);at[1]+=1.5;
  const b=A.buffers.get('horde_distant_loop'),src=b&&A.play('horde_distant_loop',at,LEVEL.horde_distant_loop*Math.min(1.6,.6+crowd.length/20),200,'horde',2,{bus:'ambience',ref:20,rolloff:.6});
  if(src){this.stats.played.horde_distant_loop=(this.stats.played.horde_distant_loop||0)+1;this.stats.horde=crowd.length;}this.hordeNext=this.clock+(b?.duration||10)-.5;}}};
const wait=setInterval(()=>{if(!window.tactical?.T?.ready)return;clearInterval(wait);tactical.app.on('update',dt=>Z.tick(tactical.T,dt));},250);
})();
