/* World-space tactical feedback. All colours are owned by home.css. */
export function createTacticalFX(T, {scene, walls, color, fog}) {
  const palette=Object.fromEntries(['vision','alert','danger'].map(k=>[k,new T.Color(color(k))]));
  const cast=new T.Raycaster(), visionSegments=32, tracked=new Set(), particles=[], marks=[], pulses=[];
  const shellGeometry=new T.CylinderGeometry(.012,.012,.055,7);
  const chipGeometry=new T.IcosahedronGeometry(.025,0);
  const shellMaterial=new T.MeshStandardMaterial({color:color('flash'),metalness:.7,roughness:.35});
  const chipMaterial=new T.MeshBasicMaterial({color:color('trim')});
  const markerMaterial=new T.MeshBasicMaterial({color:color('rubber'),transparent:true,opacity:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const markerGeometry=new T.CircleGeometry(.043,8);
  [shellMaterial,chipMaterial,markerMaterial].forEach(fog.applyMaterial);
  const muzzle=new T.PointLight(color('flash'),0,3,2);scene.add(muzzle);let flashTime=0;
  const tint=e=>e.mode==='aim'||e.mode==='burst'?'danger':e.memory>0?'alert':'vision';
  function addEnemy(e) {
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(visionSegments*9),3).setUsage(T.DynamicDrawUsage));
    geometry.setAttribute('strength',new T.BufferAttribute(new Float32Array(visionSegments*3),1).setUsage(T.DynamicDrawUsage));
    const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,
      uniforms:{...fog.uniforms,tint:{value:new T.Color(color('vision'))},opacity:{value:.22}},
      vertexShader:'attribute float strength; varying float fade; varying vec2 fogUV; void main(){fade=strength;fogUV=(position.xz+35.0)/70.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 tint; uniform float opacity; uniform sampler2D playerFogMap; uniform float playerFogActive; varying float fade; varying vec2 fogUV; void main(){gl_FragColor=vec4(tint,opacity*fade*mix(1.0,texture2D(playerFogMap,fogUV).r,playerFogActive));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    });
    const mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=1;scene.add(mesh);
    const edgeGeometry=new T.BufferGeometry();edgeGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array((visionSegments+3)*3),3).setUsage(T.DynamicDrawUsage));
    const line=new T.Line(edgeGeometry,new T.LineBasicMaterial({color:color('vision'),transparent:true,opacity:.26,depthWrite:false}));fog.applyMaterial(line.material);line.frustumCulled=false;scene.add(line);
    e.vision={mesh,line,time:0,ranges:[]};tracked.add(e);
  }
  function updateVision(e,dt,playerHeight,clock) {
    if(!e.vision)return;
    const v=e.vision;v.mesh.visible=e.alive&&e.group.visible;v.line.visible=e.alive&&e.group.visible;if(!e.alive||!e.group.visible)return;
    const token=tint(e);v.mesh.material.uniforms.tint.value.copy(palette[token]);v.line.material.color.copy(palette[token]);
    const alert=e.memory>0, aiming=e.mode==='aim'||e.mode==='burst';
    v.mesh.material.uniforms.opacity.value=aiming?.36:alert?.26:.18;
    v.line.material.opacity=aiming?.8:alert?.62:.45;
    // Update world-space geometry at 10 Hz; colour changes respond immediately.
    v.time-=dt;if(v.time>0)return;v.time=.1;
    const origin=e.group.position, range=playerHeight<1.3?23:30, half=alert?.96:Math.PI/4;
    const positions=v.mesh.geometry.attributes.position, strength=v.mesh.geometry.attributes.strength, edge=v.line.geometry.attributes.position;
    const points=[];v.ranges=[];
    for(let i=0;i<=visionSegments;i++) {
      const angle=e.group.rotation.y-half+i/visionSegments*half*2;
      const direction=new T.Vector3(Math.sin(angle),(playerHeight-1.55)/range,Math.cos(angle)).normalize();
      cast.set(new T.Vector3(origin.x,1.55,origin.z),direction);cast.far=range;
      const hit=cast.intersectObjects(walls,false)[0], distance=hit?Math.max(.05,hit.distance-.08):range;
      points.push([origin.x+direction.x*distance,.035,origin.z+direction.z*distance]);v.ranges.push(distance);
    }
    edge.setXYZ(0,origin.x,.038,origin.z);
    points.forEach((p,i)=>edge.setXYZ(i+1,p[0],.038,p[2]));edge.setXYZ(visionSegments+2,origin.x,.038,origin.z);
    for(let i=0;i<visionSegments;i++) {
      positions.setXYZ(i*3,origin.x,.035,origin.z);positions.setXYZ(i*3+1,...points[i]);positions.setXYZ(i*3+2,...points[i+1]);
      strength.setX(i*3,1);strength.setX(i*3+1,Math.max(.08,1-v.ranges[i]/30));strength.setX(i*3+2,Math.max(.08,1-v.ranges[i+1]/30));
    }
    positions.needsUpdate=true;strength.needsUpdate=true;edge.needsUpdate=true;
  }
  function hideVision(e){if(e.vision){e.vision.mesh.visible=false;e.vision.line.visible=false;}}
  function removeEnemy(e){if(!e.vision)return;[e.vision.mesh,e.vision.line].forEach(m=>{scene.remove(m);m.geometry.dispose();m.material.dispose();});tracked.delete(e);e.vision=null;}
  function pulse(position) {
    const mesh=new T.Mesh(new T.RingGeometry(.94,1,48),new T.MeshBasicMaterial({color:color('alert'),transparent:true,opacity:.7,depthWrite:false,side:T.DoubleSide}));
    fog.applyMaterial(mesh.material);mesh.rotation.x=-Math.PI/2;mesh.position.set(position.x,.045,position.z);scene.add(mesh);pulses.push({mesh,life:1.1});
  }
  function emit(position,velocity,shell,life) {
    const mesh=new T.Mesh(shell?shellGeometry:chipGeometry,shell?shellMaterial:chipMaterial);mesh.position.copy(position);scene.add(mesh);
    particles.push({mesh,velocity,life,shell});
    if(particles.length>48){scene.remove(particles.shift().mesh);}
  }
  function eject(camera,id) {
    const origin=new T.Vector3(.16,-.15,-.6).applyMatrix4(camera.matrixWorld);
    const velocity=new T.Vector3(1.3+Math.random(),1.3,-.2).applyQuaternion(camera.quaternion);
    emit(origin,velocity,true,1.6);
  }
  function fire(camera,id){muzzle.position.copy(new T.Vector3(.16,-.15,-.6).applyMatrix4(camera.matrixWorld));muzzle.intensity=id==='sniper'?3:1.6;flashTime=.045;}
  function impact(hit) {
    if(!hit.face)return;
    const normal=hit.face.normal.clone().transformDirection(hit.object.matrixWorld),point=hit.point.clone().addScaledVector(normal,.012);
    const mark=new T.Mesh(markerGeometry,markerMaterial);mark.position.copy(point);mark.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);scene.add(mark);marks.push(mark);
    if(marks.length>32)scene.remove(marks.shift());
    for(let i=0;i<4;i++)emit(point,new T.Vector3((Math.random()-.5)*1.6,Math.random()*1.3,(Math.random()-.5)*1.6).addScaledVector(normal,1.1),false,.4+Math.random()*.2);
  }
  function update(dt) {
    flashTime-=dt;if(flashTime<=0)muzzle.intensity=0;
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.velocity.y-=9.8*dt;p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*7;p.mesh.rotation.z+=dt*5;
      if(p.mesh.position.y<.025){p.mesh.position.y=.025;p.velocity.y=Math.abs(p.velocity.y)*.25;p.velocity.x*=.75;p.velocity.z*=.75;}
      if(p.life<=0){scene.remove(p.mesh);particles.splice(i,1);}
    }
    for(let i=pulses.length-1;i>=0;i--){const p=pulses[i];p.life-=dt;p.mesh.scale.setScalar(.4+(1.1-p.life)*4);p.mesh.material.opacity=p.life*.55;if(p.life<=0){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();pulses.splice(i,1);}}
  }
  function theme(){Object.keys(palette).forEach(k=>palette[k].set(color(k)));shellMaterial.color.set(color('flash'));chipMaterial.color.set(color('trim'));markerMaterial.color.set(color('rubber'));muzzle.color.set(color('flash'));tracked.forEach(e=>{e.vision.time=0;});}
  function clear(){particles.forEach(p=>scene.remove(p.mesh));marks.forEach(m=>scene.remove(m));pulses.forEach(p=>{scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();});particles.length=marks.length=pulses.length=0;muzzle.intensity=0;}
  function dispose(){clear();[...tracked].forEach(removeEnemy);[shellGeometry,chipGeometry,markerGeometry,shellMaterial,chipMaterial,markerMaterial].forEach(o=>o.dispose());scene.remove(muzzle);}
  return {addEnemy,removeEnemy,hideVision,updateVision,pulse,fire,eject,impact,update,theme,clear,dispose};
}
