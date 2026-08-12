import * as THREE from 'three';

const canvas = document.querySelector('#game');
const stageLabel = document.querySelector('#stageLabel');
const hint = document.querySelector('#hint');
const status = document.querySelector('#status');
const resetButton = document.querySelector('#resetButton');
const againButton = document.querySelector('#againButton');
const completion = document.querySelector('#completion');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xf7f3ea, 1);

const scene = new THREE.Scene();

const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
let yaw = -0.7;
const pitch = 0.72;
const cameraDistance = 22;
const cameraTarget = new THREE.Vector3(0, 0.55, 0);

const ambient = new THREE.AmbientLight(0xffffff, 1.65);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.75);
sun.position.set(-5, 10, 7);
scene.add(sun);

const levelRoot = new THREE.Group();
scene.add(levelRoot);

const pathMaterial = new THREE.MeshStandardMaterial({
  color: 0xf5f0e7,
  roughness: 0.78,
  metalness: 0
});
const pathEdgeMaterial = new THREE.MeshStandardMaterial({
  color: 0x292a2c,
  roughness: 0.86,
  metalness: 0
});
const anchorMaterial = new THREE.MeshStandardMaterial({
  color: 0xd9ccba,
  roughness: 0.92,
  metalness: 0
});
const goalMaterial = new THREE.MeshStandardMaterial({
  color: 0xf1b941,
  roughness: 0.48,
  metalness: 0.04,
  emissive: 0x4b2d00,
  emissiveIntensity: 0.12
});
const ballMaterial = new THREE.MeshStandardMaterial({
  color: 0xd83b38,
  roughness: 0.32,
  metalness: 0.02
});

const levels = [
  {
    name: '첫 번째 겹침',
    targetYaw: -0.55,
    depth: 3.0,
    start: [-4.7, 0.0, -1.25],
    joint: [-1.25, 0.0, 0.55],
    outLength: 3.7,
    text: '두 회색 연결점과 길의 방향이 하나로 이어지게 맞춰 보세요.'
  },
  {
    name: '숨은 깊이',
    targetYaw: 0.28,
    depth: 3.35,
    start: [-4.9, -0.25, 1.8],
    joint: [-1.35, -0.25, -0.55],
    outLength: 3.8,
    text: '떨어져 있는 두 길이 한 줄처럼 보이는 시점을 찾아보세요.'
  },
  {
    name: '비스듬한 통로',
    targetYaw: 1.02,
    depth: 3.65,
    start: [-4.15, 0.35, 2.4],
    joint: [-0.8, 0.35, 0.15],
    outLength: 3.9,
    text: '연결점뿐 아니라 양쪽 난간의 방향까지 맞추는 것이 핵심입니다.'
  },
  {
    name: '엇갈린 층',
    targetYaw: 2.0,
    depth: 3.95,
    start: [-4.55, 0.65, -2.25],
    joint: [-1.0, 0.65, -0.45],
    outLength: 4.0,
    text: '실제 위치가 달라도 화면에서 하나의 통로가 되면 길이 열립니다.'
  },
  {
    name: '마지막 시점',
    targetYaw: 2.82,
    depth: 4.15,
    start: [-4.6, -0.35, 1.7],
    joint: [-0.9, -0.35, -0.8],
    outLength: 4.15,
    text: '마지막입니다. 끊어진 흔적이 사라지는 한 장면을 찾아보세요.'
  }
];

let levelIndex = 0;
let currentLevel = levels[0];
let pathA;
let pathB;
let ball;
let goal;
let jointMarkers = [];
let startPoint = new THREE.Vector3();
let jointA = new THREE.Vector3();
let jointB = new THREE.Vector3();
let goalPoint = new THREE.Vector3();
let ballPhase = 'start';
let phaseTime = 0;
let connected = false;
let solved = false;
let dragActive = false;
let previousX = 0;
let lastTime = performance.now();

function vector(v) {
  return new THREE.Vector3(v[0], v[1], v[2]);
}

function cameraAxisForYaw(targetYaw) {
  const cp = Math.cos(pitch);
  return new THREE.Vector3(
    Math.sin(targetYaw) * cp,
    Math.sin(pitch),
    Math.cos(targetYaw) * cp
  ).normalize();
}

