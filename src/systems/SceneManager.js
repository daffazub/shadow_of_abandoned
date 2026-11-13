import {
	Vector3,
	MeshBuilder,
	StandardMaterial,
	Color3,
	SceneLoader,
	Ray,
} from "@babylonjs/core";
import { LevelBuilder } from "./LevelBuilder.js";

const FLOOR_Y = 2.52;
const CEILING_Y = 6.66;
const FLOOR_PROBE_HEIGHT = 5.0;
const TABLE_HEIGHT = 0.8;

/**
 * KOORDINAT ITEM DI SCENE "horror_scene"
 * Hanya x dan z yang perlu diatur. Ketinggian (y) dihitung otomatis dari lantai.
 * Koridor berjalan ke arah +z (pemain mulai di z = -5).
 *
 * Cara mencari koordinat: berjalan ke tempat yang diinginkan, tekan tombol P,
 * lalu lihat konsol (F12). Salin nilai x dan z ke sini.
 */
const HORROR_LAYOUT = {
	playerStart: { x: -3.0, z: -5.2 },
	wardKey: { x: -1.0, z: -6.20, deskAxis: "x" },
	wardGate: { x: 1.2, z: -5.225, axis: "x" },
	noticeDoc: { x: 4.41, z: -8.20, deskAxis: "x" },
	battery1: { x: 3.3, z: -1.8 },
	encounter1: { x: 4.41, z: -0.2, radius: 3 },
	diaryDoc: { x: 5.8, z: 4.8, deskAxis: "z" },
	battery2: { x: 3.2, z: 6.6 },
	experimentDoc: { x: 0.2, z: 3.15, deskAxis: "x" },
	encounter2: { x: 0.2, z: 2.1, radius: 2.5 },
	restrictedKey: { x: 8.4, z: 3.15, deskAxis: "x" },
	restrictedGate: { x: 7.6, z: -5.225, axis: "x" },
	gateWidth: 3.1,
	gateHeight: 4.15,
};

export class SceneManager {
	constructor(scene, systems) {
		this.scene = scene;
		this.systems = systems;
		this.currentScene = null;
		this.sceneData = new Map();
		this.levelBuilder = new LevelBuilder(scene, systems);

		// Pelacak objek yang dibuat per scene, supaya bisa dibersihkan
		this.sceneObjects = [];
		this.triggerObservers = [];
		this.objectCounter = 0;
		this.tableMaterial = null;

		this.initializeScenes();
	}

