import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const commit = 'f14bd502e9807d58890b4e9490d041bdab65ce05';
const repoRoot = path.resolve(process.argv[2] ?? process.cwd());
const outputRoot = path.resolve(process.argv[3] ?? path.dirname(fileURLToPath(import.meta.url)));
const source = name => execFileSync('git', ['show', `${commit}:games/101-bomber/Client/Presentation/src/${name}`], {cwd: repoRoot, encoding: 'utf8'});
const sources = ['view/runtime.ts', 'view/world/dolls.ts', 'view/camera.ts', 'view/logic/interp.ts', 'view/logic/camera-math.ts'];
const identity = sources.map(file => ({file, sha256: crypto.createHash('sha256').update(source(file)).digest('hex')}));
function method(file, start, end) {
  const full = source(file);
  const from = full.indexOf(start);
  const to = full.indexOf(end, from + start.length);
  if (from < 0 || to < from) throw new Error(`method not located: ${file}`);
  return full.slice(from, to);
}
function object3d() {
  const vector = () => ({x: 0, y: 0, z: 0, set(x, y, z) {Object.assign(this, {x,y,z});}});
  return {position: vector(), rotation: vector(), scale: vector(), visible: true,
    updateMatrixWorld() {}, localToWorld() {}, getWorldQuaternion() {}, setHex() {}};
}
const context = vm.createContext({Math, Number, Map, Set,
  BlockType: {水: 99}, WATER_FX: {wadeY: -0.1},
  maxHealthOfView: () => 6, bossHeightScale: () => 1, comboOf: () => null,
  dollStatus: () => ({frozen: false, shocked: false}), statusTint: () => 0xffffff,
  gaitRate: () => 1, frenzyActive: () => false, DOLL: {footSwing: 0.1}, FACE: {},
  hash01: () => 0, FROZEN_TINT: 0xaaaaaa, WHITE: 0xffffff,
  DROP_MS: 320, SQUASH_MS: 180, FLASH_MS: 80, WOBBLE_MS: 350, BLINK_IN_MS: 180, WALK_BOB: 0.05,
});
function evaluate(ts) {return vm.runInContext(stripTypeScriptTypes(ts, {mode: 'strip'}), context);}
evaluate(source('view/logic/interp.ts').replaceAll('export ', ''));
evaluate(source('view/logic/camera-math.ts').replaceAll('export ', ''));
evaluate(`class ConsumerDoll { ${method('view/world/dolls.ts', '  update(x:', '\n  /**')} }\nglobalThis.dollUpdate = ConsumerDoll.prototype.update;`);
evaluate(`class ConsumerView { ${method('view/runtime.ts', '  private updateDolls(', '\n  private shownHats(')} }\nglobalThis.viewUpdate = ConsumerView.prototype.updateDolls;`);
evaluate(`class ConsumerCamera { ${method('view/camera.ts', '  update(dtSec:', '\n  /**')} }\nglobalThis.cameraUpdate = ConsumerCamera.prototype.update;`);

