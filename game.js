import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const canvas = document.querySelector('#game');
const stageLabel = document.querySelector('#stageLabel');
const hint = document.querySelector('#hint');
const status = document.querySelector('#status');
const resetButton = document.querySelector('#resetButton');
const againButton = document.querySelector('#againButton');
const completion = document.querySelector('#completion');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xf7f3ea, 1);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);

let yaw = -0.7;
const pitch = 0.72;
const cameraDistance = 22;
const cameraTarget = new THREE.Vector3(0, 0.15, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0xc9bda9, 2.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-6, 11, 8);
scene.add(sun);

const levelRoot = new THREE.Group();
scene.add(levelRoot);

const pathMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5f0e7,
  roughness: 0.8,
  metalness: 0,
  side: THREE.DoubleSide
});
const railMaterial = new THREE.MeshStandardMaterial({
  color: 0x292a2c,
  roughness: 0.88,
  metalness: 0,
  side: THREE.DoubleSide
});
const ballMaterial = new THREE.MeshStandardMaterial({
  color: 0xd83b38,
  roughness: 0.3,
  metalness: 0.02
});

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TRACK_WIDTH = 1.28;
const TRACK_THICKNESS = 0.24;
const RAIL_HEIGHT = 0.36;
const BALL_RADIUS = 0.35;
const TRACK_SEGMENTS = 220;

const levels = [
  {
    name: '감춰진 경사',
    targetYaw: -0.55,
    forwardAngle: 0.18,
    inLength: 3.25,
    bridgeLength: 2.55,
    outLength: 3.55,
    depth: -3.0,
    text: '길의 굴곡이 사라져 하나의 평범한 직선처럼 보이는 시점을 찾으세요.'
  },
  {
    name: '깊이 속 직선',
    targetYaw: 0.32,
    forwardAngle: -0.22,
    inLength: 3.35,
    bridgeLength: 2.7,
    outLength: 3.5,
    depth: -3.45,
    text: '실제 통로는 아래쪽으로 이어집니다. 화면에서는 그 깊이가 사라지는 각도가 있습니다.'
  },
  {
    name: '비스듬한 낙차',
    targetYaw: 1.08,
    forwardAngle: 0.42,
    inLength: 3.15,
    bridgeLength: 2.85,
    outLength: 3.65,
    depth: -3.8,
    text: '바닥과 양쪽 난간이 모두 한 줄로 이어져 보이는 시점을 찾아보세요.'
  },
  {
    name: '숨은 층',
    targetYaw: 2.02,
    forwardAngle: -0.38,
    inLength: 3.45,
    bridgeLength: 2.7,
    outLength: 3.45,
    depth: -4.05,
    text: '높이 차이는 실제로 존재합니다. 정사영에서만 그 차이가 보이지 않게 만들어 보세요.'
  },
  {
    name: '마지막 직선',
    targetYaw: 2.78,
    forwardAngle: 0.3,
    inLength: 3.3,
    bridgeLength: 3.0,
    outLength: 3.6,
    depth: -4.35,
    text: '마지막입니다. 실제 경사로 전체가 완전한 직선처럼 보이는 한 장면을 찾으세요.'
  }
];

let levelIndex = 0;
let currentLevel = levels[0];
let routeCurve = null;
let routeEnd = new THREE.Vector3();
let endTangent = new THREE.Vector3(1, 0, 0);
let ballMesh = null;
let ballBody = null;
let physicsWorld = null;
let trackPhysicsMaterial = null;
let ballPhysicsMaterial = null;
let ballState = 'waiting';
let alignmentHold = 0;
let solved = false;
let dragActive = false;
let previousX = 0;
let lastTime = performance.now();
let rollingTime = 0;

function cameraAxisForYaw(targetYaw) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(
    Math.sin(targetYaw) * cp,
    Math.sin(pitch),
    Math.cos(targetYaw) * cp
  ).normalize();
}

function smootherstep(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function makeFrame(tangent) {
  const t = tangent.clone().normalize();
  let right = new THREE.Vector3().crossVectors(WORLD_UP, t);

  if (right.lengthSq() < 0.0001) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }

  const normal = new THREE.Vector3().crossVectors(t, right).normalize();
  return { tangent: t, right, normal };
}