	initializeScenes() {
		const L = HORROR_LAYOUT;

		// ---------------------------------------------------------------
		// SCENE UTAMA (saat ini): koridor dengan alur Scene 1-4 storyboard
		// ---------------------------------------------------------------
		this.sceneData.set("horror_scene", {
			name: "Abandoned Ward",
			playerStart: new Vector3(L.playerStart.x, 4, L.playerStart.z),
			environment: "horror_scene_glb",
			lighting: "atmospheric",
			interactables: [
				// --- Scene 1: kunci pertama ---
				{
					type: "key",
					snapToFloor: true,
					position: new Vector3(L.wardKey.x, FLOOR_Y, L.wardKey.z),
					deskAxis: L.wardKey.deskAxis,
					data: { id: "ward_key", name: "Ward Gate Key", spin: true },
				},
				{
					type: "door",
					snapToFloor: true,
					position: new Vector3(L.wardGate.x, FLOOR_Y, L.wardGate.z),
					data: {
						axis: L.wardGate.axis,
						id: "ward_gate",
						locked: true,
						keyId: "ward_key",
						requiresName: "Ward Gate Key",
						size: { w: L.gateWidth, h: L.gateHeight, d: 0.2 },
					},
				},

				// --- Scene 2: dokumen #1 ---
				{
					type: "note",
					snapToFloor: true,
					position: new Vector3(L.noticeDoc.x, FLOOR_Y, L.noticeDoc.z),
					deskAxis: L.noticeDoc.deskAxis,
					data: {
						id: "doc_notice",
						title: "Notice of Closure",
						content:
							"By order of the County Board, Blackwood Asylum is closed effective immediately. All remaining staff are to leave the premises. Morning roll call on November 16th: 127 patients and 31 staff on the register. Not one of them answered. Do not search for them. - Administration",
					},
				},

				// --- Scene 3: baterai dan dokumen #2 ---
				{
					type: "battery",
					position: new Vector3(L.battery1.x, 0, L.battery1.z),
					data: { amount: 30 },
				},
				{
					type: "note",
					snapToFloor: true,
					position: new Vector3(L.diaryDoc.x, FLOOR_Y, L.diaryDoc.z),
					deskAxis: L.diaryDoc.deskAxis,
					data: {
						id: "doc_diary",
						title: "Patient Diary - Bed 14",
						content:
							"They say the dark is empty. It is not. It waits until the light grows weak, and then it walks closer. I counted its footsteps last night. Keep the lamp burning, Marta. Whatever you do, never let the light go out.",
					},
				},
				{
					type: "battery",
					position: new Vector3(L.battery2.x, 0, L.battery2.z),
					data: { amount: 30 },
				},

				// --- Scene 4: dokumen #3 dan kunci area terlarang ---
				{
					type: "note",
					snapToFloor: true,
					position: new Vector3(L.experimentDoc.x, FLOOR_Y, L.experimentDoc.z),
					deskAxis: L.experimentDoc.deskAxis,
					data: {
						id: "doc_experiment",
						title: "Dr. Hartwell - Experiment 9",
						content:
							"The mind-warping trial has failed. The patients did not lose their minds; their minds were taken from them. Something answered through the apparatus, something that cannot exist in the light. I have sealed the lower wing and left the key where only the desperate would look.",
					},
				},
				{
					type: "key",
					snapToFloor: true,
					position: new Vector3(L.restrictedKey.x, FLOOR_Y, L.restrictedKey.z),
					deskAxis: L.restrictedKey.deskAxis,
					data: { id: "restricted_key", name: "Restricted Wing Key", spin: true },
				},
				{
					type: "door",
					snapToFloor: true,
					position: new Vector3(L.restrictedGate.x, FLOOR_Y, L.restrictedGate.z),
					data: {
						axis: L.restrictedGate.axis,
						id: "restricted_gate",
						locked: true,
						keyId: "restricted_key",
						requiresName: "Restricted Wing Key",
						size: { w: L.gateWidth, h: L.gateHeight, d: 0.2 },
					},
				},
			],
			triggers: [
				{
					position: new Vector3(L.encounter1.x, FLOOR_Y, L.encounter1.z),
					radius: L.encounter1.radius,
					event: "entity_encounter",
					data: { intensity: 1 },
				},
				{
					position: new Vector3(L.encounter2.x, FLOOR_Y, L.encounter2.z),
					radius: L.encounter2.radius,
					event: "entity_encounter",
					data: { intensity: 2 },
				},
			],
		});

		// ---------------------------------------------------------------
		// SCENE LAIN: belum dipakai, dikerjakan di Tahap C
		// ---------------------------------------------------------------
		this.sceneData.set("asylum_entrance", {
			name: "Asylum Entrance",
			playerStart: new Vector3(0, 5, -8),
			environment: "full_asylum",
			lighting: "atmospheric",
			interactables: [
				{
					type: "note",
					position: new Vector3(8, 1, -5),
					data: {
						title: "Admission Log - Final Entry",
						content:
							"October 15th, 1973: Last patient admitted before the incident. Dr. Hartwell's experimental treatments have shown disturbing side effects. Patients report seeing shadows that move independently of light sources.",
					},
				},
				{
					type: "key",
					position: new Vector3(-6, 1, 3),
					data: { id: "corridor_key", name: "Corridor Access Key" },
				},
				{
					type: "note",
					position: new Vector3(3, 1, 8),
					data: {
						title: "Security Report",
						content:
							"Multiple power outages reported in Wing C. Maintenance unable to locate source. Staff reporting unexplained sounds and temperature drops in affected areas.",
					},
				},
				{
					type: "door",
					position: new Vector3(0, 0, 18),
					data: {
						locked: true,
						keyId: "corridor_key",
						targetScene: "main_corridor",
					},
				},
			],
			triggers: [
				{
					position: new Vector3(0, 0, 0),
					radius: 3,
					event: "area_entered",
					data: { area: "entrance" },
				},
				{
					position: new Vector3(5, 0, 5),
					radius: 2,
					event: "whisper_sound",
					data: { intensity: 1 },
				},
			],
		});

		this.sceneData.set("main_corridor", {
			name: "Main Corridor",
			playerStart: new Vector3(0, 1.8, 0),
			environment: "full_asylum",
			lighting: "atmospheric",
			interactables: [
				{
					type: "note",
					position: new Vector3(-1.5, 1, 25),
					data: {
						title: "Dr. Hartwell's Journal - Day 47",
						content:
							"The subjects have begun to change. They speak of shadows that move independently, of whispers in empty rooms. The entity grows stronger with each passing day. I fear we have opened a door that should have remained closed forever.",
					},
				},
				{
					type: "key",
					position: new Vector3(1.2, 1, 35),
					data: { id: "research_key", name: "Research Wing Key" },
				},
				{
					type: "switch",
					position: new Vector3(-1.8, 1.5, 15),
					data: { id: "corridor_lights", controls: "lighting" },
				},
				{
					type: "note",
					position: new Vector3(1.5, 1, 45),
					data: {
						title: "Maintenance Log",
						content:
							"Electrical systems failing throughout the facility. Lights flicker without cause. Temperature sensors reading impossible values. Recommend immediate evacuation.",
					},
				},
				{
					type: "door",
					position: new Vector3(0, 0, 58),
					data: {
						locked: true,
						keyId: "research_key",
						targetScene: "research_wing",
					},
				},
			],
			triggers: [
				{
					position: new Vector3(0, 0, 10),
					radius: 2,
					event: "entity_encounter",
					data: { intensity: 1 },
				},
				{
					position: new Vector3(0, 0, 30),
					radius: 2,
					event: "lights_flicker",
					data: {},
				},
				{
					position: new Vector3(0, 0, 40),
					radius: 2,
					event: "entity_encounter",
					data: { intensity: 2 },
				},
			],
		});

		this.sceneData.set("research_wing", {
			name: "Restricted Research Wing",
			playerStart: new Vector3(0, 1.8, 62),
			environment: "full_asylum",
			lighting: "atmospheric",
			interactables: [
				{
					type: "note",
					position: new Vector3(-8, 1, 68),
					data: {
						title: "FINAL LOG - EVACUATION ORDER",
						content:
							"Day 73: IMMEDIATE EVACUATION ORDERED. The entity has fully manifested. It feeds on electrical energy, grows stronger in darkness. All research data must be destroyed. May God forgive us for what we have unleashed upon this world.",
					},
				},
				{
					type: "note",
					position: new Vector3(10, 1, 72),
					data: {
						title: "Experiment Log - Subject 23",
						content:
							"Subject shows complete neural restructuring. Consciousness appears to exist partially outside physical form. Entity attachment confirmed. Termination of experiment recommended immediately.",
					},
				},
				{
					type: "key",
					position: new Vector3(-12, 1, 75),
					data: { id: "basement_key", name: "Basement Access Key" },
				},
				{
					type: "generator",
					position: new Vector3(8, 0, 78),
					data: { id: "main_generator", powers: "facility_lighting" },
				},
				{
					type: "door",
					position: new Vector3(0, 0, 85),
					data: {
						locked: true,
						keyId: "basement_key",
						targetScene: "basement",
					},
				},
			],
			triggers: [
				{
					position: new Vector3(0, 0, 65),
					radius: 4,
					event: "area_entered",
					data: { area: "research_wing" },
				},
				{
					position: new Vector3(-5, 0, 70),
					radius: 2,
					event: "entity_encounter",
					data: { intensity: 3 },
				},
				{
					position: new Vector3(5, 0, 80),
					radius: 2,
					event: "generator_proximity",
					data: {},
				},
			],
		});

		this.sceneData.set("basement", {
			name: "Basement - The Source",
			playerStart: new Vector3(0, -2.2, 80),
			environment: "full_asylum",
			lighting: "atmospheric",
			interactables: [
				{
					type: "note",
					position: new Vector3(-6, -3, 85),
					data: {
						title: "The Truth - Dr. Hartwell's Final Words",
						content:
							"The entity was never created by our experiments. We merely provided it a doorway into our reality. It has existed in the spaces between consciousness and matter for eons. Our research only gave it form. The only way to stop it is to sever its connection to this place. The generator must be destroyed.",
					},
				},
				{
					type: "switch",
					position: new Vector3(0, -3, 88),
					data: { id: "entity_banishment", controls: "final_sequence" },
				},
			],
			triggers: [
				{
					position: new Vector3(0, -4, 82),
					radius: 3,
					event: "area_entered",
					data: { area: "basement" },
				},
				{
					position: new Vector3(0, -4, 85),
					radius: 2,
					event: "entity_encounter",
					data: { intensity: 4, final: true },
				},
			],
		});
	}

