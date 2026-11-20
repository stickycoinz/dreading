/* tacticalTag: put this on any Editor entity to tell the AI what it is. Edit "Kind" in the inspector.
   Alternative without the script: entity tags (nav-walkable, nav-obstacle, cover-low, cover-high, stairs, door,
   defend-area, nav-ignore, or tactical:<kind>; slot via a "slot:<id>" tag). */
var TacticalTag=pc.createScript('tacticalTag');
TacticalTag.attributes.add('kind',{type:'string',default:'obstacle',title:'Kind',
 description:'walkable = floor soldiers stand on; obstacle = blocks movement; coverLow / coverTall = blocks movement and is scored as cover; stair = invisible navigation ramp rising along local +Z; door = opening that must stay passable (checked on rebuild); defensiveArea = role destination slot (enemyDefend: radius = area the enemy squad holds); spawn = soldier spawn point (Slot id = soldier name, Team); threat = unused since milestone 3; decor = visual only (ignored by navigation)',
 enum:[{'Walkable surface':'walkable'},{'Obstacle':'obstacle'},{'Low cover object':'coverLow'},{'Tall cover object':'coverTall'},{'Stair ramp (navigation)':'stair'},{'Door / opening':'door'},{'Defensive area / role slot':'defensiveArea'},{'Threat marker (unused since M3)':'threat'},{'Soldier spawn':'spawn'},{'Decoration (no navigation)':'decor'}]});
TacticalTag.attributes.add('blocksSight',{type:'boolean',default:true,title:'Blocks sight',description:'Used by line-of-sight checks (perception and cover).'});
TacticalTag.attributes.add('slot',{type:'string',default:'',title:'Slot id',description:'Defensive areas: role slot (stairApproach1/2, overwatch1/2, enemyDefend). Soldier spawn: soldier name (ECHO, FOXTROT...).'});
TacticalTag.attributes.add('team',{type:'string',default:'',title:'Team',description:'Soldier spawn / defensive area: friendly or enemy.',enum:[{'(none)':''},{'Friendly':'friendly'},{'Enemy':'enemy'}]});
TacticalTag.attributes.add('radius',{type:'number',default:1,title:'Area radius (m)'});
TacticalTag.prototype.initialize=function(){};