class PerspectiveRoute extends THREE.Curve {
  constructor(level) {
    super();
    this.level = level;
    this.forward = new THREE.Vector3(
      Math.cos(level.forwardAngle),
      0,
      Math.sin(level.forwardAngle)
    ).normalize();
    this.axis = cameraAxisForYaw(level.targetYaw);
    this.totalBaseLength = level.inLength + level.bridgeLength + level.outLength;

    const origin = new THREE.Vector3(0, 0, 0);
    this.jointA = origin.clone().addScaledVector(this.forward, -level.bridgeLength * 0.5);
    this.bridgeBaseEnd = origin.clone().addScaledVector(this.forward, level.bridgeLength * 0.5);
    this.start = this.jointA.clone().addScaledVector(this.forward, -level.inLength);
    this.jointB = this.bridgeBaseEnd.clone().addScaledVector(this.axis, level.depth);
    this.end = this.jointB.clone().addScaledVector(this.forward, level.outLength);
    this.arcLengthDivisions = 1600;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const level = this.level;
    const d = THREE.MathUtils.clamp(t, 0, 1) * this.totalBaseLength;

    if (d <= level.inLength) {
      return target.copy(this.start).addScaledVector(this.forward, d);
    }

    if (d <= level.inLength + level.bridgeLength) {
      const s = (d - level.inLength) / level.bridgeLength;
      return target
        .copy(this.jointA)
        .addScaledVector(this.forward, level.bridgeLength * s)
        .addScaledVector(this.axis, level.depth * smootherstep(s));
    }

    const outDistance = d - level.inLength - level.bridgeLength;
    return target.copy(this.jointB).addScaledVector(this.forward, outDistance);
  }
}

function buildRoute(level) {
  const curve = new PerspectiveRoute(level);
  curve.updateArcLengths();
  return curve;
}

function createPhysicsWorld() {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0)
  });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 18;
  world.solver.tolerance = 0.0005;

  trackPhysicsMaterial = new CANNON.Material('track');
  ballPhysicsMaterial = new CANNON.Material('ball');

  const contact = new CANNON.ContactMaterial(trackPhysicsMaterial, ballPhysicsMaterial, {
    friction: 0.16,
    restitution: 0,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
    frictionEquationStiffness: 1e7,
    frictionEquationRelaxation: 3
  });
  world.addContactMaterial(contact);
  world.defaultContactMaterial.friction = 0.16;
  world.defaultContactMaterial.restitution = 0;

  return world;
}

function addStaticTrimesh(vertices, indices) {
  const shape = new CANNON.Trimesh(vertices, indices);
  const body = new CANNON.Body({
    mass: 0,
    material: trackPhysicsMaterial
  });
  body.addShape(shape);
  physicsWorld.addBody(body);
  return body;
}

function sampleRoute(curve, segments = TRACK_SEGMENTS) {
  const samples = [];

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const frame = makeFrame(tangent);
    samples.push({ point, tangent, ...frame });
  }

  return samples;
}

