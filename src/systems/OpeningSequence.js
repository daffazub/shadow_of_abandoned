export class OpeningSequence {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.hasStarted = false;
        this.introPlaying = false;
        this.introFinished = false;
        this.introElapsed = 0;
        this.introDuration = 22;
        this.skipAvailableAfter = 3;
        this.skipHandler = null;
        this.cameraStartRotation = null;
        this.triggersActivated = {
            objectLook: false,
            firstMovement: false,
        };
        this.stepCount = 0;
    }

    start() {
        if (this.hasStarted) return;
        this.hasStarted = true;
        this.setupEnvironmentalClues();
        this.setupTriggers();
        this.startAmbientAudio();
        this.startIntro();
    }

    startIntro() {
        const camera = this.scene.activeCamera;
        const player = this.systems.playerController;
        if (!camera || !player) {
            this.finishIntro();
            return;
        }

        this.introPlaying = true;
        this.introFinished = false;
        this.introElapsed = 0;
        this.cameraStartRotation = camera.rotation.clone();
        this.introFlickered = false;
        this.introStartedAt = performance.now();
        player.resetInput();
        player.controlsLocked = true;
        this.showIntroOverlay();

        this.skipHandler = (event) => {
            if (event.code === "Space" && (performance.now() - this.introStartedAt) / 1000 >= this.skipAvailableAfter) {
                event.preventDefault();
                this.finishIntro();
            }
        };
        window.addEventListener("keydown", this.skipHandler);

        this.systems.audioManager.playSound("intro_wake", { volume: 0.35 });
        setTimeout(() => {
            if (this.introPlaying) this.systems.audioManager.playSound("intro_waterphone", { volume: 0.45 });
        }, 5_000);
        setTimeout(() => {
            if (this.introPlaying) this.systems.audioManager.playSound("door_slam", { volume: 0.75 });
        }, 9_000);
        setTimeout(() => {
            if (this.introPlaying) this.systems.audioManager.playSound("intro_whoosh", { volume: 0.4 });
        }, 14_000);
        setTimeout(() => {
            if (this.introPlaying) this.systems.audioManager.playSound("electrical_spark", { volume: 0.3 });
        }, 16_000);
        setTimeout(() => {
            if (this.introPlaying) this.finishIntro();
        }, this.introDuration * 1000);
    }

    finishIntro() {
        if (this.introFinished) return;
        this.introPlaying = false;
        this.introFinished = true;
        if (this.skipHandler) {
            window.removeEventListener("keydown", this.skipHandler);
            this.skipHandler = null;
        }
        if (this.systems.playerController) {
            this.systems.playerController.resetInput();
            this.systems.playerController.controlsLocked = false;
        }
        this.scene.getEngine().getRenderingCanvas()?.focus();

        const overlay = document.getElementById("openingIntro");
        if (overlay) {
            overlay.classList.add("opening-intro-fade-out");
            setTimeout(() => overlay.remove(), 900);
        }
        this.showControlHint();
        console.log("Opening intro finished; player controls enabled");
    }

    showIntroOverlay() {
        document.getElementById("openingIntro")?.remove();
        const overlay = document.createElement("div");
        overlay.id = "openingIntro";
        overlay.className = "opening-intro";
        overlay.innerHTML = `
            <div class="opening-intro-card">
                <p class="opening-intro-kicker">BLACKWOOD ASYLUM · 1973</p>
                <p class="opening-intro-title">Patient intake records</p>
                <p class="opening-intro-copy">You wake beneath a failing light. The room is empty, but the door is not.</p>
                <p class="opening-intro-sealed">The exit is sealed.<br>Find another way out.</p>
                <p class="opening-intro-skip">Press Space to skip</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    showControlHint() {
        const hint = document.createElement("div");
        hint.className = "opening-control-hint";
        hint.textContent = "Press F for flashlight · Press E to interact";
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 6000);
    }

    startAmbientAudio() {
        this.systems.audioManager.playAmbient("ambient_asylum");
    }

    update(deltaTime) {
        if (!this.introPlaying) return;
        this.introElapsed += deltaTime;
        const camera = this.scene.activeCamera;
        if (!camera || !this.cameraStartRotation) return;

        const t = this.introElapsed;
        const focus = Math.min(1, Math.max(0, (t - 2) / 8));
        const turn = Math.sin(focus * Math.PI * 0.5) * 0.28;
        const shakeAmount = t >= 9 && t <= 12 ? 0.018 * Math.sin(t * 34) : 0;
        camera.rotation.y = this.cameraStartRotation.y + turn + shakeAmount;
        camera.rotation.x = this.cameraStartRotation.x + (t >= 9 && t <= 12 ? shakeAmount * 0.6 : 0);

        if (t >= 16 && !this.introFlickered) {
            this.introFlickered = true;
            this.systems.environmentManager.flickerLights();
        }
    }

    setupEnvironmentalClues() {
        const clipboard = this.scene.getMeshByName("intake_clipboard");
        if (clipboard) {
            this.systems.interactionManager.registerInteractable(clipboard, "document", {
                title: "Patient Transfer Form",
                content: "Subject 23 - TRANSFER TO WING C - EXPERIMENTAL PROTOCOL 7\n[Blood stains obscure the remaining text]",
            });
        }

        const recorder = this.scene.getMeshByName("broken_recorder");
        if (recorder) {
            this.systems.interactionManager.registerInteractable(recorder, "device", {
                title: "Audio Recording Device",
                content: "Cracked tape recorder with partially ejected cassette.\nLabel reads: \"SESSION 47 - DR. [ILLEGIBLE]\"",
            });
        }

        const keycard = this.scene.getMeshByName("keycard_fragment");
        if (keycard) {
            this.systems.interactionManager.registerInteractable(keycard, "key_item", {
                title: "Security Keycard Fragment",
                content: "Half of a security access card showing \"CLEARANCE LEV-\" and part of a photograph.",
            });
        }
    }

    setupTriggers() {
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.pickInfo?.pickedMesh?.name === "broken_recorder" && !this.triggersActivated.objectLook) {
                this.triggersActivated.objectLook = true;
                this.systems.audioManager.playSound("static", { volume: 0.4 });
            }
        });

        this.systems.eventSystem.on("player_moved", () => {
            this.stepCount++;
            if (this.stepCount === 3 && !this.triggersActivated.firstMovement) {
                this.triggersActivated.firstMovement = true;
                this.systems.audioManager.playSound("door_slam", { volume: 0.3 });
            }
        });
    }
}
