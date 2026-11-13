import {
	Color3,
	MeshBuilder,
	Ray,
	StandardMaterial,
	TransformNode,
	Vector3,
} from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";

export const MONSTER_CONFIG = {
	path: "/assets/models/monster/",
	file: "smiley_monster.glb",
	triggerDoorId: "restricted_gate",
	height: 2.3,
	scaleOverride: null,
	facingOffset: Math.PI,
	spawnDelay: 1.0,
	spawnDistances: [9, 7, 5, 3.5],
	spawnFreezeTime: 2.4,
	chaseSpeed: 2.75,
	catchUpSpeed: 4.2,
	catchUpDistance: 10,
	catchDistance: 1.15,
	darkCaptureTime: 8,
	lightRecoveryRate: 2,
	bodyRadius: 0.5,
	turnRate: 8,
};

function wrapAngle(a) {
	while (a > Math.PI) a -= Math.PI * 2;
	while (a < -Math.PI) a += Math.PI * 2;
	return a;
}

export class MonsterManager {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.cfg = { ...MONSTER_CONFIG };
		this.state = "dormant";
		this.timer = 0;
		this.time = 0;
		this.darkExposure = 0;
		this.loadPromise = null;
		this.modelReady = false;
		this.container = null;
		this.meshSet = new Set();
		this.animGroups = [];
		this.pivot = null;
		this.bob = null;
		this.fit = null;
		this.scaleFactor = 1;
		this.floorY = 0;
		this.stuckTimer = 0;
		this.lastPos = new Vector3();
		this.growlTimer = 0;
		this.heartbeatTimer = 0;
		this.usingPlaceholder = false;
		this.chaseToken = 0;
		this.readyToken = null;
		this.disposed = false;
		this.ended = false;
		this.animating = false;
		this.ambientPlaying = false;
		this.onGameEnded = () => {
			this.ended = true;
			this.despawn();
		};
		this.systems.eventSystem?.on?.("game_ended", this.onGameEnded);
		this.setupDebugKeys();
	}

	preload() {
		if (this.disposed) return Promise.resolve(false);
		if (!this.loadPromise) {
			// A preload caller need not await this promise (including the game bootstrap).
			this.loadPromise = this.loadModel().catch((error) => {
				console.warn("[Monster] Unable to initialize model.", error);
				return false;
			});
		}
		return this.loadPromise;
	}

	async loadModel() {
		this.pivot = new TransformNode("monster_pivot", this.scene);
		this.pivot.setEnabled(false);
		this.bob = new TransformNode("monster_bob", this.scene);
		this.bob.parent = this.pivot;
		this.fit = new TransformNode("monster_fit", this.scene);
		this.fit.parent = this.bob;
		let container;
		try {
			container = await SceneLoader.LoadAssetContainerAsync(this.cfg.path, this.cfg.file, this.scene);
			if (this.disposed) {
				container.dispose();
				return false;
			}
			this.container = container;
			// Babylon validates container hierarchies before adding. Attach to the
			// disabled pivot synchronously, before any render/update can observe it.
			container.addAllToScene();
			for (const root of container.rootNodes) root.parent = this.fit;
			const bounds = this.getBounds(container.meshes);
			const size = bounds.max.subtract(bounds.min);
			if (!Number.isFinite(size.y) || size.y <= 1e-4) throw new Error("Model has no valid vertex bounds");
			this.scaleFactor = this.cfg.scaleOverride ?? this.cfg.height / size.y;
			this.fit.scaling.setAll(this.scaleFactor);
			// Never overwrite GLTF root translation, rotation, or handedness scaling.
			this.fit.position.set(
				-(bounds.min.x + bounds.max.x) * 0.5 * this.scaleFactor,
				-bounds.min.y * this.scaleFactor,
				-(bounds.min.z + bounds.max.z) * 0.5 * this.scaleFactor
			);
			container.meshes.forEach((mesh) => {
				this.meshSet.add(mesh);
				mesh.isPickable = false;
				mesh.checkCollisions = false;
				mesh.alwaysSelectAsActiveMesh = true;
			});
			container.materials.forEach((mat) => {
				mat.maxSimultaneousLights = 10;
				if (mat.emissiveColor && !mat.emissiveTexture) mat.emissiveColor = new Color3(0.07, 0.015, 0.015);
			});
			this.animGroups = container.animationGroups || [];
			this.animGroups.forEach((g) => g.stop());
		} catch (error) {
			container?.dispose();
			this.container = null;
			if (this.disposed) return false;
			console.warn("[Monster] Model load failed; using placeholder.", error);
			this.meshSet.clear();
			this.buildPlaceholder();
		}
		this.modelReady = true;
		return true;
	}

	buildPlaceholder() {
		this.usingPlaceholder = true;
		this.fit.position.setAll(0);
		this.fit.scaling.setAll(1);
		const body = MeshBuilder.CreateCylinder("monster_placeholder", { height: this.cfg.height, diameter: 0.7 }, this.scene);
		const mat = new StandardMaterial("monster_placeholder_mat", this.scene);
		mat.maxSimultaneousLights = 10;
		mat.diffuseColor = new Color3(0.08, 0.02, 0.02);
		mat.emissiveColor = new Color3(0.25, 0.02, 0.02);
		body.material = mat;
		body.isPickable = false;
		body.checkCollisions = false;
		body.parent = this.fit;
		body.position.y = this.cfg.height / 2;
		this.meshSet.add(body);
		this.scaleFactor = 1;
	}

	getBounds(meshes) {
		const bounds = {
			min: new Vector3(Infinity, Infinity, Infinity),
			max: new Vector3(-Infinity, -Infinity, -Infinity),
		};
		for (const mesh of meshes) {
			// Empty GLTF roots have synthetic bounds; include actual geometry only.
			if (!mesh.getTotalVertices?.()) continue;
			mesh.refreshBoundingInfo(true);
			mesh.computeWorldMatrix(true);
			for (const point of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
				bounds.min.minimizeInPlace(point);
				bounds.max.maximizeInPlace(point);
			}
		}
		return bounds;
	}

	isStoryScene() {
		return ["restricted_area", "experiment_lab"].includes(this.systems.sceneManager?.currentScene);
	}

	isPaused() {
		const player = this.systems.playerController;
		return !!(player?.controlsLocked || player?.frozen || this.systems.sceneManager?.isTransitioning || globalThis.document?.hidden);
	}

	isProtected() {
		const player = this.systems.playerController;
		const position = this.scene.activeCamera?.position;
		if (!position) return true;
		const safe = (this.systems.sceneManager?.safeZones || []).some((zone) => {
			const dx = position.x - zone.position.x;
			const dz = position.z - zone.position.z;
			return dx * dx + dz * dz <= zone.radius * zone.radius;
		});
		return safe || !!(player?.flashlightEnabled && player.batteryLevel > 0 && player.flashlight?.intensity > 0.1);
	}

	onDoorOpened(data) {
		if (data?.id !== this.cfg.triggerDoorId || this.disposed || this.ended) return;
		// The corridor door precedes the story transition; it must not attack here.
		void this.preload();
		if (this.isStoryScene()) this.startChase(this.findDoorPosition(data.id));
	}

	findDoorPosition(doorId) {
		for (const item of this.systems.interactionManager?.interactables?.values() || []) {
			if (item.type === "door" && item.data?.id === doorId) return item.mesh.position.clone();
		}
		return null;
	}

	startChase(anchor = null) {
		if (this.disposed || this.ended || this.state !== "dormant" || !this.isStoryScene()) return;
		const token = ++this.chaseToken;
		this.anchor = anchor?.clone() ?? null;
		this.state = "pending";
		this.timer = this.cfg.spawnDelay;
		this.darkExposure = 0;
		this.readyToken = null;
		// Only update() may spawn. A stale load continuation cannot resurrect a chase.
		void this.preload().then((ready) => {
			if (ready && !this.disposed && this.chaseToken === token && this.state === "pending") this.readyToken = token;
		});
	}

	spawn() {
		if (this.state !== "pending" || this.readyToken !== this.chaseToken || this.disposed || this.ended || this.isPaused() || !this.isStoryScene()) return;
		const player = this.scene.activeCamera.position;
		const forward = this.horizontalDirToward(player, this.anchor) || this.cameraForward();
		const spawn = this.findSpawnPoint(player, this.anchor || player, forward);
		if (!spawn) {
			this.timer = 0.5;
			return;
		}
		this.floorY = spawn.y;
		this.pivot.position.copyFrom(spawn);
		this.lastPos.copyFrom(spawn);
		this.faceDirection(player.subtract(spawn), 1);
		this.state = "spawning";
		this.timer = this.cfg.spawnFreezeTime;
		this.stuckTimer = 0;
		this.growlTimer = 4;
		this.heartbeatTimer = 0;
	}

	beginChasing() {
		this.state = "chasing";
	}

	floorAt(x, z) {
		const manager = this.systems.sceneManager;
		if (typeof manager?.findFloorY === "function") {
			const y = manager.findFloorY(x, z);
			return Number.isFinite(y) ? y : null;
		}
		// Some prototype scenes do not expose a floor helper. Probe real geometry,
		// never synthesize a floor from camera height or an unvalidated spawn point.
		const top = (this.scene.activeCamera?.position.y ?? 2) + 2;
		const hit = this.scene.pickWithRay(new Ray(new Vector3(x, top, z), Vector3.Down(), 20), (m) => this.isSolid(m));
		return hit?.hit && hit.getNormal(true)?.y > 0.5 ? hit.pickedPoint.y : null;
	}

	validFloor(position, referenceY) {
		const y = this.floorAt(position.x, position.z);
		if (!Number.isFinite(y) || Math.abs(y - referenceY) > 0.8) return null;
		const r = this.cfg.bodyRadius;
		for (const [x, z] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
			const edge = this.floorAt(position.x + x, position.z + z);
			if (!Number.isFinite(edge) || Math.abs(edge - y) > 0.3) return null;
		}
		return y;
	}

	findSpawnPoint(player, origin, forward) {
		const playerFloor = this.floorAt(player.x, player.z);
		if (!Number.isFinite(playerFloor)) return null;
		const candidates = this.cfg.spawnDistances.map((d) => new Vector3(origin.x + forward.x * d, 0, origin.z + forward.z * d));
		for (const d of [8, 6, 4]) candidates.push(new Vector3(player.x - forward.x * d, 0, player.z - forward.z * d));
		for (const c of candidates) {
			const y = this.validFloor(c, playerFloor);
			if (y === null) continue;
			c.y = y;
			if (this.isLineBlocked(new Vector3(player.x, playerFloor, player.z), c)) continue;
			let blocked = false;
			for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
				if (this.isMoveBlocked(new Vector3(Math.sin(a), 0, Math.cos(a)), this.cfg.bodyRadius, c)) {
					blocked = true;
					break;
				}
			}
			if (!blocked) return c;
		}
		return null;
	}

	isLineBlocked(from, to) {
		const dir = new Vector3(to.x - from.x, 0, to.z - from.z);
		const len = dir.length();
		if (len < 0.01) return false;
		dir.scaleInPlace(1 / len);
		for (const h of [0.5, 1.4]) {
			const origin = new Vector3(from.x, from.y + h, from.z);
			if (this.scene.pickWithRay(new Ray(origin, dir, len), (m) => this.isSolid(m))?.hit) return true;
		}
		return false;
	}

	isSolid(mesh) {
		return mesh.isEnabled() && mesh.isPickable && mesh.checkCollisions && !this.meshSet.has(mesh) && !mesh.metadata?.isPickup;
	}

	horizontalDirToward(from, to) {
		if (!to) return null;
		const d = new Vector3(to.x - from.x, 0, to.z - from.z);
		return d.lengthSquared() > 0.0001 ? d.normalize() : null;
	}

	cameraForward() {
		const f = this.scene.activeCamera.getForwardRay().direction;
		const d = new Vector3(f.x, 0, f.z);
		return d.lengthSquared() > 0.0001 ? d.normalize() : new Vector3(1, 0, 0);
	}

	setPresentation(visible, running = false) {
		this.pivot?.setEnabled(visible);
		const animate = visible && running;
		if (animate !== this.animating) {
			this.animGroups.forEach((g) => animate ? g.play(true) : g.pause());
			this.animating = animate;
		}
		const ambient = animate && this.state === "chasing";
		if (ambient !== this.ambientPlaying) {
			if (ambient) this.systems.audioManager?.playAmbient?.("entity_pursuit");
			else this.systems.audioManager?.stopAmbient?.("entity_pursuit");
			this.ambientPlaying = ambient;
		}
	}

	update(deltaTime) {
		if (this.disposed) return;
		if (!this.isStoryScene() && this.state !== "dormant") this.despawn();
		const active = !this.ended && ["pending", "spawning", "chasing"].includes(this.state);
		const lit = this.isProtected();
		const paused = this.isPaused();
		this.setPresentation(active && this.state !== "pending" && !lit, !paused);
		if (!active || paused) return;
		const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
		if (!dt) return;
		this.time += dt;
		this.darkExposure = lit ? Math.max(0, this.darkExposure - dt * this.cfg.lightRecoveryRate) : this.darkExposure + dt;
		if (this.state === "pending") {
			this.timer = Math.max(0, this.timer - dt);
			if (this.timer <= 0) this.spawn();
			this.setPresentation(this.state === "spawning" && !lit, true);
			return;
		}
		this.bob.position.y = Math.sin(this.time * 7) * 0.05;
		const player = this.scene.activeCamera.position;
		const pos = this.pivot.position;
		const toPlayer = new Vector3(player.x - pos.x, 0, player.z - pos.z);
		const dist = toPlayer.length();
		if (this.state === "spawning") {
			this.faceDirection(toPlayer, dt);
			this.timer = Math.max(0, this.timer - dt);
			if (this.timer <= 0) this.beginChasing();
			return;
		}
		if (lit) return;
		if (dist <= this.cfg.catchDistance && this.darkExposure >= this.cfg.darkCaptureTime &&
			Math.abs((this.floorAt(player.x, player.z) ?? Infinity) - this.floorY) <= 0.8 &&
			!this.isLineBlocked(pos, player)) {
			this.onCaught();
			return;
		}
		if (dist < 1e-6) return;
		const desired = toPlayer.scale(1 / dist);
		const speed = dist > this.cfg.catchUpDistance ? this.cfg.catchUpSpeed : this.cfg.chaseSpeed;
		const step = Math.max(0, Math.min(speed * dt, dist - this.cfg.catchDistance * 0.5));
		const moveDir = this.pickDirection(desired, step);
		if (moveDir && step > 0) {
			pos.addInPlace(moveDir.scale(step));
			this.floorY = this.floorAt(pos.x, pos.z);
			pos.y = this.floorY;
			this.faceDirection(moveDir, dt);
		} else this.faceDirection(desired, dt);
		if (step > 0) this.checkStuck(dt, step);
		this.updateAudio(dt, dist);
	}

	pickDirection(desired, step) {
		const candidates = [desired];
		if (Math.abs(desired.x) > 0.15) candidates.push(new Vector3(Math.sign(desired.x), 0, 0));
		if (Math.abs(desired.z) > 0.15) candidates.push(new Vector3(0, 0, Math.sign(desired.z)));
		const base = Math.atan2(desired.x, desired.z);
		for (const a of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) candidates.push(new Vector3(Math.sin(base + a), 0, Math.cos(base + a)));
		for (const dir of candidates) {
			const target = this.pivot.position.add(dir.scale(step));
			if (!this.isMoveBlocked(dir, step + this.cfg.bodyRadius) && this.validFloor(target, this.floorY) !== null) return dir;
		}
		return null;
	}

	isMoveBlocked(dir, reach, pos = this.pivot.position) {
		for (const h of [0.5, 1.4]) {
			for (const offset of [-this.cfg.bodyRadius, 0, this.cfg.bodyRadius]) {
				const origin = new Vector3(pos.x + dir.z * offset, pos.y + h, pos.z - dir.x * offset);
				if (this.scene.pickWithRay(new Ray(origin, dir, reach), (m) => this.isSolid(m))?.hit) return true;
			}
		}
		return false;
	}

	checkStuck(dt, step) {
		const moved = Vector3.Distance(this.pivot.position, this.lastPos);
		this.stuckTimer = moved < step * 0.2 ? this.stuckTimer + dt : 0;
		this.lastPos.copyFrom(this.pivot.position);
		if (this.stuckTimer <= 2.5) return;
		this.stuckTimer = 0;
		const player = this.scene.activeCamera.position;
		const spawn = this.findSpawnPoint(player, player, this.cameraForward().scale(-1));
		// Recovery may not teleport through the wall that trapped the monster.
		if (!spawn || this.isLineBlocked(this.pivot.position, spawn)) return;
		this.pivot.position.copyFrom(spawn);
		this.lastPos.copyFrom(spawn);
		this.floorY = spawn.y;
	}

	updateAudio(dt, dist) {
		const audio = this.systems.audioManager;
		this.growlTimer -= dt;
		if (this.growlTimer <= 0) {
			this.growlTimer = 6 + Math.random() * 4;
			const position = this.pivot.position.add(new Vector3(0, 1.5, 0));
			audio?.playSound?.("entity_growl", { position, volume: Math.max(0.3, 1 - dist / 20) });
		}
		this.heartbeatTimer -= dt;
		if (this.heartbeatTimer <= 0 && dist < 12) {
			this.heartbeatTimer = Math.min(2.5, Math.max(0.7, dist / 6));
			audio?.playSound?.("heartbeat", { volume: Math.min(1, 1.2 - dist / 14) });
		}
	}

	faceDirection(dir, dt) {
		if (dir.lengthSquared() < 1e-6) return;
		const target = Math.atan2(dir.x, dir.z) + this.cfg.facingOffset;
		this.pivot.rotation.y = wrapAngle(this.pivot.rotation.y + wrapAngle(target - this.pivot.rotation.y) * Math.min(1, this.cfg.turnRate * dt));
	}

	onCaught() {
		if (this.ended || this.disposed || this.state !== "chasing" || this.isPaused() || this.isProtected()) return;
		this.ended = true;
		this.state = "caught";
		++this.chaseToken;
		this.setPresentation(false);
		const player = this.systems.playerController;
		if (player) {
			player.frozen = true;
			player.controlsLocked = true;
			player.resetInput?.();
		}
		this.systems.eventSystem?.emit("ending_requested", { ending: "C" });
	}

	despawn() {
		++this.chaseToken;
		this.readyToken = null;
		this.state = "dormant";
		this.timer = 0;
		this.darkExposure = 0;
		this.stuckTimer = 0;
		this.setPresentation(false);
		this.animGroups.forEach((g) => g.stop());
	}

	setupDebugKeys() {
		this.debugKeyHandler = (event) => {
			if (this.disposed || this.ended || !this.isStoryScene() || this.isPaused()) return;
			const k = event.key?.toLowerCase();
			if (k === "h") {
				this.despawn();
				this.startChase();
			} else if (k === "o") this.cfg.facingOffset = wrapAngle(this.cfg.facingOffset + Math.PI / 2);
			else if ((k === "-" || k === "=") && this.fit) {
				const factor = k === "=" ? 1.1 : 1 / 1.1;
				this.scaleFactor *= factor;
				this.fit.scaling.scaleInPlace(factor);
				this.fit.position.scaleInPlace(factor);
			}
		};
		globalThis.document?.addEventListener("keydown", this.debugKeyHandler);
	}

	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.despawn();
		globalThis.document?.removeEventListener("keydown", this.debugKeyHandler);
		this.systems.eventSystem?.off?.("game_ended", this.onGameEnded);
		this.container?.dispose();
		this.container = null;
		this.pivot?.dispose(false, true);
		this.meshSet.clear();
		this.animGroups = [];
		this.modelReady = false;
	}
}
