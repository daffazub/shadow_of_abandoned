import { Vector3, SpotLight, Color3 } from '@babylonjs/core';

export class PlayerController {
    constructor(camera, scene, systems) {
        this.camera = camera;
        this.scene = scene;
        this.systems = systems;

        this.moveSpeed = 3.0;
        this.mouseSensitivity = 0.002;
        this.isMoving = false;
        this.lastFootstepTime = 0;
        this.footstepInterval = 500;

        // Flashlight system
        this.flashlight = null;
        this.flashlightEnabled = false;
        this.batteryLevel = 100;
        this.batteryDrainRate = 0.5; // persen per detik saat menyala
        this.flashlightIntensity = 3.0; // naikkan jika masih terlalu gelap
        this.flickerChance = 0.02;

        this.keys = {};
        this.mouseMovement = { x: 0, y: 0 };

        this.setupControls();
        this.setupFlashlight();
        this.setupPointerLock();
    }

    setupControls() {
        // Keyboard input
        this.scene.onKeyboardObservable.add((kbInfo) => {
            const key = kbInfo.event.key.toLowerCase();

            if (kbInfo.type === 1) { // Key down
                this.keys[key] = true;

                if (key === 'f') {
                    this.toggleFlashlight();
                }
                if (key === 'e') {
                    this.systems.interactionManager.tryInteract();
                }
            } else if (kbInfo.type === 2) { // Key up
                this.keys[key] = false;
            }
        });

        // Mouse input
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === 4) { // Mouse move
                if (document.pointerLockElement === this.scene.getEngine().getRenderingCanvas()) {
                    this.mouseMovement.x = pointerInfo.event.movementX || 0;
                    this.mouseMovement.y = pointerInfo.event.movementY || 0;
                }
            }
        });
    }

    setupFlashlight() {
        // Posisi dan arah bersifat LOKAL karena lampu menjadi anak kamera.
        // (0,0,0) = tepat di kamera, (0,0,1) = lurus ke depan kamera.
        this.flashlight = new SpotLight(
            'flashlight',
            Vector3.Zero(),
            new Vector3(0, 0, 1),
            Math.PI / 3, // sudut kerucut cahaya
            2,           // exponent (kekerasan tepi cahaya)
            this.scene
        );

        this.flashlight.diffuse = new Color3(1, 0.9, 0.7);
        this.flashlight.specular = new Color3(1, 0.9, 0.7);
        this.flashlight.intensity = 0;
        this.flashlight.range = 25;
        this.flashlight.parent = this.camera;
    }

    setupPointerLock() {
        const canvas = this.scene.getEngine().getRenderingCanvas();

        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement !== canvas) {
                // Pointer lock lost
            }
        });
    }

    update(deltaTime) {
        this.handleMovement(deltaTime);
        this.handleMouseLook();
        this.updateFlashlight(deltaTime);
        this.updateFootsteps(deltaTime);
        this.updateUI();
    }

    handleMovement(deltaTime) {
        const yaw = this.camera.rotation.y;

        // Arah horizontal berdasarkan putaran kamera (tidak terpengaruh melihat atas/bawah)
        const forward = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

        const moveVector = Vector3.Zero();
        let moving = false;

        if (this.keys['w']) {
            moveVector.addInPlace(forward);
            moving = true;
        }
        if (this.keys['s']) {
            moveVector.subtractInPlace(forward);
            moving = true;
        }
        if (this.keys['a']) {
            moveVector.subtractInPlace(right);
            moving = true;
        }
        if (this.keys['d']) {
            moveVector.addInPlace(right);
            moving = true;
        }

        if (moving && moveVector.lengthSquared() > 0.0001) {
            moveVector.normalize();
            const direction = moveVector.clone();
            // Batasi langkah per frame agar tabrakan tetap stabil saat FPS turun.
            const step = this.moveSpeed * Math.min(Math.max(deltaTime, 0), 0.05);

            // Gunakan ellipsoid kamera (radius tubuh pemain) milik Babylon.js.
            // moveWithCollisions menangani sudut dan sisi tubuh, bukan hanya
            // satu ray dari tengah kamera yang mudah melewati sudut tembok.
            if (this.camera.checkCollisions && this.scene.collisionsEnabled) {
                this.camera.moveWithCollisions(direction.scale(step));
            } else {
                this.camera.position.addInPlace(direction.scale(step));
            }
        } else {
            moving = false;
        }

        this.isMoving = moving;
    }

    handleMouseLook() {
        if (this.mouseMovement.x !== 0 || this.mouseMovement.y !== 0) {
            this.camera.rotation.y += this.mouseMovement.x * this.mouseSensitivity;
            this.camera.rotation.x += this.mouseMovement.y * this.mouseSensitivity;

            // Batasi rotasi vertikal
            this.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotation.x));

            this.mouseMovement.x = 0;
            this.mouseMovement.y = 0;
        }
    }

    updateFlashlight(deltaTime) {
        if (this.flashlightEnabled) {
            // Kurangi baterai
            this.batteryLevel = Math.max(0, this.batteryLevel - this.batteryDrainRate * deltaTime);

            // Efek berkedip saat baterai rendah
            let intensity = this.flashlightIntensity;
            if (this.batteryLevel < 20) {
                if (Math.random() < this.flickerChance * (21 - this.batteryLevel)) {
                    intensity = Math.random() * 0.5;
                }
            }

            // Matikan jika baterai habis
            if (this.batteryLevel <= 0) {
                intensity = 0;
                this.flashlightEnabled = false;
            }

            this.flashlight.intensity = intensity;
        } else {
            this.flashlight.intensity = 0;
        }

        // Posisi dan arah TIDAK perlu disalin manual:
        // lampu sudah menjadi anak kamera (parent) sehingga ikut bergerak dan berputar.
    }

    updateFootsteps(deltaTime) {
        if (this.isMoving) {
            const currentTime = Date.now();
            if (currentTime - this.lastFootstepTime > this.footstepInterval) {
                this.systems.audioManager.playFootstep();
                this.lastFootstepTime = currentTime;
            }
        }
    }

    updateUI() {
        const batteryElement = document.getElementById('battery');
        if (batteryElement) {
            batteryElement.textContent = `${Math.floor(this.batteryLevel)}%`;
        }
    }

    toggleFlashlight() {
        if (this.batteryLevel > 0) {
            this.flashlightEnabled = !this.flashlightEnabled;
            this.systems.audioManager.playSound('flashlight_click');
        }
    }

    // Dipakai nanti untuk pickup baterai (sesuai storyboard Scene 3)
    addBattery(amount = 30) {
        this.batteryLevel = Math.min(100, this.batteryLevel + amount);
    }

    getPosition() {
        return this.camera.position.clone();
    }

    getForwardDirection() {
        return this.camera.getForwardRay().direction.clone();
    }
}