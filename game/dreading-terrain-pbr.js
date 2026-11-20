/* DREADING terrain-only PBR integration. No simulation or navigation mutations. */
(function (G) {
'use strict';
const T = G.DreadingTerrainPbr = { state: 'idle', error: null, enabled: new URLSearchParams(location.search).get('terrainPbr') === '1' };
const chunk = `
#ifndef DREADING_TERRAIN_BLEND
#define DREADING_TERRAIN_BLEND
uniform highp sampler2DArray terrainAlbedo;
uniform highp sampler2DArray terrainNormal;
uniform highp sampler2DArray terrainRoughness;
uniform sampler2D terrainMask0;
uniform sampler2D terrainMask1;
uniform sampler2D terrainMask2;
vec3 terrainC;
vec3 terrainN;
float terrainR;
bool terrainReady = false;
vec2 terrainUv(float layer) {
    vec2 tile = vec2(mod(layer,4.0),floor(layer/4.0));
    return (tile + (vec2(8.0) + fract(vPositionW.xz / 2.0) * 1008.0) / 1024.0) / vec2(4.0,2.0);
}
vec3 terrainFetch(highp sampler2DArray tex, float layer) {
    return texture(tex, vec3(vPositionW.xz / 2.0, layer)).rgb;
}
void terrainLayer(float layer, float weight) {
    vec3 c = terrainFetch(terrainAlbedo,layer);
    if(layer == 4.0) c = mix(c,vec3(0.12,0.125,0.12),0.15);
    terrainC = mix(terrainC,c,weight);
    terrainN = mix(terrainN,terrainFetch(terrainNormal,layer)*2.0-1.0,weight);
    terrainR = mix(terrainR,terrainFetch(terrainRoughness,layer).g,weight);
}
void terrainEvaluate() {
    if (terrainReady) return;
    terrainReady = true;
    vec2 uv = clamp((vPositionW.xz+150.0)/300.0,0.0,1.0);
    vec3 m0=texture2D(terrainMask0,uv).rgb;
    vec3 m1=texture2D(terrainMask1,uv).rgb;
    vec3 m2=texture2D(terrainMask2,uv).rgb;
    terrainC=terrainFetch(terrainAlbedo,0.0);
    float macro=0.5+0.25*sin(vPositionW.x*0.055+sin(vPositionW.z*0.07))+0.25*cos(vPositionW.z*0.041);
    terrainC*=mix(vec3(0.58,0.66,0.37),vec3(0.94,0.96,0.72),macro);
    terrainN=terrainFetch(terrainNormal,0.0)*2.0-1.0;
    terrainR=terrainFetch(terrainRoughness,0.0).g;
    terrainLayer(1.0,m0.r); terrainLayer(2.0,m0.g); terrainLayer(3.0,m0.b);
    terrainLayer(4.0,m1.r); terrainLayer(5.0,m1.g); terrainLayer(6.0,m1.b); terrainLayer(7.0,m2.r);
    ${new URLSearchParams(location.search).get('showcase')==='1' ? `
    // Local road wear and damp mineral breakup; retain authored surface masks.
    vec2 local=abs(vPositionW.xz-vec2(26.0,29.0));
    float area=(1.0-smoothstep(17.0,22.0,local.x))*(1.0-smoothstep(16.0,21.0,local.y));
    float wear=0.5+0.25*sin(vPositionW.x*1.7+sin(vPositionW.z*.83)*2.0)+0.25*cos(vPositionW.z*2.3);
    float road=max(m1.r,m2.r)*area;
    terrainC*=1.0-road*(.08+.20*wear);
    terrainR=mix(terrainR,.40,road*smoothstep(.62,.9,wear)*.65);
    ` : ''}
}
#endif
`;
function loadTexture(app, file, srgb) {
    return new Promise((resolve,reject) => {
        const image=new Image();
        image.onload=()=>{
            if(!file.startsWith('masks')) {
                const canvas=document.createElement('canvas');canvas.width=1008;canvas.height=1008;const ctx=canvas.getContext('2d',{willReadFrequently:true});const layers=[];
                for(let i=0;i<8;i++){ctx.clearRect(0,0,1008,1008);ctx.drawImage(image,(i%4)*1024+8,Math.floor(i/4)*1024+8,1008,1008,0,0,1008,1008);layers.push(new Uint8Array(ctx.getImageData(0,0,1008,1008).data));}
                const texture=new pc.Texture(app.graphicsDevice,{name:'terrain-array-'+file,width:1008,height:1008,arrayLength:8,format:srgb?pc.PIXELFORMAT_SRGBA8:pc.PIXELFORMAT_RGBA8,mipmaps:true,levels:[layers],anisotropy:4,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_REPEAT});texture.upload();resolve(texture);return;
            }
            const texture=new pc.Texture(app.graphicsDevice,{name:'terrain-pbr-'+file,format:srgb?pc.PIXELFORMAT_SRGBA8:pc.PIXELFORMAT_RGBA8,flipY:false,mipmaps:true,anisotropy:4,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
            texture.setSource(image);resolve(texture);
        };
        image.onerror=()=>reject(new Error('Terrain PBR texture failed: '+file));
        image.src='terrain-pbr/'+file;
    });
}
T.createMaterial=async function(app) {
    if(T.promise && T.device===app.graphicsDevice)return T.promise;
    T.device=app.graphicsDevice;T.state='loading';
    T.promise=(async()=>{
        const textures=await Promise.all([loadTexture(app,'albedo.jpg',true),loadTexture(app,'normal.jpg',false),loadTexture(app,'roughness.jpg',false),loadTexture(app,'masks0.png',false),loadTexture(app,'masks1.png',false),loadTexture(app,'masks2.png',false)]);
        const m=new pc.StandardMaterial();m.name='DREADING layered terrain PBR';m.useMetalness=true;m.metalness=0;m.diffuseVertexColor=false;m.normalMap=textures[3];m.gloss=1;
        const chunks=m.getShaderChunks(pc.SHADERLANGUAGE_GLSL);
        chunks.set('terrainBlendPS',chunk);
        chunks.set('diffusePS','#include "terrainBlendPS"\nvoid getAlbedo(){terrainEvaluate();dAlbedo=terrainC;}');
        chunks.set('glossPS','#include "terrainBlendPS"\nvoid getGlossiness(){terrainEvaluate();dGlossiness=clamp(1.0-terrainR,0.02,0.95);}');
        chunks.set('normalMapPS','#include "terrainBlendPS"\nvoid getNormal(){terrainEvaluate();vec3 n=normalize(dVertexNormalW);vec3 t=normalize(vec3(1.0,0.0,0.0)-n*n.x);vec3 b=normalize(cross(t,n));vec3 detail=normalize(mix(vec3(0.0,0.0,1.0),terrainN,0.45));dNormalW=normalize(t*detail.x+b*detail.y+n*detail.z);}');
        m.shaderChunksVersion='2.23';
        ['terrainAlbedo','terrainNormal','terrainRoughness','terrainMask0','terrainMask1','terrainMask2'].forEach((name,i)=>m.setParameter(name,textures[i]));m.update();T.state='ready';T.material=m;return m;
    })().catch(error=>{T.state='error';T.error=error.message;console.error(error);throw error;});
    return T.promise;
};
T.attach=function(app,entity,spec){
    if(!T.enabled)return;
    if(spec.mapHash!=='a2b72dc1'){T.state='map-mismatch';T.error='Paint masks are authored for Carentan map a2b72dc1';return;}
    T.createMaterial(app).then(material=>{if(entity.render && entity.parent){entity.render.meshInstances.forEach(mi=>{mi.material=material;});const roads=entity.parent.findByName('roads');if(roads && roads.render)roads.render.enabled=false;}}).catch(()=>{});
};
})(window);
