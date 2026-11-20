/* NIGHT_SURVIVAL material adaptation, PlayCanvas 2.24.1, WebGL2 GLSL.
Original atlas channels, body tone, recognition bands, indirect AO and cloth sheen restored.
Original map-specific lighting volume is intentionally not portable. PlayCanvas test-scene lighting is used.
Original direct-only AO multiplier is not reproduced; see README. */
(function(global){
const diffuseChunk="uniform sampler2D nightRM;\nuniform vec3 nightTone;\nuniform vec3 nightTag;\n\nuniform vec3 material_diffuse;\n\n#ifdef STD_DIFFUSEDETAIL_TEXTURE\n    #include \"detailModesPS\"\n#endif\n\nvoid getAlbedo() {\n    dAlbedo = material_diffuse.rgb;\n\n    #ifdef STD_DIFFUSE_TEXTURE\n        vec3 albedoTexture = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};\n\n        #ifdef STD_DIFFUSEDETAIL_TEXTURE\n            vec3 albedoDetail = {STD_DIFFUSEDETAIL_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSEDETAIL_TEXTURE_NAME}, {STD_DIFFUSEDETAIL_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSEDETAIL_TEXTURE_CHANNEL};\n            albedoTexture = detailMode_{STD_DIFFUSEDETAIL_DETAILMODE}(albedoTexture, albedoDetail);\n        #endif\n\n        dAlbedo *= albedoTexture;\n    #endif\n\n    #ifdef STD_DIFFUSE_VERTEX\n        dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});\n    #endif\n    float tagMask = smoothstep(0.7, 0.9, texture2D(nightRM, vUv0).r);\n    dAlbedo = mix(dAlbedo * nightTone, nightTag, tagMask);\n}\n";
const sheenChunk="\n\nuniform vec3 material_sheen;\n\nvoid getSheen() {\n    vec3 sheenColor = material_sheen;\n\n    #ifdef STD_SHEEN_TEXTURE\n    sheenColor *= {STD_SHEEN_TEXTURE_DECODE}(texture2DBias({STD_SHEEN_TEXTURE_NAME}, {STD_SHEEN_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_SHEEN_TEXTURE_CHANNEL};\n    #endif\n\n    #ifdef STD_SHEEN_VERTEX\n    sheenColor *= saturate(vVertexColor.{STD_SHEEN_VERTEX_CHANNEL});\n    #endif\n\n    vec3 rm = texture2D(nightRM, vUv0).rgb;\n    sSpecularity = vec3(0.45) * mix(dAlbedo, vec3(1.0), 0.15) * smoothstep(0.74, 0.86, rm.g) * (1.0 - smoothstep(0.1, 0.3, rm.b));\n}\n";
global.applyNightSurvivalMaterials=async function(app,containerAsset){
 const materials=containerAsset.resource.materials;
 if(!materials||!materials.length)throw new Error('Soldier container has no materials');
 const m=materials[0].resource;
 if(!m.diffuseMap||!m.metalnessMap)throw new Error('Original soldier atlases missing');
 m.diffuse.set(1,1,1);
 m.diffuseMapVertexColor=true;
 m.aoMapVertexColor=true;m.aoMapVertexColorChannel='a';m.aoIntensity=1;
 m.useSheen=true;m.sheen.set(.45,.45,.45);m.sheenGloss=.45;
 m.bumpiness=.36;
 m.shaderChunksVersion='2.24';
 m.shaderChunks.glsl.set('diffusePS',diffuseChunk);
 m.shaderChunks.glsl.set('sheenPS',sheenChunk);
 m.setParameter('nightRM',m.metalnessMap);
 m.setParameter('nightTone',[1.08,1.07,1.03]);
 m.setParameter('nightTag',[0.04905664341099647,0.2913649781911229,0.01462864647746829]);
 m.update();
 return {material:m.name,restored:['original albedo/normal/roughness/metalness atlases','original linear body tint','green recognition bands','indirect vertex AO','textile sheen mask'],limitations:['map-specific original lighting volume replaced by test-scene lights','original direct-diffuse AO reduction not ported','WebGL2 GLSL only; no WGSL override']};
};
})(globalThis);
