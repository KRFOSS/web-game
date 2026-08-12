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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0xf3eee5, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3eee5, 20, 42);

const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
let yaw = -0.7;
const pitch = 0.72;
const cameraDistance = 22;
const cameraTarget = new THREE.Vector3(0, 0.7, 0);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb9aa95, 2.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3.4);
sun.position.set(8, 14, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshStandardMaterial({ color: 0xe6ded1, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.15;
ground.receiveShadow = true;
scene.add(ground);

const levelRoot = new THREE.Group();
scene.add(levelRoot);

const pathMaterial = new THREE.MeshStandardMaterial({ color: 0xf9f6ef, roughness: 0.72, metalness: 0.02 });
const pathEdgeMaterial = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.82 });
const goalMaterial = new THREE.MeshStandardMaterial({ color: 0xf1b941, roughness: 0.42, metalness: 0.08, emissive: 0x4b2d00, emissiveIntensity: 0.16 });
const ballMaterial = new THREE.MeshStandardMaterial({ color: 0xd83b38, roughness: 0.34, metalness: 0.04 });
const connectorMaterial = new THREE.MeshStandardMaterial({ color: 0x8bc5b5, transparent: true, opacity: 0.0, roughness: 0.5 });

const levels = [
  { name: '첫 번째 겹침', targetYaw: -0.55, depth: 3.6, start: [-5, 0, 0], joint: [-1.3, 0, 0], end: [4.5, 0, 2.7], goal: [6.1, 0, 2.7], text: '카메라를 돌려 두 길 끝을 겹쳐 보이게 만드세요.' },
  { name: '높이의 착각', targetYaw: 0.28, depth: 3.8, start: [-5.2, -0.2, -2.2], joint: [-1.5, -0.2, -2.2], end: [3.8, 1.2, 1.4], goal: [5.6, 1.2, 1.4], text: '높이가 달라도 화면에서 맞닿으면 하나의 길입니다.' },
  { name: '비스듬한 다리', targetYaw: 1.02, depth: 4.0, start: [-4.8, 0.6, 2.5], joint: [-1.1, 0.6, 2.5], end: [2.4, -0.3, -2.3], goal: [4.6, -0.3, -2.3], text: '길의 방향보다 화면에서 보이는 연결을 믿으세요.' },
  { name: '엇갈린 층', targetYaw: 2.0, depth: 4.2, start: [-5.0, 1.1, -1.4], joint: [-1.6, 1.1, -1.4], end: [2.8, -0.7, 2.9], goal: [5.1, -0.7, 2.9], text: '서로 다른 층을 한 장의 그림처럼 맞춰 보세요.' },
  { name: '마지막 시점', targetYaw: 2.82, depth: 4.4, start: [-5.3, -0.6, 2.1], joint: [-1.4, -0.6, 2.1], end: [2.9, 1.5, -2.5], goal: [5.4, 1.5, -2.5], text: '마지막 길입니다. 가장 자연스러운 한 장면을 찾아보세요.' }
];

let levelIndex = 0;
let pathA, pathB, bridgeHint, ball, goal;
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
  // Orthographic 카메라에서는 시선축과 평행한 두 점이 같은 화면 좌표에 투영된다.
  // 연결점을 목표 시점의 실제 3차원 시선축 위에 배치해 완전한 겹침이 가능하게 한다.
  return joint.clone().add(cameraAxisForYaw(targetYaw).multiplyScalar(depthOffset));
}

function createPath(from, to, width = 1.08) {
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const length = from.distanceTo(to);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.42, length), pathMaterial.clone());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(mid);
  mesh.position.y -= 0.25;
  mesh.lookAt(to.x, mid.y, to.z);
  levelRoot.add(mesh);

  const edgeGeo = new THREE.BoxGeometry(0.09, 0.16, length + 0.03);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(edgeGeo, pathEdgeMaterial);
    edge.position.copy(mid);
    edge.position.y -= 0.05;
    edge.lookAt(to.x, mid.y, to.z);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(edge.quaternion).multiplyScalar(side * width * 0.48);
    edge.position.add(right);
    levelRoot.add(edge);
  }
  return mesh;
}

function createPillar(pos) {
  const height = Math.max(0.4, pos.y + 1.15);
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, height, 0.82),
    new THREE.MeshStandardMaterial({ color: 0xd4c8b7, roughness: 0.9 })
  );
  pillar.position.set(pos.x, -1.15 + height / 2, pos.z);
  pillar.castShadow = true;
  pillar.receiveShadow = true;
  levelRoot.add(pillar);
}

function clearLevel() {
  while (levelRoot.children.length) {
    const child = levelRoot.children.pop();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose?.());
    else child.material?.dispose?.();
  }
  jointMarkers = [];
}

