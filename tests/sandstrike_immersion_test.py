"""Bolt sightline, ground vision, radio memory, compact HUD and static batching."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SANDSTRIKE_BASE','http://127.0.0.1:8034')
source=(Path(__file__).resolve().parents[1]/'web/static/js/games/sandstrike.js').read_text()
hook='''
    window.immersion={
      tick:t=>{for(let elapsed=0;elapsed<t-.0001;elapsed+=.025)update(Math.min(.025,t-elapsed));},
      freeze:()=>enemies.forEach(e=>{e.cooldown=999;e.sense=999;e.memory=0;e.radioPending=null;e.radioCooldown=999;}),
      sniper:()=>{primary='sniper';equip('sniper',true);aiming=true;update(.1);shoot();},
      sight:()=>{camera.updateMatrixWorld(true);gun.updateMatrixWorld(true);const meshes=[];gun.traverseVisible(o=>{if(o.isMesh)meshes.push(o);});ray.layers.set(1);let intersections=0;for(const x of [-.08,0,.08])for(const y of [-.08,0,.08]){ray.setFromCamera(new T.Vector2(x,y),camera);intersections+=ray.intersectObjects(meshes,false).length;}ray.layers.set(0);return {fov:camera.fov,intersections,gun:gun.visible,scope:!$('scope').hidden,ammo:bag().ammo,hand:models.sniper.userData.parts.rightHand.position.toArray(),bolt:models.sniper.userData.parts.bolt.position.toArray()};},
      draw:()=>{renderFrame();drawRadar();return renderer.info.render.calls;},
      vision:()=>{const e=enemies[0];e.group.visible=true;e.group.position.set(-8,0,5);e.group.rotation.set(0,0,0);e.memory=0;e.mode='patrol';e.vision.time=0;tactical.updateVision(e,.1,1.65,0);return {center:e.vision.ranges[16],segments:e.vision.ranges.length,visible:e.vision.mesh.visible};},
      radioSetup:()=>{enemies.forEach((e,i)=>{e.alive=true;e.group.visible=true;e.group.position.set(i===0?0:i===3?30:5+i,0,i===3?-28:8);e.group.rotation.set(0,Math.PI,0);e.memory=0;e.sees=false;e.mode='patrol';e.cooldown=999;e.radioCooldown=999;e.radioPending=null;e.sense=999;e.path=[];e.pathTime=999;});player.set(0,1.65,14);enemies[0].radioPending={delay:.65,position:player.clone()};},
      move:()=>player.set(10,1.65,14),
      killSender:()=>{enemies[0].alive=false;},
      radio:()=>enemies.map(e=>({memory:e.memory,last:e.lastKnown.toArray(),role:e.reportRole,mode:e.mode,goal:e.goal.toArray()})),
      patrolView:()=>{const e=enemies[0];e.alive=true;e.group.visible=true;e.group.position.set(0,0,3);e.group.rotation.set(0,.9,0);e.mode='search';e.memory=5;e.sense=999;e.pathTime=999;e.path=[];e.vision.time=0;tactical.updateVision(e,.1,1.65,0);player.set(0,1.65,14);yaw=0;pitch=-.16;camera.position.copy(player);camera.rotation.set(pitch,yaw,0);},
      previews:()=>Object.values(weaponPreviews).every(v=>v.startsWith('data:image/png')&&v.length>200)
    };
'''
source=source.replace('    raf = requestAnimationFrame(render);\n  }',hook+'\n  }')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1100,'height':820});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None);page.add_init_script('HTMLCanvasElement.prototype.requestPointerLock=undefined;')
 page.route('**/static/js/games/sandstrike.js?*',lambda r:r.fulfill(body=source,content_type='text/javascript'))
 page.goto(BASE+'/game/sandstrike');page.get_by_role('button',name='开始训练').wait_for();page.wait_for_load_state('networkidle')
 assert not page.locator('.fps-help').get_attribute('open')
 page.get_by_role('button',name='开始训练').click();page.evaluate('immersion.freeze();immersion.sniper()')
 for step in [.025,.15,.2,.3,.3,.3]:
  page.evaluate(f'immersion.tick({step})');v=page.evaluate('immersion.sight()')
  assert v['intersections']==0 and v['fov']>=60 and v['gun'],v
  if step==.2:
   page.evaluate('immersion.draw()');page.screenshot(path='/tmp/fps-bolt-clear.png',full_page=True)
 page.evaluate('immersion.tick(.1)');assert page.evaluate('immersion.sight().scope')
 assert page.evaluate('immersion.sight().ammo')==4
 assert page.evaluate('immersion.previews()')
 slots=page.locator('.fps-slots').bounding_box();viewport=page.locator('.fps-viewport').bounding_box()
 assert slots['x']>viewport['x']+viewport['width']*.7 and slots['y']>viewport['y']+viewport['height']*.45
 assert not page.locator('.fps-toolbar').is_visible()
 assert not page.locator('.fps-radar').is_visible()
 page.locator('.fps-canvas').focus();page.keyboard.down('Tab');assert page.locator('.fps-radar').is_visible();page.keyboard.up('Tab');assert not page.locator('.fps-radar').is_visible()
 v=page.evaluate('immersion.vision()');assert v['visible'] and v['center']<3 and v['segments']==33,v
 page.evaluate('immersion.radioSetup();immersion.tick(.4)');assert page.evaluate('immersion.radio()[1].memory')==0
 page.evaluate('immersion.move();immersion.tick(.3)');v=page.evaluate('immersion.radio()')
 assert v[1]['memory']>7 and v[2]['memory']>7 and v[3]['memory']==0,v
 assert v[1]['last']==[0,1.65,14] and v[2]['last']==[0,1.65,14],v
 assert v[1]['goal']!=v[2]['goal'],v
 page.evaluate('immersion.radioSetup();immersion.killSender();immersion.tick(.8)');assert page.evaluate('immersion.radio()[1].memory')==0
 page.keyboard.press('2');page.keyboard.press('q');assert page.locator('.fps-weapon-name').inner_text()=='栓动狙击枪'
 page.keyboard.press('q');assert page.locator('.fps-weapon-name').inner_text()=='半自动手枪'
 page.locator('.fps-viewport').dispatch_event('wheel',{'deltaY':100,'bubbles':True,'cancelable':True});assert page.locator('.fps-weapon-name').inner_text()=='战术刀'
 page.keyboard.press('1');page.evaluate('immersion.tick(.3);immersion.patrolView()');calls=page.evaluate('immersion.draw()')
 page.screenshot(path='/tmp/fps-immersive-combat.png',full_page=True)
 assert calls<260,calls
 page.keyboard.press('Escape');page.locator('#theme-toggle').click();page.get_by_role('button',name='继续游戏').click();page.evaluate('immersion.tick(.1);immersion.draw()')
 page.screenshot(path='/tmp/fps-immersive-night.png',full_page=True)
 assert not errors,errors
 print('PASS: clear bolt sightline, radio delay/range/snapshot/flanking, killed-sender cancellation, clipped vision, quiet HUD, model previews; draw calls',calls,flush=True)
 b.close()