function endpointForTargetYaw(joint, targetYaw, depthOffset) {
  // 정사영에서는 카메라 시선축과 평행한 변위가 화면 위치를 바꾸지 않는다.
  // 따라서 두 연결점을 목표 시점의 동일한 투영 위치에 놓을 수 있다.
  return joint.clone().add(cameraAxisForYaw(targetYaw).multiplyScalar(depthOffset));
}

function createPath(from, to, width = 1.06) {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.38, length),
    pathMaterial.clone()
  );
  mesh.position.copy(mid);
  mesh.position.y -= 0.22;
  mesh.lookAt(to.x, mid.y, to.z);
  levelRoot.add(mesh);

  const edgeGeo = new THREE.BoxGeometry(0.085, 0.14, length + 0.02);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeo, pathEdgeMaterial);
    edge.position.copy(mid);
    edge.position.y -= 0.02;
    edge.lookAt(to.x, mid.y, to.z);
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(edge.quaternion)
      .multiplyScalar(side * width * 0.48);
    edge.position.add(right);
    levelRoot.add(edge);
  }

  return mesh;
}

function createAnchor(pos) {
  const anchor = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.82, 1.35),
    anchorMaterial.clone()
  );
  anchor.position.copy(pos);
  anchor.position.y -= 0.58;
  levelRoot.add(anchor);
  return anchor;
}

function clearLevel() {
  while (levelRoot.children.length) {
    const child = levelRoot.children.pop();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
    else child.material?.dispose?.();
  }
  jointMarkers = [];
}

function loadLevel(index) {
  clearLevel();
  currentLevel = levels[index];
  stageLabel.textContent = `${index + 1} / ${levels.length}`;
  hint.textContent = currentLevel.text;
  status.textContent = '길이 한 줄로 이어지는 시점을 찾아보세요.';

  startPoint = vector(currentLevel.start);
  jointA = vector(currentLevel.joint);
  jointB = endpointForTargetYaw(
    jointA,
    currentLevel.targetYaw,
    currentLevel.depth
  );

  // 두 번째 길은 첫 번째 길과 같은 진행 벡터를 사용한다.
  // 목표 시점에서는 끝점뿐 아니라 통로의 방향과 난간까지 정확히 이어진다.
  const continuation = jointA.clone().sub(startPoint).normalize();
  goalPoint = jointB.clone().addScaledVector(continuation, currentLevel.outLength);

  pathA = createPath(startPoint, jointA);
  pathB = createPath(jointB, goalPoint);

  // 연결부 아래에 긴 기둥을 두면 실제 깊이와 높이가 노출되어 착시가 깨진다.
  // 시작과 목표에만 짧은 받침을 두어 공간적 단서를 최소화한다.
  createAnchor(startPoint);
  createAnchor(goalPoint);

  const jointMarkerGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.075, 36);
  for (const p of [jointA, jointB]) {
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0x817a70,
      roughness: 0.74,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    const marker = new THREE.Mesh(jointMarkerGeo, markerMat);
    marker.position.copy(p);
    marker.position.y += 0.07;
    levelRoot.add(marker);
    jointMarkers.push(marker);
  }

  ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.37, 40, 24),
    ballMaterial.clone()
  );
  ball.position.copy(startPoint).add(new THREE.Vector3(0, 0.42, 0));
  levelRoot.add(ball);

  goal = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.14, 18, 48),
    goalMaterial.clone()
  );
  goal.rotation.x = Math.PI / 2;
  goal.position.copy(goalPoint).add(new THREE.Vector3(0, 0.34, 0));
  levelRoot.add(goal);

  ballPhase = 'start';
  phaseTime = 0;
  connected = false;
  solved = false;
  yaw = currentLevel.targetYaw - 0.95;
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

function projectedDistance(a, b) {
  const pa = a.clone().project(camera);
  const pb = b.clone().project(camera);
  const dx = (pa.x - pb.x) * renderer.domElement.clientWidth * 0.5;
  const dy = (pa.y - pb.y) * renderer.domElement.clientHeight * 0.5;
  return Math.hypot(dx, dy);
}