function fixture(hz) {
  const doll = {visual:'alive', root:object3d(), shown:false, dropAt:-1e9, lastX:10, lastZ:10,
    x:10,z:10,lastVX:0,lastVZ:0,speed:2,yaw:Math.PI,dirX:0,dirZ:-1,
    swayX:0,swayZ:0,swayVX:0,swayVZ:0,walkPhase:0,height:1,scale:1,groundY:0,id:1,
    bodyPivot:object3d(),headPivot:object3d(),footL:object3d(),footR:object3d(),armL:object3d(),armR:object3d(),
    eyes:object3d(),patch:object3d(),tufts:object3d(),mat:{emissive:object3d()},headTop:object3d().position,
    headQuat:{},headTopLocal:1,footZ:0,blinkAt:1e9,blinkInAt:-1e9,flashAt:-1e9,wobbleAt:-1e9,
    setTint(){},setHeight(){},update:context.dollUpdate};
  const p={NetEntityIdRaw:1,positionKnown:true,eliminated:false,teleportTick:0,
    玩家属性:{血量当前:6},BomberPlayerState:{ProtectedUntilTick:0},skills:{facing:1}};
  const curr={Tick:20,Players:[p],BomberMatchState:{HatKingNetEntityIdRaw:0},match:{tickRateHz:20}};
  const view={opts:{localPlayerId:1,config:{},rules:{hatKingPillarMinHats:1,bossMinHearts:6,skills:{}}},
    dolls:new Map([[1,doll]]),blinkSnap:new Set(),prevMap:new Map(),pos:{x:0,z:0},
    localTarget:{x:10,z:10,dx:0,dz:0},perHeart:2,terrain:{groundAt:()=>0},waterTrail:{step:()=>null},
    dollFx:{},skillFx:{player(){}},updateSpectate(){},deaths:[]};
  const cam={boardSize:23,center:11.5,sx:{value:10,velocity:0},sz:{value:9.4,velocity:0},
    initialized:true,glideUntil:0,overview:false,blend:0,followDist:9.5,off:{},noise:{},
    shakeClock:0,shakeAmp:0,shakePeak:0,cine:null,cineWeight:0,
    camera:{position:object3d().position,lookAt(){},updateMatrixWorld(){}}};
  let rotationReads=0;
  let frame=0;
  const rows=[];
  const run=(z,quaternion={x:0,y:1,z:0,w:0})=>{
    const model={position:{x:10,y:1.5,z},get rotation(){rotationReads++;return quaternion;}};
    const sample={curr,prev:curr,alpha:0.5,renderTick:20,localPose:{playerId:1,entity:'synthetic-life',connectionGeneration:'1',publicationSequence:String(frame+1),model}};
    const prior=doll.z;
    context.viewUpdate.call(view,sample,frame*1000/hz,1/hz);
    const t=view.localTarget;
    context.cameraUpdate.call(cam,1/hz,1/hz,frame/hz,t.x,t.z,t.dx,t.dz,0);
    const raw=Math.abs(((doll.yaw-Math.PI+3*Math.PI)%(2*Math.PI))-Math.PI);
    rows.push({frame:frame++,z:doll.z,deltaZ:doll.z-prior,dirZ:doll.dirZ,yawRadians:doll.yaw,
      yawErrorDegrees:raw*180/Math.PI,rootZ:doll.root.position.z,rootYaw:doll.root.rotation.y,
      cameraLookZ:cam.sz.value,cameraTargetZ:t.z+t.dz*0.6,rotationReads});
  };
  return {run,rows,doll,get rotationReads(){return rotationReads;}};
}

const cases=[];
for(const hz of [60,120]) {
  const f=fixture(hz);
  f.run(9.975);f.run(9.950);f.run(9.960);f.run(9.935);
  cases.push({name:`synthetic Model correction ${hz} Hz`,kind:'expected RED for orientation invariance',
    passed:f.rows.every(r=>r.yawErrorDegrees<1e-6),rotationReads:f.rotationReads,rows:f.rows});
}
const stationary=fixture(60);
stationary.run(10,{x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2});
cases.push({name:'stationary Model facing turns right',kind:'expected RED for quaternion consumption',
  passed:Math.abs(stationary.doll.yaw-Math.PI)>1e-3,rotationReads:stationary.rotationReads,rows:stationary.rows});
const control=fixture(60);
for(let i=1;i<=4;i++)control.run(10-i*.025);
cases.push({name:'monotonic Model motion control',kind:'control',passed:control.rows.every(r=>r.yawErrorDegrees<1e-6),rows:control.rows});
const result={scope:'ISOLATED_ACTUAL_METHODS_SYNTHETIC_POSES_NOT_BROWSER_NOT_WASM_NOT_NATIVE',
  commit,sources:identity,
  sceneBackend:'Object property stubs; entire unmodified ViewRuntime.updateDolls/Doll.update/CameraRig.update and source math execute; decoration/status helpers are neutral stubs; no Game/Runtime simulation',
  cases,pass:cases.filter(c=>c.passed).length,fail:cases.filter(c=>!c.passed).length};
fs.mkdirSync(outputRoot, {recursive:true});
fs.writeFileSync(path.join(outputRoot,'consumer-probe.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({scope:result.scope,pass:result.pass,fail:result.fail,cases:cases.map(({name,passed,rotationReads,rows})=>({name,passed,rotationReads,maxYawErrorDegrees:Math.max(...rows.map(r=>r.yawErrorDegrees))}))},null,2));
process.exitCode=result.fail?1:0;