function createDeck(samples) {
  const positions = [];
  const visualIndices = [];
  const collisionVertices = [];
  const collisionIndices = [];

  for (const sample of samples) {
    const { point, right, normal } = sample;
    const halfWidth = TRACK_WIDTH * 0.5;

    const leftTop = point.clone().addScaledVector(right, -halfWidth);
    const rightTop = point.clone().addScaledVector(right, halfWidth);
    const leftBottom = leftTop.clone().addScaledVector(normal, -TRACK_THICKNESS);
    const rightBottom = rightTop.clone().addScaledVector(normal, -TRACK_THICKNESS);

    for (const p of [leftTop, rightTop, leftBottom, rightBottom]) {
      positions.push(p.x, p.y, p.z);
    }

    collisionVertices.push(
      leftTop.x, leftTop.y, leftTop.z,
      rightTop.x, rightTop.y, rightTop.z
    );
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = i * 4;
    const b = (i + 1) * 4;

    visualIndices.push(
      a, b, b + 1,
      a, b + 1, a + 1,

      a + 2, b + 3, b + 2,
      a + 2, a + 3, b + 3,

      a, a + 2, b + 2,
      a, b + 2, b,

      a + 1, b + 1, b + 3,
      a + 1, b + 3, a + 3
    );

    const c = i * 2;
    const d = (i + 1) * 2;
    collisionIndices.push(
      c, d, d + 1,
      c, d + 1, c + 1
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(visualIndices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, pathMaterial);
  levelRoot.add(mesh);
  addStaticTrimesh(collisionVertices, collisionIndices);
}

function createRail(samples, side) {
  const positions = [];
  const indices = [];

  for (const sample of samples) {
    const { point, right, normal } = sample;
    const base = point.clone().addScaledVector(right, side * TRACK_WIDTH * 0.5);
    const top = base.clone().addScaledVector(normal, RAIL_HEIGHT);
    positions.push(base.x, base.y, base.z, top.x, top.y, top.z);
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = i * 2;
    const b = (i + 1) * 2;

    if (side > 0) {
      indices.push(
        a, b, b + 1,
        a, b + 1, a + 1
      );
    } else {
      indices.push(
        a, b + 1, b,
        a, a + 1, b + 1
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, railMaterial);
  levelRoot.add(mesh);
  addStaticTrimesh(positions, indices);
}

function createTrack(curve) {
  const samples = sampleRoute(curve);
  createDeck(samples);
  createRail(samples, -1);
  createRail(samples, 1);
}

function clearLevel() {
  while (levelRoot.children.length) {
    const child = levelRoot.children.pop();
    child.geometry?.dispose?.();
  }
  physicsWorld = null;
  ballBody = null;
  ballMesh = null;
}

function createBall() {
  const start = routeCurve.getPointAt(0);
  const startTangent = routeCurve.getTangentAt(0).normalize();
  const frame = makeFrame(startTangent);
  const startPosition = start.clone().addScaledVector(frame.normal, BALL_RADIUS + 0.018);

  ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 42, 28),
    ballMaterial
  );
  ballMesh.position.copy(startPosition);
  levelRoot.add(ballMesh);

  ballBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.KINEMATIC,
    material: ballPhysicsMaterial,
    shape: new CANNON.Sphere(BALL_RADIUS),
    linearDamping: 0.008,
    angularDamping: 0.012,
    allowSleep: true
  });
  ballBody.position.set(startPosition.x, startPosition.y, startPosition.z);
  physicsWorld.addBody(ballBody);
}

function releaseBall() {
  const tangent = routeCurve.getTangentAt(0).normalize();
  ballBody.type = CANNON.Body.DYNAMIC;
  ballBody.mass = 1;
  ballBody.updateMassProperties();
  ballBody.velocity.set(tangent.x * 1.45, tangent.y * 1.45, tangent.z * 1.45);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.wakeUp();

  ballState = 'rolling';
  rollingTime = 0;
  status.textContent = '시점이 맞았습니다. 공은 연속된 실제 충돌면 위를 굴러갑니다. 카메라는 계속 자유롭게 돌릴 수 있습니다.';
}

function loadLevel(index) {
  clearLevel();
  currentLevel = levels[index];
  physicsWorld = createPhysicsWorld();
  routeCurve = buildRoute(currentLevel);
  routeEnd.copy(routeCurve.getPointAt(1));
  endTangent.copy(routeCurve.getTangentAt(0.9999)).normalize();

  createTrack(routeCurve);
  createBall();

  ballState = 'waiting';
  alignmentHold = 0;
  solved = false;
  dragActive = false;
  rollingTime = 0;
  yaw = currentLevel.targetYaw - 0.92;

  stageLabel.textContent = `${index + 1} / ${levels.length}`;
  hint.textContent = currentLevel.text;
  status.textContent = '화면을 돌려 통로 전체가 하나의 직선처럼 보이게 만드세요.';
  completion.hidden = true;
  updateCamera();
}

function updateCamera() {
  const cp = Math.cos(pitch);
  camera.position.set(
    cameraTarget.x + Math.sin(yaw) * cp * cameraDistance,
    cameraTarget.y + Math.sin(pitch) * cameraDistance,
    cameraTarget.z + Math.cos(yaw) * cp * cameraDistance
  );
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
}

function projectToPixels(point) {
  const p = point.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * renderer.domElement.clientWidth,
    y: (-p.y * 0.5 + 0.5) * renderer.domElement.clientHeight
  };
}

function distanceToLine(point, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 1) return Infinity;
  return Math.abs(vy * point.x - vx * point.y + b.x * a.y - b.y * a.x) / len;
}