function loadLevel(index) {
  clearLevel();
  const data = levels[index];
  stageLabel.textContent = `${index + 1} / ${levels.length}`;
  hint.textContent = data.text;
  status.textContent = '길 끝이 화면에서 맞닿으면 공이 건너갑니다.';

  startPoint = vector(data.start);
  jointA = vector(data.joint);
  jointB = endpointForTargetYaw(jointA, data.targetYaw, data.depth);

  const baseEnd = vector(data.end);
  const direction = vector(data.goal).sub(baseEnd).setY(0).normalize();
  if (direction.lengthSq() < 0.01) direction.set(1, 0, 0);
  goalPoint = jointB.clone().add(direction.multiplyScalar(3.3));
  goalPoint.y = jointB.y;

  pathA = createPath(startPoint, jointA);
  pathB = createPath(jointB, goalPoint);
  createPillar(startPoint);
  createPillar(jointA);
  createPillar(jointB);
  createPillar(goalPoint);

  const jointMarkerGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.1, 32);
  for (const p of [jointA, jointB]) {
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0x7b7469,
      roughness: 0.7,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    const marker = new THREE.Mesh(jointMarkerGeo, markerMat);
    marker.position.copy(p);
    marker.position.y += 0.08;
    levelRoot.add(marker);
    jointMarkers.push(marker);
  }

  bridgeHint = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 1), connectorMaterial.clone());
  levelRoot.add(bridgeHint);

  ball = new THREE.Mesh(new THREE.SphereGeometry(0.38, 40, 24), ballMaterial);
  ball.castShadow = true;
  ball.position.copy(startPoint).add(new THREE.Vector3(0, 0.45, 0));
  levelRoot.add(ball);

  goal = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.15, 18, 48), goalMaterial);
  goal.rotation.x = Math.PI / 2;
  goal.position.copy(goalPoint).add(new THREE.Vector3(0, 0.36, 0));
  goal.castShadow = true;
  levelRoot.add(goal);

  ballPhase = 'start';
  phaseTime = 0;
  connected = false;
  solved = false;
  yaw = data.targetYaw - 1.0;
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
  const threshold = Math.max(42, Math.min(innerWidth, innerHeight) * 0.07);
  connected = px <= threshold;

  const proximity = THREE.MathUtils.clamp(1 - px / (threshold * 3.2), 0, 1);
  for (const marker of jointMarkers) {
    const scale = 1 + proximity * 0.24;
    marker.scale.set(scale, 1, scale);
    marker.material.emissive.setHex(connected ? 0x3b9f87 : 0x6b5525);
    marker.material.emissiveIntensity = connected ? 0.7 : proximity * 0.32;
  }

  const mid = jointA.clone().add(jointB).multiplyScalar(0.5);
  const len = jointA.distanceTo(jointB);
  bridgeHint.position.copy(mid);
  bridgeHint.position.y += 0.05;
  bridgeHint.scale.set(1, 1, len);
  bridgeHint.lookAt(jointB.x, mid.y, jointB.z);
  bridgeHint.material.opacity = connected ? 0.18 : 0;

  if (!solved && ballPhase === 'waiting') {
    if (connected) {
      status.textContent = '연결되었습니다. 공이 건너갑니다.';
    } else if (px < threshold * 2.2) {
      status.textContent = '거의 맞았습니다. 조금만 더 돌려 보세요.';
    } else {
      status.textContent = '두 회색 연결점을 화면에서 하나로 겹쳐 보세요.';
    }
  }
}

function ease(t) {
  return t * t * (3 - 2 * t);
}

function moveBall(dt) {
  if (solved) return;
  phaseTime += dt;

  if (ballPhase === 'start') {
    const t = Math.min(1, phaseTime / 2.4);
    ball.position.lerpVectors(startPoint, jointA, ease(t));
    ball.position.y += 0.43;
    ball.rotation.x += dt * 3.2;
    if (t >= 1) {
      ballPhase = 'waiting';
      phaseTime = 0;
      status.textContent = '공이 길 끝에서 기다립니다. 두 회색 연결점을 겹쳐 보세요.';
    }
  } else if (ballPhase === 'waiting') {
    ball.position.copy(jointA).add(new THREE.Vector3(0, 0.43, 0));
    if (connected) {
      ballPhase = 'crossing';
      phaseTime = 0;
    }
  } else if (ballPhase === 'crossing') {
    const t = Math.min(1, phaseTime / 0.82);
    ball.position.lerpVectors(jointA, jointB, ease(t));
    ball.position.y += 0.43 + Math.sin(Math.PI * t) * 0.12;
    ball.rotation.x += dt * 4.0;
    if (t >= 1) {
      ballPhase = 'goal';
      phaseTime = 0;
      status.textContent = '좋습니다. 이제 목표까지 이동합니다.';
    }
  } else if (ballPhase === 'goal') {
    const t = Math.min(1, phaseTime / 2.2);
    ball.position.lerpVectors(jointB, goalPoint, ease(t));
    ball.position.y += 0.43;
    ball.rotation.x += dt * 3.6;
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
  goal.rotation.z += dt * 0.6;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

canvas.addEventListener('pointerdown', (e) => {
  dragActive = true;
  previousX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragActive || solved || ballPhase === 'crossing' || ballPhase === 'goal') return;
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
