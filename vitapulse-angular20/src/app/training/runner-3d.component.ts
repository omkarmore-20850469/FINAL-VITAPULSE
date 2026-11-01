import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import * as THREE from 'three';
import { MusicService } from '../music/music.service';

/** Lightweight procedural 3D runner. No external model download is required. */
@Component({
  selector: 'app-runner-3d',
  standalone: true,
  template: '<div #viewport class="runner3d-viewport" [class.runner3d-compact]="compact" role="img" [attr.aria-label]="motionLabel()"></div>',
  styles: [`
    :host{display:inline-flex;vertical-align:middle;align-items:center;justify-content:center;min-width:0;min-height:0}
    .runner3d-viewport{width:176px;height:208px;position:relative;overflow:hidden;isolation:isolate;pointer-events:none;background:radial-gradient(ellipse at 50% 78%,rgba(79,153,129,.20),rgba(79,153,129,0) 66%);}
    .runner3d-viewport canvas{display:block;width:100%;height:100%;outline:none}
    .runner3d-compact{width:68px;height:68px;background:radial-gradient(circle at 50% 72%,rgba(79,153,129,.22),transparent 70%)}
    @media(prefers-reduced-motion:reduce){.runner3d-viewport{background:transparent}}
  `]
})
export class Runner3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() compact = false;
  @Input() activity = 'running';
  @ViewChild('viewport', { static: true }) viewport!: ElementRef<HTMLDivElement>;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private runner?: THREE.Group;
  private leftLeg?: THREE.Group;
  private rightLeg?: THREE.Group;
  private leftShin?: THREE.Group;
  private rightShin?: THREE.Group;
  private leftArm?: THREE.Group;
  private rightArm?: THREE.Group;
  private leftForearm?: THREE.Group;
  private rightForearm?: THREE.Group;
  private torso?: THREE.Group;
  private bicycle?: THREE.Group;
  private bicycleWheels: THREE.Group[] = [];
  private frame = 0;
  private resizeObserver?: ResizeObserver;
  private lastTime = 0;
  private reducedMotion = false;
  private phase = 0;
  private lastFrameTime = 0;

  constructor(private music: MusicService) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Reframe the 3D stage whenever a workout activity or compact-card layout changes.
    // This is important when a running session switches to cycling or floor exercises.
    if ((changes["activity"] || changes["compact"]) && this.renderer && this.camera) this.resize();
  }

  ngAfterViewInit(): void {
    try { this.initializeScene(); } catch { /* WebGL can be unavailable on some devices; keep the rest of the app usable. */ }
  }

  private initializeScene(): void {
    const host = this.viewport.nativeElement;
    this.reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.camera.position.set(3.0, 2.45, 6.7);
    this.camera.lookAt(0, 1.18, 0);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.HemisphereLight(0xeaf8f2, 0x50645e, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x68c9ae, 2.3);
    rim.position.set(-4, 2.5, -3); this.scene.add(rim);
    const fill = new THREE.PointLight(0xe6b879, 1.1, 10);
    fill.position.set(-2, 2, 4); this.scene.add(fill);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 48),
      new THREE.MeshBasicMaterial({ color: 0x69a994, transparent: true, opacity: 0.14, depthWrite: false })
    );
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.025; floor.scale.set(1.18, 0.45, 1); this.scene.add(floor);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.008, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x6bb69e, transparent: true, opacity: 0.38 })
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.035; halo.scale.set(1.18, 0.45, 1); this.scene.add(halo);

    this.runner = new THREE.Group();
    this.runner.position.y = 0.04;
    this.scene.add(this.runner);
    this.buildRunner();
    this.buildBicycle();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.frame = requestAnimationFrame(this.animate);
  }

  private material(color: number, roughness = 0.55, metalness = 0.02): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private addCapsule(parent: THREE.Object3D, radius: number, length: number, color: number, y: number, x = 0, z = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), this.material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); return mesh;
  }

  private addSphere(parent: THREE.Object3D, radius: number, color: number, x: number, y: number, z: number, scale?: THREE.Vector3): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), this.material(color, 0.48));
    mesh.position.set(x, y, z); if (scale) mesh.scale.copy(scale); mesh.castShadow = true; parent.add(mesh); return mesh;
  }

  private addLimb(parent: THREE.Object3D, length: number, radius: number, color: number, foot = false): THREE.Group {
    const pivot = new THREE.Group(); parent.add(pivot);
    const segment = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.05, length - radius * 2), 4, 8), this.material(color));
    segment.position.y = -length / 2; segment.castShadow = true; pivot.add(segment);
    if (foot) {
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.105, 0.34), this.material(0xf4f4ed, 0.4));
      shoe.position.set(0, -length + 0.015, 0.105); shoe.castShadow = true; pivot.add(shoe);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.025, 0.345), this.material(0x2b5149, 0.42));
      sole.position.set(0, -length - 0.035, 0.105); pivot.add(sole);
    }
    return pivot;
  }

  private buildRunner(): void {
    const root = this.runner!;
    const skin = 0xc98f69;
    const shirt = 0x287c68;
    const shorts = 0x253c3c;
    const accent = 0xe4b76b;
    const head = new THREE.Group(); head.position.set(0, 2.34, 0); root.add(head);
    this.addSphere(head, 0.19, skin, 0, 0, 0.015, new THREE.Vector3(0.91, 1.05, 0.93));
    this.addSphere(head, 0.195, 0x292e2c, 0, 0.105, -0.025, new THREE.Vector3(0.98, 0.63, 0.97));
    this.addSphere(head, 0.042, skin, 0.17, -0.045, 0.015, new THREE.Vector3(0.75, 0.9, 0.7));
    const neck = this.addCapsule(root, 0.075, 0.12, skin, 2.15);
    neck.rotation.x = -0.08;

    this.torso = new THREE.Group(); this.torso.position.set(0, 1.76, 0); root.add(this.torso);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.235, 0.47, 5, 12), this.material(shirt, 0.7));
    chest.scale.set(1.02, 1.0, 0.77); chest.rotation.x = -0.12; chest.castShadow = true; this.torso.add(chest);
    this.addSphere(this.torso, 0.235, shirt, 0, 1.78 - 1.76, 0, new THREE.Vector3(1.05, 0.62, 0.82));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.38, 0.012), this.material(accent, 0.45, 0.08));
    stripe.position.set(0.12, -0.02, 0.176); this.torso.add(stripe);
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.18, 4, 10), this.material(shorts));
    pelvis.position.set(0, 1.34 - 1.76, 0); pelvis.scale.set(1.05, 0.7, 0.78); this.torso.add(pelvis);

    const hipY = 1.34;
    this.leftLeg = new THREE.Group(); this.leftLeg.position.set(-0.115, hipY, 0); root.add(this.leftLeg);
    this.rightLeg = new THREE.Group(); this.rightLeg.position.set(0.115, hipY, 0); root.add(this.rightLeg);
    this.leftShin = this.addLimb(this.leftLeg, 0.48, 0.095, skin);
    this.rightShin = this.addLimb(this.rightLeg, 0.48, 0.095, skin);
    const leftThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), this.material(shorts)); leftThigh.position.y = -0.22; this.leftLeg.add(leftThigh);
    const rightThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 8), this.material(shorts)); rightThigh.position.y = -0.22; this.rightLeg.add(rightThigh);
    // Shin pivots sit at the knee, making the gait visibly articulated.
    this.leftShin.position.y = -0.48; this.rightShin.position.y = -0.48;
    const leftCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.25, 4, 8), this.material(skin)); leftCalf.position.y = -0.25; this.leftShin.add(leftCalf);
    const rightCalf = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.25, 4, 8), this.material(skin)); rightCalf.position.y = -0.25; this.rightShin.add(rightCalf);
    this.addShoe(this.leftShin); this.addShoe(this.rightShin);

    this.leftArm = new THREE.Group(); this.leftArm.position.set(-0.255, 2.02, 0); root.add(this.leftArm);
    this.rightArm = new THREE.Group(); this.rightArm.position.set(0.255, 2.02, 0); root.add(this.rightArm);
    const leftUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.25, 4, 8), this.material(shirt)); leftUpper.position.y = -0.19; this.leftArm.add(leftUpper);
    const rightUpper = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.25, 4, 8), this.material(shirt)); rightUpper.position.y = -0.19; this.rightArm.add(rightUpper);
    this.leftForearm = this.addLimb(this.leftArm, 0.34, 0.062, skin);
    this.rightForearm = this.addLimb(this.rightArm, 0.34, 0.062, skin);
    this.leftForearm.position.y = -0.37; this.rightForearm.position.y = -0.37;
    this.addSphere(this.leftArm, 0.067, skin, 0, -0.39, 0.01);
    this.addSphere(this.rightArm, 0.067, skin, 0, -0.39, 0.01);
    // Keep the runner in a gentle forward-leaning sprint posture.
    root.rotation.z = -0.035;
  }

  private addTubeBetween(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, color: number, radius = 0.025): THREE.Mesh {
    const direction = new THREE.Vector3().subVectors(b, a);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), this.material(color, 0.38, 0.3));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    parent.add(mesh);
    return mesh;
  }

  private buildBicycle(): void {
    const bike = new THREE.Group();
    const frameColor = 0x2e8f82;
    const metal = 0x243440;
    const rear = new THREE.Vector3(0.66, 0.48, -0.11);
    const front = new THREE.Vector3(-0.70, 0.48, -0.11);
    const bottom = new THREE.Vector3(0.00, 0.53, -0.11);
    const seat = new THREE.Vector3(0.13, 1.04, -0.11);
    const handle = new THREE.Vector3(-0.49, 1.12, -0.11);
    const wheelRadius = 0.43;
    for (const centre of [rear, front]) {
      const wheel = new THREE.Group();
      wheel.position.copy(centre);
      const tire = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.023, 8, 36), this.material(metal, 0.48, 0.15));
      wheel.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 10), this.material(0xb8c6d4, 0.35, 0.3));
      hub.rotation.x = Math.PI / 2;
      wheel.add(hub);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const end = new THREE.Vector3(Math.cos(angle) * wheelRadius, Math.sin(angle) * wheelRadius, 0);
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, wheelRadius, 4), this.material(0x8ba2ae, 0.6, 0.15));
        spoke.position.copy(end).multiplyScalar(0.5);
        spoke.rotation.z = angle - Math.PI / 2;
        wheel.add(spoke);
      }
      bike.add(wheel);
      this.bicycleWheels.push(wheel);
    }
    // A clean, compact road-bike frame makes the cycling motion immediately recognisable.
    this.addTubeBetween(bike, rear, bottom, frameColor, 0.028);
    this.addTubeBetween(bike, bottom, seat, frameColor, 0.028);
    this.addTubeBetween(bike, seat, rear, frameColor, 0.028);
    this.addTubeBetween(bike, bottom, front, frameColor, 0.028);
    this.addTubeBetween(bike, front, handle, frameColor, 0.028);
    this.addTubeBetween(bike, handle, seat, frameColor, 0.022);
    this.addTubeBetween(bike, new THREE.Vector3(0.0, 0.56, -0.11), new THREE.Vector3(0.16, 0.56, -0.11), metal, 0.018);
    this.addTubeBetween(bike, new THREE.Vector3(0.16, 0.56, -0.11), new THREE.Vector3(0.16, 0.65, -0.11), metal, 0.015);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.12), this.material(0x202b34, 0.55));
    saddle.position.set(0.14, 1.08, -0.11); bike.add(saddle);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.30, 8), this.material(0x283740, 0.45));
    bar.rotation.z = Math.PI / 2; bar.position.set(-0.51, 1.15, -0.11); bike.add(bar);
    bike.visible = false;
    this.bicycle = bike;
    this.scene?.add(bike);
  }

  private addShoe(shin: THREE.Group): void {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.105, 0.32), this.material(0xf4f4ed, 0.38));
    shoe.position.set(0, -0.49, 0.10); shoe.castShadow = true; shin.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.195, 0.025, 0.33), this.material(0x2b5149, 0.4));
    sole.position.set(0, -0.55, 0.10); shin.add(sole);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), this.material(0xe4b76b, 0.4));
    accent.position.set(0.012, -0.465, 0.266); shin.add(accent);
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const host = this.viewport.nativeElement;
    const width = Math.max(1, host.clientWidth); const height = Math.max(1, host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    const motion = this.motionType();
    this.camera.position.z = this.compact ? 7.8 : (motion === 'pushups' || motion === 'cycling' ? 7.8 : 6.7);
    this.camera.position.y = this.compact ? 2.55 : (motion === 'pushups' ? 1.8 : 2.45);
    this.camera.lookAt(0, this.compact ? 1.15 : (motion === 'pushups' ? 0.78 : 1.18), 0);
    this.camera.updateProjectionMatrix();
  }

  private motionType(): 'running' | 'walking' | 'cycling' | 'yoga' | 'stretching' | 'yoga-stretching' | 'squats' | 'pushups' {
    const name = String(this.activity || 'running').toLowerCase();
    if (name.includes('cycl') || name.includes('bike')) return 'cycling';
    if (name.includes('walk')) return 'walking';
    if (name.includes('yoga') && name.includes('stretch')) return 'yoga-stretching';
    if (name.includes('yoga')) return 'yoga';
    if (name.includes('stretch')) return 'stretching';
    if (name.includes('squat')) return 'squats';
    if (name.includes('push')) return 'pushups';
    return 'running';
  }

  motionLabel(): string {
    const labels: Record<string, string> = {
      running: 'Animated 3D runner', walking: 'Animated 3D walking athlete', cycling: 'Animated 3D cyclist on a bicycle',
      yoga: 'Animated 3D yoga pose', stretching: 'Animated 3D stretching athlete', 'yoga-stretching': 'Animated 3D yoga and stretching sequence', squats: 'Animated 3D squat demonstration', pushups: 'Animated 3D push-up demonstration'
    };
    return labels[this.motionType()];
  }

  private animate = (time: number): void => {
    this.frame = requestAnimationFrame(this.animate);
    if (!this.renderer || !this.scene || !this.camera || !this.runner) return;
    this.lastTime = time;
    const mode = this.motionType();
    const speed = mode === 'walking' ? 0.0042 : mode === 'cycling' ? 0.0068 : mode === 'yoga' ? 0.0018 : mode === 'stretching' ? 0.0025 : mode === 'yoga-stretching' ? 0.0019 : mode === 'squats' ? 0.0031 : mode === 'pushups' ? 0.0028 : 0.008;
    // Free-running phase, or phase locked to the music's beat clock when BPM sync is on.
    // One stride/pedal cycle = 2 beats; one squat = 4 beats; one push-up = 4 beats.
    const dt = this.lastFrameTime ? Math.min(100, time - this.lastFrameTime) : 16;
    this.lastFrameTime = time;
    const bpm = this.music.syncBpm();
    const beatSynced = bpm > 0 && (mode === 'running' || mode === 'walking' || mode === 'cycling' || mode === 'squats' || mode === 'pushups');
    if (beatSynced) this.phase = Math.PI * this.music.currentBeat() * (mode === 'squats' ? 1 / 1.6 : mode === 'pushups' ? 1 / 2.1 : 1);
    else this.phase += dt * speed;
    const t = this.phase;
    const swing = Math.sin(t);
    const bend = (Math.sin(t * 0.8) + 1) / 2;
    const pushPhase = (Math.sin(t * 1.05) + 1) / 2;
    const cycling = mode === 'cycling';
    if (this.bicycle) this.bicycle.visible = cycling;
    this.bicycleWheels.forEach((wheel, index) => { wheel.rotation.z = cycling ? -t * 1.5 : 0; });

    // Reset the whole rig first; every activity then applies its own motion profile.
    this.runner.scale.setScalar(mode === 'cycling' ? 0.91 : mode === 'pushups' ? 0.80 : 1);
    this.runner.position.set(0, mode === 'cycling' ? -0.10 : 0.04, 0);
    this.runner.rotation.set(0, 0, -0.035);
    if (this.leftLeg) this.leftLeg.rotation.set(0, 0, 0);
    if (this.rightLeg) this.rightLeg.rotation.set(0, 0, 0);
    if (this.leftShin) this.leftShin.rotation.set(0, 0, 0);
    if (this.rightShin) this.rightShin.rotation.set(0, 0, 0);
    if (this.leftArm) this.leftArm.rotation.set(0, 0, 0);
    if (this.rightArm) this.rightArm.rotation.set(0, 0, 0);
    if (this.leftForearm) this.leftForearm.rotation.set(0, 0, 0);
    if (this.rightForearm) this.rightForearm.rotation.set(0, 0, 0);
    if (this.torso) this.torso.rotation.set(0, 0, 0);

    if (this.reducedMotion) {
      // Honour reduced-motion preferences while keeping the right exercise and props visible.
      if (mode === 'cycling') { this.runner.rotation.y = -Math.PI / 2; if (this.torso) this.torso.rotation.z = 0.12; }
      if (mode === 'pushups') { this.runner.position.set(-1.15, 0.74, 0); this.runner.rotation.z = -Math.PI / 2; }
      if ((mode === 'yoga' || mode === 'yoga-stretching') && this.leftArm && this.rightArm) { this.leftArm.rotation.z = 2.7; this.rightArm.rotation.z = -2.7; }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (mode === 'running') {
      if (this.leftLeg) this.leftLeg.rotation.x = swing * 0.78;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing * 0.78;
      if (this.leftShin) this.leftShin.rotation.x = Math.max(0, -swing) * 1.02;
      if (this.rightShin) this.rightShin.rotation.x = Math.max(0, swing) * 1.02;
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.66;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.66;
      if (this.leftForearm) this.leftForearm.rotation.x = 0.45 + Math.max(0, swing) * 0.5;
      if (this.rightForearm) this.rightForearm.rotation.x = 0.45 + Math.max(0, -swing) * 0.5;
      if (this.torso) this.torso.rotation.z = Math.sin(t * 2) * 0.018;
      this.runner.position.y = 0.04 + Math.abs(Math.sin(t * 2)) * 0.055;
      this.runner.rotation.y = Math.sin(t * 0.45) * 0.06;
    } else if (mode === 'walking') {
      if (this.leftLeg) this.leftLeg.rotation.x = swing * 0.36;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing * 0.36;
      if (this.leftShin) this.leftShin.rotation.x = Math.max(0, -swing) * 0.38;
      if (this.rightShin) this.rightShin.rotation.x = Math.max(0, swing) * 0.38;
      if (this.leftArm) this.leftArm.rotation.x = -swing * 0.30;
      if (this.rightArm) this.rightArm.rotation.x = swing * 0.30;
      if (this.leftForearm) this.leftForearm.rotation.x = 0.18 + Math.max(0, swing) * 0.15;
      if (this.rightForearm) this.rightForearm.rotation.x = 0.18 + Math.max(0, -swing) * 0.15;
      if (this.torso) this.torso.rotation.z = Math.sin(t * 1.5) * 0.008;
      this.runner.position.y = 0.04 + Math.abs(Math.sin(t * 2)) * 0.018;
    } else if (mode === 'cycling') {
      // A compact road-bike and steady pedal stroke, with the athlete leaning forward.
      if (this.leftLeg) this.leftLeg.rotation.x = swing * 0.68;
      if (this.rightLeg) this.rightLeg.rotation.x = -swing * 0.68;
      if (this.leftShin) this.leftShin.rotation.x = 0.35 + Math.max(0, -swing) * 0.48;
      if (this.rightShin) this.rightShin.rotation.x = 0.35 + Math.max(0, swing) * 0.48;
      if (this.leftArm) { this.leftArm.rotation.x = -0.34; this.leftArm.rotation.z = 0.42; }
      if (this.rightArm) { this.rightArm.rotation.x = -0.34; this.rightArm.rotation.z = -0.42; }
      if (this.leftForearm) { this.leftForearm.rotation.x = 0.65; this.leftForearm.rotation.z = -0.18; }
      if (this.rightForearm) { this.rightForearm.rotation.x = 0.65; this.rightForearm.rotation.z = 0.18; }
      if (this.torso) this.torso.rotation.z = 0.12 + Math.sin(t) * 0.015;
      this.runner.rotation.y = -Math.PI / 2;
      this.runner.rotation.z = 0.10;
      this.runner.position.y = -0.10 + Math.abs(Math.sin(t * 2)) * 0.012;
    } else if (mode === 'squats') {
      // Repeated controlled descent and rise with a forward arm counterbalance.
      if (this.leftLeg) this.leftLeg.rotation.x = 0.18 + bend * 0.27;
      if (this.rightLeg) this.rightLeg.rotation.x = 0.18 + bend * 0.27;
      if (this.leftShin) this.leftShin.rotation.x = -bend * 0.66;
      if (this.rightShin) this.rightShin.rotation.x = -bend * 0.66;
      if (this.leftArm) this.leftArm.rotation.x = -0.68 - bend * 0.10;
      if (this.rightArm) this.rightArm.rotation.x = -0.68 - bend * 0.10;
      if (this.leftForearm) this.leftForearm.rotation.x = 0.18;
      if (this.rightForearm) this.rightForearm.rotation.x = 0.18;
      if (this.torso) this.torso.rotation.x = -0.08 - bend * 0.10;
      this.runner.position.y = 0.04 - bend * 0.16;
    } else if (mode === 'pushups') {
      // Rotate the rig into a plank and animate a gentle down/up push-up cycle.
      this.runner.position.set(-1.12, 0.76 + pushPhase * 0.075, 0);
      this.runner.rotation.z = -Math.PI / 2;
      if (this.leftArm) this.leftArm.rotation.z = 0.12 + pushPhase * 0.30;
      if (this.rightArm) this.rightArm.rotation.z = -0.12 - pushPhase * 0.30;
      if (this.leftForearm) this.leftForearm.rotation.z = -0.18 - pushPhase * 0.34;
      if (this.rightForearm) this.rightForearm.rotation.z = 0.18 + pushPhase * 0.34;
      if (this.torso) this.torso.rotation.z = Math.sin(t) * 0.015;
    } else if (mode === 'yoga-stretching') {
      // Alternate slowly between an overhead yoga pose and a gentle side stretch.
      const overheadPose = Math.sin(t * 0.34) >= 0;
      if (overheadPose) {
        if (this.leftArm) this.leftArm.rotation.z = 2.72 + Math.sin(t) * 0.035;
        if (this.rightArm) this.rightArm.rotation.z = -2.72 - Math.sin(t) * 0.035;
        if (this.leftForearm) this.leftForearm.rotation.z = 0.10;
        if (this.rightForearm) this.rightForearm.rotation.z = -0.10;
        if (this.torso) this.torso.rotation.z = Math.sin(t * 0.55) * 0.035;
      } else {
        const leftReach = Math.sin(t * 0.55) >= 0;
        if (this.leftArm) this.leftArm.rotation.z = leftReach ? 2.60 : -1.15;
        if (this.rightArm) this.rightArm.rotation.z = leftReach ? 1.15 : -2.60;
        if (this.leftForearm) this.leftForearm.rotation.z = leftReach ? 0.08 : -0.10;
        if (this.rightForearm) this.rightForearm.rotation.z = leftReach ? 0.10 : -0.08;
        if (this.torso) this.torso.rotation.z = Math.sin(t * 0.55) * 0.14;
      }
      this.runner.position.y = 0.04 + Math.sin(t * 0.7) * 0.01;
    } else if (mode === 'yoga') {
      // Calm overhead stretch, slow breathing sway and grounded legs.
      if (this.leftArm) this.leftArm.rotation.z = 2.78 + Math.sin(t) * 0.05;
      if (this.rightArm) this.rightArm.rotation.z = -2.78 - Math.sin(t) * 0.05;
      if (this.leftForearm) this.leftForearm.rotation.z = 0.12;
      if (this.rightForearm) this.rightForearm.rotation.z = -0.12;
      if (this.torso) this.torso.rotation.z = Math.sin(t * 0.65) * 0.035;
      this.runner.position.y = 0.04 + Math.sin(t * 0.7) * 0.012;
    } else if (mode === 'stretching') {
      // Alternate a side stretch: one arm reaches high while the other opens outward.
      const leftReach = Math.sin(t * 0.55) >= 0;
      if (this.leftArm) this.leftArm.rotation.z = leftReach ? 2.65 : -1.25;
      if (this.rightArm) this.rightArm.rotation.z = leftReach ? 1.25 : -2.65;
      if (this.leftForearm) this.leftForearm.rotation.z = leftReach ? 0.08 : -0.12;
      if (this.rightForearm) this.rightForearm.rotation.z = leftReach ? 0.12 : -0.08;
      if (this.torso) this.torso.rotation.z = Math.sin(t * 0.55) * 0.18;
      this.runner.position.y = 0.04 + Math.sin(t * 0.8) * 0.008;
    }
    this.renderer.render(this.scene, this.camera);
  };

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver?.disconnect();
    if (this.scene) {
      this.scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach(material => material.dispose());
        }
      });
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
