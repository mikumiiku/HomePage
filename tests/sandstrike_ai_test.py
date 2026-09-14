"""Fair enemy perception, warning, projectiles, cover and expanded-map connectivity."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('SANDSTRIKE_BASE','http://127.0.0.1:8034')
s=(Path(__file__).resolve().parents[1]/'web/static/js/games/sandstrike.js').read_text()
hook='''
    window.aiTest={
      reset:()=>{start();enemies.forEach((e,i)=>{e.alive=i===0;e.group.visible=e.alive;});const e=enemies[0];e.group.position.set(0,0,8);e.group.rotation.y=0;e.mode='patrol';e.cooldown=0;e.sense=0;e.memory=0;player.set(0,1.65,14);scene.updateMatrixWorld(true);},
      tick:t=>{for(let elapsed=0;elapsed<t;elapsed+=.05)update(.05);},
      status:()=>({health,mode:enemies[0].mode,magazine:enemies[0].magazine,bullets:bullets.length,memory:enemies[0].memory,last:enemies[0].lastKnown.toArray(),pos:enemies[0].group.position.toArray()}),
      move:(x,z)=>{player.set(x,1.65,z);},
      hidden:()=>{const e=enemies[0];e.group.position.set(-8,0,5);e.group.rotation.y=0;e.mode='search';e.memory=7;e.lastKnown.set(0,1.65,14);e.sense=0;player.set(-8,1.65,14);scene.updateMatrixWorld(true);},
      bullet:(blockedShot)=>{clearProjectiles();health=100;const e=enemies[0];e.group.position.set(blockedShot?-8:0,0,5);player.set(blockedShot?-8:0,1.65,14);e.aimPoint.copy(player);const random=Math.random;try{Math.random=()=>0;enemyBullet(e);}finally{Math.random=random;}bullets[0].velocity.copy(player).sub(bullets[0].mesh.position).normalize().multiplyScalar(220);for(let i=0;i<30;i++)updateBullets(.05);return {health};},
      hearing:()=>{
        start();health=10000;
        const setup=()=>enemies.forEach((e,i)=>{e.alive=i<3;e.sees=false;e.memory=0;e.hearingCooldown=0;e.mode='patrol';e.group.position.set(i===2?-8:0,0,i===0?-18:i===1?-31:5);e.group.rotation.y=Math.PI;e.path=[[28,28]];e.pathTime=999;});
        const levels=()=>enemies.slice(0,3).map(e=>e.memory);
        setup();equip('pistol',true);shoot();const pistol=levels();
        setup();equip('rifle',true);shoot();const rifle=levels();const direction=enemies[0].group.rotation.y;const heard=enemies[0].lastKnown.clone();player.x=12;const snapshot=enemies[0].lastKnown.equals(heard);player.x=0;
        setup();equip('sniper',true);shoot();const sniper=levels();
        setup();equip('knife',true);shoot();const knife=levels();
        setup();enemies[0].group.position.set(-8,0,-14);hearNoise(new T.Vector3(-8,1.65,14),42);const damped=enemies[0].memory;
        enemies[0].hearingCooldown=0;hearNoise(new T.Vector3(-8,1.65,14),54);const loud=enemies[0].memory;
        return {pistol,rifle,sniper,knife,damped,loud,direction,snapshot,approximate:heard.distanceTo(new T.Vector3(0,1.65,14))};
      },
      awareness:()=>{
        start();health=10000;enemies.forEach((e,i)=>{e.alive=i===0;e.group.visible=e.alive;});
        const e=enemies[0];e.group.position.set(0,0,8);e.group.rotation.y=0;e.home.set(28,0,-28);e.lastKnown.copy(player);e.memory=14;e.sense=0;e.sees=true;e.mode='cover';e.timer=1;e.cooldown=999;e.goal.set(0,0,3);e.path=[[0,7],[0,6]];e.pathTime=999;
        update(.1);update(.1);const retreat={sees:e.sees,facing:e.group.rotation.y,z:e.group.position.z};
        e.group.position.set(0,0,8);e.mode='patrol';e.memory=14;e.sees=false;e.sense=999;e.goal.copy(e.home);e.path=[[0,7],[0,6]];e.pathTime=999;e.lastKnown.set(0,1.65,14);
        update(.05);const search={mode:e.mode,goal:e.goal.toArray(),next:e.path[0],facing:e.group.rotation.y};
        const saved=obstacles.splice(0);let fallback;try{fallback=coverGoal(e).distanceTo(e.group.position);}finally{obstacles.push(...saved);}
        e.group.position.set(0,0,8);e.group.rotation.y=0;e.mode='patrol';e.cooldown=0;e.sense=0;e.memory=0;e.magazine=12;e.path=[];e.pathTime=0;
        let shots=0;const original=enemyBullet;enemyBullet=enemy=>{shots++;original(enemy);};
        try{for(let i=0;i<120;i++)update(.05);}finally{enemyBullet=original;}
        return {retreat,search,fallback,shots,mode:e.mode,memory:e.memory};
      },
      recoil:()=>{enemies.forEach(e=>e.cooldown=999);equip('rifle',true);yaw=0;pitch=0;aiming=false;crouchToggle=false;camera.rotation.set(0,0,0);shoot();const hip=pitch;pitch=0;inventory.rifle.cooldown=0;inventory.rifle.heat=0;aiming=true;crouchToggle=true;shoot();const steady=pitch;aiming=false;crouchToggle=false;pitch=0;inventory.rifle.heat=0;for(let i=0;i<8;i++){inventory.rifle.cooldown=0;shoot();}return {hip,steady,spray:pitch,camera:camera.rotation.x,ammo:inventory.rifle.ammo};},
      fast:()=>{clearProjectiles();const e=enemies[0];e.aimPoint.copy(player);enemyBullet(e);return bullets[0].velocity.length();},
      connected:()=>{player.set(0,1.65,14);buildFlow();return {size:flow.size,points:[[-3,-18],[23,-22],[-25,-9],[25,8],[-24,24],[12,-27],[-26,-28],[28,28]].map(([x,z])=>flow.has(navKey(x,z)))};}
    };
'''
s=s.replace('    raf = requestAnimationFrame(render);\n  }',hook+'\n  }').replace('renderer.shadowMap.enabled = true;','renderer.shadowMap.enabled = false;')
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox','--enable-unsafe-swiftshader']);page=b.new_page(viewport={'width':720,'height':700});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script('HTMLCanvasElement.prototype.requestPointerLock=undefined;')
 page.route('**/static/js/games/sandstrike.js?*',lambda r:r.fulfill(body=s,content_type='text/javascript'))
 page.goto(BASE+'/game/sandstrike');page.get_by_role('button',name='开始训练').wait_for()
 page.evaluate('aiTest.reset();aiTest.tick(.2)');v=page.evaluate('aiTest.status()');assert v['health']==100 and v['mode']=='aim' and v['magazine']==12,v
 page.evaluate('aiTest.move(-11,8);aiTest.tick(.9)');v=page.evaluate('aiTest.status()');assert v['health']==100,v
 page.evaluate('aiTest.reset();aiTest.tick(1.1)');v=page.evaluate('aiTest.status()');assert v['health']<100 and v['magazine']<=8 and v['mode']=='cover',v
 assert abs(page.evaluate('aiTest.fast()')-220)<.01
 page.evaluate('aiTest.hidden();aiTest.tick(.5)');v=page.evaluate('aiTest.status()');assert v['last']==[0,1.65,14] and v['memory']<7,v
 assert page.evaluate('aiTest.bullet(true).health')==100,'Crate must stop fast projectile across an entire frame'
 assert page.evaluate('aiTest.bullet(false).health')==90,'Actual projectile intersection must deal one hit'
 page.evaluate('aiTest.reset()');r=page.evaluate('aiTest.recoil()')
 assert 0<r['steady']<r['hip'] and r['spray']>r['hip']*8 and abs(r['camera']-r['spray'])<.001 and r['ammo']==20,r
 h=page.evaluate('aiTest.hearing()')
 assert h['pistol'][0]==0 and h['rifle'][0]>0 and h['rifle'][1]==0 and h['sniper'][0]>0 and h['sniper'][1]==0,h
 assert h['rifle'][2]>0 and h['knife']==[0,0,0] and h['damped']==0 and h['loud']>0,h
 assert abs(h['direction'])<.1 and h['snapshot'] and h['approximate']>1,h
 a=page.evaluate('aiTest.awareness()')
 assert a['retreat']['sees'] and abs(a['retreat']['facing'])<.1 and a['retreat']['z']<8,a
 assert a['search']['mode']=='search' and a['search']['goal']==[0,0,14] and a['search']['next'][1]>8,a
 assert a['fallback']==0 and a['shots']>=8 and a['mode']!='patrol' and a['memory']>0,a
 connected=page.evaluate('aiTest.connected()');assert all(connected['points']) and connected['size']>3000,connected
 assert not errors,errors
 print('PASS: fast reaction, 220m/s swept bullets, damage pressure, cover, last-known search, controllable recoil, retreat facing, fresh search routes, no home fallback, repeated engagement, weapon hearing ranges, walls attenuate sound, silent knife, sound snapshot, map routes',connected,flush=True)
 b.close()
