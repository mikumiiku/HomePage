/* Player exploration: current line of sight plus in-run map memory. */
export function createPlayerFog(T,{obstacles,color,materials}) {
  const size=96, span=70, origin=-35, cell=span/size;
  const pixels=new Uint8Array(size*size*4), explored=new Uint8Array(size*size);
  const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);
  texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;
  const uniforms={playerFogMap:{value:texture},playerFogActive:{value:0},playerFogTint:{value:new T.Color(color('fog'))}};
  const bound=new WeakSet();let age=0, pose={x:0,z:14,y:1.65,yaw:0,range:26,half:1.08}, occluders=[];
  function applyMaterial(material) {
    if(!material || bound.has(material) || !(material.isMeshStandardMaterial||material.isMeshBasicMaterial||material.isLineBasicMaterial))return;
    bound.add(material);const original=material.onBeforeCompile;
    material.onBeforeCompile=function(shader,renderer){
      original.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader='varying vec2 playerFogUV;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nplayerFogUV=((modelMatrix*vec4(transformed,1.0)).xz+35.0)/70.0;');
      shader.fragmentShader='uniform sampler2D playerFogMap;uniform float playerFogActive;uniform vec3 playerFogTint;varying vec2 playerFogUV;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',`vec2 knowledge=texture2D(playerFogMap,playerFogUV).rg;
        float visibility=clamp((knowledge.r*4.0+
          texture2D(playerFogMap,playerFogUV+vec2(0.0104,0.0)).r+
          texture2D(playerFogMap,playerFogUV-vec2(0.0104,0.0)).r+
          texture2D(playerFogMap,playerFogUV+vec2(0.0,0.0104)).r+
          texture2D(playerFogMap,playerFogUV-vec2(0.0,0.0104)).r)/8.0,0.0,1.0);
        float remembered=0.08+knowledge.g*0.14;
        gl_FragColor.rgb=mix(gl_FragColor.rgb,mix(playerFogTint,gl_FragColor.rgb,max(visibility,remembered)),playerFogActive);
        ${material.transparent?'gl_FragColor.a*=mix(1.0,visibility,playerFogActive);':''}
        #include <tonemapping_fragment>`);
    };
    material.customProgramCacheKey=()=> 'sandstrike-exploration-v2';material.needsUpdate=true;
  }
  Object.values(materials).forEach(applyMaterial);
  function blockedRay(x,z,margin=.6) {
    const dx=x-pose.x,dz=z-pose.z,length=Math.hypot(dx,dz);
    for(const o of occluders){
      let low=0,high=1;
      const axes=[[pose.x,dx,o.x-o.w/2,o.x+o.w/2],[pose.z,dz,o.z-o.d/2,o.z+o.d/2]];
      let hit=true;
      for(const [start,delta,min,max] of axes){
        if(Math.abs(delta)<.00001){if(start<min||start>max){hit=false;break;}}
        else {let a=(min-start)/delta,b=(max-start)/delta;if(a>b)[a,b]=[b,a];low=Math.max(low,a);high=Math.min(high,b);if(low>high){hit=false;break;}}
      }
      // A small wall-surface margin keeps revealed front faces free of grid seams.
      const nearEye=pose.y+(1.55-pose.y)*low,farEye=pose.y+(1.55-pose.y)*Math.min(1,high);
      if(hit&&low<high&&high>0&&Math.min(nearEye,farEye)<(o.top??7)+.02&&low*length<length-margin)return true;
    }
    return false;
  }
  function visibility(x,z,strict=false) {
    const dx=x-pose.x,dz=z-pose.z,distance=Math.hypot(dx,dz);
    if(distance>pose.range)return 0;
    const facing=(-Math.sin(pose.yaw)*dx-Math.cos(pose.yaw)*dz)/Math.max(.001,distance);
    if(distance>2.2&&facing<Math.cos(pose.half))return 0;
    if(blockedRay(x,z,strict?0:.6))return 0;
    return Math.min(1,(pose.range-distance)/2);
  }
  function reset(){pixels.fill(0);explored.fill(0);age=0;uniforms.playerFogActive.value=1;texture.needsUpdate=true;}
  function update(dt,player,yaw,scoped=false,force=false) {
    pose={x:player.x,z:player.z,y:player.y,yaw,range:scoped?48:26,half:scoped?.34:1.08};
    occluders=obstacles.filter(o=>(o.top??7)>player.y-.12);
    age-=dt;if(age>0&&!force)return;age=.12;
    for(let i=0;i<size*size;i++) {
      const x=origin+(i%size+.5)*cell,z=origin+(Math.floor(i/size)+.5)*cell,v=visibility(x,z);
      if(v>.1)explored[i]=1;
      pixels[i*4]=Math.round(v*255);pixels[i*4+1]=explored[i]*255;pixels[i*4+3]=255;
    }
    texture.needsUpdate=true;
  }
  function canSee(position){return uniforms.playerFogActive.value===0||visibility(position.x,position.z,true)>.03;}
  function knowledge(x,z){const gx=Math.floor((x-origin)/cell),gz=Math.floor((z-origin)/cell);if(gx<0||gz<0||gx>=size||gz>=size)return {visible:false,explored:false};const i=gz*size+gx;return {visible:pixels[i*4]>20,explored:!!explored[i]};}
  function shadeRadar(ctx,scale,center){
    ctx.fillStyle=color('fog');const width=cell*scale;
    for(let i=0;i<size*size;i++){ctx.globalAlpha=pixels[i*4]>20?0:explored[i]?.72:1;if(ctx.globalAlpha){const x=center+(origin+i%size*cell)*scale,z=center+(origin+Math.floor(i/size)*cell)*scale;ctx.fillRect(Math.round(x),Math.round(z),Math.round(x+width)-Math.round(x),Math.round(z+width)-Math.round(z));}}
    ctx.globalAlpha=1;
  }
  function theme(){uniforms.playerFogTint.value.set(color('fog'));}
  function dispose(){texture.dispose();}
  return {uniforms,applyMaterial,reset,update,canSee,knowledge,shadeRadar,theme,dispose};
}
