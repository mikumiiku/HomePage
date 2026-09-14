/* 沙城突击：本地 WebGL 第一人称单人训练。Three.js MIT，自托管。 */
(function (M) {
  'use strict';
  const stage = M.stage('sandstrike');
  const version = new URL(document.currentScript.src).search;
  stage.classList.add('fps-stage');
  stage.dataset.state = 'loading';
  const loading = M.overlay(stage, { title: '正在准备训练场', lines: ['首次加载需要几秒钟。'], actions: [] });
  let expired = false;
  const timeout = setTimeout(() => { expired = true; failure(); }, 20000);
  function failure() {
    loading.remove();
    stage.querySelectorAll('.overlay').forEach(el => el.remove());
    M.overlay(stage, { title: '无法打开 3D 场景', lines: ['请使用支持 WebGL 的浏览器，并开启硬件加速后重试。'], actions: [{ label: '重新加载', primary: true, onClick: () => location.reload() }] });
  }
  Promise.all([
    import('/static/vendor/three/three.module.min.js?v=0.160.1'),
    import('/static/vendor/three/GLTFLoader.js' + version),
    import('/static/vendor/three/SkeletonUtils.js' + version),
    import('/static/js/games/sandstrike-models.js' + version),
    import('/static/js/games/sandstrike-tactics.js' + version),
    import('/static/vendor/three/BufferGeometryUtils.js' + version),
    import('/static/js/games/sandstrike-fog.js' + version),
  ]).then(async ([T, loaders, skeleton, models, tactics, geometry, fog]) => {
    const soldier = await new loaders.GLTFLoader().loadAsync('/static/models/sandstrike/soldier.glb' + version);
    return { T, soldier, clone: skeleton.clone, createArsenal: models.createArsenal, createTacticalFX: tactics.createTacticalFX, mergeGeometries: geometry.mergeGeometries, createPlayerFog: fog.createPlayerFog };
  }).then(({ T, soldier, clone, createArsenal, createTacticalFX, mergeGeometries, createPlayerFog }) => {
    clearTimeout(timeout);
    if (expired) return;
    loading.remove();
    try { setup(T, soldier, clone, createArsenal, createTacticalFX, mergeGeometries, createPlayerFog); } catch (error) { console.error('沙城突击初始化失败', error); failure(); }
  }).catch(error => { clearTimeout(timeout); console.error('3D 资源加载失败', error); failure(); });

  function setup(T, soldier, cloneSkeleton, createArsenal, createTacticalFX, mergeGeometries, createPlayerFog) {
    const G = M.savegame('sandstrike');
    const savedSettings = G.load().data.settings;
    let sound = savedSettings.sound;
    let primary = ['rifle', 'sniper', 'shotgun'].includes(savedSettings.primary) ? savedSettings.primary : 'rifle';
    const WEAPONS = {
      rifle: { name: '突击步枪', capacity: 30, reserve: 90, damage: 34, head: 100, interval: 0.135, reload: 1.65, range: 70, pellets: 1, spread: 0, fov: 48, tone: 135, noise: 42, kick: 0.016 },
      sniper: { name: '栓动狙击枪', capacity: 5, reserve: 20, damage: 100, head: 160, interval: 1.35, reload: 2.7, range: 100, pellets: 1, spread: 0, fov: 20, tone: 70, noise: 54, kick: 0.055 },
      shotgun: { name: '泵动霰弹枪', capacity: 8, reserve: 32, damage: 20, head: 30, interval: 0.85, reload: 0.6, range: 22, pellets: 9, spread: 0.055, fov: 58, tone: 85, noise: 46, kick: 0.043 },
      pistol: { name: '半自动手枪', capacity: 12, reserve: 48, damage: 28, head: 84, interval: 0.28, reload: 1.25, range: 50, pellets: 1, spread: 0, fov: 54, tone: 205, noise: 30, kick: 0.022 },
      knife: { name: '战术刀', capacity: 0, reserve: 0, damage: 65, head: 100, interval: 0.55, reload: 0, range: 2.1, pellets: 1, spread: 0, fov: 74, tone: 350 },
      grenade: { name: '破片手雷', capacity: 0, reserve: 0, interval: 0.7, reload: 0, fov: 74 },
    };
    let previousWeapon = primary;
    let active = primary, inventory = {}, grenades = 2, switchTime = 0, crouchToggle = false;
    const weapon = () => WEAPONS[active];
    const bag = () => inventory[active];
    function refill() { Object.entries(WEAPONS).forEach(([id, w]) => { inventory[id] = { ammo: w.capacity, reserve: w.reserve, cooldown: 0, heat: 0, shots: 0 }; }); grenades = 2; }
    refill();
    stage.innerHTML = `<div class="fps-viewport">
      <canvas class="fps-canvas" tabindex="0" aria-label="沙城突击训练场"></canvas>
      <div class="fps-status"><canvas class="fps-radar" width="224" height="224" aria-label="战术地图"></canvas><div class="fps-mission"><strong class="fps-clock">04:00</strong><span class="fps-round">1 / 3</span><span class="fps-objective"></span></div></div>
      <div class="fps-scope" hidden aria-hidden="true"><div class="fps-scope-lens"><span>4×</span></div></div><div class="fps-crosshair" aria-hidden="true"></div><div class="fps-damage" aria-hidden="true"></div>
      <div class="fps-message" role="status" aria-live="polite" hidden></div>
      <div class="fps-bottom"><div class="fps-stat fps-vitals" aria-label="生命"><span class="fps-health-icon" aria-hidden="true">+</span><b class="fps-health">100</b><span class="fps-posture fps-sr">站立</span><div class="fps-healthbar"><i></i></div></div><div class="fps-stat fps-rounds"><div class="fps-weapon-name">突击步枪</div><b class="fps-ammo">30</b><span class="fps-reserve">/ 90</span><div class="fps-action-progress" aria-hidden="true"><i></i></div></div></div>
      <div class="fps-slots" role="group" aria-label="切换武器">${['primary','pistol','knife','grenade'].map((id,i)=>`<button type="button" data-weapon="${id}"><span class="fps-slot-number">${i+1}</span><span class="fps-slot-preview" aria-hidden="true"></span><span class="fps-slot-label"></span></button>`).join('')}</div>
      <div class="fps-touch"><div class="fps-dpad"><button type="button" data-move="KeyW" aria-label="向前移动">前进</button><button type="button" data-move="KeyA" aria-label="向左移动">左移</button><button type="button" data-move="KeyS" aria-label="向后移动">后退</button><button type="button" data-move="KeyD" aria-label="向右移动">右移</button></div><div class="fps-touch-actions"><button type="button" class="fps-aim" aria-pressed="false">瞄准</button><button type="button" class="fps-crouch" aria-pressed="false">蹲下</button><button type="button" class="fps-throw">投雷</button><button type="button" class="fps-fire">射击</button></div></div>
      <button type="button" class="fps-pause fps-menu-button" aria-label="暂停游戏" title="暂停游戏"><span aria-hidden="true"></span></button>
      <button type="button" class="fps-reload">换弹</button>
      <div class="fps-toolbar"><div class="fps-loadout"><label for="fps-primary">主武器</label><select id="fps-primary" class="fps-primary" aria-label="选择主武器"><option value="rifle">突击步枪</option><option value="sniper">栓动狙击枪</option><option value="shotgun">泵动霰弹枪</option></select></div><button type="button" class="btn fps-sound"></button><button type="button" class="btn fps-fullscreen">全屏游戏</button></div>
    </div>`;
    const $ = name => stage.querySelector('.fps-' + name);
    const canvas = $('canvas'), viewport = $('viewport'), radar = $('radar'), loadout = $('loadout');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1 : 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(74, 1, 0.06, 110);
    camera.rotation.order = 'YXZ';
    scene.add(camera);
    const materials = {};
    const color = name => getComputedStyle(document.documentElement).getPropertyValue('--fps-' + name).trim();
    ['sand', 'stone', 'trim', 'wood', 'metal', 'enemy', 'cloth', 'glass', 'flash', 'gun', 'steel', 'rubber', 'foliage', 'clay'].forEach(name => {
      materials[name] = new T.MeshStandardMaterial({ color: color(name), roughness: name === 'steel' ? .36 : name === 'gun' ? .6 : .92, metalness: name === 'steel' ? .65 : name === 'gun' ? .3 : 0 });
    });
    const hemi = new T.HemisphereLight(color('sky'), color('sand'), 2.2);
    scene.add(hemi);
    const sun = new T.DirectionalLight(color('flash'), 3.2);
    sun.position.set(-14, 24, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -37, right: 37, top: 37, bottom: -37, near: 1, far: 70 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const obstacles = [], walls = [], decals = [];
    // Small deterministic plaster, paving and wood textures stay fully local.
    ['stone', 'sand', 'wood'].forEach(name => {
      const tile = document.createElement('canvas'); tile.width = tile.height = 128;
      const texture = new T.CanvasTexture(tile); texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.repeat.set(1, 1);
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      materials[name].map = texture;
      decals.push(() => {
        const ctx = tile.getContext('2d'); ctx.globalAlpha = 1; ctx.fillStyle = color('ui'); ctx.fillRect(0, 0, 128, 128);
        ctx.fillStyle = color('metal'); let seed = 71;
        for (let i = 0; i < 1800; i++) {
          seed = (seed * 16807) % 2147483647; const x = seed % 128;
          seed = (seed * 16807) % 2147483647; const y = seed % 128;
          ctx.globalAlpha = 0.025 + (seed % 9) / 100;
          ctx.fillRect(x, y, name === 'wood' ? 1 : 2, name === 'wood' ? 9 : 1);
        }
        ctx.globalAlpha = 0.15;
        if (name === 'wood') for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 1, 128);
        texture.needsUpdate = true;
      });
    });
    function box(x, y, z, w, h, d, material, parent = scene, solid = false) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), materials[material]);
      if (['stone', 'sand', 'wood'].includes(material)) {
        const uv = mesh.geometry.attributes.uv;
        const dimensions = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
        for (let i = 0; i < uv.count; i++) {
          const size = dimensions[Math.floor(i / 4)];
          uv.setXY(i, uv.getX(i) * size[0] / 2.5, uv.getY(i) * size[1] / 2.5);
        }
      }
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.materialToken = material;
      parent.add(mesh);
      if (solid) { obstacles.push({ x, z, w, d, top: y+h/2 }); walls.push(mesh); }
      return mesh;
    }
    box(0, -0.2, 0, 74, 0.4, 74, 'sand');
    // Perimeter buildings and crenellations frame an original courtyard map.
    [[-35, 0, 4, 70], [35, 0, 4, 70], [0, -35, 66, 4], [0, 35, 66, 4]].forEach(([x, z, w, d]) => {
      box(x, 3.5, z, w, 7, d, 'stone', scene, true);
      box(x, 7, z, w + 0.25, 0.3, d + 0.25, 'trim');
    });
    for (let n = -32; n <= 32; n += 4) {
      [-1, 1].forEach(side => {
        box(side * 32.96, 4.5, n, 0.1, 1.4, 0.85, 'glass');
        box(side * 32.75, 3.72, n, 0.5, 0.16, 1.1, 'trim');
        box(n, 4.5, side * 32.96, 0.85, 1.4, 0.1, 'glass');
        box(n, 7.4, side * 35, 1.3, 0.7, 4, 'stone');
      });
    }
    // An archway, side lanes, low cover and a raised central planter.
    box(-7, 2, -7, 1.6, 4, 3, 'stone', scene, true);
    box(1, 2, -7, 1.6, 4, 3, 'stone', scene, true);
    box(-3, 4.7, -7, 9.6, 1.4, 3, 'stone');
    const arch = new T.Mesh(new T.TorusGeometry(3.2, 0.4, 5, 24, Math.PI), materials.trim);
    arch.position.set(-3, 1.7, -5.44); scene.add(arch);
    box(-11, 1.5, 2, 7, 3, 1.2, 'stone', scene, true);
    box(10, 1.5, -3, 5, 3, 1.2, 'stone', scene, true);
    box(5, 0.65, 6, 3.5, 1.3, 3.5, 'stone', scene, true);
    box(5, 1.32, 6, 3.8, 0.15, 3.8, 'trim');
    function crate(x, z, size = 2, y = 0) {
      box(x, y + size / 2, z, size, size, size, 'wood', scene, true);
      [-0.38, 0.38].forEach(v => {
        box(x + v * size, y + size / 2, z, 0.1, size + 0.03, size + 0.03, 'trim');
        box(x, y + size * (v + 0.5), z, size + 0.03, 0.12, size + 0.03, 'trim');
      });
    }
    [[-8, 8, 2.4], [10, 10, 2.4], [-12, -10, 2.5], [9, -11, 2.5], [12, -10, 2.5], [-3, -1, 1.8], [12, 2, 1.8]].forEach(c => crate(...c));
    crate(10.5, -10.5, 1.8, 2.5);
    // Connected west market, central courtyard and east depot; every block has two exits.
    [[-18,-12,5,15],[-18,15,5,10],[18,-14,5,12],[18,15,5,12],[-6,-25,13,4],[11,27,10,4]].forEach(([x,z,w,d]) => {
      box(x,2.7,z,w,5.4,d,'stone',scene,true);
      box(x,5.5,z,w+0.35,0.24,d+0.35,'trim');
      for(let n=-d/2+1.5;n<d/2;n+=3) {
        box(x-w/2-0.02,3.5,z+n,0.05,1.1,0.8,'glass');
        box(x+w/2+0.02,3.5,z+n,0.05,1.1,0.8,'glass');
      }
    });
    [[-26,-23,2.6],[-24,2,2],[-28,17,2.2],[25,-13,2.4],[28,21,2.4],[5,-22,2],[4,25,2]].forEach(c=>crate(...c));
    [[-25,10],[25,-3],[-8,24],[9,-17]].forEach(([x,z])=>box(x,0.6,z,4,1.2,1.1,'stone',scene,true));
    // Market roofs stand above walkable alleys; their posts provide readable cover.
    [-28,-23].forEach(x=>{
      [-10,-4].forEach(z=>box(x,1.5,z,0.2,3,0.2,'wood',scene,true));
      box(x,3.05,-7,3.8,0.14,7,'cloth');
    });
    box(25,2.8,28,11,0.25,6,'wood');
    [20,30].forEach(x=>box(x,1.4,28,0.3,2.8,0.3,'metal',scene,true));
    // Ground paving joints: geometry, no remote textures.
    for (let n = -16; n <= 16; n += 2) {
      box(n, 0.006, 0, 0.018, 0.012, 34, 'trim');
      box(0, 0.007, n, 34, 0.012, 0.018, 'trim');
    }
    function sign(text, x, y, z, rotation = 0) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const texture = new T.CanvasTexture(c); texture.colorSpace = T.SRGBColorSpace;
      const mesh = new T.Mesh(new T.PlaneGeometry(2.6, 1.3), new T.MeshBasicMaterial({ map: texture, transparent: true }));
      mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
      decals.push(() => {
        const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 256, 128);
        ctx.fillStyle = color('enemy'); ctx.font = 'bold 86px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 95); texture.needsUpdate = true;
      });
    }
    sign('A', -7, 2.5, -5.46); sign('B', 10, 2.1, -2.38);
    sign('市场', -20.53, 2.2, 15, -Math.PI/2); sign('仓库', 20.53, 2.2, 15, Math.PI/2); sign('A', -6, 2.5, -22.94); sign('B', 11, 2.5, 24.94);
    // Market props, curved palm fronds and suspended cables give each route an identity.
    function palm(x,z,height=5) {
      const trunk=new T.Mesh(new T.CylinderGeometry(.13,.26,height,9),materials.wood);trunk.position.set(x,height/2,z);scene.add(trunk);
      walls.push(trunk);obstacles.push({x,z,w:.52,d:.52,top:height});
      const vertices=[],indices=[];
      for(let leaf=0;leaf<10;leaf++) {
        const angle=leaf*Math.PI*.2, length=2.2+(leaf%3)*.35, base=vertices.length/3;
        for(let i=0;i<=9;i++){
          const t=i/9, distance=t*length,width=Math.sin(t*Math.PI)*.26;
          const y=height+.3+Math.sin(t*Math.PI)*.48-t*t*.95;
          [-1,1].forEach(side=>vertices.push(x+Math.sin(angle)*distance+Math.cos(angle)*width*side,y,z+Math.cos(angle)*distance-Math.sin(angle)*width*side));
          if(i<9){const n=base+i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
        }
      }
      const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();
      const leaves=new T.Mesh(geometry,materials.foliage);scene.add(leaves);
    }
    materials.foliage.side=T.DoubleSide;
    [[-29,-28,5.8],[28,30,5],[-12,27,5.6],[29,-26,6.2]].forEach(p=>palm(...p));
    [-28,-24].forEach((x,i)=>{
      box(x,.7,-7,1.7,.18,1.6,'wood',scene,true);
      [-.65,.65].forEach(dx=>box(x+dx,.35,-7,.12,.7,1.4,'wood'));
      const pot=new T.Mesh(new T.LatheGeometry([new T.Vector2(.07,0),new T.Vector2(.28,.08),new T.Vector2(.36,.42),new T.Vector2(.26,.64),new T.Vector2(.25,.73)],16),materials.clay);
      pot.position.set(x,.8,-7);scene.add(pot);
      box(x,.93,-6.48,.6,.24,.35,'cloth');
    });
    for(let n=0;n<9;n++)box(-29.7+n*.48,3.1,-7,.45,.08,6.9,n%2?'sand':'cloth');
    [[-32,-22,32,-22],[-30,5,-18,5],[18,25,32,25]].forEach(([x1,z1,x2,z2])=>{
      const curve=new T.CatmullRomCurve3([new T.Vector3(x1,6,z1),new T.Vector3((x1+x2)/2,4.9,(z1+z2)/2),new T.Vector3(x2,6,z2)]);
      scene.add(new T.Mesh(new T.TubeGeometry(curve,24,.022,5,false),materials.metal));
    });
    // Batch immutable architecture; original invisible walls remain accurate raycast targets.
    scene.updateMatrixWorld(true);
    const batches = new Map();
    scene.children.filter(o=>o.isMesh).forEach(mesh=>{
      const list=batches.get(mesh.material)||[];
      list.push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)); batches.set(mesh.material,list); mesh.visible=false;
    });
    batches.forEach((geometries,material)=>{
      const geometry=mergeGeometries(geometries,false);
      if(!geometry)throw new Error('场景合并失败');
      const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
      geometries.forEach(g=>g.dispose());
    });
    const atmosphere=new T.Mesh(new T.SphereGeometry(95,24,12),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
      uniforms:{top:{value:new T.Color(color('sky-high'))},horizon:{value:new T.Color(color('sky'))},sunTint:{value:new T.Color(color('flash'))}},
      vertexShader:'varying vec3 skyDirection; void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 top;uniform vec3 horizon;uniform vec3 sunTint;varying vec3 skyDirection;void main(){vec3 d=normalize(skyDirection);float h=smoothstep(0.0,0.7,d.y);float glow=pow(max(0.0,dot(d,normalize(vec3(-0.5,0.8,0.3)))),48.0)*0.16;gl_FragColor=vec4(mix(horizon,top,h)+sunTint*glow,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    }));atmosphere.renderOrder=-2;scene.add(atmosphere);
    // Detailed weapon assemblies and articulated gloved hands share one view model.
    const gun = new T.Group(); camera.add(gun);
    const models = createArsenal(T, materials);
    Object.entries(models).forEach(([id, model]) => { gun.add(model); model.visible = id === active; });
    gun.scale.setScalar(0.8);
    const weaponPreviews = {};
    function buildWeaponPreviews() {
      const previewScene=new T.Scene(), target=new T.WebGLRenderTarget(192,64);
      const previewCamera=new T.OrthographicCamera(-1.1,1.1,.367,-.367,.1,10);
      previewCamera.position.set(3,0,-.35);previewCamera.lookAt(0,0,-.35);
      const silhouette=new T.MeshBasicMaterial({color:color('ui')});previewScene.overrideMaterial=silhouette;
      const oldTarget=renderer.getRenderTarget(), oldColor=renderer.getClearColor(new T.Color()), oldAlpha=renderer.getClearAlpha();
      renderer.setRenderTarget(target);renderer.setClearColor(color('panel'),0);
      Object.entries(models).forEach(([id,model])=>{
        const visible=model.visible, hands=[model.userData.parts.rightHand,model.userData.parts.leftHand].filter(Boolean);
        hands.forEach(h=>h.visible=false);previewScene.add(model);model.visible=true;renderer.render(previewScene,previewCamera);
        const pixels=new Uint8Array(192*64*4);renderer.readRenderTargetPixels(target,0,0,192,64,pixels);
        const c=document.createElement('canvas');c.width=192;c.height=64;const ctx=c.getContext('2d'),data=ctx.createImageData(192,64);
        for(let y=0;y<64;y++)data.data.set(pixels.subarray(y*768,(y+1)*768),(63-y)*768);
        ctx.putImageData(data,0,0);weaponPreviews[id]=c.toDataURL();gun.add(model);model.visible=visible;hands.forEach(h=>h.visible=true);
      });
      renderer.setRenderTarget(oldTarget);renderer.setClearColor(oldColor,oldAlpha);target.dispose();silhouette.dispose();
    }
    buildWeaponPreviews();
    const flash = new T.Mesh(new T.ConeGeometry(0.12, 0.3, 7), new T.MeshBasicMaterial({ color: color('flash'), depthTest: false }));
    flash.rotation.x = -Math.PI / 2; flash.renderOrder = 11; gun.add(flash); flash.visible = false;
    gun.traverse(o=>o.layers.set(1));hemi.layers.enable(1);sun.layers.enable(1);
    renderer.info.autoReset=false;
    function renderFrame() {
      renderer.info.reset();camera.layers.set(0);renderer.render(scene,camera);
      if(!gun.visible)return;
      // First-person geometry is rendered after world transparency and never tinted by cones.
      const background=scene.background, autoClear=renderer.autoClear, shadowUpdate=renderer.shadowMap.autoUpdate;
      try {
        renderer.autoClear=false;renderer.shadowMap.autoUpdate=false;scene.background=null;camera.layers.set(1);
        renderer.clearDepth();renderer.render(scene,camera);
      } finally {camera.layers.set(0);scene.background=background;renderer.autoClear=autoClear;renderer.shadowMap.autoUpdate=shadowUpdate;}
    }
    const thrown = [], effects = [], bullets = [];
    const fog = createPlayerFog(T,{obstacles,color,materials});
    scene.traverse(o=>{if(o.isMesh&&!(o.layers.mask&2))(Array.isArray(o.material)?o.material:[o.material]).forEach(fog.applyMaterial);});
    const tactical = createTacticalFX(T, {scene, walls, color, fog});

    let state = 'menu', health = 100, score = 0, round = 1, kills = 0, headshots = 0;
    let yaw = 0, pitch = 0, remaining = 240, reloadTime = 0, reloadWeapon = null, recoil = 0, damage = 0, hitTime = 0, waveDelay = 0;
    let clockTime = 0, slotTime = 0, autoFireAt = 0, pendingShot = false, firing = false, triggerWasHeld = false, aiming = false, footsteps = 0, messageTime = 0, last = 0, raf = 0, disposed = false;
    let enemies = [], flow = new Map();
    const keys = new Set(), player = new T.Vector3(0, 1.65, 14), ray = new T.Raycaster();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let audioContext;
    function audioShot(frequency, duration = 0.07, volume = 0.025) {
      if (!sound) return;
      try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(45, audioContext.currentTime + duration);
        gain.gain.setValueAtTime(volume, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
      } catch (_) { /* Muted fallback on devices without Web Audio. */ }
    }
    function setState(next) {
      state = next; stage.dataset.state = next;
      $('pause').disabled = next !== 'playing'; $('reload').disabled = next !== 'playing';
      $('primary').disabled = next === 'playing' || next === 'error';
      stage.querySelectorAll('[data-weapon]').forEach(b => { b.disabled = next !== 'playing'; });
      stage.querySelectorAll('.fps-touch button').forEach(b => { b.disabled = next !== 'playing'; });
    }
    function clearInput() { keys.clear(); pendingShot = false; firing = false; triggerWasHeld = false; aiming = false; stage.classList.remove('fps-tactical'); $('aim').setAttribute('aria-pressed', 'false'); }
    function notice(text, seconds = 2.4) { $('message').textContent = text; $('message').hidden = false; messageTime = seconds; }
    function hud() {
      $('health').textContent = Math.ceil(health); $('healthbar').firstElementChild.style.width = health + '%';
      const w = weapon(), rounds = bag();
      stage.classList.toggle('fps-low-health',health<=25);
      stage.classList.toggle('fps-selecting',slotTime>0);
      $('weapon-name').textContent = w.name;
      $('ammo').textContent = active === 'knife' ? '近战' : active === 'grenade' ? grenades : rounds.ammo;
      $('ammo').style.fontSize = active === 'knife' ? '20px' : '';
      const progress = reloadTime > 0 ? 1 - reloadTime / w.reload : active === 'sniper' && rounds.cooldown > 0 ? 1 - rounds.cooldown / w.interval : 0;
      $('action-progress').style.opacity = progress ? '1' : '0'; $('action-progress').firstElementChild.style.transform = 'scaleX(' + progress + ')';
      $('reserve').textContent = active === 'knife' ? '2 米' : active === 'grenade' ? '枚' : '/ ' + rounds.reserve;
      $('posture').textContent = isCrouching() ? '蹲伏' : '站立';
      $('crouch').textContent = crouchToggle ? '站起' : '蹲下'; $('crouch').setAttribute('aria-pressed', String(isCrouching()));
      $('throw').textContent = '投雷 ×' + grenades; $('throw').disabled = state !== 'playing' || grenades === 0;
      $('reload').disabled = state !== 'playing' || !w.capacity || rounds.ammo === w.capacity || !rounds.reserve || reloadTime > 0;
      stage.querySelectorAll('[data-weapon]').forEach(b => {
        const id=b.dataset.weapon==='primary'?primary:b.dataset.weapon, selected=id===active;
        b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',WEAPONS[id].name);
        b.querySelector('.fps-slot-label').textContent=WEAPONS[id].name+(id==='grenade'?' ×'+grenades:'');
        b.querySelector('.fps-slot-preview').style.setProperty('--weapon-preview', 'url("'+(weaponPreviews[id]||'')+'")');
      });
      $('round').textContent = round + ' / 3';
      $('objective').textContent = '剩余敌人 ' + enemies.filter(e => e.alive).length + ' · ' + score + ' 分';
      $('clock').textContent = M.fmt.clock(Math.ceil(remaining)); M.hud.score(score);
    }
    function blocked(x, z, radius = 0.34) {
      return Math.abs(x) > 32.5 || Math.abs(z) > 32.5 || obstacles.some(o => Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius);
    }
    function move(position, dx, dz) {
      if (!blocked(position.x + dx, position.z)) position.x += dx;
      if (!blocked(position.x, position.z + dz)) position.z += dz;
    }
    const navKey = (x, z) => x + ',' + z;
    function buildFlow() {
      const sx = Math.round(player.x), sz = Math.round(player.z);
      flow = new Map([[navKey(sx, sz), 0]]);
      const queue = [[sx, sz]];
      for (let i = 0; i < queue.length; i++) {
        const [x, z] = queue[i], next = flow.get(navKey(x, z)) + 1;
        [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]].forEach(([nx, nz]) => {
          const key = navKey(nx, nz);
          if (!flow.has(key) && !blocked(nx, nz, 0.45)) { flow.set(key, next); queue.push([nx, nz]); }
        });
      }
    }
    // Real skinned soldier mesh: independent skeletons, Idle/Walk animation blending.
    soldier.scene.updateMatrixWorld(true);
    const sourceBounds = new T.Box3().setFromObject(soldier.scene);
    const soldierScale = 1.9 / (sourceBounds.max.y - sourceBounds.min.y);
    function createEnemy(x, z, index) {
      const group = new T.Group(); scene.add(group); group.position.set(x, 0, z);
      const body = cloneSkeleton(soldier.scene); body.scale.multiplyScalar(soldierScale);
      body.position.y -= sourceBounds.min.y * soldierScale; body.rotation.y = Math.PI; group.add(body);
      const mixer = new T.AnimationMixer(body);
      const actions = {};
      soldier.animations.forEach(clip => { if (clip.name === 'Idle' || clip.name === 'Walk') actions[clip.name] = mixer.clipAction(clip).play(); });
      actions.Walk?.setEffectiveWeight(0); actions.Idle?.setEffectiveWeight(1);
      const enemy = { group, body, mixer, actions, hp: 100, alive: true, cooldown: .25 + index * .08, walk: index, head: null, mode: 'patrol', memory: 0, sense: 0, sees: false, timer: 0, magazine: 12, burst: 0, path: [], pathTime: 0, lastKnown: new T.Vector3(x,0,z), home: new T.Vector3(x,0,z), goal: new T.Vector3(x,0,z), aimPoint: new T.Vector3(), radioCooldown: 0, radioPending: null, reportRole: 0, reportDirection: new T.Vector3(0,0,1), fall: 0, searchScan: 0, hearingCooldown: 0 };
      body.traverse(o => {
        if (o.isBone && /Head$/.test(o.name)) enemy.head = o;
        if (o.isMesh) { (Array.isArray(o.material)?o.material:[o.material]).forEach(fog.applyMaterial); o.castShadow = true; o.receiveShadow = true; o.userData.enemy = enemy; o.frustumCulled = false; }
      });
      enemy.signal = new T.Mesh(new T.SphereGeometry(0.055,8,6), new T.MeshBasicMaterial({color:color('flash')})); group.add(enemy.signal); enemy.signal.position.set(0.1,1.28,1); enemy.signal.visible=false;
      enemy.weapon = new T.Group(); group.add(enemy.weapon); enemy.weapon.position.set(0.1, 1.25, 0.37);
      box(0, 0, 0, 0.11, 0.13, 0.42, 'gun', enemy.weapon);
      box(0, -0.03, -0.29, 0.12, 0.15, 0.22, 'rubber', enemy.weapon);
      box(0, -0.15, -0.05, 0.065, 0.22, 0.12, 'gun', enemy.weapon);
      box(0, -0.04, 0.31, 0.09, 0.1, 0.24, 'gun', enemy.weapon);
      const barrel = new T.Mesh(new T.CylinderGeometry(0.02,0.02,0.38,12), materials.gun);
      barrel.rotation.x = Math.PI/2; barrel.position.z = 0.57; enemy.weapon.add(barrel);
      for (let i=0;i<4;i++) box(0,0.083,i*0.055,0.12,0.015,0.016,'steel',enemy.weapon);
      const bones = []; body.traverse(o => { if (o.isBone) bones.push(o); });
      enemy.arms = ['Right','Left'].map(side => ['Arm','ForeArm','Hand'].map(part => bones.find(bone => bone.name.endsWith(side + part))));
      mixer.update(0.01); group.updateMatrixWorld(true); poseEnemyArms(enemy); tactical.addEnemy(enemy); enemies.push(enemy);
    }
    function turnBone(bone, child, target) {
      const start = bone.getWorldPosition(new T.Vector3());
      const current = child.getWorldPosition(new T.Vector3()).sub(start).normalize();
      const desired = target.clone().sub(start).normalize();
      const world = bone.getWorldQuaternion(new T.Quaternion());
      world.premultiply(new T.Quaternion().setFromUnitVectors(current, desired));
      bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(world));
      bone.updateMatrixWorld(true);
    }
    function poseEnemyArms(e) {
      e.group.updateMatrixWorld(true);
      e.arms.forEach(([upper, lower, hand], index) => {
        if (!upper || !lower || !hand) return;
        const start = upper.getWorldPosition(new T.Vector3()), elbow = lower.getWorldPosition(new T.Vector3()), wrist = hand.getWorldPosition(new T.Vector3());
        const target = e.weapon.localToWorld(new T.Vector3(index ? 0 : 0.01, -0.08, index ? 0.29 : -0.13));
        const hint = e.group.localToWorld(new T.Vector3(index ? -0.48 : 0.5, 1.01, 0.12));
        const first = start.distanceTo(elbow), second = elbow.distanceTo(wrist);
        const direction = target.clone().sub(start); const distance = Math.min(direction.length(), first + second - 0.001); direction.normalize();
        const bend = hint.sub(start); bend.addScaledVector(direction, -bend.dot(direction)).normalize();
        const along = (first * first - second * second + distance * distance) / (2 * distance);
        const height = Math.sqrt(Math.max(0, first * first - along * along));
        const elbowTarget = start.clone().addScaledVector(direction, along).addScaledVector(bend, height);
        turnBone(upper, lower, elbowTarget); turnBone(lower, hand, target);
      });
    }
    function clearEnemies() {
      enemies.forEach(e => { tactical.removeEnemy(e); e.signal.geometry.dispose(); e.signal.material.dispose(); e.mixer.stopAllAction(); e.mixer.uncacheRoot(e.body); e.weapon.traverse(o => { if (o.geometry) o.geometry.dispose(); }); scene.remove(e.group); });
      enemies = [];
    }
    function spawnWave() {
      clearEnemies(); clearProjectiles();
      const spots = [[-3, -18], [23, -22], [-25, -9], [25, 8], [-24, 24], [12, -27]];
      spots.slice(0, round + 3).forEach(([x, z], i) => createEnemy(x, z, i));
      remaining = 240; waveDelay = 0; buildFlow(); notice('第 ' + round + ' 轮', 1.5); hud();
    }
    function lockPointer() {
      if (matchMedia('(pointer: coarse)').matches || !canvas.requestPointerLock) return;
      try { const result = canvas.requestPointerLock(); if (result && result.catch) result.catch(() => {}); } catch (_) { /* Drag and direct-fire remain available. */ }
    }
    function removeOverlays() { $('toolbar').appendChild(loadout); stage.querySelectorAll('.overlay').forEach(el => el.remove()); stage.style.minHeight = ''; }
    function start() {
      removeOverlays(); clearInput(); player.set(0, 1.65, 14); yaw = 0; pitch = 0;
      health = 100; refill(); active = primary; switchTime = 0; crouchToggle = false; score = 0; round = 1; kills = 0; headshots = 0;
      reloadTime = 0; reloadWeapon = null; recoil = 0; damage = 0; hitTime = 0;
      equip(primary, true);
      fog.reset();fog.update(0,player,yaw,false,true);setState('playing'); spawnWave(); if(matchMedia('(pointer: coarse)').matches) viewport.scrollIntoView({block:'start'}); canvas.focus({ preventScroll: true }); lockPointer(); audioShot(200, 0.08, 0.01);
    }
    function showOverlay(title, lines, label, action) {
      removeOverlays();
      const overlay = M.overlay(viewport, { title, lines, actions: [{ label, primary: true, onClick: () => { $('toolbar').appendChild(loadout); action(); } }] });
      viewport.style.minHeight = '';
      overlay.querySelector('.overlay-card').insertBefore(loadout, overlay.querySelector('.choices'));
      if(state === 'paused') { const restart=document.createElement('button');restart.type='button';restart.className='btn';restart.textContent='重新开始';restart.addEventListener('click',start);overlay.querySelector('.choices').appendChild(restart); }
      if(state !== 'error') {
        const help=document.createElement('details');help.className='fps-help';
        help.innerHTML='<summary>操作与战术</summary><p>WASD 移动 · 左键 / 空格射击 · 右键切换瞄准<br>C 蹲伏 · R 换弹 · G 投雷 · Shift 奔跑<br>1—4 切枪 · Q 上一武器 · Tab 战术地图 · Esc 暂停<br>常规视野 26 米，狙击开镜 48 米；未探索区域被迷雾遮蔽。<br>地面视野：浅色巡逻，琥珀色警戒，红色瞄准。敌人会通过无线电共享最后目击位置。</p>';
        overlay.querySelector('.overlay-card').appendChild(help);
      }
      overlay.querySelector('button').focus({ preventScroll: true });
    }
    function pause() {
      if (state !== 'playing') return;
      setState('paused'); clearInput(); $('scope').hidden = true; $('crosshair').hidden = false; gun.visible = true; if (document.pointerLockElement === canvas) document.exitPointerLock();
      showOverlay('游戏已暂停', [], '继续游戏', () => { setState('playing'); canvas.focus({ preventScroll: true }); lockPointer(); });
    }
    function finish(win, reason) {
      if (state !== 'playing') return;
      setState('ended'); clearInput(); $('scope').hidden = true; $('crosshair').hidden = false; gun.visible = true; if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (win) score += Math.ceil(health) * 10;
      G.update(d => { d.stats.games++; d.stats.wins += win ? 1 : 0; d.stats.kills += kills; d.stats.headshots += headshots; d.best.score = Math.max(d.best.score, score); });
      M.hud.best(G.load().data.best.score); hud();
      showOverlay(win ? '三轮清场完成' : '训练结束', [reason, '本局 ' + score + ' 分 · 击败 ' + kills + ' 人 · 爆头 ' + headshots + ' 次', '最佳 ' + G.load().data.best.score + ' 分'], '再玩一局', start);
    }
    function isCrouching() { return crouchToggle; }
    function equip(id, force = false) {
      if ((!force && state !== 'playing') || !WEAPONS[id]) return;
      if(id!==active)previousWeapon = active; active = id; slotTime = 2.2; reloadTime = 0; reloadWeapon = null; switchTime = force ? 0 : 0.28;
      pendingShot = false; firing = false; triggerWasHeld = false; aiming = false; recoil = 0; flash.visible = false; gun.visible = true;
      camera.fov = 74; camera.updateProjectionMatrix();
      Object.entries(models).forEach(([key, model]) => { model.visible = key === active; });
      $('scope').hidden = true; $('aim').setAttribute('aria-pressed', 'false'); hud();
    }
    function reload() {
      const w = weapon(), rounds = bag();
      if (state !== 'playing' || reloadTime > 0 || !w.capacity || rounds.ammo === w.capacity) return;
      if (rounds.reserve <= 0) { notice('备用弹药已用完，本轮结束后补充'); return; }
      reloadTime = w.reload; reloadWeapon = active; aiming = false;
      audioShot(360, 0.1, 0.012); hud();
    }
    function hitEnemy(e, amount, head = false) {
      if (!e.alive || state !== 'playing') return;
      e.hp -= amount; hitTime = 0.16; e.memory = 7; e.lastKnown.copy(player); e.mode = 'search'; e.timer = 0.5;
      if (e.hp > 0) return;
      e.alive = false; e.fall=0; tactical.hideVision(e); kills++; if (head) headshots++; score += head ? 150 : 100;
      hitTime = 0.3; $('crosshair').classList.add('kill');
      if (enemies.every(enemy => !enemy.alive)) {
        if (round === 3) { finish(true, '训练完成，剩余生命已计入得分。'); return; }
        waveDelay = 2.5; notice('区域肃清', 2.5);
      }
    }
    function headHit(hit, e) {
      if (e.head) {
        const center = e.head.getWorldPosition(new T.Vector3());
        return hit.point.distanceTo(center) < 0.25;
      }
      return hit.point.y > e.group.position.y + 1.55;
    }
    function shoot() {
      if (state !== 'playing' || switchTime > 0 || bag().cooldown > 0) return;
      if (active === 'grenade') { throwGrenade(); return true; }
      const w = weapon(), rounds = bag();
      if (reloadTime > 0) {
        if (active !== 'shotgun' || rounds.ammo === 0) return;
        reloadTime = 0; reloadWeapon = null;
      }
      if (w.capacity && rounds.ammo <= 0) { if (rounds.reserve > 0) reload(); else { notice('弹药耗尽，请切换武器'); rounds.cooldown = 0.4; } return; }
      if (w.capacity) rounds.ammo--;
      rounds.cooldown = w.interval; autoFireAt = performance.now() + w.interval * 1000; recoil = 1;
      if(w.noise)hearNoise(player,w.noise); audioShot(w.tone, active === 'sniper' ? 0.18 : 0.08);
      camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
      if(w.capacity){tactical.fire(camera,active);if(active!=='sniper')tactical.eject(camera,active);else {rounds.caseEjected=false;rounds.boltSound=0;}}
      const targets = walls.concat(enemies.filter(e => e.alive).map(e => e.body));
      const hits = new Map();
      for (let i = 0; i < w.pellets; i++) {
        ray.setFromCamera(new T.Vector2(0, 0), camera);
        if (w.spread && i > 0) {
          // A stable radial pellet pattern makes range and partial cover predictable.
          const angle = i * 2.39996, radius = w.spread * Math.sqrt(i / (w.pellets - 1)) * (aiming ? 0.75 : 1) * (isCrouching() ? 0.8 : 1);
          const offset = new T.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(camera.quaternion);
          ray.ray.direction.add(offset).normalize();
        }
        ray.far = w.range;
        const hit = ray.intersectObjects(targets, true)[0];
        if(hit && !hit.object.userData.enemy && i===0)tactical.impact(hit);
        if (hit?.object.userData.enemy) {
          const e = hit.object.userData.enemy, head = headHit(hit, e);
          const amount = (head ? w.head : w.damage) * (active === 'shotgun' ? Math.max(0.15, 1 - hit.distance / 24) : 1);
          const record = hits.get(e) || { amount: 0, head: false }; record.amount += amount; record.head ||= head; hits.set(e, record);
        }
      }
      ray.far = Infinity;
      hits.forEach((hit, e) => hitEnemy(e, hit.amount, hit.head));
      if (hits.size) audioShot(560, 0.06, 0.013);
      
      if(w.kick) {
        // Move the actual aim after the bullet leaves: dragging down counters climb.
        const kick=w.kick*(aiming?.72:1)*(isCrouching()?.72:1)*(1+Math.min(rounds.heat,10)*.075);
        rounds.heat+=1;rounds.shots++;
        pitch=Math.min(1.25,pitch+kick);
        yaw+=Math.sin(rounds.shots*.85)*kick*(rounds.heat>4?.55:.22);
        camera.rotation.set(pitch,yaw,0);camera.updateMatrixWorld(true);
      }
      hud(); return true;
    }
    function clearProjectiles() {
      tactical.clear();
      [...thrown, ...effects, ...bullets].forEach(p => { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); });
      thrown.length = 0; effects.length = 0; bullets.length = 0;
    }
    function throwGrenade() {
      if (state !== 'playing' || grenades <= 0 || inventory.grenade.cooldown > 0 || switchTime > 0) return;
      grenades--; inventory.grenade.cooldown = 0.7;
      reloadTime = 0; reloadWeapon = null; recoil = 1;
      const direction = new T.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const origin = player.clone();
      const mesh = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), new T.MeshStandardMaterial({ color: color('cloth'), roughness: 0.65 }));
      fog.applyMaterial(mesh.material);mesh.castShadow = true; mesh.position.copy(origin); scene.add(mesh);
      const velocity = direction.multiplyScalar(11); velocity.y += 2.8;
      thrown.push({ mesh, velocity, fuse: 2 });
      audioShot(300, 0.12, 0.012); hud();
    }
    function clearLine(from, to) {
      const delta = to.clone().sub(from), distance = delta.length();
      if (distance < 0.01) return true;
      ray.set(from, delta.normalize()); ray.far = Math.max(0, distance - 0.05);
      const clear = !ray.intersectObjects(walls, false).length; ray.far = Infinity; return clear;
    }
    function explode(position) {
      hearNoise(position,48);
      if (state !== 'playing') return;
      const blast = new T.Mesh(new T.SphereGeometry(1, 20, 12), new T.MeshBasicMaterial({ color: color('flash'), transparent: true, opacity: 0.65, depthWrite: false }));
      fog.applyMaterial(blast.material);blast.position.copy(position); scene.add(blast); effects.push({ mesh: blast, life: 0.45 });
      audioShot(55, 0.4, 0.065);
      const center = position.clone(); center.y = Math.max(0.18, center.y);
      const selfDistance = center.distanceTo(player);
      if (selfDistance < 5 && clearLine(center, player)) {
        health = Math.max(0, health - Math.ceil(100 * (1 - selfDistance / 5))); damage = 0.8;
        if (health <= 0) { finish(false, '被手雷波及。投掷后注意保持距离。'); return; }
      }
      enemies.filter(e => e.alive).forEach(e => {
        const target = e.group.position.clone(); target.y = 1;
        const distance = target.distanceTo(center);
        if (distance < 6 && clearLine(center, target)) hitEnemy(e, 160 * (1 - distance / 6));
      });
      hud();
    }
    function updateProjectiles(dt) {
      for (let i = thrown.length - 1; i >= 0; i--) {
        const grenade = thrown[i]; grenade.fuse -= dt;
        let left = dt;
        while (left > 0) {
          const step = Math.min(left, 1 / 60); left -= step;
          grenade.velocity.y -= 9.8 * step;
          const delta = grenade.velocity.clone().multiplyScalar(step), distance = delta.length();
          ray.set(grenade.mesh.position, delta.clone().normalize()); ray.far = distance + 0.085;
          const hit = ray.intersectObjects(walls, false)[0]; ray.far = Infinity;
          if (hit) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
            grenade.mesh.position.copy(hit.point).addScaledVector(normal, 0.09);
            grenade.velocity.reflect(normal).multiplyScalar(0.48);
          } else grenade.mesh.position.add(delta);
          if (grenade.mesh.position.y < 0.09) { grenade.mesh.position.y = 0.09; grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.36; grenade.velocity.x *= 0.8; grenade.velocity.z *= 0.8; }
          grenade.mesh.rotation.x += step * 4;
        }
        if (grenade.fuse <= 0) { const position = grenade.mesh.position.clone(); scene.remove(grenade.mesh); grenade.mesh.geometry.dispose(); grenade.mesh.material.dispose(); thrown.splice(i, 1); explode(position); }
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i]; effect.life -= dt; effect.mesh.scale.setScalar(0.4 + (0.45 - effect.life) * 8); effect.mesh.material.opacity = Math.max(0, effect.life);
        if (effect.life <= 0) { scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); effects.splice(i, 1); }
      }
    }
    function visibleToEnemy(e) {
      const origin = e.group.position.clone(); origin.y = 1.55;
      const direction = player.clone().sub(origin); const distance = direction.length();
      ray.set(origin, direction.normalize()); ray.far = distance;
      const visible = ray.intersectObjects(walls, false).length === 0; ray.far = Infinity; return visible;
    }
    // Navigation uses each soldier's remembered target, never the hidden player's position.
    function routeTo(e, target) {
      const sx=Math.round(e.group.position.x), sz=Math.round(e.group.position.z);
      const tx=Math.round(target.x), tz=Math.round(target.z), start=navKey(sx,sz), end=navKey(tx,tz);
      const queue=[[sx,sz]], previous=new Map([[start,null]]); let found=false;
      for(let i=0;i<queue.length;i++) {
        const [x,z]=queue[i], key=navKey(x,z); if(key===end){found=true;break;}
        for(const [nx,nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]) {
          const k=navKey(nx,nz); if(!previous.has(k)&&!blocked(nx,nz,0.45)){previous.set(k,key);queue.push([nx,nz]);}
        }
      }
      e.path=[]; if(!found)return;
      for(let k=end;k&&k!==start;k=previous.get(k)) e.path.unshift(k.split(',').map(Number));
    }
    function coverGoal(e) {
      const candidates=[];
      obstacles.forEach(o=>{
        if(o.w>15||o.d>15)return;
        [[o.x-o.w/2-1,o.z],[o.x+o.w/2+1,o.z],[o.x,o.z-o.d/2-1],[o.x,o.z+o.d/2+1]].forEach(([x,z])=>{
          const v=new T.Vector3(x,1.1,z), d=v.distanceTo(e.group.position);
          if(d<11&&!blocked(x,z,0.5)&&!clearLine(e.lastKnown,v))candidates.push({v,d});
        });
      });
      candidates.sort((a,b)=>a.d-b.d);
      return candidates[0]?.v || e.group.position.clone();
    }
    function enemyBullet(e) {
      const origin=e.group.position.clone(); origin.y=1.28;
      // Track only confirmed sightings; fast bullets still sweep the full path against cover.
      const target=e.aimPoint.clone(), spread=0.12+origin.distanceTo(target)*0.009;
      const angle=Math.random()*Math.PI*2, radius=Math.sqrt(Math.random())*spread;
      target.x+=Math.cos(angle)*radius; target.y+=Math.sin(angle)*radius;
      const velocity=target.sub(origin).normalize().multiplyScalar(220);
      const mesh=new T.Mesh(new T.CylinderGeometry(0.025,0.025,0.65,5),new T.MeshBasicMaterial({color:color('flash')}));
      fog.applyMaterial(mesh.material);mesh.position.copy(origin); mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),velocity.clone().normalize()); scene.add(mesh);
      bullets.push({mesh,velocity,life:.6}); e.magazine--; audioShot(95,0.045,0.009);
    }
    function updateBullets(dt) {
      for(let i=bullets.length-1;i>=0;i--) {
        const b=bullets[i], length=b.velocity.length()*dt, direction=b.velocity.clone().normalize();
        ray.set(b.mesh.position,direction); ray.far=length;
        const wall=ray.intersectObjects(walls,false)[0];
        const onRay=new T.Vector3(), onBody=new T.Vector3();
        const sq=ray.ray.distanceSqToSegment(new T.Vector3(player.x,0.25,player.z),new T.Vector3(player.x,player.y-0.12,player.z),onRay,onBody);
        const travel=onRay.distanceTo(b.mesh.position);
        const hit=sq<0.28*0.28 && travel<=length && (!wall||travel<wall.distance);
        ray.far=Infinity; b.life-=dt;
        if(hit){health=Math.max(0,health-(10+(round-1)*2)); damage=0.5; if(health<=0)finish(false,'生命耗尽。敌人举枪时可以横移或退回掩体。');}
        if(hit||wall||b.life<=0){scene.remove(b.mesh);b.mesh.geometry.dispose();b.mesh.material.dispose();bullets.splice(i,1);}
        else b.mesh.position.addScaledVector(b.velocity,dt);
      }
    }
    function hearNoise(position, radius) {
      enemies.forEach(e=>{
        if(!e.alive||e.sees||e.hearingCooldown>0)return;
        const ear=e.group.position.clone();ear.y=1.55;
        const source=position.clone();source.y=Math.max(.3,source.y);
        const audible=radius*(clearLine(ear,source)?1:.6);
        if(ear.distanceTo(source)>audible)return;
        // Sound gives an approximate, fixed source location, not ongoing wall vision.
        const angle=e.walk*2.39996+.7;
        const estimate=source.clone().add(new T.Vector3(Math.cos(angle)*1.4,0,Math.sin(angle)*1.4));
        if(blocked(estimate.x,estimate.z,.5))estimate.copy(source);
        e.lastKnown.copy(estimate);e.memory=14;e.searchScan=0;e.reportRole=0;
        e.hearingCooldown=.3;e.path=[];e.pathTime=0;
        if(e.mode==='patrol')e.mode='search';
        if(!['aim','burst'].includes(e.mode))e.group.rotation.y=Math.atan2(estimate.x-ear.x,estimate.z-ear.z);
        if(e.mode==='search')searchGoal(e);e.vision.time=0;
      });
    }
    function broadcastAlert(sender, report) {
      // Radio transmits a dated sighting, never a live reference to the player.
      tactical.pulse(sender.group.position); audioShot(680,.055,.008);
      enemies.forEach(ally=>{
        if(ally===sender||!ally.alive||ally.group.position.distanceTo(sender.group.position)>24)return;
        if(ally.sees)return;
        ally.lastKnown.copy(report);ally.memory=Math.max(ally.memory,14);ally.searchScan=0;ally.pathTime=0;ally.path=[];
        ally.reportRole=ally.walk%3-1;
        ally.reportDirection.copy(report).sub(sender.group.position);ally.reportDirection.y=0;ally.reportDirection.normalize();
        ally.radioCooldown=Math.max(ally.radioCooldown,3);
        if(!['aim','burst','cover','reload'].includes(ally.mode)){ally.mode='search';ally.timer=.55;}
        ally.vision.time=0;tactical.pulse(ally.group.position);
      });
    }
    function setEnemyGoal(e, target) {
      if(Math.hypot(e.goal.x-target.x,e.goal.z-target.z)>.75) {
        e.goal.set(target.x,0,target.z);e.path=[];e.pathTime=0;
      }
    }
    function searchGoal(e) {
      const goal=e.lastKnown.clone();
      if(e.reportRole && !e.sees) {
        const offset=e.reportRole*4.5;
        const x=e.lastKnown.x+e.reportDirection.z*offset,z=e.lastKnown.z-e.reportDirection.x*offset;
        if(!blocked(x,z,.5))goal.set(x,0,z);
      }
      setEnemyGoal(e,goal);
    }
    function updateEnemies(dt) {
      let attackers=enemies.filter(e=>e.alive&&(e.mode==='aim'||e.mode==='burst')).length;
      enemies.forEach(e=>{
        if(state!=='playing')return;
        if(!e.alive){e.fall+=dt;const t=Math.min(1,e.fall/.55);e.group.rotation.z=(e.walk%2?1:-1)*t*1.45;e.group.position.y=t*.15;e.group.visible=e.fall<4&&fog.canSee(e.group.position);tactical.hideVision(e);return;}
        e.group.visible=fog.canSee(e.group.position);
        if(waveDelay>0)return;
        const pos=e.group.position, dx=player.x-pos.x, dz=player.z-pos.z, distance=Math.hypot(dx,dz);
        e.hearingCooldown=Math.max(0,e.hearingCooldown-dt);
        e.radioCooldown=Math.max(0,e.radioCooldown-dt);
        if(e.radioPending){e.radioPending.delay-=dt;if(e.radioPending.delay<=0){broadcastAlert(e,e.radioPending.position);e.radioPending=null;}}
        e.timer-=dt; e.cooldown-=dt; e.memory=Math.max(0,e.memory-dt); e.pathTime-=dt; e.sense-=dt;
        if(e.sense<=0) {
          e.sense=0.08;
          const facing=(Math.sin(e.group.rotation.y)*dx+Math.cos(e.group.rotation.y)*dz)/Math.max(distance,0.01);
          e.sees=distance<(isCrouching()?23:30) && (facing>Math.cos(e.memory>0?.96:Math.PI/4)||distance<1.3) && visibleToEnemy(e);
          if(e.sees){
            e.lastKnown.copy(player);e.memory=14;e.searchScan=0;e.reportRole=0;
            if(e.radioCooldown<=0&&!e.radioPending){e.radioPending={delay:.65,position:player.clone()};e.radioCooldown=6;}
          }
        }
        e.signal.visible=e.mode==='aim'||e.mode==='burst';const signalToken=e.signal.visible?'danger':'alert';if(e.signalToken!==signalToken){e.signalToken=signalToken;e.signal.material.color.set(color(signalToken));}
        let moving=false;
        if(e.mode==='aim') {
          if(e.sees)e.aimPoint.lerp(new T.Vector3(player.x,player.y-.4,player.z),Math.min(1,dt*9));
          e.group.rotation.y=Math.atan2(e.aimPoint.x-pos.x,e.aimPoint.z-pos.z);
          if(!e.sees){e.mode='search';e.timer=0.6;e.path=[];e.pathTime=0;searchGoal(e);attackers--;}
          else if(e.timer<=0){e.mode='burst';e.burst=Math.min(e.magazine,round===1?4:5);e.timer=0;}
        } else if(e.mode==='burst') {
          if(e.timer<=0){if(e.sees){enemyBullet(e);e.aimPoint.lerp(new T.Vector3(player.x,player.y-.4,player.z),.6);}e.burst--;e.timer=0.12;}
          if(e.burst<=0||!e.sees){e.mode='cover';setEnemyGoal(e,coverGoal(e));e.path=[];e.timer=.85+Math.random()*.35;e.cooldown=e.timer;attackers--;e.pathTime=0;}
        } else {
          if(e.magazine<=0 && e.mode!=='reload'){e.mode='reload';e.timer=1.8;}
          if(e.mode==='reload') {if(e.timer<=0){e.magazine=12;e.mode='search';e.path=[];e.pathTime=0;}}
          else if(e.sees && e.cooldown<=0 && attackers<3 && distance<25 && e.mode!=='cover') {
            e.mode='aim';e.timer=.32+Math.random()*.18-(round-1)*.025;e.aimPoint.copy(player);e.aimPoint.y-=0.4;attackers++;
            
          } else {
            if(e.mode==='cover' && e.timer<=0){e.mode='search';e.pathTime=0;}
            if(e.mode!=='cover') {
              if(e.memory>0){e.mode='search';searchGoal(e);}
              else {
                if(e.mode!=='patrol'||pos.distanceTo(e.goal)<1||e.path.length===0){
                  e.mode='patrol';e.path=[];e.pathTime=0; const angle=Math.random()*Math.PI*2;
                  const x=e.home.x+Math.cos(angle)*5,z=e.home.z+Math.sin(angle)*5;
                  if(!blocked(x,z,0.5)){setEnemyGoal(e,new T.Vector3(x,0,z));}
                }
              }
              // Waiting attackers strafe along a visible flank rather than stacking on the player.
              if(e.sees && distance<15){const side=e.walk%2?1:-1;const x=pos.x+dz/Math.max(distance,1)*side*3,z=pos.z-dx/Math.max(distance,1)*side*3;if(!blocked(x,z,0.5))setEnemyGoal(e,new T.Vector3(x,0,z));}
            }
            if(e.pathTime<=0){routeTo(e,e.goal);e.pathTime=1.3;}
            if(e.path.length){const [x,z]=e.path[0],mx=x-pos.x,mz=z-pos.z,len=Math.hypot(mx,mz);if(len<0.18)e.path.shift();else{const speed=e.mode==='patrol'?2.35:e.mode==='cover'?3.5:3.1;move(pos,mx/len*dt*speed,mz/len*dt*speed);if(e.memory<=0)e.group.rotation.y=Math.atan2(mx,mz);moving=true;}}
          }
        }
        // Alert soldiers can retreat/strafe while watching the last confirmed threat.
        if(e.memory>0 && !['aim','burst'].includes(e.mode)) {
          const scanning=!e.sees&&e.mode==='search'&&Math.hypot(pos.x-e.goal.x,pos.z-e.goal.z)<1.6;
          e.group.rotation.y=Math.atan2(e.lastKnown.x-pos.x,e.lastKnown.z-pos.z)+(scanning?Math.sin(clockTime*1.8+e.walk)*.9:0);
          if(scanning){e.searchScan+=dt;if(e.searchScan>=3){e.memory=0;e.path=[];e.pathTime=0;}}
        }
        tactical.updateVision(e,dt,player.y,clockTime);
        e.actions.Walk?.setEffectiveWeight(moving?1:0); e.actions.Idle?.setEffectiveWeight(moving?0:1);
        e.mixer.update(dt);e.weapon.rotation.x=0;poseEnemyArms(e);
      });
      updateBullets(dt);
    }
    function update(dt) {
      if (state !== 'playing') return;
      Object.values(inventory).forEach(rounds => { rounds.cooldown = Math.max(0, rounds.cooldown - dt); rounds.heat=Math.max(0,rounds.heat-dt*2.3);if(rounds.heat===0)rounds.shots=0; });
      switchTime = Math.max(0, switchTime - dt); recoil = Math.max(0, recoil - dt * 7);
      clockTime += dt; slotTime = Math.max(0,slotTime-dt); tactical.update(dt);
      damage = Math.max(0, damage - dt * 1.4); hitTime = Math.max(0, hitTime - dt); if(hitTime===0)$('crosshair').classList.remove('kill');
      messageTime -= dt; if (messageTime <= 0) $('message').hidden = true;
      if (reloadTime > 0) {
        reloadTime -= dt;
        if (reloadTime <= 0 && reloadWeapon) {
          const rounds = inventory[reloadWeapon], w = WEAPONS[reloadWeapon];
          const take = Math.min(reloadWeapon === 'shotgun' ? 1 : w.capacity - rounds.ammo, rounds.reserve);
          rounds.ammo += take; rounds.reserve -= take;
          if (reloadWeapon === 'shotgun' && rounds.ammo < w.capacity && rounds.reserve > 0) { reloadTime = w.reload; audioShot(340, 0.05, 0.01); }
          else { reloadTime = 0; reloadWeapon = null; }
        }
      }
      if (waveDelay > 0) {
        waveDelay -= dt;
        if (waveDelay <= 0) { round++; health = Math.min(100, health + 35); refill(); reloadTime = 0; reloadWeapon = null; spawnWave(); }
      } else { remaining = Math.max(0, remaining - dt); if (remaining <= 0) { finish(false, '本轮时间已到。'); return; } }
      if (keys.has('ArrowLeft')) yaw += dt * 1.7;
      if (keys.has('ArrowRight')) yaw -= dt * 1.7;
      if (keys.has('ArrowUp')) pitch = Math.min(1.25, pitch + dt * 1.2);
      if (keys.has('ArrowDown')) pitch = Math.max(-1.25, pitch - dt * 1.2);
      const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
      const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const moving = forward || side, speed = (isCrouching() ? 1.7 : keys.has('ShiftLeft') ? 6 : active === 'knife' ? 4.6 : 3.8) * dt / (Math.hypot(forward, side) || 1);
      move(player, (side * Math.cos(yaw) - forward * Math.sin(yaw)) * speed, (-forward * Math.cos(yaw) - side * Math.sin(yaw)) * speed);
      footsteps += moving ? dt * 10 : 0;
      player.y += ((isCrouching() ? 1.02 : 1.65) - player.y) * Math.min(1, dt * 14);
      camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
      camera.updateMatrixWorld(true);
      const triggerHeld = firing || keys.has('Space');
      if (triggerHeld && !triggerWasHeld) pendingShot = true;
      if (pendingShot || (triggerHeld && active === 'rifle' && performance.now() >= autoFireAt)) { if (shoot()) pendingShot = false; }
      triggerWasHeld = triggerHeld;
      fog.update(dt,player,yaw,active==='sniper'&&aiming&&bag().cooldown<=0&&reloadTime<=0);
      updateEnemies(dt);
      if (state === 'playing') updateProjectiles(dt);
      const scoped = active === 'sniper' && aiming && bag().cooldown <= 0 && reloadTime <= 0;
      const cycle = bag().cooldown / weapon().interval;
      const cycling = active === 'sniper' && cycle > 0;
      const boltPhase = 1 - cycle;
      const smooth = v => { v=T.MathUtils.clamp(v,0,1);return v*v*(3-2*v); };
      const pull = smooth((boltPhase-.16)/.22)*(1-smooth((boltPhase-.57)/.22));
      const reach = smooth(boltPhase/.16)*(1-smooth((boltPhase-.78)/.18));
      const parts = models[active].userData.parts;
      if(cycling && boltPhase>.32 && !bag().caseEjected){tactical.eject(camera,active);bag().caseEjected=true;}
      if(cycling && bag().boltSound<3 && boltPhase>[.16,.58,.86][bag().boltSound]){audioShot([330,240,410][bag().boltSound],.035,.009);bag().boltSound++;}
      if (parts.bolt) { parts.bolt.position.z=.13+pull*.15;parts.bolt.rotation.z=reach*-.9; parts.rightHand.position.set(.044+reach*.15,-.15+reach*.1,.13+pull*.15);parts.rightHand.rotation.z=-reach*.4; }
      if (parts.pump) parts.pump.position.z = -0.46 + Math.sin(cycle * Math.PI) * 0.16;
      if (parts.slide) parts.slide.position.z = -0.14 + recoil * 0.05;
      const lowered = active === 'sniper';
      const bob = !reducedMotion && moving ? Math.sin(footsteps)*.009 : 0;
      // Keep the scope's housing below the centre ray throughout the entire bolt cycle.
      gun.position.set(cycling ? .43 : lowered ? .34 : aiming ? .1 : .24,
        (lowered ? -.43 : -.29) - (cycling ? .07+pull*.025 : 0) - (reloadTime>0 ? Math.sin(reloadTime/weapon().reload*Math.PI)*.2 : 0) - switchTime*.6 + bob,
        -.6+recoil*.04);
      gun.rotation.set(cycling ? -.12 : recoil*(weapon().kick||0)*2.5, active==='knife'?recoil*.5:cycling?.13:0,
        reloadTime>0?-.3:active==='knife'?-recoil*.7:cycling?-.18-reach*.05:0);
      gun.visible = !scoped;
      flash.position.set(0, 0.025, (models[active].userData.muzzleZ || -1) - 0.12);
      flash.visible = recoil > 0.55 && weapon().capacity > 0;
      $('scope').hidden = !scoped; $('crosshair').hidden = scoped;
      $('aim').setAttribute('aria-pressed', String(aiming));
      const fov = scoped ? 20 : aiming && weapon().capacity && active !== 'sniper' ? weapon().fov : 74;
      if(cycling && camera.fov < 60){camera.fov=74;camera.updateProjectionMatrix();}
      if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
      $('damage').style.opacity = damage; $('crosshair').classList.toggle('hit', hitTime > 0); hud();
    }
    function drawRadar() {
      if(!stage.classList.contains('fps-tactical'))return;
      const ctx = radar.getContext('2d'), scale = 3.1, center = 112;
      ctx.clearRect(0, 0, 224, 224); ctx.fillStyle = color('trim');
      obstacles.forEach(o => ctx.fillRect(center + (o.x - o.w / 2) * scale, center + (o.z - o.d / 2) * scale, o.w * scale, o.d * scale));
      ctx.fillStyle = color('enemy'); enemies.filter(e => e.alive && fog.canSee(e.group.position)).forEach(e => { ctx.beginPath(); ctx.arc(center + e.group.position.x * scale, center + e.group.position.z * scale, 4, 0, Math.PI * 2); ctx.fill(); });
      fog.shadeRadar(ctx,scale,center);
      ctx.save(); ctx.translate(center + player.x * scale, center + player.z * scale); ctx.rotate(-yaw);
      ctx.fillStyle = color('ui'); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-5, 5); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function render(now) {
      if (disposed) return;
      let elapsed = last ? Math.min((now - last) / 1000, 0.5) : 0; last = now;
      // Preserve elapsed simulation time on slower devices; cap catch-up after suspension.
      while (elapsed > 0 && state === 'playing') { const step = Math.min(elapsed, 0.05); update(step); elapsed -= step; }
      if (!document.hidden && state === 'playing') { renderFrame(); drawRadar(); }
      raf = requestAnimationFrame(render);
    }
    function resize() {
      stage.style.setProperty('--fps-toolbar-height', '0px');
      const w = viewport.clientWidth, h = viewport.clientHeight;
      stage.style.setProperty('--fps-scope-size', h * 0.78 + 'px');
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); renderFrame(); drawRadar();
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(viewport);
    function theme() {
      const dark = M.theme.isDark();
      tactical.theme();fog.theme();
      atmosphere.material.uniforms.top.value.set(color('sky-high'));atmosphere.material.uniforms.horizon.value.set(color('sky'));atmosphere.material.uniforms.sunTint.value.set(color('flash'));
      Object.keys(materials).forEach(name => materials[name].color.set(color(name)));
      gun.traverse(o => { if (o.isMesh && o.userData.materialToken) o.material.color.set(color(o.userData.materialToken)); });
      scene.background = new T.Color(color('sky')); scene.fog = new T.Fog(color('sky'), 48, 105);
      hemi.color.set(color('sky')); hemi.groundColor.set(color('sand'));
      sun.intensity = dark ? 1.6 : 3.2; hemi.intensity = dark ? 2.8 : 2.2;
      renderer.toneMappingExposure = dark ? 1.15 : 1;
      decals.forEach(draw => draw());
      renderFrame();
    }
    window.addEventListener('themechange', theme);
    // Poly Haven CC0 textures, copied into this site's embedded static resources.
    const textureLoader = new T.TextureLoader();
    [['stone','stone'], ['sand','ground'], ['wood','wood']].forEach(([material, file]) => {
      ['color','normal'].forEach(kind => {
        textureLoader.load('/static/img/sandstrike/' + file + '-' + kind + '.jpg' + version, texture => {
          if (disposed) { texture.dispose(); return; }
          texture.wrapS = texture.wrapT = T.RepeatWrapping;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          if (kind === 'color') texture.colorSpace = T.SRGBColorSpace;
          const slot = kind === 'color' ? 'map' : 'normalMap';
          const previous = materials[material][slot];
          materials[material][slot] = texture;
          materials[material].normalScale.set(0.55, 0.55);
          materials[material].needsUpdate = true;
          gun.traverse(o => {
            if (o.isMesh && o.userData.materialToken === material) {
              o.material[slot] = texture; o.material.normalScale.set(0.55, 0.55); o.material.needsUpdate = true;
            }
          });
          if (previous) previous.dispose();
          renderFrame();
        }, undefined, () => { /* Procedural material remains usable if a texture fails. */ });
      });
    });
    const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'KeyR', 'KeyC', 'KeyG', 'KeyQ', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'Digit4']);
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape') { pause(); return; }
      if (state !== 'playing' || e.isComposing || (e.target !== canvas && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) { e.preventDefault(); return; }
      if (gameKeys.has(e.code)) { e.preventDefault(); keys.add(e.code); }
      if (!e.repeat && e.code === 'Space') requestShot();
      if (e.code === 'KeyR') reload();
      if (!e.repeat && e.code === 'KeyC') crouchToggle = !crouchToggle;
      if (e.code === 'Tab') stage.classList.add('fps-tactical');
      if (!e.repeat && e.code === 'KeyQ') equip([primary,'pistol','knife','grenade'].includes(previousWeapon)?previousWeapon:'pistol');
      if (!e.repeat && e.code === 'KeyG') throwGrenade();
      if (!e.repeat && /^Digit[1-4]$/.test(e.code)) equip([primary, 'pistol', 'knife', 'grenade'][Number(e.code.slice(-1)) - 1]);
    });
    window.addEventListener('keyup', e => { keys.delete(e.code); if(e.code==='Tab')stage.classList.remove('fps-tactical'); });
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) pause(); });
    document.addEventListener('pointerlockerror', () => { /* Direct-fire fallback is already active. */ });
    let drag = null;
    function requestShot() {
      if (state !== 'playing') return;
      pendingShot = true; triggerWasHeld = true;
      camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
      if (shoot()) pendingShot = false;
    }
    canvas.addEventListener('pointerdown', e => {
      if (state !== 'playing') return;
      e.preventDefault(); canvas.focus({ preventScroll: true });
      if (e.pointerType === 'mouse' && e.button === 2) { aiming = !aiming; return; }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.pointerType === 'mouse') { firing = true; triggerWasHeld = true; requestShot(); }
      if (document.pointerLockElement !== canvas) {
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
      }
    });
    // Pointer events only report the first pressed mouse button; handle chords too.
    canvas.addEventListener('mousedown', e => {
      if(state !== 'playing')return;
      e.preventDefault();
      if(e.buttons===3){if(e.button===0){firing=true;requestShot();}else if(e.button===2)aiming=!aiming;}
    });
    window.addEventListener('mouseup',e=>{if(e.button===0)firing=false;});
    function look(dx, dy) { const sensitivity = aiming ? (active === 'sniper' ? 0.0007 : 0.0015) : 0.0025; yaw -= dx * sensitivity; pitch = Math.max(-1.25, Math.min(1.25, pitch - dy * sensitivity)); }
    document.addEventListener('mousemove', e => { if (state === 'playing' && document.pointerLockElement === canvas) look(e.movementX, e.movementY); });
    canvas.addEventListener('pointermove', e => { if (state === 'playing' && drag && e.pointerId === drag.id && document.pointerLockElement !== canvas) { look(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; } });
    window.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse') { if (e.button === 0) firing = false;  }
      if (drag && drag.id === e.pointerId) drag = null;
    });
    canvas.addEventListener('pointercancel', () => { drag = null; clearInput(); });
    ['contextmenu', 'dragstart', 'auxclick', 'selectstart'].forEach(type => viewport.addEventListener(type, e => { e.preventDefault(); e.stopPropagation(); }));
    let wheelAt=0;
    viewport.addEventListener('wheel', e => { if(state!=='playing')return;e.preventDefault();if(!e.deltaY||performance.now()<wheelAt)return;wheelAt=performance.now()+180;const slots=[primary,'pistol','knife','grenade'];equip(slots[(slots.indexOf(active)+(e.deltaY>0?1:3))%4]);canvas.focus({preventScroll:true}); }, {passive:false});
    window.addEventListener('beforeunload', e => { if (state === 'playing') { e.preventDefault(); e.returnValue = ''; } });
    function hold(button, down, up) {
      button.addEventListener('pointerdown', e => { if (state !== 'playing') return; e.preventDefault(); button.setPointerCapture(e.pointerId); down(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => button.addEventListener(event, up));
    }
    stage.querySelectorAll('[data-move]').forEach(button => hold(button, () => keys.add(button.dataset.move), () => keys.delete(button.dataset.move)));
    hold($('fire'), () => { firing = true; triggerWasHeld = true; requestShot(); }, () => { firing = false; });
    $('fire').addEventListener('click', e => { if (e.detail === 0) requestShot(); });
    $('primary').value = primary;
    $('primary').addEventListener('change', () => {
      if (state === 'playing') return;
      primary = $('primary').value; G.update(d => { d.settings.primary = primary; }); equip(primary, true); renderFrame();
    });
    stage.querySelectorAll('[data-weapon]').forEach(b => b.addEventListener('click', () => { equip(b.dataset.weapon === 'primary' ? primary : b.dataset.weapon); canvas.focus({ preventScroll: true }); }));
    $('crouch').addEventListener('click', () => { if (state === 'playing') { crouchToggle = !crouchToggle; hud(); } });
    $('aim').addEventListener('click', () => { if (state === 'playing') { aiming = !aiming; $('aim').setAttribute('aria-pressed', String(aiming)); } });
    $('throw').addEventListener('click', throwGrenade);
    $('reload').addEventListener('click', reload); $('pause').addEventListener('click', pause);
    function soundLabel() { $('sound').textContent = sound ? '关闭音效' : '开启音效'; $('sound').setAttribute('aria-pressed', String(sound)); }
    $('sound').addEventListener('click', () => { sound = !sound; G.update(d => { d.settings.sound = sound; }); soundLabel(); }); soundLabel();
    $('fullscreen').addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen(); }
      catch (_) { M.toast('当前浏览器不支持全屏，可横屏游玩'); }
    });
    document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? '退出全屏' : '全屏游戏'; resize(); });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); pause(); setState('error'); showOverlay('3D 场景已中断', ['图形资源不可用，请重新加载游戏。'], '重新加载', () => location.reload()); });
    M.onRestart(start);
    window.addEventListener('pagehide', e => {
      pause();
      if (e.persisted) return;
      disposed = true; clearProjectiles(); clearEnemies(); tactical.dispose(); fog.dispose(); cancelAnimationFrame(raf); resizeObserver.disconnect(); renderer.dispose();
      if (audioContext) audioContext.close().catch(() => {});
    });
    camera.position.copy(player); gun.position.set(0.28, -0.27, -0.55); theme(); resize(); setState('menu');
    M.hud.best(G.load().data.best.score);
    showOverlay('沙城突击', ['沙城 · 三轮清场'], '开始训练', start);
    raf = requestAnimationFrame(render);
  }
})(window.App);
