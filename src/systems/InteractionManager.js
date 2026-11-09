import {
    Ray,
    Vector3,
    Color3,
    MeshBuilder,
    StandardMaterial,
} from '@babylonjs/core';

export class InteractionManager {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.interactables = new Map();
        this.currentInteractable = null;
        this.interactionRange = 3.0;
        this.lookThreshold = 0.92; // seberapa lurus pemain harus menghadap objek (1 = tepat lurus)

        // Inventory berupa Map supaya cocok dengan HUD di main.js (memakai .size)
        this.inventory = new Map();
        // Daftar id dokumen yang sudah ditemukan (dipakai HUD "Documents Found")
        this.documentsFound = [];

        this.pickupCounter = 0;
        this.messageTimeout = null;

        this.setupUI();
        this.setupDebugKeys();
    }

    setupUI() {
        this.interactionUI = document.getElementById('interaction');
    }

    // Tekan P untuk mencetak posisi pemain di konsol (F12).
    // Berguna untuk menentukan koordinat item. Boleh dihapus kalau tidak perlu.
    setupDebugKeys() {
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'p' && this.scene.activeCamera) {
                const p = this.scene.activeCamera.position;
                console.log(
                    `Posisi: new Vector3(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`
                );
            }
        });
    }

    registerInteractable(mesh, type, data = {}) {
        const interactable = {
            mesh: mesh,
            type: type,
            data: data,
            isActive: true
        };

        this.interactables.set(mesh.id, interactable);

        // Add interaction highlight material if needed
        if (!mesh.material) {
            mesh.material = this.systems.assetManager.createPlaceholderMaterial();
        }
    }

    // ---------------------------------------------------------------
    // PICKUP BATERAI
    // ---------------------------------------------------------------

    /**
     * Membuat baterai yang bisa diambil.
     * @param {Vector3} position  posisi di atas lantai (y harus di atas lantai)
     * @param {number} amount     persen baterai yang ditambahkan
     * @param {boolean} snapToFloor  jika true, baterai diturunkan otomatis ke lantai
     */
    spawnBattery(position, amount = 30, snapToFloor = true) {
        const id = `battery_${this.pickupCounter++}`;

        const mesh = MeshBuilder.CreateCylinder(
            id,
            { height: 0.35, diameter: 0.18 },
            this.scene
        );
        mesh.metadata = { isPickup: true };
        mesh.checkCollisions = false;

        const pos = position.clone();
        if (snapToFloor) {
            const downRay = new Ray(position, new Vector3(0, -1, 0), 10);
            const hit = this.scene.pickWithRay(
                downRay,
                (m) => m.isPickable && !(m.metadata && m.metadata.isPickup)
            );
            if (hit && hit.hit && hit.pickedPoint) {
                pos.y = hit.pickedPoint.y + 0.25;
            }
        }
        mesh.position = pos;

        // Emissive supaya tetap terlihat samar di kegelapan
        const material = new StandardMaterial(`${id}_mat`, this.scene);
        material.diffuseColor = new Color3(0.2, 0.7, 0.2);
        material.emissiveColor = new Color3(0.1, 0.45, 0.1);
        mesh.material = material;

        this.registerInteractable(mesh, 'battery', { id, amount, spin: true });
        return mesh;
    }

    interactWithBattery(interactable) {
        const player = this.systems.playerController;
        if (!player || typeof player.addBattery !== 'function') return false;

        if (player.batteryLevel >= 100) {
            this.showMessage('Battery already full');
            return false;
        }

        const before = player.batteryLevel;
        player.addBattery(interactable.data.amount ?? 30);
        const gained = Math.round(player.batteryLevel - before);

        this.systems.audioManager.playSound('key_pickup');
        this.systems.eventSystem.emit('battery_collected', interactable.data);
        this.showMessage(`Battery +${gained}%`);

        this.removePickup(interactable);
        return true;
    }

    removePickup(interactable) {
        interactable.mesh.dispose();
        this.interactables.delete(interactable.mesh.id);
    }

    showMessage(text, duration = 2500) {
        let el = document.getElementById('game-message');
        if (!el) {
            el = document.createElement('div');
            el.id = 'game-message';
            el.style.cssText = [
                'position:fixed',
                'bottom:20%',
                'left:50%',
                'transform:translateX(-50%)',
                'padding:8px 18px',
                'background:rgba(0,0,0,0.7)',
                'color:#4ecdc4',
                'font-family:"Courier New",monospace',
                'font-size:16px',
                'border:1px solid #333',
                'border-radius:4px',
                'z-index:50',
                'pointer-events:none',
            ].join(';');
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.display = 'block';

        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(() => {
            el.style.display = 'none';
        }, duration);
    }

    // ---------------------------------------------------------------
    // DETEKSI OBJEK YANG DILIHAT PEMAIN
    // ---------------------------------------------------------------

    update(deltaTime) {
        // Animasi putar pelan untuk pickup
        this.interactables.forEach((interactable) => {
            if (interactable.data.spin && !interactable.mesh.isDisposed()) {
                interactable.mesh.rotation.y += deltaTime * 1.5;
            }
        });

        this.checkForInteractables();
    }

    checkForInteractables() {
        const camera = this.scene.activeCamera;
        if (!camera) return;

        const origin = camera.position;
        const forward = camera.getForwardRay().direction;

        let closestInteractable = null;
        let closestDistance = this.interactionRange;

        this.interactables.forEach((interactable, id) => {
            // Bersihkan mesh yang sudah dihapus
            if (interactable.mesh.isDisposed()) {
                this.interactables.delete(id);
                return;
            }
            if (!interactable.isActive) return;

            const target = interactable.mesh.getAbsolutePosition();
            const toTarget = target.subtract(origin);
            const distance = toTarget.length();
            if (distance > this.interactionRange || distance < 0.001) return;

            const dir = toTarget.scale(1 / distance);

            // Pemain harus menghadap ke arah objek
            if (Vector3.Dot(forward, dir) < this.lookThreshold) return;

            // Tidak boleh terhalang dinding
            if (!this.hasLineOfSight(origin, dir, distance, interactable.mesh)) return;

            if (distance < closestDistance) {
                closestInteractable = interactable;
                closestDistance = distance;
            }
        });

        this.updateInteractionUI(closestInteractable);
        this.currentInteractable = closestInteractable;
    }

    hasLineOfSight(origin, dir, distance, mesh) {
        const ray = new Ray(origin, dir, distance + 0.5);
        const hit = this.scene.pickWithRay(
            ray,
            (m) => m.isPickable && m.isEnabled() && m.isVisible
        );
        if (!hit || !hit.hit) return true;
        return (
            hit.pickedMesh === mesh ||
            hit.pickedMesh.isDescendantOf(mesh) ||
            hit.distance >= distance - 0.4
        );
    }

    updateInteractionUI(interactable) {
        if (!this.interactionUI) return;

        if (interactable) {
            this.interactionUI.style.display = 'block';
            this.interactionUI.textContent = this.getInteractionText(interactable);
        } else {
            this.interactionUI.style.display = 'none';
        }
    }

    getInteractionText(interactable) {
        switch (interactable.type) {
            case 'door':
                return interactable.data.locked ? 'Locked' : 'Press E to open';
            case 'note':
                return 'Press E to read';
            case 'key':
                return 'Press E to pick up';
            case 'battery':
                return 'Press E to pick up battery';
            case 'switch':
                return 'Press E to flip switch';
            case 'generator':
                return 'Press E to start generator';
            default:
                return 'Press E to interact';
        }
    }

    // ---------------------------------------------------------------
    // AKSI INTERAKSI
    // ---------------------------------------------------------------

    tryInteract() {
        if (!this.currentInteractable) return false;

        const interactable = this.currentInteractable;

        switch (interactable.type) {
            case 'door':
                return this.interactWithDoor(interactable);
            case 'note':
                return this.interactWithNote(interactable);
            case 'key':
                return this.interactWithKey(interactable);
            case 'battery':
                return this.interactWithBattery(interactable);
            case 'switch':
                return this.interactWithSwitch(interactable);
            case 'generator':
                return this.interactWithGenerator(interactable);
            default:
                return false;
        }
    }

    interactWithDoor(interactable) {
        if (interactable.data.locked) {
            // Sebelumnya memakai playerController.hasKey yang tidak ada,
            // sehingga pintu tidak pernah terbuka. Sekarang memakai inventory.
            if (this.hasItem('key', interactable.data.keyId)) {
                interactable.data.locked = false;
                this.systems.audioManager.playSound('door_creak');
                this.systems.eventSystem.emit('door_unlocked', interactable.data);
                this.showMessage('Door unlocked');
                return true;
            } else {
                this.systems.audioManager.playSound('door_locked');
                this.showMessage('The door is locked');
                return false;
            }
        } else {
            this.systems.audioManager.playSound('door_creak');
            this.systems.eventSystem.emit('door_opened', interactable.data);

            // Simple door opening animation
            if (!interactable.data.isOpen) {
                interactable.mesh.rotation.y += Math.PI / 2;
                interactable.data.isOpen = true;
            }
            return true;
        }
    }

    interactWithNote(interactable) {
        this.systems.audioManager.playSound('paper_rustle');

        const title = interactable.data.title || 'Document';
        const docId = interactable.data.id || title;

        // Hitung dokumen hanya sekali per dokumen
        if (!this.documentsFound.includes(docId)) {
            this.documentsFound.push(docId);
            this.systems.eventSystem.emit('document_found', { title, id: docId });
        }

        this.systems.eventSystem.emit('note_read', {
            title: title,
            content: interactable.data.content || 'The text is too faded to read...'
        });

        // Mark as read
        interactable.data.isRead = true;
        return true;
    }

    interactWithKey(interactable) {
        this.systems.audioManager.playSound('key_pickup');
        this.systems.eventSystem.emit('key_collected', interactable.data);

        // Add to inventory
        this.addToInventory('key', interactable.data);

        // Remove from scene
        this.removePickup(interactable);
        return true;
    }

    interactWithSwitch(interactable) {
        interactable.data.isOn = !interactable.data.isOn;
        this.systems.audioManager.playSound('switch_flip');
        this.systems.eventSystem.emit('switch_toggled', interactable.data);

        // Visual feedback
        if (interactable.data.isOn) {
            interactable.mesh.material.emissiveColor = new Color3(0, 1, 0);
        } else {
            interactable.mesh.material.emissiveColor = new Color3(1, 0, 0);
        }

        return true;
    }

    interactWithGenerator(interactable) {
        if (!interactable.data.isRunning) {
            interactable.data.isRunning = true;
            this.systems.audioManager.playSound('generator_start');
            this.systems.eventSystem.emit('generator_started', interactable.data);

            // Start generator sound loop
            this.systems.audioManager.playAmbient('generator_running');
            return true;
        }
        return false;
    }

    // ---------------------------------------------------------------
    // INVENTORY
    // ---------------------------------------------------------------

    addToInventory(type, data) {
        const id = data.id ?? `${type}_${this.inventory.size}`;
        this.inventory.set(`${type}:${id}`, { type, data });

        // Update UI
        const itemsElement = document.getElementById('items');
        if (itemsElement) {
            itemsElement.textContent = this.inventory.size.toString();
        }
    }

    hasItem(type, id) {
        return this.inventory.has(`${type}:${id}`);
    }

    removeInteractable(meshId) {
        this.interactables.delete(meshId);
    }

    dispose() {
        this.interactables.clear();
    }
}