function updateConnection() {
  const px = projectedDistance(jointA, jointB);
  const threshold = Math.max(24, Math.min(innerWidth, innerHeight) * 0.032);
  connected = px <= threshold;

  const proximity = THREE.MathUtils.clamp(1 - px / (threshold * 4), 0, 1);
  for (const marker of jointMarkers) {
    marker.visible = ballPhase !== 'goal';
    if (!marker.visible) continue;

    const scale = 1 + proximity * 0.2;
    marker.scale.set(scale, 1, scale);
    marker.material.emissive.setHex(connected ? 0x2f8f78 : 0x5b4821);
    marker.material.emissiveIntensity = connected ? 0.58 : proximity * 0.25;
  }

  if (!solved && ballPhase === 'waiting') {
    if (connected) {
      status.textContent = '길이 이어졌습니다.';
    } else if (px < threshold * 2.4) {
      status.textContent = '거의 맞았습니다. 난간까지 한 줄이 되게 조금만 더 돌려 보세요.';
    } else {
      status.textContent = '두 회색 연결점이 하나로 겹치도록 시점을 돌려 보세요.';
    }
  }
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function transferToSecondPath() {
  // 연결 판정의 허용 오차 때문에 화면상 작은 점프가 생기지 않도록
  // 카메라를 정확한 목표 시점으로 고정한 뒤 경로의 위상만 전환한다.
  yaw = currentLevel.targetYaw;
  updateCamera();

  // jointA와 jointB는 이 시점에서 같은 화면 좌표에 투영된다.
  // 실제 공간 사이를 날아가는 애니메이션 대신 즉시 다른 경로로 옮겨
  // 플레이어에게는 같은 위치에서 계속 굴러가는 것처럼 보이게 한다.
  ball.position.copy(jointB).add(new THREE.Vector3(0, 0.42, 0));
  jointMarkers.forEach((marker) => {
    marker.visible = false;
  });
  ballPhase = 'goal';
  phaseTime = 0;
  connected = false;
  status.textContent = '시점 속에서 길이 하나가 되었습니다. 목표까지 이동합니다.';
}

function moveBall(dt) {
  if (solved) return;
  phaseTime += dt;

  if (ballPhase === 'start') {
    const t = Math.min(1, phaseTime / 2.25);
    ball.position.lerpVectors(startPoint, jointA, ease(t));
    ball.position.y += 0.42;
    ball.rotation.x += dt * 3.2;

    if (t >= 1) {
      ballPhase = 'waiting';
      phaseTime = 0;
      status.textContent = '공이 길 끝에서 기다립니다. 두 연결점을 겹쳐 보세요.';
    }
  } else if (ballPhase === 'waiting') {
    ball.position.copy(jointA).add(new THREE.Vector3(0, 0.42, 0));
    if (connected) transferToSecondPath();
  } else if (ballPhase === 'goal') {
    const t = Math.min(1, phaseTime / 2.25);
    ball.position.lerpVectors(jointB, goalPoint, ease(t));
    ball.position.y += 0.42;
    ball.rotation.x += dt * 3.45;
    if (t >= 1) finishLevel();
  }
}

function finishLevel() {
  solved = true;
  status.textContent = '단계 완료';

  if (levelIndex < levels.length - 1) {
    setTimeout(() => {
      levelIndex += 1;
      loadLevel(levelIndex);
    }, 900);
  } else {
    setTimeout(() => {
      completion.hidden = false;
    }, 650);
  }
}

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);

  const aspect = w / h;
  const viewHeight = aspect < 1 ? 12.5 : 10;
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
  updateConnection();
  moveBall(dt);
  goal.rotation.z += dt * 0.55;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

canvas.addEventListener('pointerdown', (e) => {
  if (solved || ballPhase === 'goal') return;
  dragActive = true;
  previousX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragActive || solved || ballPhase === 'goal') return;
  const dx = e.clientX - previousX;
  previousX = e.clientX;
  yaw -= dx * 0.008;
});

canvas.addEventListener('pointerup', () => {
  dragActive = false;
});

canvas.addEventListener('pointercancel', () => {
  dragActive = false;
});

window.addEventListener('keydown', (e) => {
  if (solved || ballPhase === 'goal') return;
  if (e.key === 'ArrowLeft') yaw += 0.055;
  if (e.key === 'ArrowRight') yaw -= 0.055;
  if (e.key.toLowerCase() === 'r') loadLevel(levelIndex);
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