	// ---------------------------------------------------------------
	// MEMUAT SCENE
	// ---------------------------------------------------------------

	async loadScene(sceneName) {
		const sceneData = this.sceneData.get(sceneName);
		if (!sceneData) {
			console.error(`Scene ${sceneName} not found`);
			return false;
		}

		// Clear current scene
		if (this.currentScene) {
			this.clearScene();
		}

		console.log(`Loading scene: ${sceneData.name}`);

		// Set player position
		this.scene.activeCamera.position.copyFrom(sceneData.playerStart);

		// Load environment
		await this.loadEnvironment(sceneData.environment);

		// Setup lighting
		this.setupLighting(sceneData.lighting);

		// GLB dipanaskan sekali sebelum pembuatan anchor yang sinkron.
		await this.systems.propLibrary.preload();

		// Create interactables
		this.createInteractables(sceneData.interactables);

		// Setup triggers
		this.setupTriggers(sceneData.triggers);

		// Start ambient audio
		this.systems.audioManager.playAmbient("ambient_asylum");

		this.currentScene = sceneName;

		// Emit scene loaded event
		this.systems.eventSystem.emit("scene_loaded", {
			scene: sceneName,
			data: sceneData,
		});

		return true;
	}

	async loadEnvironment(environmentType) {
		if (environmentType === "horror_scene_glb") {
			await this.loadHorrorSceneGLB();
		} else {
			// "full_asylum" dan lainnya: coba GLB, jika gagal pakai koridor prosedural
			await this.createFullAsylum();
		}
	}