function projectedStraightness() {
  const start = projectToPixels(routeCurve.getPointAt(0));
  const end = projectToPixels(routeCurve.getPointAt(1));
  let maxDeviation = 0;

  for (let i = 1; i < 36; i += 1) {
    const p = projectToPixels(routeCurve.getPointAt(i / 36));
    maxDeviation = Math.max(maxDeviation, distanceToLine(p, start, end));
  }

  return maxDeviation;
}

function updateAlignment(dt) {
  if (ballState !== 'waiting' || solved) return;

  const deviation = projectedStraightness();
  const threshold = Math.max(7, Math.min(innerWidth, innerHeight) * 0.011);

  if (deviation <= threshold) {
    alignmentHold += dt;
    status.textContent = '통로의 깊이가 거의 사라졌습니다. 시점을 잠시 유지하세요.';
    if (alignmentHold >= 0.24) releaseBall();
  } else {
    alignmentHold = 0;
    if (deviation <= threshold * 2.8) {
      status.textContent = '거의 맞았습니다. 바닥과 난간이 완전히 곧아지도록 조금만 더 돌려 보세요.';
    } else {
      status.textContent = '통로의 굴곡이 사라져 하나의 직선처럼 보이는 시점을 찾으세요.';
    }
  }
}

function syncPhysics(dt) {
  if (!physicsWorld || !ballBody || !ballMesh) return;

  if (ballState === 'rolling') {
    rollingTime += dt;
    physicsWorld.step(1 / 180, dt, 8);
  }

  ballMesh.position.set(ballBody.position.x, ballBody.position.y, ballBody.position.z);
  ballMesh.quaternion.set(
    ballBody.quaternion.x,
    ballBody.quaternion.y,
    ballBody.quaternion.z,
    ballBody.quaternion.w
  );

  if (ballState !== 'rolling' || solved) return;

  const ballPosition = new THREE.Vector3(
    ballBody.position.x,
    ballBody.position.y,
    ballBody.position.z
  );
  const toEnd = ballPosition.clone().sub(routeEnd);
  const passedEndPlane = toEnd.dot(endTangent) > -0.35;
  const nearEnd = ballPosition.distanceTo(routeEnd) < 0.95;

  if (rollingTime > 1 && (nearEnd || passedEndPlane)) {
    ballState = 'finished';
    finishLevel();
    return;
  }

  if (ballBody.position.y < -14) {
    status.textContent = '공이 통로 밖으로 떨어졌습니다. 단계를 다시 시작합니다.';
    ballState = 'failed';
    dragActive = false;
    setTimeout(() => loadLevel(levelIndex), 850);
  }
}

function finishLevel() {
  solved = true;
  dragActive = false;
  if (ballBody) {
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
  }
  status.textContent = '단계 완료. 공은 하나의 연속된 실제 통로를 따라 끝까지 굴러갔습니다.';

  if (levelIndex < levels.length - 1) {
    setTimeout(() => {
      levelIndex += 1;
      loadLevel(levelIndex);
    }, 1050);
  } else {
    setTimeout(() => {
      completion.hidden = false;
    }, 700);
  }
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);

  const aspect = w / h;
  const viewHeight = aspect < 1 ? 11.5 : 9.2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.updateProjectionMatrix();
}

function animate(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  updateCamera();
  updateAlignment(dt);
  syncPhysics(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function cameraInputAllowed() {
  return !solved && ballState !== 'failed' && ballState !== 'finished';
}

canvas.addEventListener('pointerdown', (event) => {
  if (!cameraInputAllowed()) return;
  dragActive = true;
  previousX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (!dragActive || !cameraInputAllowed()) return;
  const dx = event.clientX - previousX;
  previousX = event.clientX;
  yaw -= dx * 0.008;
});

canvas.addEventListener('pointerup', () => {
  dragActive = false;
});

canvas.addEventListener('pointercancel', () => {
  dragActive = false;
});

window.addEventListener('keydown', (event) => {
  if (cameraInputAllowed()) {
    if (event.key === 'ArrowLeft') yaw += 0.05;
    if (event.key === 'ArrowRight') yaw -= 0.05;
  }
  if (event.key.toLowerCase() === 'r') loadLevel(levelIndex);
});

window.addEventListener('resize', resize);
resetButton.addEventListener('click', () => loadLevel(levelIndex));
againButton.addEventListener('click', () => {
  levelIndex = 0;
  loadLevel(0);
});

resize();
loadLevel(0);
requestAnimationFrame(animate);
