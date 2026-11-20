/* TacticalYuka (library, no script type): perception classes PORTED from Yuka 0.7.8
   (MIT License, Copyright (c) 2023 Yuka authors, https://github.com/Mugen87/yuka - see THIRD_PARTY_NOTICES.md):
     src/perception/vision/Vision.js        -> Vision
     src/perception/memory/MemoryRecord.js  -> MemoryRecord
     src/perception/memory/MemorySystem.js  -> MemorySystem
     src/core/Regulator.js                  -> Regulator
   Changes from the originals (marked "M3:"):
   - plain [x,y,z] arrays instead of Yuka Vector3/Ray; the owner supplies getWorldPosition(out) / getWorldDirection(out)
   - Regulator runs on simulation time passed to ready(now) (Yuka uses a wall-clock Time object) and takes a phase
     offset so soldiers' vision updates are staggered across frames
   - JSON serialization (toJSON/fromJSON/resolveReferences) removed */
(function(g){
'use strict';
function sub(a,b){return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function len(v){return Math.hypot(v[0],v[1],v[2]);}
function angleTo(a,b){var den=len(a)*len(b);if(den===0)return Math.PI/2;var t=(a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/den;return Math.acos(Math.max(-1,Math.min(1,t)));}

/* Vision: range + field of view (full cone angle, radians) + obstacles with lineOfSightTest(ray, outPoint). */
function Vision(owner){this.owner=owner||null;this.fieldOfView=Math.PI;this.range=Infinity;this.obstacles=[];}
Vision.prototype.addObstacle=function(o){this.obstacles.push(o);return this;};
Vision.prototype.removeObstacle=function(o){var i=this.obstacles.indexOf(o);if(i>=0)this.obstacles.splice(i,1);return this;};
Vision.prototype.visible=function(point){
 var owner=this.owner,obstacles=this.obstacles,worldPosition=owner.getWorldPosition([0,0,0]);
 // check if point lies within the game entity's visual range
 var toPoint=sub(point,worldPosition),distanceToPoint=len(toPoint);
 if(distanceToPoint>this.range)return false;
 // next, check if the point lies within the game entity's field of view
 var direction=owner.getWorldDirection([0,0,0]);
 if(angleTo(direction,toPoint)>this.fieldOfView*0.5)return false;
 // the point lies within range and field of view. now check if obstacles block the view to the given point.
 var ray={origin:worldPosition,direction:toPoint.map(function(v){return v/(distanceToPoint||1);})},intersectionPoint=[0,0,0];
 for(var i=0;i<obstacles.length;i++){
  var intersection=obstacles[i].lineOfSightTest(ray,intersectionPoint,distanceToPoint);
  if(intersection!==null){var d=sub(intersectionPoint,worldPosition);if(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]<=distanceToPoint*distanceToPoint)return false;}
 }
 return true;
};

/* MemoryRecord: what one soldier remembers about one other entity. */
function MemoryRecord(entity){this.entity=entity||null;this.timeBecameVisible=-Infinity;this.timeLastSensed=-Infinity;this.lastSensedPosition=[0,0,0];this.visible=false;}

/* MemorySystem: records per sensed entity; records older than memorySpan (s) are no longer "valid". */
function MemorySystem(owner){this.owner=owner||null;this.records=[];this.recordsMap=new Map();this.memorySpan=1;}
MemorySystem.prototype.getRecord=function(entity){return this.recordsMap.get(entity);};
MemorySystem.prototype.createRecord=function(entity){var record=new MemoryRecord(entity);this.records.push(record);this.recordsMap.set(entity,record);return this;};
MemorySystem.prototype.deleteRecord=function(entity){var record=this.getRecord(entity),index=this.records.indexOf(record);if(index>=0)this.records.splice(index,1);this.recordsMap.delete(entity);return this;};
MemorySystem.prototype.hasRecord=function(entity){return this.recordsMap.has(entity);};
MemorySystem.prototype.clear=function(){this.records.length=0;this.recordsMap.clear();return this;};
MemorySystem.prototype.getValidMemoryRecords=function(currentTime,result){
 var records=this.records;result.length=0;
 for(var i=0;i<records.length;i++){var record=records[i];if((currentTime-record.timeLastSensed)<=this.memorySpan)result.push(record);}
 return result;
};

/* Regulator: allows an update at most updateFrequency times per second. M3: simulation clock + phase offset. */
function Regulator(updateFrequency,phase){this.updateFrequency=updateFrequency||0;this._nextUpdateTime=phase||0;}
Regulator.prototype.ready=function(elapsedTime){
 if(elapsedTime>=this._nextUpdateTime){this._nextUpdateTime=elapsedTime+(1/this.updateFrequency);return true;}
 return false;
};
Regulator.prototype.reset=function(phase){this._nextUpdateTime=phase||0;};

g.TacticalYuka={Vision:Vision,MemoryRecord:MemoryRecord,MemorySystem:MemorySystem,Regulator:Regulator};
})(globalThis);