	async loadHorrorSceneGLB() {
		try {
			const result = await SceneLoader.ImportMeshAsync(
				"",
				"/assets/models/",
				"corridor_baru.glb",
				this.scene
			);
			console.log(
				"corridor_baru.glb loaded with",
				result.meshes.length,
				"meshes"
			);

			// Collision dan visibilitas untuk geometri koridor.
			result.meshes.forEach((mesh, index) => {
				if (!mesh.geometry) return;

				mesh.checkCollisions = true;
				mesh.isPickable = true;

				if (!mesh.material) {
					const material = new StandardMaterial(
						`corridor_mat_${index}`,
						this.scene
					);
					material.diffuseColor = new Color3(0.4, 0.4, 0.4);
					material.specularColor = new Color3(0.1, 0.1, 0.1);
					mesh.material = material;
				}

				// Pengaman untuk GLB lama: sisi belakang koridor adalah dinding solid.
				if (mesh.name === "BackSide_0" && mesh.material) {
					const material = mesh.material;
					material.alpha = 1;
					if (material.albedoColor) material.albedoColor.a = 1;
					if (material.diffuseColor) material.diffuseColor.a = 1;
					material.useAlphaFromAlbedoTexture = false;
					material.backFaceCulling = false;
				}
			});

			// Position the corridor properly
			if (result.meshes.length > 0) {
				const rootMesh = result.meshes[0];
				rootMesh.position = Vector3.Zero();
				rootMesh.scaling = new Vector3(1, 1, 1);
			}

			// Root GLB sudah diposisikan ulang; paksa matrix dan bounds terbaru.
			result.meshes.forEach((mesh) => {
				mesh.computeWorldMatrix(true);
				if (mesh.geometry) mesh.refreshBoundingInfo();
			});

			this.scene.getEngine().hideLoadingUI();
			this.floorMatrixRetryDone = false;
			return result;
		} catch (error) {
			console.warn("Failed to load corridor_baru.glb; memakai koridor cadangan:", error);
			// Fallback to procedural corridor
			this.createFallbackCorridor();
			this.scene.getEngine().hideLoadingUI();
			return null;
		}
	}

