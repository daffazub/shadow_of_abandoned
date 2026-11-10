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

// Nama area yang tampil di HUD. Kunci = nama scene yang dimuat SceneManager.
const SCENE_NAMES = {
	horror_scene: "Asylum Entrance",
	asylum_entrance: "Entrance Hall",
	main_corridor: "Main Corridor",
	research_wing: "Research Wing",
	basement: "Basement",
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
			console.log(`Key collected: ${data.keyName}`);
		});

		// Generator and power events
		this.systems.eventSystem.on("generator_activated", (data) => {
			if (data.powers === "facility_lighting") {
				this.systems.environmentManager.restorePower();
			}
		});

		// Final sequence events
		this.systems.eventSystem.on("switch_activated", (data) => {
			if (data.controls === "final_sequence") {
				this.startFinalSequence();
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
		console.log("Starting final sequence...");

		// Dramatic lighting and audio
		this.systems.environmentManager.startChaseSequence();
		this.systems.audioManager.playAmbient("entity_pursuit");

		// Show final message after delay
		setTimeout(() => {
			this.showGameComplete();
		}, 10000);
	}

	closeDocument() {
		if (this.activeOverlay) {
			this.activeOverlay.remove();
			this.activeOverlay = null;
		}
	}

	showDocument(title, content) {
		// Pastikan hanya satu dokumen terbuka pada satu waktu
		this.closeDocument();

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

	showGameComplete() {
		const overlay = document.createElement("div");
		overlay.className = "document-overlay";
		overlay.innerHTML = `
            <div class="document-content">
                <div class="document-header">
                    <h3>Entity Contained</h3>
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

	// Start game when user clicks
	document.getElementById("clickToStart")?.addEventListener("click", () => {
		document.getElementById("clickToStart").style.display = "none";
		new Game();
	});
});