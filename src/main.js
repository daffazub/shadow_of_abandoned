import { Engine, Scene, Vector3, UniversalCamera } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { AssetManager } from "./systems/AssetManager.js";
import { AudioManager } from "./systems/AudioManager.js";
import { PlayerController } from "./systems/PlayerController.js";
import { InteractionManager } from "./systems/InteractionManager.js";
import { EventSystem } from "./systems/EventSystem.js";
import { SceneManager } from "./systems/SceneManager.js";
import { EnvironmentManager } from "./systems/EnvironmentManager.js";
import { OpeningSequence } from "./systems/OpeningSequence.js";
import { PropLibrary } from "./systems/PropLibrary.js";
import { MonsterManager } from "./systems/MonsterManager.js";

// Nama area yang tampil di HUD. Kunci = nama scene yang dimuat SceneManager.
const SCENE_NAMES = {
	horror_scene: "Asylum Entrance",
	asylum_entrance: "Entrance Hall",
	main_corridor: "Main Corridor",
	research_wing: "Research Wing",
	basement: "Basement",
	restricted_area: "Restricted Wing",
	experiment_lab: "Experiment Laboratory",
};

class Game {
	constructor() {
		this.canvas = document.getElementById("gameCanvas");
		this.engine = new Engine(this.canvas, true, {
			preserveDrawingBuffer: true,
			stencil: true,
		});
		this.scene = null;
		this.camera = null;
		this.activeOverlay = null;
		this.gameEnded = false;
		this.finalSequenceStarted = false;

		this.systems = {};

		this.init();
	}

	/**
	 * Initializes the game by creating a scene, setting up the systems, and starting the render loop.
	 * Also sets up event listeners to enhance the horror experience.
	 */
	async init() {
		// Create scene with proper collision settings
		this.scene = new Scene(this.engine);
		this.scene.gravity = new Vector3(0, -9.81, 0);
		this.scene.collisionsEnabled = true;
		this.scene.workerCollisions = false; // Disable for better performance in browser

		// Initialize systems
		this.systems.assetManager = new AssetManager(this.scene);
		this.systems.audioManager = new AudioManager(this.scene);
		this.systems.eventSystem = new EventSystem();
		this.systems.propLibrary = new PropLibrary(this.scene);
		this.systems.sceneManager = new SceneManager(this.scene, this.systems);
		this.systems.environmentManager = new EnvironmentManager(
			this.scene,
			this.systems
		);
		this.systems.interactionManager = new InteractionManager(
			this.scene,
			this.systems
		);
		this.systems.openingSequence = new OpeningSequence(
			this.scene,
			this.systems
		);
		this.systems.monsterManager = new MonsterManager(this.scene, this.systems);
		// Muat model monster di latar belakang supaya tidak ada jeda saat pintu kedua dibuka
		this.systems.monsterManager.preload();

		// Setup camera
		this.setupCamera();

		// Setup player controller
		this.systems.playerController = new PlayerController(
			this.camera,
			this.scene,
			this.systems
		);

		// Load initial scene
		await this.systems.sceneManager.loadScene("horror_scene");

		// Start opening sequence
		this.systems.openingSequence.start();

		// Start render loop
		this.engine.runRenderLoop(() => {
			this.update();
			this.scene.render();
		});

		// Handle resize
		window.addEventListener("resize", () => {
			this.engine.resize();
		});

		// Setup event listeners for enhanced horror experience
		this.setupEventListeners();

		// Keyboard shortcut to close document overlay (X)
		this.setupDocumentShortcuts();

		// Setup story events
		this.systems.eventSystem.setupStoryEvents(this.systems);
	}

