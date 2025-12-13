import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

let scene, camera, renderer, model, sunLight, hemiLight;

let walkFrames = [];
let walkingMesh;
let blobShadowMesh;
let totalFrames = 3;
let currentFrame = 0;
const frameDuration = 0.05;

let targetScrollT = 0;
let smoothScrollT = 0;
const LERP_FACTOR = 0.08;

const CSS_SCROLL_VARIABLE = "--scroll-progress";
const shadowResolution = 1024 * 2;
const modelPath = "/content/glb/ravagh.glb";
const spriteTexturePaths = [
	"/content/png/frame1.png",
	"/content/png/frame2.png",
	"/content/png/frame3.png",
];
const SPRITE_HEIGHT = 1.5;
const SPRITE_WIDTH = SPRITE_HEIGHT * (371 / 835);
const WHITE_COLOR = 0xffffff;

const MAX_PIXEL_RATIO = 1.5;

function cubicInOut(t) {
	t *= 2;
	if (t < 1) return 0.5 * t * t * t;
	t -= 2;
	return 0.5 * (t * t * t + 2);
}

let cameraKeyframes = [
	{
		scrollPoint: 0.0,
		pos: new THREE.Vector3(0, 6, -5.5),
		look: new THREE.Vector3(0, 2, -5.5),
		fov: 100,
		hour: 12,
		sunAzimuth: 0,
		spritePos: new THREE.Vector3(0, 0, -6.5),
	},
	{
		scrollPoint: 0.7,
		pos: new THREE.Vector3(0, 6, 5),
		look: new THREE.Vector3(0, 2, 5),
		fov: 100,
		hour: 8.5,
		sunAzimuth: 0,
		spritePos: new THREE.Vector3(0, 0, 15),
	},
	{
		scrollPoint: 0.71,
		pos: new THREE.Vector3(0, 5, 0),
		look: new THREE.Vector3(0, 5, 0),
		fov: 100,
		hour: 9,
		sunAzimuth: 0,
		spritePos: new THREE.Vector3(0, 0, 15),
	},
	{
		scrollPoint: 1,
		pos: new THREE.Vector3(0, 6, 0),
		look: new THREE.Vector3(0, 2, 0),
		fov: 100,
		hour: 12,
		sunAzimuth: 0,
		spritePos: new THREE.Vector3(0, 0, 15),
	},
];

init();

function init() {
	scene = new THREE.Scene();
	scene.background = new THREE.Color(WHITE_COLOR);

	camera = new THREE.PerspectiveCamera(
		cameraKeyframes[0].fov,
		window.innerWidth / window.innerHeight,
		0.1,
		2000
	);
	camera.position.copy(cameraKeyframes[0].pos);

	renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(
		Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
	);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 0.5;

	document.getElementById("three-container").appendChild(renderer.domElement);

	hemiLight = new THREE.HemisphereLight(WHITE_COLOR, 0x444444, 0.6);
	scene.add(hemiLight);

	sunLight = new THREE.DirectionalLight(WHITE_COLOR, 2.0);
	sunLight.castShadow = true;

	sunLight.shadow.mapSize.width = shadowResolution;
	sunLight.shadow.mapSize.height = shadowResolution;

	sunLight.shadow.radius = 3;

	sunLight.shadow.bias = -0.0005;
	sunLight.shadow.normalBias = 0.05;
	const defaultFrustumSize = 50;
	sunLight.shadow.camera.left = -defaultFrustumSize;
	sunLight.shadow.camera.right = defaultFrustumSize;
	sunLight.shadow.camera.top = defaultFrustumSize;
	sunLight.shadow.camera.bottom = -defaultFrustumSize;
	sunLight.shadow.camera.near = 0.1;
	sunLight.shadow.camera.far = 500;

	scene.add(sunLight);

	const planeGeo = new THREE.PlaneGeometry(2000, 2000);
	const planeMat = new THREE.MeshStandardMaterial({
		color: WHITE_COLOR,
		roughness: 0.9,
		metalness: 0,
	});
	const plane = new THREE.Mesh(planeGeo, planeMat);
	plane.rotation.x = -Math.PI / 2;
	plane.receiveShadow = true;
	scene.add(plane);

	const loader = new GLTFLoader();
	loader.load(
		modelPath,
		(gltf) => {
			model = gltf.scene;
			model.scale.set(1, 1, 1);
			model.traverse((child) => {
				if (child.isMesh) {
					child.castShadow = true;
					child.receiveShadow = true;
					child.material.opacity = 0.001;
				}
			});

			scene.add(model);

			try {
				const bbox = new THREE.Box3().setFromObject(model);
				if (bbox.isEmpty() === false) {
					const size = new THREE.Vector3();
					bbox.getSize(size);
					const center = new THREE.Vector3();
					bbox.getCenter(center);

					const pad = Math.max(size.x, size.y, size.z) * 0.6 + 1;
					const left = -pad;
					const right = pad;
					const top = pad;
					const bottom = -pad;

					sunLight.shadow.camera.left = left;
					sunLight.shadow.camera.right = right;
					sunLight.shadow.camera.top = top;
					sunLight.shadow.camera.bottom = bottom;

					const lightDir = new THREE.Vector3(0.5, -1, 0.5).normalize();
					sunLight.position
						.copy(lightDir)
						.multiplyScalar(Math.max(size.length(), 20))
						.add(center);

					if (sunLight.shadow.camera.position) {
						sunLight.shadow.camera.position.copy(sunLight.position);
					}

					if (sunLight.shadow.camera.updateProjectionMatrix) {
						sunLight.shadow.camera.updateProjectionMatrix();
					}
				}
			} catch (e) {
				console.warn("Shadow frustum tightening failed:", e);
			}

			onScroll();
		},
		(undefined) => {},
		(err) => {
			console.error("GLTF load error:", err);
		}
	);

	// loadAndCreateWalkingMesh();

	createBlobShadow();

	window.addEventListener("resize", onResize);
	window.addEventListener("scroll", onScroll);

	animate();
}

