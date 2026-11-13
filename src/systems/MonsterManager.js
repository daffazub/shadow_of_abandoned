import {
	Color3,
	MeshBuilder,
	Ray,
	StandardMaterial,
	TransformNode,
	Vector3,
} from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";

// Semua angka penting untuk monster ada di sini. Ubah di sini saja.
export const MONSTER_CONFIG = {
	path: "/assets/models/monster/",
	file: "smiley_monster.glb",

	// Pintu yang memicu pengejaran (id dari SceneManager: "restricted_gate" = pintu kedua).
	triggerDoorId: "restricted_gate",

	// Ukuran & arah model
	height: 2.3, // tinggi akhir monster (meter)
	scaleOverride: null, // isi angka (mis. 0.01) jika auto-scale salah
	// Jika monster berjalan mundur/menyamping, ubah: 0, Math.PI/2, Math.PI, -Math.PI/2
	// (saat game berjalan: tekan O untuk memutar 90 derajat dan lihat hasilnya di konsol).
	facingOffset: Math.PI,

	// Kemunculan
	spawnDelay: 1.0, // jeda (detik) setelah pintu terbuka sebelum monster muncul
	spawnDistances: [9, 7, 5, 3.5], // jarak di balik pintu; dicoba berurutan sampai ada lantai
	spawnFreezeTime: 2.4, // monster diam menatap pemain sebelum mulai mengejar

	// Pengejaran (kecepatan pemain = 3.0 di PlayerController)
	chaseSpeed: 2.75,
	catchUpSpeed: 4.2, // dipakai jika pemain terlalu jauh, supaya monster tidak tertinggal
	catchUpDistance: 10,
	catchDistance: 1.15, // jarak tertangkap
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

		this.state = "dormant"; // dormant | pending | spawning | chasing | caught
		this.timer = 0;
		this.time = 0;
		this.loadPromise = null;
		this.meshSet = new Set();
		this.animGroups = [];
		this.pivot = null;
		this.bob = null;
		this.scaleFactor = 1;
		this.floorY = 0;
		this.stuckTimer = 0;
		this.lastPos = new Vector3();
		this.growlTimer = 0;
		this.heartbeatTimer = 0;
		this.usingPlaceholder = false;
		this.pendingTimeout = null;

		this.setupDebugKeys();
	}

	// ---------------------------------------------------------------
	// MEMUAT MODEL
	// ---------------------------------------------------------------

	preload() {
		if (!this.loadPromise) this.loadPromise = this.loadModel();
		return this.loadPromise;
	}

	async loadModel() {
		this.pivot = new TransformNode("monster_pivot", this.scene);
		this.bob = new TransformNode("monster_bob", this.scene);
		this.bob.parent = this.pivot;

		try {
			const container = await SceneLoader.LoadAssetContainerAsync(
				this.cfg.path,
				this.cfg.file,
				this.scene
			);
			container.addAllToScene();

			const root = container.rootNodes[0];
			root.parent = this.bob;

			// Ukuran asli, dihitung saat pivot masih identitas.
			this.pivot.computeWorldMatrix(true);
			const bounds = this.getBounds(container.meshes);
			const size = bounds.max.subtract(bounds.min);
			console.log(
				`[Monster] ukuran asli: ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`
			);

			// Kaki di y=0, tengah badan di x=z=0.
			root.position.set(
				-(bounds.min.x + bounds.max.x) / 2,
				-bounds.min.y,
				-(bounds.min.z + bounds.max.z) / 2
			);

			if (this.cfg.scaleOverride) {
				this.scaleFactor = this.cfg.scaleOverride;
			} else if (size.y > 1e-4 && Number.isFinite(size.y)) {
				this.scaleFactor = this.cfg.height / size.y;
			} else {
				console.warn("[Monster] ukuran model tidak valid, dipakai skala 1.");
				this.scaleFactor = 1;
			}
			this.pivot.scaling.setAll(this.scaleFactor);
			console.log(`[Monster] skala akhir: ${this.scaleFactor.toFixed(4)}`);
			if (size.y < Math.max(size.x, size.z) * 0.5) {
				console.warn("[Monster] model tampak rebah (tinggi < lebar). Cek orientasi model.");
			}

			container.meshes.forEach((mesh) => {
				this.meshSet.add(mesh);
				mesh.isPickable = false;
				mesh.checkCollisions = false;
				mesh.alwaysSelectAsActiveMesh = true; // mesh berkulit bisa hilang karena culling
			});
			container.materials.forEach((mat) => {
				if (mat.emissiveColor && !mat.emissiveTexture) {
					mat.emissiveColor = new Color3(0.07, 0.015, 0.015);
				}
			});

			this.animGroups = container.animationGroups || [];
			this.animGroups.forEach((g) => g.stop());
		} catch (error) {
			console.warn(
				"[Monster] Model gagal dimuat (cek koneksi internet untuk decoder meshopt). Placeholder dipakai.",
				error
			);
			this.buildPlaceholder();
		}

		this.pivot.setEnabled(false);
	}

	buildPlaceholder() {
		this.usingPlaceholder = true;
		const body = MeshBuilder.CreateCylinder(
			"monster_placeholder",
			{ height: this.cfg.height, diameter: 0.7 },
			this.scene
		);
		const mat = new StandardMaterial("monster_placeholder_mat", this.scene);
		mat.diffuseColor = new Color3(0.08, 0.02, 0.02);
		mat.emissiveColor = new Color3(0.25, 0.02, 0.02);
		body.material = mat;
		body.isPickable = false;
		body.checkCollisions = false;
		body.parent = this.bob;
		body.position.y = this.cfg.height / 2;
		this.meshSet.add(body);
		this.scaleFactor = 1;
		this.pivot.scaling.setAll(1);
	}

	getBounds(meshes) {
		const bounds = {
			min: new Vector3(Infinity, Infinity, Infinity),
			max: new Vector3(-Infinity, -Infinity, -Infinity),
		};
		meshes.forEach((mesh) => {
			mesh.computeWorldMatrix(true);
			const box = mesh.getBoundingInfo().boundingBox;
			const matrix = mesh.getWorldMatrix();
			for (const x of [box.minimum.x, box.maximum.x]) {
				for (const y of [box.minimum.y, box.maximum.y]) {
					for (const z of [box.minimum.z, box.maximum.z]) {
						const p = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
						bounds.min.minimizeInPlace(p);
						bounds.max.maximizeInPlace(p);
					}
				}
			}
		});
		return bounds;
	}

	// ---------------------------------------------------------------
	// ALUR: pintu terbuka -> pengantar -> muncul -> mengejar -> tertangkap
	// ---------------------------------------------------------------

	onDoorOpened(data) {
		if (!data || data.id !== this.cfg.triggerDoorId) return;
		this.startChase(this.findDoorPosition(this.cfg.triggerDoorId));
	}

	findDoorPosition(doorId) {
		const map = this.systems.interactionManager?.interactables;
		if (!map) return null;
		for (const item of map.values()) {
			if (item.type === "door" && item.data && item.data.id === doorId) {
				return item.mesh.position.clone();
			}
		}
		return null;
	}

	startChase(anchor = null) {
		if (this.state !== "dormant") return;
		this.state = "pending";

		// Pengantar: lampu berkedip dan degup jantung, sebelum monster terlihat.
		this.systems.environmentManager?.flickerLights?.();
		this.systems.audioManager.playSound("static", { volume: 0.6 });
		this.systems.audioManager.playSound("heartbeat", { volume: 0.9 });

		this.pendingTimeout = setTimeout(() => {
			this.pendingTimeout = null;
			this.spawn(anchor);
		}, this.cfg.spawnDelay * 1000);
	}

	async spawn(anchor) {
		await this.preload();
		if (this.state !== "pending") return;

		const cam = this.scene.activeCamera;
		const player = cam.position;
		const forward = this.horizontalDirToward(player, anchor) || this.cameraForward();
		const origin = anchor || player;

		const spawn = this.findSpawnPoint(player, origin, forward);
		this.floorY = spawn.y;
		this.pivot.position.set(spawn.x, spawn.y, spawn.z);
		this.lastPos.copyFrom(this.pivot.position);
		this.faceDirection(new Vector3(player.x - spawn.x, 0, player.z - spawn.z), 1);
		this.pivot.setEnabled(true);
		this.animGroups.forEach((g) => g.start(true, 1.0));

		this.state = "spawning";
		this.timer = this.cfg.spawnFreezeTime;
		this.stuckTimer = 0;
		this.growlTimer = 4;
		this.heartbeatTimer = 0;

		const pos = this.pivot.position.clone();
		pos.y += 1.5;
		this.systems.audioManager.playSound("entity_growl", { position: pos, volume: 1.0 });
		this.systems.environmentManager?.flickerLights?.();
		this.systems.eventSystem.showMessage("RUN.", 2500);
		console.log(`[Monster] muncul di x=${spawn.x.toFixed(2)} z=${spawn.z.toFixed(2)} y=${spawn.y.toFixed(2)}`);
	}

	beginChasing() {
		this.state = "chasing";
		this.systems.audioManager.playAmbient("entity_pursuit");
	}

	// ---------------------------------------------------------------
	// MENCARI TITIK MUNCUL
	// ---------------------------------------------------------------

	findSpawnPoint(player, origin, forward) {
		const sm = this.systems.sceneManager;
		const playerFloor = sm.findFloorY(player.x, player.z) ?? player.y - 0.9;

		const candidates = [];
		this.cfg.spawnDistances.forEach((d) =>
			candidates.push(new Vector3(origin.x + forward.x * d, 0, origin.z + forward.z * d))
		);
		// Cadangan: di belakang pemain
		[8, 6, 4].forEach((d) =>
			candidates.push(new Vector3(player.x - forward.x * d, 0, player.z - forward.z * d))
		);

		for (const c of candidates) {
			const y = sm.findFloorY(c.x, c.z);
			if (y === null || Math.abs(y - playerFloor) > 0.8) continue;
			if (this.isLineBlocked(player, new Vector3(c.x, player.y, c.z))) continue;
			return { x: c.x, y, z: c.z };
		}

		console.warn("[Monster] Tidak ada titik muncul yang valid, memakai titik cadangan.");
		return {
			x: origin.x + forward.x * 3,
			y: playerFloor,
			z: origin.z + forward.z * 3,
		};
	}

	isLineBlocked(from, to) {
		const dir = to.subtract(from);
		const len = dir.length();
		if (len < 0.01) return false;
		dir.scaleInPlace(1 / len);
		const hit = this.scene.pickWithRay(new Ray(from, dir, len), (m) => this.isSolid(m));
		return !!(hit && hit.hit);
	}

	isSolid(mesh) {
		return (
			mesh.isEnabled() &&
			mesh.isPickable &&
			mesh.checkCollisions &&
			!this.meshSet.has(mesh) &&
			!(mesh.metadata && mesh.metadata.isPickup)
		);
	}

	horizontalDirToward(from, to) {
		if (!to) return null;
		const d = new Vector3(to.x - from.x, 0, to.z - from.z);
		if (d.length() < 1) return null;
		return d.normalize();
	}

	cameraForward() {
		const f = this.scene.activeCamera.getForwardRay().direction;
		const d = new Vector3(f.x, 0, f.z);
		return d.lengthSquared() > 0.0001 ? d.normalize() : new Vector3(1, 0, 0);
	}

	// ---------------------------------------------------------------
	// UPDATE PER FRAME
	// ---------------------------------------------------------------

	update(deltaTime) {
		if (this.state !== "spawning" && this.state !== "chasing") return;

		const dt = Math.min(Math.max(deltaTime, 0), 0.05);
		this.time += dt;

		const player = this.scene.activeCamera.position;
		const pos = this.pivot.position;
		const toPlayer = new Vector3(player.x - pos.x, 0, player.z - pos.z);
		const dist = toPlayer.length();

		// Gerak naik-turun halus agar tidak terasa meluncur kaku
		this.bob.position.y = (Math.sin(this.time * 7) * 0.05) / this.scaleFactor;

		if (this.state === "spawning") {
			this.faceDirection(toPlayer, dt);
			this.timer -= dt;
			if (this.timer <= 0) this.beginChasing();
			return;
		}

		// --- mengejar ---
		if (dist <= this.cfg.catchDistance) {
			this.onCaught();
			return;
		}

		const desired = toPlayer.scale(1 / dist);
		const speed = dist > this.cfg.catchUpDistance ? this.cfg.catchUpSpeed : this.cfg.chaseSpeed;
		const step = Math.min(speed * dt, dist - this.cfg.catchDistance * 0.5);
		const moveDir = this.pickDirection(desired, step);

		if (moveDir) {
			pos.x += moveDir.x * step;
			pos.z += moveDir.z * step;
			pos.y = this.floorY;
			this.faceDirection(moveDir, dt);
		} else {
			this.faceDirection(desired, dt);
		}

		this.checkStuck(dt, step);
		this.updateAudio(dt, dist);
	}

	// Mencari arah gerak yang tidak menabrak dinding: langsung, geser, lalu menyerong.
	pickDirection(desired, step) {
		const candidates = [desired];
		if (Math.abs(desired.x) > 0.15) candidates.push(new Vector3(Math.sign(desired.x), 0, 0));
		if (Math.abs(desired.z) > 0.15) candidates.push(new Vector3(0, 0, Math.sign(desired.z)));
		const base = Math.atan2(desired.x, desired.z);
		[0.5, -0.5, 1.0, -1.0, 1.5, -1.5].forEach((a) =>
			candidates.push(new Vector3(Math.sin(base + a), 0, Math.cos(base + a)))
		);

		const reach = step + this.cfg.bodyRadius;
		for (const dir of candidates) {
			if (!this.isMoveBlocked(dir, reach)) return dir;
		}
		return null;
	}

	isMoveBlocked(dir, reach) {
		const pos = this.pivot.position;
		for (const h of [0.5, 1.4]) {
			const origin = new Vector3(pos.x, pos.y + h, pos.z);
			const hit = this.scene.pickWithRay(new Ray(origin, dir, reach), (m) => this.isSolid(m));
			if (hit && hit.hit) return true;
		}
		return false;
	}

	// Tanpa navmesh, monster bisa tersangkut. Jika diam terlalu lama, pindahkan ke belakang pemain.
	checkStuck(dt, step) {
		const moved = Vector3.Distance(this.pivot.position, this.lastPos);
		if (moved < step * 0.2) {
			this.stuckTimer += dt;
		} else {
			this.stuckTimer = 0;
		}
		this.lastPos.copyFrom(this.pivot.position);

		if (this.stuckTimer > 2.5) {
			this.stuckTimer = 0;
			const player = this.scene.activeCamera.position;
			const back = this.cameraForward().scale(-1);
			const spawn = this.findSpawnPoint(player, player, back);
			this.pivot.position.set(spawn.x, spawn.y, spawn.z);
			this.floorY = spawn.y;
			console.log("[Monster] tersangkut, dipindahkan ke titik baru.");
		}
	}

	updateAudio(dt, dist) {
		const audio = this.systems.audioManager;

		this.growlTimer -= dt;
		if (this.growlTimer <= 0) {
			this.growlTimer = 6 + Math.random() * 4;
			const p = this.pivot.position.clone();
			p.y += 1.5;
			audio.playSound("entity_growl", { position: p, volume: Math.max(0.3, 1 - dist / 20) });
		}

		// Degup jantung makin cepat saat monster mendekat
		this.heartbeatTimer -= dt;
		if (this.heartbeatTimer <= 0 && dist < 12) {
			this.heartbeatTimer = Math.min(2.5, Math.max(0.7, dist / 6));
			audio.playSound("heartbeat", { volume: Math.min(1, 1.2 - dist / 14) });
		}
	}

	faceDirection(dir, dt) {
		if (dir.lengthSquared() < 1e-6) return;
		const target = Math.atan2(dir.x, dir.z) + this.cfg.facingOffset;
		const diff = wrapAngle(target - this.pivot.rotation.y);
		const k = Math.min(1, this.cfg.turnRate * dt);
		this.pivot.rotation.y = wrapAngle(this.pivot.rotation.y + diff * k);
	}

	// ---------------------------------------------------------------
	// TERTANGKAP
	// ---------------------------------------------------------------

	onCaught() {
		if (this.state === "caught") return;
		this.state = "caught";

		const player = this.systems.playerController;
		if (player) player.frozen = true;
		this.systems.audioManager.stopAmbient("entity_pursuit");
		if (document.pointerLockElement) document.exitPointerLock();

		// Kamera menatap wajah monster
		const head = this.pivot.position.clone();
		head.y += this.cfg.height * 0.85;
		this.scene.activeCamera.setTarget(head);

		this.systems.audioManager.playSound("entity_growl", { volume: 1.0 });
		this.systems.audioManager.playSound("static", { volume: 1.0 });
		this.systems.environmentManager?.flickerLights?.();

		const flash = document.createElement("div");
		flash.style.cssText =
			"position:fixed;inset:0;background:#a00;opacity:0;z-index:999;pointer-events:none;transition:opacity 1.2s ease-in;";
		document.body.appendChild(flash);
		requestAnimationFrame(() => (flash.style.opacity = "0.55"));

		setTimeout(() => {
			flash.remove();
			this.showCaughtOverlay();
		}, 1800);
	}

	showCaughtOverlay() {
		const overlay = document.createElement("div");
		overlay.className = "document-overlay";
		overlay.innerHTML = `
            <div class="document-content">
                <div class="document-header">
                    <h3>You Were Caught</h3>
                </div>
                <div class="document-body">
                    <p>The smiling thing found you in the dark. The asylum keeps what it takes.</p>
                </div>
                <div class="document-footer">
                    <button id="monsterRetry" style="background: #ff6b6b; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Try Again</button>
                </div>
            </div>
        `;
		document.body.appendChild(overlay);
		overlay.querySelector("#monsterRetry").onclick = () => location.reload();
	}

	// ---------------------------------------------------------------
	// RESET
	// ---------------------------------------------------------------

	despawn() {
		if (this.pendingTimeout) {
			clearTimeout(this.pendingTimeout);
			this.pendingTimeout = null;
		}
		this.animGroups.forEach((g) => g.stop());
		if (this.pivot) this.pivot.setEnabled(false);
		this.systems.audioManager?.stopAmbient("entity_pursuit");
		this.state = "dormant";
	}

	// ---------------------------------------------------------------
	// TOMBOL DEBUG (untuk menguji tanpa harus membuka pintu kedua)
	//   H : munculkan monster di depan pemain
	//   O : putar arah hadap model 90 derajat (jika monster jalan mundur/menyamping)
	//   - / = : perkecil / perbesar monster 10%
	// ---------------------------------------------------------------

	setupDebugKeys() {
		document.addEventListener("keydown", (e) => {
			const k = e.key.toLowerCase();
			if (k === "h") {
				if (this.state !== "dormant") this.despawn();
				if (this.systems.playerController) this.systems.playerController.frozen = false;
				this.startChase(null);
			} else if (k === "o") {
				this.cfg.facingOffset = wrapAngle(this.cfg.facingOffset + Math.PI / 2);
				console.log(
					`[Monster] facingOffset = ${this.cfg.facingOffset.toFixed(3)} (${Math.round((this.cfg.facingOffset * 180) / Math.PI)} derajat). Salin ke MONSTER_CONFIG jika sudah pas.`
				);
			} else if ((k === "-" || k === "=") && this.pivot) {
				this.scaleFactor *= k === "=" ? 1.1 : 1 / 1.1;
				this.pivot.scaling.setAll(this.scaleFactor);
				console.log(`[Monster] scaleOverride = ${this.scaleFactor.toFixed(4)}`);
			}
		});
	}

	dispose() {
		this.despawn();
	}
}
