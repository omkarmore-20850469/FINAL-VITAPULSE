import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as THREE from 'three';

type Motion = 'run' | 'walk' | 'squat' | 'stretch' | 'idle';

@Component({
  selector: 'app-trainer-3d',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-content trainer3d-page">
      <div class="page-intro trainer3d-intro"><div><div class="eyebrow">VITAPULSE MOTION LAB</div><h1>Move with <em>confidence.</em></h1><p>Explore the interactive 3D trainer and preview movement patterns before your session.</p></div><span class="trainer3d-badge"><span class="pulse"></span> INTERACTIVE 3D EXPERIENCE</span></div>
      <div class="trainer3d-layout">
        <section class="trainer3d-stage panel">
          <div class="trainer3d-stage-head"><div><div class="eyebrow">3D MOVEMENT STUDIO</div><h2>{{ motionTitle() }}</h2><p>{{ motionDescription() }}</p></div><span class="trainer3d-live"><i></i> REAL-TIME RENDER</span></div>
          <div class="trainer3d-canvas-wrap" #canvasHost aria-label="Interactive 3D exercise avatar. Drag to rotate; use mouse wheel to zoom.">
            <div class="trainer3d-canvas-glow"></div>
            <div class="trainer3d-hud trainer3d-hud-top"><span>VITAPULSE / MOTION 01</span><span>DRAG TO ROTATE · SCROLL TO ZOOM</span></div>
            <div class="trainer3d-loading" *ngIf="!ready()"><span class="trainer3d-spinner"></span><span>Preparing 3D scene…</span></div>
            <div class="trainer3d-hud trainer3d-hud-bottom"><span><b></b> 3D SCENE ACTIVE</span><span>PROCEDURAL AVATAR</span></div>
          </div>
          <div class="trainer3d-controls"><div class="trainer3d-motion-tabs" role="group" aria-label="Choose demonstration movement"><button *ngFor="let item of motions" type="button" [class.selected-motion]="motion()===item.id" (click)="setMotion(item.id)">{{item.label}}</button></div><div class="trainer3d-action-row"><button class="btn btn-primary" (click)="togglePlayback()"><span>{{playing() ? 'Ⅱ' : '▶'}}</span> {{playing() ? 'Pause animation' : 'Play animation'}}</button><button class="btn btn-outline" (click)="resetView()">↺ Reset view</button><label class="trainer3d-speed">Speed <input type="range" min="0.4" max="1.6" step="0.1" [value]="speed()" (input)="setSpeed($any($event.target).value)" aria-label="Animation speed"><strong>{{speed().toFixed(1)}}×</strong></label></div>
          </div>
        </section>
        <aside class="trainer3d-side">
          <section class="panel trainer3d-info"><div class="eyebrow">MOVEMENT GUIDE</div><h3>{{ motionTitle() }} basics</h3><p>{{ motionDescription() }}</p><div class="trainer3d-tip-list"><div><span>01</span><p><strong>Start comfortably</strong><small>Use a range of motion that feels manageable.</small></p></div><div><span>02</span><p><strong>Keep it controlled</strong><small>Focus on smooth movement, not speed.</small></p></div><div><span>03</span><p><strong>Take a pause</strong><small>Stop if you feel pain, dizziness or unusual discomfort.</small></p></div></div><div class="trainer3d-note">This is an illustrative 3D demonstration, not a medical assessment or a form-correction system.</div></section>
          <section class="panel trainer3d-exercise-list"><div class="panel-heading"><div><div class="eyebrow">QUICK SELECT</div><h3>Explore movements</h3></div><span class="trainer3d-count">05</span></div><button *ngFor="let item of motions" class="trainer3d-exercise-row" [class.active-exercise]="motion()===item.id" (click)="setMotion(item.id)"><span class="trainer3d-exercise-icon">{{item.icon}}</span><span><strong>{{item.label}}</strong><small>{{item.subtitle}}</small></span><span class="trainer3d-arrow">↗</span></button></section>
        </aside>
      </div>
      <section class="trainer3d-bottom-grid"><article class="trainer3d-feature"><span class="trainer3d-feature-icon">◉</span><div><strong>Interactive camera</strong><p>Drag the scene to view the avatar from different angles.</p></div></article><article class="trainer3d-feature"><span class="trainer3d-feature-icon">⌁</span><div><strong>Motion presets</strong><p>Switch between running, walking, squatting and stretching previews.</p></div></article><article class="trainer3d-feature"><span class="trainer3d-feature-icon">◇</span><div><strong>Built for expansion</strong><p>The scene can later load licensed rigged GLB characters and recorded animation clips.</p></div></article></section>
    </section>
  `
})
export class Trainer3DComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasHost', { static: true }) canvasHost!: ElementRef<HTMLDivElement>;
  readonly ready = signal(false);
  readonly motion = signal<Motion>('run');
  readonly playing = signal(true);
  readonly speed = signal(1);
  readonly motions: {id:Motion;label:string;subtitle:string;icon:string}[] = [
    {id:'run',label:'Running',subtitle:'Rhythmic cardio movement',icon:'↗'},
    {id:'walk',label:'Walking',subtitle:'Gentle, steady movement',icon:'⌁'},
    {id:'squat',label:'Squat',subtitle:'Lower-body movement preview',icon:'↓'},
    {id:'stretch',label:'Stretch',subtitle:'A calm mobility pose',icon:'✧'},
    {id:'idle',label:'Neutral',subtitle:'Relaxed standing pose',icon:'◌'}
  ];
  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private avatar?: THREE.Group;
  private torso?: THREE.Group;
  private leftArm?: THREE.Group;
  private rightArm?: THREE.Group;
  private leftLeg?: THREE.Group;
  private rightLeg?: THREE.Group;
  private leftShin?: THREE.Group;
  private rightShin?: THREE.Group;
  private animationFrame = 0;
  private clock = new THREE.Clock();
  private resizeObserver?: ResizeObserver;
  private elapsed = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pointerMove = (event: PointerEvent) => this.onPointerMove(event);
  private pointerUp = () => { this.dragging = false; };
  private wheel = (event: WheelEvent) => { event.preventDefault(); if (this.camera) { this.camera.position.z = THREE.MathUtils.clamp(this.camera.position.z + event.deltaY * 0.006, 4.2, 9.5); this.camera.lookAt(0, 1.25, 0); } };

  motionTitle(): string { return this.motions.find(x => x.id === this.motion())?.label || 'Movement'; }
  motionDescription(): string {
    const descriptions: Record<Motion,string> = {
      run:'A continuous running cycle with alternating arm and leg movement.',
      walk:'A lower-intensity walking cycle with gentle, steady steps.',
      squat:'A simplified squat movement preview to explore controlled lowering and standing.',
      stretch:'An illustrative overhead stretch pose for a calm mobility break.',
      idle:'A neutral standing pose. Use it to inspect the avatar from different angles.'
    };
    return descriptions[this.motion()];
  }

  ngAfterViewInit(): void {
    try { this.createScene(); this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(this.canvasHost.nativeElement); this.canvasHost.nativeElement.addEventListener('pointerdown', this.onPointerDown); this.canvasHost.nativeElement.addEventListener('pointermove', this.pointerMove); this.canvasHost.nativeElement.addEventListener('pointerup', this.pointerUp); this.canvasHost.nativeElement.addEventListener('pointerleave', this.pointerUp); this.canvasHost.nativeElement.addEventListener('wheel', this.wheel, {passive:false}); this.resize(); this.ready.set(true); this.animate(); }
    catch (error) { console.error('Unable to initialise VitaPulse 3D scene', error); }
  }

  private material(color: number, roughness = 0.52, metalness = 0.04): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({color, roughness, metalness}); }
  private createScene(): void {
    const host = this.canvasHost.nativeElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1f24);
    this.scene.fog = new THREE.Fog(0x0d1f24, 9, 19);
    this.camera = new THREE.PerspectiveCamera(34, Math.max(host.clientWidth,1) / Math.max(host.clientHeight,1), 0.1, 60);
    this.camera.position.set(0, 1.65, 7.25); this.camera.lookAt(0,1.25,0);
    this.renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.className = 'trainer3d-webgl';
    this.renderer.domElement.setAttribute('aria-label','Animated 3D fitness avatar');
    host.prepend(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xb8d8ff,0x202038,2.1));
    const key = new THREE.DirectionalLight(0xffffff,3.2); key.position.set(3,6,5); this.scene.add(key);
    const rim = new THREE.PointLight(0x8b7cff,25,12); rim.position.set(-3,2.8,-2); this.scene.add(rim);
    const mint = new THREE.PointLight(0x5fe0b5,12,10); mint.position.set(3,1.5,-1); this.scene.add(mint);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2,72),new THREE.MeshStandardMaterial({color:0x14303a,roughness:0.82,metalness:0.08})); floor.rotation.x=-Math.PI/2; floor.position.y=-0.055; this.scene.add(floor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25,0.012,8,120),new THREE.MeshBasicMaterial({color:0x4fd1c0,transparent:true,opacity:0.8})); ring.rotation.x=Math.PI/2; ring.position.y=0.005; this.scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.8,0.006,6,120),new THREE.MeshBasicMaterial({color:0x5adbb0,transparent:true,opacity:0.35})); ring2.rotation.x=Math.PI/2; ring2.position.y=0.008; this.scene.add(ring2);
    const grid = new THREE.GridHelper(10,30,0x414c78,0x252e4d); grid.position.y=-0.045; (grid.material as THREE.Material).transparent=true; (grid.material as THREE.Material).opacity=0.3; this.scene.add(grid);
    this.avatar = new THREE.Group(); this.scene.add(this.avatar);
    this.buildAvatar(this.avatar);
    // Tiny floating points add depth without relying on external assets.
    const points: THREE.Vector3[]=[]; for(let i=0;i<85;i++){ const angle=Math.random()*Math.PI*2; const radius=2.6+Math.random()*2.4; points.push(new THREE.Vector3(Math.cos(angle)*radius,Math.random()*3.6,Math.sin(angle)*radius-0.5)); }
    const geometry = new THREE.BufferGeometry().setFromPoints(points); const particles = new THREE.Points(geometry,new THREE.PointsMaterial({color:0x7ae3d5,size:0.025,transparent:true,opacity:0.75})); this.scene.add(particles);
  }

  private buildAvatar(root: THREE.Group): void {
    const skin = this.material(0xc98f70,0.68); const shirt = this.material(0x8274f5,0.38,0.08); const shorts = this.material(0x293652,0.62); const shoe = this.material(0x64dcb3,0.35); const dark = this.material(0x1c2438,0.45); const jointMat=skin;
    const sphere=(parent:THREE.Object3D,mat:THREE.Material,pos:THREE.Vector3,scale:THREE.Vector3)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,18),mat);mesh.position.copy(pos);mesh.scale.copy(scale);parent.add(mesh);return mesh;};
    const capsule=(parent:THREE.Object3D,mat:THREE.Material,pos:THREE.Vector3,radius:number,length:number)=>{const geo=new THREE.CapsuleGeometry(radius,Math.max(0.01,length),6,12);const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(pos);parent.add(mesh);return mesh;};
    this.torso = new THREE.Group(); this.torso.position.set(0,1.55,0); root.add(this.torso);
    capsule(this.torso,shirt,new THREE.Vector3(0,0.12,0),0.27,0.52);
    sphere(this.torso,shirt,new THREE.Vector3(0,0.39,0),new THREE.Vector3(0.34,0.19,0.22));
    sphere(this.torso,shorts,new THREE.Vector3(0,-0.35,0),new THREE.Vector3(0.27,0.2,0.19));
    // Neck, head, ears and a simple hair cap make the procedural model readable at dashboard scale.
    capsule(this.torso,skin,new THREE.Vector3(0,0.56,0),0.075,0.11);
    sphere(this.torso,skin,new THREE.Vector3(0,0.78,0.015),new THREE.Vector3(0.19,0.235,0.17));
    sphere(this.torso,dark,new THREE.Vector3(0,0.92,-0.005),new THREE.Vector3(0.195,0.12,0.174));
    sphere(this.torso,skin,new THREE.Vector3(-0.19,0.77,0),new THREE.Vector3(0.045,0.07,0.045)); sphere(this.torso,skin,new THREE.Vector3(0.19,0.77,0),new THREE.Vector3(0.045,0.07,0.045));
    // Eyes are tiny dark markers on the forward-facing side.
    sphere(this.torso,dark,new THREE.Vector3(-0.067,0.79,0.168),new THREE.Vector3(0.018,0.024,0.012)); sphere(this.torso,dark,new THREE.Vector3(0.067,0.79,0.168),new THREE.Vector3(0.018,0.024,0.012));
    const makeArm=(side:number)=>{const pivot=new THREE.Group();pivot.position.set(side*0.34,0.35,0);this.torso!.add(pivot);capsule(pivot,shirt,new THREE.Vector3(0,-0.18,0),0.105,0.22);sphere(pivot,jointMat,new THREE.Vector3(0,-0.32,0),new THREE.Vector3(0.085,0.085,0.085));capsule(pivot,skin,new THREE.Vector3(0,-0.48,0),0.072,0.24);sphere(pivot,skin,new THREE.Vector3(0,-0.64,0.01),new THREE.Vector3(0.075,0.09,0.065));return pivot;};
    this.leftArm=makeArm(-1);this.rightArm=makeArm(1);
    const makeLeg=(side:number)=>{const thigh=new THREE.Group();thigh.position.set(side*0.15,-0.43,0);this.torso!.add(thigh);capsule(thigh,shorts,new THREE.Vector3(0,-0.22,0),0.13,0.28);capsule(thigh,skin,new THREE.Vector3(0,-0.5,0),0.09,0.27);const shin=new THREE.Group();shin.position.set(0,-0.58,0);thigh.add(shin);capsule(shin,skin,new THREE.Vector3(0,-0.19,0),0.075,0.27);sphere(shin,shoe,new THREE.Vector3(0.035,-0.37,0.075),new THREE.Vector3(0.09,0.055,0.16));return {thigh,shin};};
    const left=makeLeg(-1),right=makeLeg(1);this.leftLeg=left.thigh;this.rightLeg=right.thigh;this.leftShin=left.shin;this.rightShin=right.shin;
    // Add small trainer accents on the chest and shoes.
    const badge=new THREE.Mesh(new THREE.CircleGeometry(0.055,24),this.material(0xd7fff1,0.4));badge.position.set(0.11,0.2,0.255);this.torso.add(badge);
  }

  private animate = (): void => {
    this.animationFrame=requestAnimationFrame(this.animate);
    const delta=Math.min(this.clock.getDelta(),0.04); if(this.playing()) this.elapsed+=delta*this.speed();
    const t=this.elapsed; const mode=this.motion();
    if(this.avatar){
      let swing=0, bob=0, squat=0, armBias=0;
      if(mode==='run'){swing=0.68;bob=Math.abs(Math.sin(t*9))*0.075;}
      if(mode==='walk'){swing=0.32;bob=Math.abs(Math.sin(t*5))*0.025;}
      if(mode==='squat'){squat=this.playing()?(Math.sin(t*2.2)*0.5+0.5)*0.58:0.18;}
      if(mode==='stretch'){armBias=-1.05;}
      this.avatar.position.y=bob;
      if(this.torso){this.torso.rotation.x=mode==='run'?Math.sin(t*9)*0.035:0;this.torso.position.y=1.55-squat*0.48;}
      if(this.leftArm)this.leftArm.rotation.x=mode==='stretch'?-1.7:Math.sin(t*(mode==='run'?9:5))*swing+armBias;
      if(this.rightArm)this.rightArm.rotation.x=mode==='stretch'?-1.7:-Math.sin(t*(mode==='run'?9:5))*swing+armBias;
      if(this.leftArm)this.leftArm.rotation.z=mode==='stretch'?-0.18:0.06;
      if(this.rightArm)this.rightArm.rotation.z=mode==='stretch'?0.18:-0.06;
      if(this.leftLeg)this.leftLeg.rotation.x=mode==='squat'?squat:Math.sin(t*(mode==='run'?9:5))*swing;
      if(this.rightLeg)this.rightLeg.rotation.x=mode==='squat'?squat:Math.sin(t*(mode==='run'?9:5)+Math.PI)*swing;
      if(this.leftShin)this.leftShin.rotation.x=mode==='run'?Math.max(0,Math.sin(t*9+Math.PI))*0.85:mode==='walk'?Math.max(0,Math.sin(t*5+Math.PI))*0.25:mode==='squat'?-squat*0.7:0;
      if(this.rightShin)this.rightShin.rotation.x=mode==='run'?Math.max(0,Math.sin(t*9))*0.85:mode==='walk'?Math.max(0,Math.sin(t*5))*0.25:mode==='squat'?-squat*0.7:0;
      if(mode==='idle'){if(this.torso)this.torso.rotation.z=Math.sin(t*1.2)*0.012;}
    }
    this.renderer?.render(this.scene!,this.camera!);
  };

  setMotion(value: Motion): void { this.motion.set(value); if(this.avatar){this.avatar.position.y=0;} }
  togglePlayback(): void { this.playing.update(v=>!v); }
  setSpeed(value: string): void { const n=Number(value); if(Number.isFinite(n))this.speed.set(THREE.MathUtils.clamp(n,0.4,1.6)); }
  resetView(): void { if(this.avatar)this.avatar.rotation.set(0,0,0); if(this.camera){this.camera.position.set(0,1.65,7.25);this.camera.lookAt(0,1.25,0);} }
  private onPointerDown = (event: PointerEvent): void => { if(event.button!==0)return;this.dragging=true;this.lastX=event.clientX;this.lastY=event.clientY;this.canvasHost.nativeElement.setPointerCapture?.(event.pointerId); };
  private onPointerMove(event: PointerEvent): void { if(!this.dragging||!this.avatar)return;const dx=event.clientX-this.lastX;const dy=event.clientY-this.lastY;this.lastX=event.clientX;this.lastY=event.clientY;this.avatar.rotation.y+=dx*0.008;this.avatar.rotation.x=THREE.MathUtils.clamp(this.avatar.rotation.x+dy*0.003,-0.18,0.18); }
  private resize(): void { const host=this.canvasHost?.nativeElement;if(!host||!this.renderer||!this.camera)return;const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix(); }
  ngOnDestroy(): void { cancelAnimationFrame(this.animationFrame);this.resizeObserver?.disconnect();const host=this.canvasHost?.nativeElement;if(host){host.removeEventListener('pointerdown',this.onPointerDown);host.removeEventListener('pointermove',this.pointerMove);host.removeEventListener('pointerup',this.pointerUp);host.removeEventListener('pointerleave',this.pointerUp);host.removeEventListener('wheel',this.wheel);}this.scene?.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points){object.geometry.dispose();const mat=object.material;if(Array.isArray(mat))mat.forEach(m=>m.dispose());else mat.dispose();}});this.renderer?.dispose();this.renderer?.domElement.remove();}
}