function createBlobShadow() {
	const size = 256;
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	const grd = ctx.createRadialGradient(
		size / 2,
		size / 2,
		size * 0.05,
		size / 2,
		size / 2,
		size / 2
	);
	grd.addColorStop(0, "rgba(0,0,0,0.45)");
	grd.addColorStop(0.4, "rgba(0,0,0,0.28)");
	grd.addColorStop(1, "rgba(0,0,0,0.0)");
	ctx.fillStyle = grd;
	ctx.fillRect(0, 0, size, size);

	const texture = new THREE.CanvasTexture(canvas);
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;

	// const geo = new THREE.PlaneGeometry(SPRITE_WIDTH * 1.3, SPRITE_HEIGHT * 0.6);
	// const mat = new THREE.MeshBasicMaterial({
	// 	map: texture,
	// 	transparent: true,
	// 	depthWrite: false,
	// 	opacity: 0.9,
	// });
	// blobShadowMesh = new THREE.Mesh(geo, mat);
	// blobShadowMesh.rotation.x = -Math.PI / 2;
	// blobShadowMesh.renderOrder = 1;
	// blobShadowMesh.receiveShadow = false;
	// blobShadowMesh.castShadow = false;
	// blobShadowMesh.position.set(0, 0.01, 0);
	// scene.add(blobShadowMesh);
}

function loadAndCreateWalkingMesh() {
	const textureLoader = new THREE.TextureLoader();
	let texturesLoaded = 0;
	const totalTextures = spriteTexturePaths.length;

	spriteTexturePaths.forEach((path, index) => {
		textureLoader.load(
			path,
			(texture) => {
				texture.generateMipmaps = false;
				texture.minFilter = THREE.LinearFilter;
				texture.magFilter = THREE.LinearFilter;

				walkFrames[index] = texture;
				texturesLoaded++;

				if (texturesLoaded === totalTextures) {
					const meshGeo = new THREE.PlaneGeometry(SPRITE_WIDTH, SPRITE_HEIGHT);

					const meshMaterial = new THREE.MeshStandardMaterial({
						map: walkFrames[0],
						transparent: true,
						side: THREE.DoubleSide,
						alphaTest: 0.5,
						depthTest: true,
						depthWrite: true,
					});

					walkingMesh = new THREE.Mesh(meshGeo, meshMaterial);
					walkingMesh.castShadow = false;
					walkingMesh.receiveShadow = false;
					walkingMesh.rotation.x = -Math.PI * 1.05;
					walkingMesh.rotation.z = Math.PI;

					const initialPos = cameraKeyframes[0].spritePos;
					walkingMesh.position.set(
						initialPos.x,
						SPRITE_HEIGHT / 2 + initialPos.y,
						initialPos.z
					);

					scene.add(walkingMesh);

					if (blobShadowMesh) {
						blobShadowMesh.position.set(
							walkingMesh.position.x,
							0.01,
							walkingMesh.position.z
						);
					}
				}
			},
			(undefined) => {},
			(err) => {
				console.error("Texture load error for", path, err);
			}
		);
	});
}

function onResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setPixelRatio(
		Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)
	);
}

function onScroll() {
	const maxScroll = document.body.scrollHeight - window.innerHeight;
	let t = maxScroll > 0 ? window.scrollY / maxScroll : 0;
	targetScrollT = THREE.MathUtils.clamp(t, 0, 1);
}

function updateCSSScrollVariable() {
	document.body.style.setProperty(
		CSS_SCROLL_VARIABLE,
		smoothScrollT.toFixed(4)
	);
}

function morphCamera(t) {
	const t_clamped = THREE.MathUtils.clamp(t, 0, 1);

	let start = cameraKeyframes[0];
	let end = cameraKeyframes[cameraKeyframes.length - 1];

	for (let i = 0; i < cameraKeyframes.length - 1; i++) {
		const kf_start = cameraKeyframes[i];
		const kf_end = cameraKeyframes[i + 1];

		if (t_clamped >= kf_start.scrollPoint && t_clamped <= kf_end.scrollPoint) {
			start = kf_start;
			end = kf_end;
			break;
		}
	}

	const segmentDuration = end.scrollPoint - start.scrollPoint;
	let t_segment = 0;

	if (segmentDuration > 0) {
		t_segment = (t_clamped - start.scrollPoint) / segmentDuration;
	} else if (t_clamped >= end.scrollPoint) {
		t_segment = 1;
	}

	const easeT = cubicInOut(t_segment);

	camera.position.lerpVectors(start.pos, end.pos, easeT);
	const lookAtPos = new THREE.Vector3().lerpVectors(
		start.look,
		end.look,
		easeT
	);
	camera.lookAt(lookAtPos);
	camera.fov = THREE.MathUtils.lerp(start.fov, end.fov, easeT);
	camera.updateProjectionMatrix();

	const currentHour = THREE.MathUtils.lerp(start.hour, end.hour, easeT);
	const currentAzimuth = THREE.MathUtils.lerp(
		start.sunAzimuth,
		end.sunAzimuth,
		easeT
	);
	updateEnvironment(currentHour, currentAzimuth);

	if (walkingMesh) {
		const interpolatedPos = new THREE.Vector3().lerpVectors(
			start.spritePos,
			end.spritePos,
			easeT
		);

		walkingMesh.position.set(
			interpolatedPos.x,
			SPRITE_HEIGHT / 2 + interpolatedPos.y,
			interpolatedPos.z
		);

		if (blobShadowMesh) {
			blobShadowMesh.position.set(
				walkingMesh.position.x,
				0.01,
				walkingMesh.position.z
			);
			const zScale = 1 + Math.abs(walkingMesh.position.z) * 0.01;
			blobShadowMesh.scale.set(zScale, zScale, 1);
			blobShadowMesh.material.opacity = THREE.MathUtils.clamp(
				1 - Math.abs(walkingMesh.position.z) * 0.02,
				0.35,
				0.95
			);
		}

		updateScrollDrivenSpriteFrame(t_clamped);
	}
}

function updateEnvironment(hour, azimuth) {
	const sunVector = new THREE.Vector3();
	const angleRad = (hour - 12) * (Math.PI / 12);
	const elevation = Math.cos(angleRad) * 90;

	const phi = THREE.MathUtils.degToRad(90 - elevation);
	const theta = THREE.MathUtils.degToRad(azimuth);

	sunVector.setFromSphericalCoords(1, phi, theta);

	sunLight.position.copy(sunVector).multiplyScalar(100);

	const sunIntensity = THREE.MathUtils.mapLinear(elevation, 0, 90, 0.5, 3.5);
	sunLight.color.set(WHITE_COLOR);
	sunLight.intensity = sunIntensity;

	hemiLight.intensity = THREE.MathUtils.mapLinear(elevation, 0, 90, 0.2, 1.1);
}

function updateScrollDrivenSpriteFrame(t) {
	if (!walkingMesh || walkFrames.length === 0) return;

	const frameIndex = Math.floor(t / frameDuration) % walkFrames.length;

	if (frameIndex !== currentFrame) {
		currentFrame = frameIndex;
		walkingMesh.material.map = walkFrames[currentFrame];
		walkingMesh.material.needsUpdate = true;
	}
}

function animate() {
	requestAnimationFrame(animate);

	smoothScrollT = THREE.MathUtils.lerp(
		smoothScrollT,
		targetScrollT,
		LERP_FACTOR
	);

	morphCamera(smoothScrollT);

	updateCSSScrollVariable();

	renderer.render(scene, camera);
}
