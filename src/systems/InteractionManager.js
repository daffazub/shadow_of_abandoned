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
        this.lookThreshold = 0.92; // seberapa lurus pemain harus menghadap objek kecil (1 = tepat lurus)

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
                        `Posisi: x=${p.x.toFixed(1)}, y=${p.y.toFixed(1)}, z=${p.z.toFixed(1)}`
                    );
                }
                if (e.key.toLowerCase() === 'g') this.printGateDiagnostics();
            });
        }

        printGateDiagnostics() {
            const camera = this.scene.activeCamera;
            const vectorState = (value) => ({
                x: value?.x,
                y: value?.y,
                z: value?.z,
                hasNaN: !value || [value.x, value.y, value.z].some(Number.isNaN),
                hasZero: !value || [value.x, value.y, value.z].some((component) => component === 0),
            });
            console.group('[Debug G] Gerbang');
            console.log('Kamera:', camera ? vectorState(camera.position) : null);
            this.interactables.forEach((interactable) => {
                if (interactable.type !== 'door') return;
                const anchor = interactable.mesh;
                const pivot = anchor.metadata?.propPivot;
                const children = pivot ? pivot.getChildMeshes(false) : [];
                const bounds = pivot ? pivot.getHierarchyBoundingVectors(true) : null;
                console.group(`${anchor.id} (${interactable.data.id || 'door'})`);
                console.log('Anchor:', {
                    worldPosition: vectorState(anchor.getAbsolutePosition()),
                    visibility: anchor.visibility,
                    isVisible: anchor.isVisible,
                    enabled: anchor.isEnabled(),
                    checkCollisions: anchor.checkCollisions,
                });
                console.log('Pivot:', pivot ? {
                    position: vectorState(pivot.position),
                    scaling: vectorState(pivot.scaling),
                    rotation: vectorState(pivot.rotation),
                } : null);
                console.log('Visual world bounds:', bounds ? {
                    min: vectorState(bounds.min),
                    max: vectorState(bounds.max),
                    size: vectorState(bounds.max.subtract(bounds.min)),
                } : null);
                console.log('Visual child count:', children.length);
                children.forEach((mesh) => {
                    const material = mesh.material;
                    console.log('Visual child:', {
                        name: mesh.name,
                        isEnabled: mesh.isEnabled(),
                        isVisible: mesh.isVisible,
                        visibility: mesh.visibility,
                        material: material?.getClassName?.() || material?.name || null,
                        alphaMode: material?.alphaMode,
                        hasAlbedoTexture: Boolean(material?.albedoTexture),
                        position: vectorState(mesh.position),
                        scaling: vectorState(mesh.scaling),
                    });
                });
                console.groupEnd();
            });
            console.groupEnd();
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
        let surfaceY = pos.y;
        if (snapToFloor) {
            const downRay = new Ray(position, new Vector3(0, -1, 0), 10);
            const hit = this.scene.pickWithRay(
                downRay,
                (m) =>
                    m.isPickable &&
                    m.checkCollisions &&
                    !(m.metadata && (m.metadata.isPickup || m.metadata.isDecor))
            );
            if (hit && hit.hit && hit.pickedPoint) {
                surfaceY = hit.pickedPoint.y;
                pos.y = surfaceY + 0.25;
            }
        }
        mesh.position = pos;

        // Emissive supaya tetap terlihat samar di kegelapan
        const material = new StandardMaterial(`${id}_mat`, this.scene);
        material.diffuseColor = new Color3(0.2, 0.7, 0.2);
        material.emissiveColor = new Color3(0.1, 0.45, 0.1);
        mesh.material = material;

        this.registerInteractable(mesh, 'battery', { id, amount, spin: true });
        this.systems.propLibrary.attach('battery', mesh, { surfaceY });
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
        this.systems.propLibrary?.removeHighlight(interactable.mesh);
        const material = interactable.mesh.material;
        const propMaterials = interactable.mesh.metadata?.propOwnedMaterials || [];
        interactable.mesh.dispose();
        propMaterials.forEach((ownedMaterial) => ownedMaterial.dispose());
        material?.dispose();
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
        if (this.systems.playerController.controlsLocked || this.systems.playerController.frozen) {
            this.currentInteractable = null;
            this.updateInteractionUI(null);
            return;
        }
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

            const distance = this.getLookDistance(interactable, origin, forward);
            if (distance === null) return;

            if (distance < closestDistance) {
                closestInteractable = interactable;
                closestDistance = distance;
            }
        });

        this.updateInteractionUI(closestInteractable);
        this.currentInteractable = closestInteractable;
    }

    /**
     * Mengembalikan jarak ke objek jika pemain sedang melihatnya, atau null.
     * - Objek besar (pintu, generator): pemain harus mengarah ke permukaannya.
     * - Objek kecil (dokumen, kunci): cukup menghadap ke arahnya (lebih mudah).
     */
    getLookDistance(interactable, origin, forward) {
        const mesh = interactable.mesh;
        if (!mesh.isEnabled()) return null;

        const ext = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
        const isLarge = Math.max(ext.x, ext.y, ext.z) > 0.8;

        if (isLarge) {
            const ray = new Ray(origin, forward, this.interactionRange + 0.5);
            const hit = this.scene.pickWithRay(
                ray,
                (m) => m.isPickable && m.isEnabled() && m.isVisible
            );
            if (hit && hit.hit && hit.pickedMesh === mesh && hit.distance <= this.interactionRange) {
                return hit.distance;
            }
            return null;
        }

        const target = mesh.getAbsolutePosition();
        const toTarget = target.subtract(origin);
        const distance = toTarget.length();
        if (distance > this.interactionRange || distance < 0.001) return null;

        const dir = toTarget.scale(1 / distance);
        if (Vector3.Dot(forward, dir) < this.lookThreshold) return null;
        if (!this.hasLineOfSight(origin, dir, distance, mesh)) return null;

        return distance;
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
            case 'door': {
                const d = interactable.data;
                if (!d.locked) return 'Press E to open';
                if (this.hasItem('key', d.keyId)) return 'Press E to unlock';
                return d.requiresName ? `Locked - needs ${d.requiresName}` : 'Locked';
            }
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
        if (this.systems.playerController?.controlsLocked || this.systems.playerController?.frozen || !this.currentInteractable || !this.currentInteractable.isActive) return false;

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
        const data = interactable.data;

        if (data.locked) {
            if (this.hasItem('key', data.keyId)) {
                data.locked = false;
                this.systems.eventSystem.emit('door_unlocked', data);
                this.showMessage('Unlocked');
                // lanjut membuka pintu di bawah
            } else {
                this.systems.audioManager.playSound('door_locked');
                this.showMessage(
                    data.requiresName ? `Locked - you need the ${data.requiresName}` : 'The door is locked'
                );
                return false;
            }
        }

        this.systems.audioManager.playSound('door_creak');
        this.systems.eventSystem.emit('door_opened', data);
        this.openDoor(interactable);
        return true;
    }

    // Pintu bergeser naik ke atas, lalu hilang. Tabrakan dimatikan seketika
    // supaya pemain bisa lewat dan tidak tersangkut di pintu yang berputar.
    openDoor(interactable) {
        const mesh = interactable.mesh;
        interactable.isActive = false;
        interactable.data.isOpen = true;
        mesh.checkCollisions = false;

        const startY = mesh.position.y;
        const height = (interactable.data.size && interactable.data.size.h) || 3;
        const endY = startY + height + 0.2;
        let t = 0;

        const observer = this.scene.onBeforeRenderObservable.add(() => {
            if (mesh.isDisposed()) {
                this.scene.onBeforeRenderObservable.remove(observer);
                return;
            }
            t += this.scene.getEngine().getDeltaTime() / 1000 / 1.2;
            const k = Math.min(1, t);
            const eased = 1 - Math.pow(1 - k, 3);
            mesh.position.y = startY + (endY - startY) * eased;
            if (k >= 1) {
                this.scene.onBeforeRenderObservable.remove(observer);
                mesh.setEnabled(false);
            }
        });
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
        this.showMessage(`Picked up: ${interactable.data.name || 'key'}`);

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
        this.currentInteractable = null;
    }
}