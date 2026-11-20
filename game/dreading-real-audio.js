/* Recorded FPS shots and single footsteps. The original audition MP3s stay intact. */
(function(g){'use strict';
g.DreadingRealAudio={async load(ctx,A){
 const response=await fetch('audio/real_sfx/playback.json');if(!response.ok)throw Error('Real sound manifest: '+response.status);
 const manifest=await response.json();
 await Promise.all(manifest.files.map(async file=>{
  const r=await fetch('audio/real_sfx/'+file.file);if(!r.ok)throw Error(file.file+': '+r.status);
  const source=await ctx.decodeAudioData(await r.arrayBuffer());
  for(const clip of file.clips){
   const start=Math.floor(clip.start*source.sampleRate),end=Math.min(source.length,Math.floor((clip.end??source.duration)*source.sampleRate));
   if(end<=start)throw Error('Invalid slice: '+clip.name);
   const out=ctx.createBuffer(source.numberOfChannels,end-start,source.sampleRate);
   let peak=0;for(let channel=0;channel<source.numberOfChannels;channel++){const data=source.getChannelData(channel);for(let i=start;i<end;i++)peak=Math.max(peak,Math.abs(data[i]));}
   const gain=clip.peakLimit?Math.min(1,clip.peakLimit/(peak||1)):1,fadeIn=Math.round(source.sampleRate*.001),fadeOut=Math.round(source.sampleRate*.018);
   for(let channel=0;channel<out.numberOfChannels;channel++){const data=out.getChannelData(channel);data.set(source.getChannelData(channel).subarray(start,end));for(let i=0;i<data.length;i++)data[i]*=gain*Math.min(1,i/fadeIn,(data.length-1-i)/fadeOut);}
   A.buffers.set(clip.name,out);A.metrics[clip.name]={source:file.file,start:clip.start,seconds:out.duration,peakDb:20*Math.log10(peak*gain||1e-9)};
  }
 }));
 A.realSteps=manifest.steps;A.realReady=true;
}};
})(window);
