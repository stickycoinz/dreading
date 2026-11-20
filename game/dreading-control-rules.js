/* Pure, host-run control-match rules. Kept separate for deterministic rule tests. */
(function(g){'use strict';const R={win:300,duration:720,capture:10,incomeEvery:20,recovery:15};
R.fresh=round=>({round,phase:'waiting',score:[0,0],elapsed:0,income:0,recovery:[0,0],winner:null,countdown:5});
R.advance=function(s,points,dt){if(s.phase!=='playing'&&s.phase!=='overtime')return;dt=Math.max(0,Math.min(dt,.5));s.elapsed+=dt;s.income+=dt;const held=[0,0];for(const p of points)if(p.owner>=0&&!p.contested)held[p.owner]++;for(let side=0;side<2;side++)if(held[side]>=2)s.score[side]+=dt;let winner=s.score[0]>=R.win?0:s.score[1]>=R.win?1:null;if(s.elapsed>=R.duration){if(Math.abs(s.score[0]-s.score[1])>.00001)winner=s.score[0]>s.score[1]?0:1;else s.phase='overtime';}if(winner!==null){s.winner=winner;s.phase='finished';}return held;};
if(typeof module!=='undefined')module.exports=R;else g.DreadingControlRules=R;
})(typeof window!=='undefined'?window:globalThis);
