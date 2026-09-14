"""Fog of war: range, exploration, wall occlusion, scope and enemy/cone privacy."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SANDSTRIKE_BASE','http://127.0.0.1:8034')
s=(Path(__file__).resolve().parents[1]/'web/static/js/games/sandstrike.js').read_text()
hook='''
    window.fogTest={
      reset:()=>fog.reset(),
      look:(x,z,angle=0,scoped=false)=>{player.set(x,1.65,z);yaw=angle;pitch=0;camera.position.copy(player);camera.rotation.set(0,yaw,0);fog.update(0,player,yaw,scoped,true);},
      known:(x,z)=>fog.knowledge(x,z),see:(x,z)=>fog.canSee(new T.Vector3(x,0,z)),
      target:()=>{enemies.forEach((e,i)=>{e.group.position.set(i===0?0:25,0,i===0?-18:-20);e.sense=999;e.cooldown=999;e.memory=0;e.radioPending=null;e.pathTime=999;e.path=[];});},
      step:()=>updateEnemies(.025),
      enemy:()=>({visible:enemies[0].group.visible,cone:enemies[0].vision.mesh.visible,line:enemies[0].vision.line.visible}),
      draw:()=>{renderFrame();drawRadar();}
    };
'''
s=s.replace('    raf = requestAnimationFrame(render);\n  }',hook+'\n  }')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader']);page=b.new_page(viewport={'width':1000,'height':800});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
 page.add_init_script('HTMLCanvasElement.prototype.requestPointerLock=undefined;')
 page.route('**/static/js/games/sandstrike.js?*',lambda r:r.fulfill(body=s,content_type='text/javascript'))
 page.goto(BASE+'/game/sandstrike');page.get_by_role('button',name='开始训练').wait_for();page.wait_for_load_state('networkidle');page.get_by_role('button',name='开始训练').click()
 page.evaluate('fogTest.reset();fogTest.look(0,14)');assert page.evaluate('fogTest.known(0,8).visible')
 assert not page.evaluate('fogTest.known(0,-18).explored');assert not page.evaluate('fogTest.see(0,-18)')
 page.evaluate('fogTest.look(0,14,Math.PI)');v=page.evaluate('fogTest.known(0,8)');assert v=={'visible':False,'explored':True},v
 page.evaluate('fogTest.reset();fogTest.look(-8,14)');assert not page.evaluate('fogTest.see(-8,5)')
 assert not page.evaluate('fogTest.known(-8,5).explored')
 page.evaluate('fogTest.reset();fogTest.look(0,14);fogTest.target();fogTest.step()');assert page.evaluate('fogTest.enemy()')=={'visible':False,'cone':False,'line':False}
 page.evaluate('fogTest.look(0,14,0,true);fogTest.step()');assert page.evaluate('fogTest.see(0,-18)');assert page.evaluate('fogTest.enemy().visible')
 page.evaluate('fogTest.look(0,14,Math.PI);fogTest.step()');assert not page.evaluate('fogTest.enemy().visible')
 page.evaluate('fogTest.look(0,14);fogTest.step();fogTest.draw()');page.screenshot(path='/tmp/fps-player-fog.png',full_page=True)
 page.locator('.fps-canvas').focus();page.keyboard.down('Tab');page.evaluate('fogTest.draw()');page.screenshot(path='/tmp/fps-exploration-map.png',full_page=True);page.keyboard.up('Tab')
 page.evaluate('fogTest.reset()');assert not page.evaluate('fogTest.known(0,8).explored')
 assert not errors,errors
 print('PASS: 26m visibility, 48m scoped sight, walls, explored memory, reset, hidden enemies and cones, shader compile',flush=True)
 b.close()