	/**
	 * Sets up event listeners for the horror experience.
	 * Listens for entity encounters, document discoveries, area transitions, key collections, generator and power events, and final sequence events.
	 * Triggers environment and audio effects based on the events.
	 */
	setupEventListeners() {
		// Entity encounter events
		this.systems.eventSystem.on("entity_encounter", (data) => {
			this.systems.environmentManager.flickerLights();
			this.systems.audioManager.triggerEntityEncounter(
				data.intensity,
				data.position
			);
		});
		// Arm/preload at the gate; the destination scene starts the actual chase.
		this.systems.eventSystem.on("door_opened", (data) => {
			this.systems.monsterManager.onDoorOpened(data);
		});

		// Document discovery events
		this.systems.eventSystem.on("document_found", (data) => {
			console.log(`Document discovered: ${data.title}`);
		});

		// Note reading events
		this.systems.eventSystem.on("note_read", (data) => {
			this.showDocument(data.title, data.content);
		});

		// Area transition events
		this.systems.eventSystem.on("area_entered", (data) => {
			console.log(`Entered area: ${data.area}`);

			// Trigger area-specific effects
			if (data.area === "basement") {
				this.systems.environmentManager.startEntityPursuit();
			}
		});

		// Key collection events
		this.systems.eventSystem.on("key_collected", (data) => {
			console.log(`Key collected: ${data.name || data.id}`);
		});

		// Generator and power events
		const restorePower = (data) => {
			if (data.powers === "facility_lighting") {
				this.systems.environmentManager.restorePower();
			}
		};
		this.systems.eventSystem.on("generator_started", restorePower);
		this.systems.eventSystem.on("generator_activated", restorePower);

		// Final sequence events
		const startFinalSequence = (data) => {
			if (data.controls === "final_sequence") {
				this.startFinalSequence();
			}
		};
		this.systems.eventSystem.on("switch_toggled", startFinalSequence);
		this.systems.eventSystem.on("switch_activated", startFinalSequence);
		this.systems.eventSystem.on("ending_requested", ({ ending }) => {
			if (this.gameEnded || this.finalSequenceStarted) return;
			if (ending === "B") this.showGameComplete();
			else if (ending === "A" || ending === "C") this.showEnding(ending);
		});
		this.systems.eventSystem.on("door_opened", (data) => {
			if (data.id === "restricted_gate") {
				this.systems.interactionManager.showMessage("Walk through the gate into the east corridor to enter the Restricted Wing.", 6500);
			}
		});
	}

	setupDocumentShortcuts() {
		document.addEventListener("keydown", (e) => {
			if (e.key.toLowerCase() === "x") {
				this.closeDocument();
			}
		});
	}

	startFinalSequence() {
		if (this.gameEnded || this.finalSequenceStarted) return;
		this.finalSequenceStarted = true;
		this.systems.eventSystem.stopStoryTimers();
		this.closeDocument();
		this.systems.playerController.controlsLocked = true;
		this.systems.playerController.resetInput();
		this.systems.environmentManager.stopEntityPursuit();
		this.systems.environmentManager.stopLightTimers();
		this.systems.audioManager.playSound("generator_start", { volume: 0.6 });
		this.systems.audioManager.playSound("entity_growl", { volume: 0.7 });
		this.systems.interactionManager.showMessage("Containment failure. The machine is shutting down…", 5000);
		setTimeout(() => this.showGameComplete(), 5000);
	}

	closeDocument() {
		if (this.activeOverlay) {
			this.activeOverlay.remove();
			this.activeOverlay = null;
			if (!this.gameEnded && !this.finalSequenceStarted && !this.systems.sceneManager.isTransitioning) {
				this.systems.playerController.resetInput();
				this.systems.playerController.controlsLocked = false;
			}
		}
	}

	showDocument(title, content) {
		if (this.gameEnded || this.finalSequenceStarted) return;
		// Membaca dokumen menjeda kontrol dan ancaman agar pemain tidak tertangkap saat membaca.
		this.closeDocument();
		this.systems.playerController.controlsLocked = true;
		this.systems.playerController.resetInput();
		document.exitPointerLock?.();

		const overlay = document.createElement("div");
		overlay.className = "document-overlay";
		overlay.innerHTML = `
            <div class="document-content">
                <div class="document-header">
                    <h3>${title}</h3>
                    <span class="document-close">&times;</span>
                </div>
                <div class="document-body">
                    <p>${content}</p>
                </div>
                <div class="document-footer">
                    Press X to close
                </div>
            </div>
        `;

		// Close handlers
		const closeBtn = overlay.querySelector(".document-close");
		closeBtn.onclick = () => this.closeDocument();
		overlay.onclick = (e) => {
			if (e.target === overlay) this.closeDocument();
		};

		document.body.appendChild(overlay);
		this.activeOverlay = overlay;
	}

	showEnding(ending) {
		if (this.gameEnded) return;
		this.gameEnded = true;
		this.closeDocument();
		this.systems.playerController.controlsLocked = true;
		this.systems.playerController.resetInput();
		this.camera.applyGravity = false;
		this.systems.environmentManager.stopEntityPursuit();
		["ambient_asylum", "ambient_basement", "generator_running", "entity_pursuit"].forEach((name) => this.systems.audioManager.stopAmbient(name));
		this.systems.environmentManager.stopLightTimers();
		this.systems.interactionManager.updateInteractionUI(null);
		document.exitPointerLock?.();
		const endings = {
			A: { title: "Dawn Beyond Blackwood", copy: "You reach the outside as dawn breaks. Behind you, a shadow watches from an asylum window." },
			C: { title: "Part of the Asylum", copy: "The last light fades. Your footsteps join the whispers in Blackwood's empty halls." },
		};
		const details = endings[ending];
		if (!details) return;
		const overlay = document.createElement("div");
		overlay.className = "document-overlay ending-overlay";
		overlay.dataset.ending = ending;
		const panel = document.createElement("div");
		panel.className = "document-content";
		const title = document.createElement("h2");
		title.textContent = `Ending ${ending} — ${details.title}`;
		const copy = document.createElement("p");
		copy.textContent = details.copy;
		const replay = document.createElement("button");
		replay.textContent = "Play Again";
		replay.addEventListener("click", () => location.reload());
		panel.append(title, copy, replay);
		overlay.appendChild(panel);
		document.body.appendChild(overlay);
		this.systems.eventSystem.emit("game_ended", { ending });
	}