	async createFullAsylum() {
		// loadHorrorSceneGLB sudah membuat fallback dan mengembalikan null saat gagal.
		await this.loadHorrorSceneGLB();
		this.scene.getEngine().hideLoadingUI();
	}

	// ---------------------------------------------------------------
	// KORIDOR PROSEDURAL (cadangan jika file GLB gagal dimuat)
	// ---------------------------------------------------------------

	createAsylumCorridor() {
		const corridorLength = 60;
		const corridorWidth = 4;
		const corridorHeight = 4;

		// Floor
		const floor = MeshBuilder.CreateGround(
			"corridor_floor",
			{ width: corridorWidth, height: corridorLength },
			this.scene
		);
		floor.position = new Vector3(0, 0, corridorLength / 2);
		floor.checkCollisions = true;
		const floorMaterial = new StandardMaterial("floorMaterial", this.scene);
		floorMaterial.diffuseColor = new Color3(0.15, 0.15, 0.2);
		floorMaterial.specularColor = new Color3(0.1, 0.1, 0.1);
		floor.material = floorMaterial;

		// Walls
		const wallMaterial = new StandardMaterial("wallMaterial", this.scene);
		wallMaterial.diffuseColor = new Color3(0.3, 0.35, 0.3);
		wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

		const leftWall = MeshBuilder.CreateBox(
			"leftWall",
			{ width: 0.2, height: corridorHeight, depth: corridorLength },
			this.scene
		);
		leftWall.position = new Vector3(
			-corridorWidth / 2,
			corridorHeight / 2,
			corridorLength / 2
		);
		leftWall.checkCollisions = true;
		leftWall.material = wallMaterial;

		const rightWall = MeshBuilder.CreateBox(
			"rightWall",
			{ width: 0.2, height: corridorHeight, depth: corridorLength },
			this.scene
		);
		rightWall.position = new Vector3(
			corridorWidth / 2,
			corridorHeight / 2,
			corridorLength / 2
		);
		rightWall.checkCollisions = true;
		rightWall.material = wallMaterial;

		// Ceiling
		const ceiling = MeshBuilder.CreateGround(
			"ceiling",
			{ width: corridorWidth, height: corridorLength },
			this.scene
		);
		ceiling.position = new Vector3(0, corridorHeight, corridorLength / 2);
		ceiling.rotation.x = Math.PI;
		const ceilingMaterial = new StandardMaterial("ceilingMaterial", this.scene);
		ceilingMaterial.diffuseColor = new Color3(0.25, 0.25, 0.25);
		ceiling.material = ceilingMaterial;

		this.addCorridorDetails(corridorLength, corridorWidth, corridorHeight);
	}

	createFallbackCorridor() {
		console.log("Creating fallback procedural corridor");
		this.createAsylumCorridor();
	}