	showGameComplete() {
		if (this.gameEnded) return;
		this.gameEnded = true;
		this.closeDocument();
		this.systems.playerController.controlsLocked = true;
		this.systems.playerController.resetInput();
		this.camera.applyGravity = false;
		this.systems.environmentManager.stopEntityPursuit();
		["ambient_asylum", "ambient_basement", "generator_running", "entity_pursuit"].forEach((name) => this.systems.audioManager.stopAmbient(name));
		this.systems.environmentManager.stopLightTimers();
		this.systems.interactionManager.updateInteractionUI(null);
		document.exitPointerLock?.();
		this.systems.eventSystem.emit("game_ended", { ending: "B" });
		const overlay = document.createElement("div");
		overlay.className = "document-overlay ending-overlay";
		overlay.dataset.ending = "B";
		overlay.innerHTML = `
            <div class="document-content">
                <div class="document-header">
                    <h3>Ending B — Entity Contained</h3>
                </div>
                <div class="document-body">
                    <p>The generator has been destroyed. The entity's connection to this reality has been severed.</p>
                    <p>The asylum falls silent once more, its dark secrets buried beneath the rubble.</p>
                    <p>You have survived the Shadows of the Abandoned.</p>
                </div>
                <div class="document-footer">
                    <button onclick="location.reload()" style="background: #ff6b6b; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Play Again</button>
                </div>
            </div>
        `;

		document.body.appendChild(overlay);
	}

	setupCamera() {
		this.camera = new UniversalCamera(
			"playerCamera",
			new Vector3(0, 4, -5),
			this.scene
		);
		this.camera.setTarget(new Vector3(10, 3.4, -5.2));

		// Camera settings for horror atmosphere
		this.camera.fov = 0.8;
		this.camera.minZ = 0.1;
		this.camera.maxZ = 100;

		// Enable collisions with proper settings
		this.camera.checkCollisions = true;
		this.camera.applyGravity = true;
		this.camera.ellipsoid = new Vector3(0.4, 0.9, 0.4);
		this.camera.ellipsoidOffset = new Vector3(0, 0, 0);

		// Movement settings
		this.camera.speed = 0.5;
		this.camera.angularSensibility = 2000;
	}

	update() {
		if (this.gameEnded) return;
		const deltaTime = this.engine.getDeltaTime() / 1000;

		// Update all systems
		Object.values(this.systems).forEach((system) => {
			if (system.update) {
				system.update(deltaTime);
			}
		});

		// Update UI elements
		this.updateUI();
	}

	updateUI() {
		// Update HUD elements
		const batteryElement = document.getElementById("battery");
		const documentsElement = document.getElementById("documents");
		const keysElement = document.getElementById("keys");
		const areaElement = document.getElementById("area");

		if (this.systems.playerController && batteryElement) {
			// Pakai ?? (bukan ||) supaya baterai 0% tidak tampil sebagai 100%
			const battery = this.systems.playerController.batteryLevel ?? 100;
			batteryElement.textContent = `${Math.floor(battery)}%`;
		}

		if (this.systems.interactionManager) {
			if (documentsElement) {
				documentsElement.textContent = (
					this.systems.interactionManager.documentsFound || []
				).length.toString();
			}
			if (keysElement) {
				keysElement.textContent = (
					this.systems.interactionManager.inventory || new Map()
				).size.toString();
			}
		}

		if (this.systems.sceneManager && areaElement) {
			const currentScene = this.systems.sceneManager.getCurrentScene();
			areaElement.textContent = SCENE_NAMES[currentScene] || "Unknown Area";
		}
	}
}

// Initialize game when page loads
window.addEventListener("DOMContentLoaded", () => {
	// Hide loading screen after a delay
	setTimeout(() => {
		const loadingScreen = document.getElementById("loadingScreen");
		const clickToStart = document.getElementById("clickToStart");

		if (loadingScreen) loadingScreen.style.display = "none";
		if (clickToStart) clickToStart.style.display = "flex";
	}, 2000);

	let gameStarted = false;
	window.addEventListener("game-play-requested", () => {
		if (gameStarted) return;
		gameStarted = true;
		new Game();
	});
});