	addCorridorDetails(length, width, height) {
		const doorMaterial = new StandardMaterial("doorMaterial", this.scene);
		doorMaterial.diffuseColor = new Color3(0.4, 0.3, 0.2);

		// Pintu sel di kiri dan kanan (hiasan)
		for (let z = 8; z < length; z += 12) {
			const leftDoor = MeshBuilder.CreateBox(
				`door_left_${z}`,
				{ width: 1.5, height: 2.2, depth: 0.1 },
				this.scene
			);
			leftDoor.position = new Vector3(-width / 2 + 0.1, height / 2 - 0.4, z);
			leftDoor.material = doorMaterial;
			leftDoor.checkCollisions = true;

			const rightDoor = MeshBuilder.CreateBox(
				`door_right_${z}`,
				{ width: 1.5, height: 2.2, depth: 0.1 },
				this.scene
			);
			rightDoor.position = new Vector3(width / 2 - 0.1, height / 2 - 0.4, z);
			rightDoor.material = doorMaterial;
			rightDoor.checkCollisions = true;
		}

		// Puing
		const debrisMaterial = new StandardMaterial("debrisMaterial", this.scene);
		debrisMaterial.diffuseColor = new Color3(0.3, 0.2, 0.1);

		for (let i = 0; i < 5; i++) {
			const debris = MeshBuilder.CreateBox(
				`debris_${i}`,
				{
					width: 0.5 + Math.random() * 0.5,
					height: 0.2 + Math.random() * 0.3,
					depth: 0.3 + Math.random() * 0.4,
				},
				this.scene
			);
			debris.position = new Vector3(
				(Math.random() - 0.5) * (width - 1),
				0.15,
				Math.random() * length
			);
			debris.material = debrisMaterial;
			debris.checkCollisions = true;
		}
	}

	// ---------------------------------------------------------------
	// PENCAHAYAAN
	// ---------------------------------------------------------------

	setupLighting(lightingType) {
		// Hapus lampu lama kecuali senter. Salin daftarnya dulu karena
		// menghapus elemen saat looping bisa membuat sebagian terlewat.
		[...this.scene.lights].forEach((light) => {
			if (light.name !== "flashlight") {
				light.dispose();
			}
		});

		switch (lightingType) {
			case "dim":
				this.systems.environmentManager.setupDimLighting();
				break;
			case "flickering":
				this.systems.environmentManager.setupFlickeringLights();
				break;
			case "emergency":
				this.systems.environmentManager.setupEmergencyLighting();
				break;
			default:
				this.systems.environmentManager.setupBasicLighting();
		}
	}

	// ---------------------------------------------------------------
	// ITEM INTERAKTIF
	// ---------------------------------------------------------------

	// Mencari tinggi lantai di bawah titik (x, z). Mengembalikan null jika tidak ketemu.
	findFloorY(x, z) {
		const ray = new Ray(
			new Vector3(x, FLOOR_PROBE_HEIGHT, z),
			new Vector3(0, -1, 0),
			20
		);
		const predicate = (m) =>
			m.isPickable &&
			m.isEnabled() &&
			m.checkCollisions &&
			!(m.metadata && (m.metadata.isDecor || m.metadata.isPickup));
		let hit = this.scene.pickWithRay(ray, predicate);
		if ((!hit || !hit.hit || !hit.pickedPoint) && !this.floorMatrixRetryDone) {
			this.floorMatrixRetryDone = true;
			this.scene.meshes.forEach((mesh) => {
				mesh.computeWorldMatrix(true);
				if (mesh.geometry) mesh.refreshBoundingInfo();
			});
			hit = this.scene.pickWithRay(ray, predicate);
		}
		return hit && hit.hit && hit.pickedPoint ? hit.pickedPoint.y : null;
	}

	makeMaterial(name, diffuse, emissive = null, specular = 0.05) {
		const mat = new StandardMaterial(name, this.scene);
		mat.diffuseColor = diffuse;
		mat.specularColor = new Color3(specular, specular, specular);
		if (emissive) mat.emissiveColor = emissive;
		return mat;
	}

	getTableMaterial() {
		if (!this.tableMaterial || this.tableMaterial.isDisposed) {
			this.tableMaterial = this.makeMaterial(
				"item_table_mat",
				new Color3(0.22, 0.15, 0.1),
				new Color3(0.03, 0.02, 0.015)
			);
		}
		return this.tableMaterial;
	}

	createInteractables(interactables) {
		interactables.forEach((item) => {
			const id = `${item.type}_${this.objectCounter++}`;
			const data = { ...item.data };
			const pos = item.position;

			if (item.type === "battery") {
				const mesh = this.systems.interactionManager.spawnBattery(
					new Vector3(pos.x, FLOOR_PROBE_HEIGHT, pos.z),
					data.amount ?? 30,
					true
				);
				this.sceneObjects.push(mesh);
				console.log(`+ battery at x=${pos.x}, z=${pos.z}`);
				return;
			}

			const snap = item.snapToFloor === true;
			let floorY = 0;
			if (snap) {
				const found = this.findFloorY(pos.x, pos.z);
				if (found === null) console.warn(`! Lantai tidak ditemukan di x=${pos.x}, z=${pos.z} untuk ${item.type}. Dipakai y=0. Cek HORROR_LAYOUT.`);
				floorY = found ?? 0;
			}

			let baseY = floorY;
			if (snap && (item.type === "note" || item.type === "key")) {
				const deskAxis = item.deskAxis || "z";
				const deskSize = this.systems.propLibrary.getFittedSize("desk", { axis: deskAxis }) || new Vector3(0.9, TABLE_HEIGHT, 0.7);
				const table = MeshBuilder.CreateBox(`${id}_table`, { width: deskSize.x, height: TABLE_HEIGHT, depth: deskSize.z }, this.scene);
				table.position.set(pos.x, floorY + TABLE_HEIGHT / 2, pos.z);
				table.material = this.getTableMaterial();
				table.checkCollisions = true;
				table.metadata = { isDecor: true };
				this.sceneObjects.push(table);
				baseY = floorY + TABLE_HEIGHT;
				const longSide = Math.max(deskSize.x, deskSize.z);
				const shortSide = Math.min(deskSize.x, deskSize.z);
				if (longSide > 1.7 || shortSide > 0.9) console.warn(`[SceneManager] Desk di luar batas koridor: panjang=${longSide.toFixed(2)} m, pendek=${shortSide.toFixed(2)} m.`);
				if (this.systems.propLibrary.attach("desk", table, { surfaceY: floorY, axis: deskAxis })) table.visibility = 0;
				console.log(`[SceneManager] desk (${deskAxis}) ukuran akhir: w=${deskSize.x.toFixed(3)} h=${deskSize.y.toFixed(3)} d=${deskSize.z.toFixed(3)} m`);
			}

			let mesh;
			switch (item.type) {
				case "door": {
					const size = data.size || { w: 3.1, h: 4.15, d: 0.2 };
					const anchorWidth = data.axis === "x" ? size.d : size.w;
					const anchorDepth = data.axis === "x" ? size.w : size.d;
					mesh = MeshBuilder.CreateBox(id, { width: anchorWidth, height: size.h, depth: anchorDepth }, this.scene);
					mesh.position.set(pos.x, snap ? floorY + size.h / 2 : pos.y, pos.z);
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.26, 0.22, 0.2), new Color3(0.04, 0.03, 0.03));
					mesh.checkCollisions = true;
					break;
				}
				case "note": {
					mesh = MeshBuilder.CreateBox(id, { width: 0.35, height: 0.02, depth: 0.25 }, this.scene);
					mesh.position.set(pos.x, snap ? baseY + 0.015 : pos.y, pos.z);
					mesh.rotation.y = (Math.random() - 0.5) * 0.6;
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.9, 0.9, 0.8), new Color3(0.3, 0.3, 0.25));
					mesh.metadata = { isPickup: true };
					break;
				}
				case "key": {
					mesh = MeshBuilder.CreateBox(id, { width: 0.08, height: 0.04, depth: 0.28 }, this.scene);
					mesh.position.set(pos.x, snap ? baseY + 0.04 : pos.y, pos.z);
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.8, 0.7, 0.2), new Color3(0.5, 0.4, 0.1), 0.3);
					mesh.metadata = { isPickup: true };
					break;
				}
				case "generator": {
					mesh = MeshBuilder.CreateBox(id, { width: 1.2, height: 1.0, depth: 0.8 }, this.scene);
					mesh.position.set(pos.x, snap ? floorY + 0.5 : pos.y + 0.5, pos.z);
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.3, 0.32, 0.35), new Color3(0.05, 0.05, 0.08));
					mesh.checkCollisions = true;
					break;
				}
				case "switch": {
					mesh = MeshBuilder.CreateBox(id, { width: 0.25, height: 0.35, depth: 0.1 }, this.scene);
					mesh.position.set(pos.x, snap ? floorY + 1.2 : pos.y, pos.z);
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.4, 0.4, 0.4), new Color3(1, 0, 0));
					break;
				}
				default: {
					mesh = MeshBuilder.CreateBox(id, { size: 0.5 }, this.scene);
					mesh.position.set(pos.x, snap ? floorY + 0.25 : pos.y, pos.z);
					mesh.material = this.makeMaterial(`${id}_mat`, new Color3(0.5, 0.5, 0.5));
				}
			}

			this.sceneObjects.push(mesh);
			this.systems.interactionManager.registerInteractable(mesh, item.type, data);
			if (item.type === "door") {
				const size = data.size || { w: 3.1, h: 4.15, d: 0.2 };
				this.systems.propLibrary.attach("iron_gate", mesh, {
					surfaceY: floorY,
					width: size.w,
					height: size.h,
					depth: size.d,
					rotationY: data.axis === "x" ? Math.PI / 2 : 0,
				});
			} else if (item.type === "note") {
				this.systems.propLibrary.attach("document", mesh, { surfaceY: baseY });
			} else if (item.type === "key") {
				this.systems.propLibrary.attach(data.id === "restricted_key" ? "key_restricted" : "key_ward", mesh, { surfaceY: baseY });
			}

			const label = data.title || data.name || data.id || "";
			console.log(`+ ${item.type} "${label}" at x=${mesh.position.x.toFixed(1)}, y=${mesh.position.y.toFixed(1)}, z=${mesh.position.z.toFixed(1)}`);
		});
	}

	// ---------------------------------------------------------------
	// PEMICU (TRIGGER)
	// ---------------------------------------------------------------

	setupTriggers(triggers) {
		triggers.forEach((trigger) => {
			let fired = false;

			const observer = this.scene.onBeforeRenderObservable.add(() => {
				if (fired) return;
				const cam = this.scene.activeCamera;
				if (!cam) return;

				// Jarak horizontal saja, supaya tidak terpengaruh tinggi mata pemain
				const dx = cam.position.x - trigger.position.x;
				const dz = cam.position.z - trigger.position.z;
				const dy = Math.abs(cam.position.y - trigger.position.y);

				if (Math.sqrt(dx * dx + dz * dz) <= trigger.radius && dy <= 4) {
					// Sekali pakai: tandai dan lepas pengamatnya
					fired = true;
					this.scene.onBeforeRenderObservable.remove(observer);
					this.systems.eventSystem.emit(trigger.event, trigger.data);
				}
			});

			this.triggerObservers.push(observer);
		});
	}

	// ---------------------------------------------------------------
	// PEMBERSIHAN
	// ---------------------------------------------------------------

	clearScene() {
		// Lepas semua pemicu
		this.triggerObservers.forEach((obs) =>
			this.scene.onBeforeRenderObservable.remove(obs)
		);
		this.triggerObservers = [];

		// Hapus semua objek item dan meja
		this.sceneObjects.forEach((obj) => {
			if (obj && !obj.isDisposed()) {
				this.systems.propLibrary?.removeHighlight(obj);
				obj.dispose();
			}
		});
		this.sceneObjects = [];

		// Dispose of level builder resources
		if (this.levelBuilder) {
			this.levelBuilder.dispose();
			this.levelBuilder = new LevelBuilder(this.scene, this.systems);
		}

		// Clear interactables
		this.systems.interactionManager.dispose();

		// Stop ambient sounds
		this.systems.audioManager.stopAmbient("ambient_asylum");
	}

	getCurrentScene() {
		return this.currentScene;
	}

	getSceneData(sceneName) {
		return this.sceneData.get(sceneName);
	}
}