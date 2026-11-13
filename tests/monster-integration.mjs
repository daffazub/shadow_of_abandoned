import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    Animation, AnimationGroup, AssetContainer, Mesh, MeshBuilder, NullEngine, Quaternion, Ray, Scene,
    SceneLoader, StandardMaterial, UniversalCamera, Vector3, VertexBuffer,
} from '@babylonjs/core';
import { MonsterManager, MONSTER_CONFIG } from '../src/systems/MonsterManager.js';
import { EventSystem } from '../src/systems/EventSystem.js';
import { SceneManager } from '../src/systems/SceneManager.js';
import { EnvironmentManager } from '../src/systems/EnvironmentManager.js';
import '@babylonjs/loaders/glTF/index.js';

function closeTo(actual, expected, epsilon = 1e-6) {
    assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should equal ${expected}`);
}

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function model(scene, { transformed = false, animated = false } = {}) {
    const container = new AssetContainer(scene);
    const root = new Mesh('gltf_conversion_root', scene);
    if (transformed) {
        root.position.set(4, 3, -7);
        root.scaling.set(-1, 2, 1);
        root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), 0.6);
    }
    const body = MeshBuilder.CreateBox('smiley_geometry', { width: 1, height: 4, depth: 0.5, updatable: true }, scene);
    body.parent = root;
    body.position.set(10, 8, -12);
    const material = new StandardMaterial('smiley_material', scene);
    body.material = material;
    container.rootNodes.push(root);
    container.meshes.push(root, body);
    container.materials.push(material);
    let group;
    if (animated) {
        const animation = new Animation('idle', 'position.y', 30, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CYCLE);
        animation.setKeys([{ frame: 0, value: 8 }, { frame: 30, value: 8.1 }]);
        group = new AnimationGroup('smiley_idle', scene);
        group.addTargetedAnimation(animation, body);
        container.animationGroups.push(group);
    }
    container.removeAllFromScene();
    return { container, root, body, material, group };
}

function harness(t, { floor = true, loader, mockImports = true } = {}) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const listeners = new Map();
    const document = {
        hidden: false,
        addEventListener(name, callback) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(callback);
        },
        removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
        key(key) { for (const callback of listeners.get('keydown') || []) callback({ key }); },
        // Capture must delegate to the game's ending, never build its own overlay.
        createElement() { assert.fail('Monster must not create a caught/reload overlay'); },
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new UniversalCamera('player', new Vector3(0, 1.8, 0), scene);
    const events = [];
    const audio = [];
    const eventSystem = new EventSystem();
    eventSystem.on('ending_requested', (data) => events.push(data));
    const systems = {
        eventSystem,
        playerController: {
            controlsLocked: false, frozen: false, flashlightEnabled: false,
            batteryLevel: 100, flashlight: { intensity: 1 }, resets: 0,
            resetInput() { this.resets++; },
        },
        sceneManager: {
            currentScene: 'restricted_area', safeZones: [], isTransitioning: false,
            findFloorY(x, z) {
                const hit = scene.pickWithRay(new Ray(new Vector3(x, 3, z), Vector3.Down(), 20),
                    (mesh) => mesh.metadata?.isFloor && mesh.isEnabled());
                return hit?.hit ? hit.pickedPoint.y : null;
            },
        },
        audioManager: Object.fromEntries(['playSound', 'playAmbient', 'stopAmbient'].map((name) => [
            name, (...args) => audio.push([name, ...args]),
        ])),
        interactionManager: { interactables: new Map() },
    };
    function solid(name, size, position, metadata = {}) {
        const mesh = MeshBuilder.CreateBox(name, size, scene);
        mesh.position.copyFrom(position);
        mesh.checkCollisions = true;
        mesh.metadata = metadata;
        mesh.computeWorldMatrix(true);
        return mesh;
    }
    const ground = floor ? solid('floor', { width: 80, depth: 80, height: 0.2 }, new Vector3(0, -0.1, 0), { isFloor: true }) : null;
    const imported = [];
    const load = t.mock.method(SceneLoader, 'LoadAssetContainerAsync', (path, file, target) => {
        assert.equal(path, '/assets/models/monster/');
        assert.equal(file, 'smiley_monster.glb');
        assert.equal(target, scene);
        if (loader) return loader(scene);
        const asset = model(scene);
        imported.push(asset);
        return Promise.resolve(asset.container);
    });
    if (mockImports) t.mock.method(SceneLoader, 'ImportMeshAsync', () => assert.fail('No second ghost model import'));
    t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected network fetch'));
    const monster = new MonsterManager(scene, systems);
    systems.monsterManager = monster;
    t.after(() => {
        monster.dispose();
        eventSystem.stopStoryTimers();
        scene.dispose();
        engine.dispose();
        if (previous) Object.defineProperty(globalThis, 'document', previous);
        else delete globalThis.document;
    });
    function tick(seconds, dt = 0.05) {
        const count = Math.round(seconds / dt);
        for (let i = 0; i < count; i++) monster.update(dt);
    }
    async function chase({ delay = 0, freeze = 0 } = {}) {
        monster.cfg.spawnDelay = delay;
        monster.cfg.spawnFreezeTime = freeze;
        monster.startChase();
        await monster.preload();
        await Promise.resolve();
        tick(delay + 0.05);
        if (monster.state === 'spawning') tick(freeze + 0.05);
        assert.equal(monster.state, 'chasing');
    }
    return { monster, scene, systems, events, audio, document, listeners, ground, solid, load, imported, tick, chase };
}

// Only browser text rasterization and model IO are replaced. Scene creation,
// corridor placement, floor picking, lighting, pursuit delegation and cleanup stay real.
class TestCanvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.context = {
            canvas: this, font: '', measureText: (text) => ({ width: text.length * 24 }),
            clearRect() {}, fillRect() {}, fillText() {}, save() {}, restore() {},
            translate() {}, scale() {}, drawImage() {},
        };
    }
    getContext() { return this.context; }
}

function corridorHarness(t, { loader, beforeCorridorImport = async () => {} } = {}) {
    const importMesh = SceneLoader.ImportMeshAsync.bind(SceneLoader);
    const h = harness(t, { floor: false, loader, mockImports: false });
    const { scene, systems } = h;
    h.document.createElement = (tag) => {
        assert.equal(tag, 'canvas', 'Only text canvases, never caught overlays, are allowed');
        return new TestCanvas(1, 1);
    };
    const oldCanvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: TestCanvas });
    t.after(() => oldCanvas ? Object.defineProperty(globalThis, 'OffscreenCanvas', oldCanvas) : delete globalThis.OffscreenCanvas);
    const interaction = systems.interactionManager;
    Object.assign(interaction, {
        registerInteractable(mesh, type, data) { this.interactables.set(mesh.uniqueId, { mesh, type, data }); },
        spawnBattery(position) {
            const mesh = MeshBuilder.CreateBox('battery', { size: 0.1 }, scene);
            mesh.position.copyFrom(position);
            return mesh;
        },
        showMessage() {}, updateInteractionUI() {}, dispose() { this.interactables.clear(); },
    });
    systems.propLibrary = {
        async preload() {}, attach() { return null; }, getFittedSize() { return null; }, removeHighlight() {},
    };
    const environment = Object.assign(Object.create(EnvironmentManager.prototype), {
        scene, systems, lights: [], particleSystems: [], lightIntervals: new Set(), lightTimeouts: new Set(),
        flickerInterval: null, powerRestored: false,
    });
    systems.environmentManager = environment;
    const manager = Object.assign(Object.create(SceneManager.prototype), {
        scene, systems, currentScene: null, sceneData: new Map(), sceneObjects: [],
        environmentMeshes: [], safeZones: [], triggerObservers: [], objectCounter: 0,
        tableMaterial: null, levelBuilder: null, isTransitioning: false,
    });
    systems.sceneManager = manager;
    manager.initializeScenes();
    manager.initializeStoryScenes();
    const observer = SceneLoader.OnPluginActivatedObservable.add((plugin) => { plugin.skipMaterials = true; });
    const data = `data:base64,${readFileSync(new URL('../public/assets/models/corridor_baru.glb', import.meta.url)).toString('base64')}`;
    const corridors = [];
    t.mock.method(SceneLoader, 'ImportMeshAsync', async (...args) => {
        assert.deepEqual(args.slice(0, 3), ['', '/assets/models/', 'corridor_baru.glb']);
        assert.equal(args[3], scene);
        await beforeCorridorImport();
        const result = await importMesh('', '', data, scene, undefined, '.glb');
        corridors.push(result);
        return result;
    });
    // Release plugin hooks and any remaining story lights.
    t.after(() => {
        SceneLoader.OnPluginActivatedObservable.remove(observer);
        environment.dispose();
    });
    return { ...h, manager, environment, corridors };
}

test('floor helper rejection is authoritative; geometric fallback is only for an absent helper', async (t) => {
    const h = harness(t);
    h.systems.sceneManager.findFloorY = () => null;
    assert.equal(h.monster.floorAt(0, 0), null, 'Do not override a rejected floor with another ray');
    h.monster.cfg.spawnDelay = 0;
    h.monster.startChase();
    await h.monster.preload();
    await Promise.resolve();
    h.tick(1);
    assert.equal(h.monster.state, 'pending', 'A helper-rejected floor cannot host a spawn');
    assert.equal(h.monster.pivot.isEnabled(), false);
    h.systems.sceneManager.findFloorY = undefined;
    closeTo(h.monster.floorAt(0, 0), 0);
    h.tick(0.6);
    assert.equal(h.monster.state, 'spawning', 'Real geometry can support scenes without a helper');
});

test('background monster load completing during actual corridor import remains owned across clear/reload', async (t) => {
    const monsterLoad = deferred();
    const importStarted = deferred();
    const releaseImport = deferred();
    const h = corridorHarness(t, {
        loader: () => monsterLoad.promise,
        beforeCorridorImport: async () => { importStarted.resolve(); await releaseImport.promise; },
    });
    const preload = h.monster.preload();
    const sceneLoad = h.manager.loadScene('restricted_area');
    await importStarted.promise;
    const asset = model(h.scene, { transformed: true, animated: true });
    monsterLoad.resolve(asset.container);
    assert.equal(await preload, true);
    assert.equal(h.manager.currentScene, null, 'Corridor import is still pending');
    assert.ok(h.scene.meshes.includes(asset.body));
    assert.equal(asset.body.isEnabled(), false);
    releaseImport.resolve();
    assert.equal(await sceneLoad, true);
    assert.equal(h.corridors.length, 1);
    assert.equal(h.monster.state, 'pending', 'loadScene starts the real delegated pursuit');
    const owned = [...h.manager.environmentMeshes, ...h.manager.sceneObjects];
    for (const mesh of h.monster.meshSet) assert.ok(!owned.includes(mesh), 'Background model is not environment geometry');
    const pivot = h.monster.pivot;
    const fit = h.monster.fit;
    h.manager.clearScene();
    assert.ok(owned.every((mesh) => mesh.isDisposed()));
    assert.equal(asset.root.isDisposed(), false);
    assert.equal(asset.body.isDisposed(), false);
    assert.equal(pivot.isDisposed(), false);
    assert.equal(fit.isDisposed(), false);
    assert.ok(h.scene.materials.includes(asset.material));
    assert.ok(h.scene.animationGroups.includes(asset.group));
    assert.equal(h.monster.state, 'dormant');
    assert.equal(asset.body.isEnabled(), false);
    assert.equal(await h.manager.loadScene('experiment_lab'), true);
    assert.equal(h.load.mock.callCount(), 1, 'Scene reload reuses the same monster container');
    assert.equal(h.monster.pivot, pivot);
    assert.equal(h.monster.state, 'pending');
    assert.equal(asset.body.isDisposed(), false);
    h.manager.clearScene();
});

for (const name of ['restricted_area', 'experiment_lab']) {
    test(`${name}: actual transformed corridor supports delegated startup, floor-safe spawn and navigation`, async (t) => {
        const h = corridorHarness(t);
        const { monster, manager, scene } = h;
        assert.equal(await manager.loadScene(name), true);
        await monster.preload();
        await Promise.resolve();
        assert.equal(monster.state, 'pending');
        assert.ok(h.corridors[0].meshes.some((mesh) => mesh.getTotalVertices() > 0));
        assert.equal(scene.getMeshByName(`${name}_floor`), null, 'No procedural fallback floor');
        const wrapper = h.corridors[0].meshes[0].parent;
        assert.deepEqual(wrapper.position.asArray(), [-5.225, -2.52, 5]);
        closeTo(wrapper.rotation.y, -Math.PI / 2);
        closeTo(monster.floorAt(scene.activeCamera.position.x, scene.activeCamera.position.z), 0, 0.01);
        h.tick(MONSTER_CONFIG.spawnDelay + 0.1);
        assert.equal(monster.state, 'spawning', 'Use default distances and the actual floor helper');
        const spawn = monster.pivot.position.clone();
        closeTo(spawn.y, 0, 0.01);
        closeTo(monster.validFloor(spawn, 0), spawn.y, 0.01);
        assert.equal(monster.isLineBlocked(new Vector3(0, spawn.y, 2), spawn), false);
        assert.equal(monster.pivot.isEnabled(), false, 'Initial safe light hides even a spawned monster');
        h.tick(MONSTER_CONFIG.spawnFreezeTime + 0.1);
        assert.equal(monster.state, 'chasing');
        assert.equal(monster.isMoveBlocked(Vector3.Right(), 2), true, 'Source side-wall geometry obstructs body rays');
        scene.activeCamera.position.set(0, 1.8, 4.5);
        assert.equal(monster.isProtected(), false, 'Test navigation in the real gap between safe zones');
        const before = Vector3.Distance(monster.pivot.position, new Vector3(0, spawn.y, 4.5));
        h.tick(0.5);
        const after = Vector3.Distance(monster.pivot.position, new Vector3(0, spawn.y, 4.5));
        assert.ok(after < before - 0.5, `Chase must advance through the corridor: ${before} -> ${after}`);
        assert.ok(Math.abs(monster.pivot.position.x) < 1.05, 'Body remains inside the corridor walls');
        closeTo(monster.floorY, manager.findFloorY(monster.pivot.position.x, monster.pivot.position.z), 0.01);
        assert.equal(monster.pivot.isEnabled(), true);
        assert.equal(h.events.length, 0);
        manager.clearScene();
        assert.equal(monster.state, 'dormant');
        assert.equal(monster.pivot.isEnabled(), false);
        assert.ok([...monster.meshSet].every((mesh) => !mesh.isDisposed()));
    });
}

test('preload is single, hidden and dormant; corridor gate only preloads', async (t) => {
    const h = harness(t);
    h.systems.sceneManager.currentScene = 'horror_scene';
    h.monster.onDoorOpened({ id: 'unrelated' });
    assert.equal(h.load.mock.callCount(), 0);
    h.monster.onDoorOpened({ id: 'restricted_gate' });
    const promise = h.monster.preload();
    assert.equal(h.monster.preload(), promise);
    await promise;
    assert.equal(h.load.mock.callCount(), 1);
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.monster.pivot.isEnabled(), false);
    for (const mesh of h.monster.meshSet) {
        assert.equal(mesh.isEnabled(), false);
        assert.ok(h.scene.meshes.includes(mesh), 'Loaded geometry must actually be in the scene');
    }
    h.monster.startChase();
    h.document.key('h');
    assert.equal(h.monster.state, 'dormant');
    h.systems.sceneManager.currentScene = 'experiment_lab';
    h.monster.startChase();
    assert.equal(h.monster.state, 'pending');
});

test('flashlight needs switch, battery AND actual intensity; safe zones hide all geometry', async (t) => {
    const h = harness(t);
    await h.chase();
    const { monster, systems } = h;
    const player = systems.playerController;
    monster.cfg.chaseSpeed = 0;
    monster.cfg.catchUpSpeed = 0;
    monster.darkExposure = 4;
    player.flashlightEnabled = true;
    h.tick(1);
    closeTo(monster.darkExposure, 2);
    assert.equal(monster.pivot.isEnabled(), false);
    for (const mesh of monster.meshSet) assert.equal(mesh.isEnabled(), false);
    for (const [enabled, battery, intensity] of [[false, 100, 1], [true, 0, 1], [true, 100, 0.1], [true, 100, 0]]) {
        player.flashlightEnabled = enabled;
        player.batteryLevel = battery;
        player.flashlight.intensity = intensity;
        monster.update(0.1);
        assert.equal(monster.pivot.isEnabled(), true);
    }
    closeTo(monster.darkExposure, 2.4);
    systems.sceneManager.safeZones.push({ position: Vector3.Zero(), radius: 2 });
    monster.pivot.position.set(0, 0, 0.5);
    monster.darkExposure = 20;
    monster.update(0.1);
    assert.equal(monster.pivot.isEnabled(), false);
    closeTo(monster.darkExposure, 19.8);
    assert.equal(h.events.length, 0);
    h.tick(12);
    closeTo(monster.darkExposure, 0);
});

test('capture requires eight seconds of darkness and proximity, emits C once and resets/freezes player', async (t) => {
    const h = harness(t);
    await h.chase();
    const { monster, systems } = h;
    monster.cfg.chaseSpeed = 0;
    monster.cfg.catchUpSpeed = 0;
    monster.darkExposure = 7.8;
    monster.pivot.position.set(0, 0, 1);
    monster.update(0.1);
    assert.equal(h.events.length, 0, 'Proximity alone is not capture');
    monster.pivot.position.z = 3;
    h.tick(1);
    assert.equal(h.events.length, 0, 'Exposure alone is not capture');
    monster.pivot.position.z = MONSTER_CONFIG.catchDistance;
    monster.update(0.05);
    assert.deepEqual(h.events, [{ ending: 'C' }]);
    assert.equal(systems.playerController.frozen, true);
    assert.equal(systems.playerController.controlsLocked, true);
    assert.equal(systems.playerController.resets, 1);
    assert.equal(monster.pivot.isEnabled(), false);
    h.tick(10);
    monster.onCaught();
    monster.despawn();
    systems.playerController.frozen = false;
    systems.playerController.controlsLocked = false;
    h.document.key('h');
    monster.startChase();
    assert.equal(monster.state, 'dormant');
    assert.equal(h.events.length, 1);
});

test('capture cannot cross a wall even within catch distance', async (t) => {
    const h = harness(t);
    await h.chase();
    h.solid('separating_wall', { width: 8, depth: 0.1, height: 3 }, new Vector3(0, 1.5, 0.45));
    h.monster.pivot.position.set(0, 0, 0.9);
    h.monster.cfg.chaseSpeed = 0;
    h.monster.darkExposure = 10;
    h.monster.update(0.1);
    assert.equal(h.events.length, 0);
});

test('document, transition, locked and frozen pause every pending/spawning/chasing timer', async (t) => {
    const h = harness(t);
    const { monster, systems, document } = h;
    monster.cfg.spawnDelay = 1;
    monster.cfg.spawnFreezeTime = 1;
    // SceneManager can request pursuit while transition controls are still locked.
    systems.playerController.controlsLocked = true;
    monster.startChase();
    await monster.preload();
    await Promise.resolve();
    assert.equal(monster.state, 'pending');
    const switches = [
        [systems.playerController, 'controlsLocked'], [systems.playerController, 'frozen'],
        [systems.sceneManager, 'isTransitioning'], [document, 'hidden'],
    ];
    systems.playerController.controlsLocked = false;
    function assertPaused() {
        const snapshot = [monster.timer, monster.time, monster.darkExposure, monster.stuckTimer,
            monster.growlTimer, monster.heartbeatTimer, ...monster.pivot.position.asArray(), monster.bob.position.y];
        for (const [object, key] of switches) {
            object[key] = true;
            h.tick(2);
            assert.deepEqual([monster.timer, monster.time, monster.darkExposure, monster.stuckTimer,
                monster.growlTimer, monster.heartbeatTimer, ...monster.pivot.position.asArray(), monster.bob.position.y], snapshot, key);
            object[key] = false;
        }
    }
    assertPaused();
    h.tick(1.05);
    assert.equal(monster.state, 'spawning');
    assertPaused();
    h.tick(1.05);
    assert.equal(monster.state, 'chasing');
    assertPaused();
    const before = monster.pivot.position.clone();
    monster.update(0.05);
    assert.ok(Vector3.Distance(before, monster.pivot.position) > 0);
});

test('late resolving load while hidden cannot spawn until update resumes', async (t) => {
    const pending = deferred();
    const h = harness(t, { loader: () => pending.promise });
    h.monster.cfg.spawnDelay = 0;
    h.monster.startChase();
    h.document.hidden = true;
    const asset = model(h.scene);
    pending.resolve(asset.container);
    await h.monster.preload();
    await Promise.resolve();
    h.tick(2);
    assert.equal(h.monster.state, 'pending');
    assert.equal(h.monster.pivot.isEnabled(), false);
    h.document.hidden = false;
    h.monster.update(0.05);
    assert.equal(h.monster.state, 'spawning');
});

test('directional body-height rays steer along walls instead of crossing them', async (t) => {
    const h = harness(t);
    await h.chase();
    const { monster, scene } = h;
    monster.pivot.position.set(0, 0, 0);
    monster.floorY = 0;
    monster.lastPos.copyFrom(monster.pivot.position);
    scene.activeCamera.position.set(8, 1.8, 5);
    const wall = h.solid('navigation_wall', { width: 0.2, height: 3, depth: 40 }, new Vector3(0.75, 1.5, 0));
    assert.equal(monster.isMoveBlocked(Vector3.Right(), 1), true);
    const direction = monster.pickDirection(new Vector3(1, 0, 1).normalize(), 0.2);
    assert.ok(direction && direction.z > 0);
    assert.equal(monster.isMoveBlocked(direction, 0.7), false);
    h.tick(2);
    assert.ok(monster.pivot.position.x < wall.position.x - 0.1, 'No wall crossing');
    assert.ok(monster.pivot.position.z > 0.5, 'Steering makes progress along wall');
    // A chest-height obstacle must still be detected even when the low ray clears.
    wall.dispose();
    monster.pivot.position.set(0, 0, 0);
    h.solid('upper_obstacle', { width: 0.2, height: 0.4, depth: 3 }, new Vector3(0.8, 1.4, 0));
    assert.equal(monster.isMoveBlocked(Vector3.Right(), 1), true);
});

test('movement never overshoots or steps off the floor; pickup geometry is ignored', async (t) => {
    const h = harness(t);
    await h.chase();
    const { monster, scene } = h;
    monster.pivot.position.set(0, 0, 0.01);
    monster.darkExposure = 0;
    monster.update(0.1);
    closeTo(monster.pivot.position.z, 0.01);
    monster.pivot.position.set(0, 0, 0);
    h.solid('pickup', { size: 1 }, new Vector3(0.7, 1, 0), { isPickup: true });
    assert.equal(monster.isMoveBlocked(Vector3.Right(), 1), false);
    h.ground.dispose();
    h.solid('small_platform', { width: 2, depth: 2, height: 0.2 }, new Vector3(0, -0.1, 0), { isFloor: true });
    scene.activeCamera.position.set(10, 1.8, 0);
    h.tick(2);
    assert.ok(monster.pivot.position.x <= 0.5 + 1e-6, 'Whole body stays supported');
    assert.equal(h.events.length, 0);
});

test('spawn has valid floor fallbacks, rejects blocked candidates and never invents a floor', async (t) => {
    const h = harness(t, { floor: false });
    const { monster, systems } = h;
    monster.cfg.spawnDelay = 0;
    monster.startChase();
    await monster.preload();
    await Promise.resolve();
    h.tick(1);
    assert.equal(monster.state, 'pending');
    assert.equal(monster.pivot.isEnabled(), false);
    assert.equal(monster.findSpawnPoint(h.scene.activeCamera.position, Vector3.Zero(), Vector3.Forward()), null);
    h.solid('player_platform', { width: 4, depth: 4, height: 0.2 }, new Vector3(0, -0.1, 0), { isFloor: true });
    h.solid('fallback_platform', { width: 4, depth: 3, height: 0.2 }, new Vector3(0, -0.1, -8), { isFloor: true });
    const fallback = monster.findSpawnPoint(h.scene.activeCamera.position, Vector3.Zero(), Vector3.Forward());
    assert.ok(fallback);
    closeTo(fallback.z, -8);
    h.solid('low_wall', { width: 10, depth: 0.3, height: 1 }, new Vector3(0, 0.5, -4));
    assert.equal(monster.findSpawnPoint(h.scene.activeCamera.position, Vector3.Zero(), Vector3.Forward()), null,
        'A wall below camera height still blocks spawning');
    // With no scene helper, the fallback must also use actual geometry.
    systems.sceneManager.findFloorY = undefined;
    closeTo(monster.floorAt(0, -8), 0);
    assert.equal(monster.floorAt(20, 20), null);
});

test('stuck recovery does not teleport through a wall or into missing floor', async (t) => {
    const h = harness(t);
    await h.chase();
    const { monster } = h;
    monster.pivot.position.set(0, 0, -9);
    monster.lastPos.copyFrom(monster.pivot.position);
    h.solid('recovery_wall', { width: 80, depth: 0.2, height: 3 }, new Vector3(0, 1.5, -8.5));
    monster.stuckTimer = 2.6;
    const before = monster.pivot.position.clone();
    monster.checkStuck(0.05, 0.2);
    assert.deepEqual(monster.pivot.position.asArray(), before.asArray());
    h.ground.dispose();
    monster.stuckTimer = 2.6;
    monster.checkStuck(0.05, 0.2);
    assert.deepEqual(monster.pivot.position.asArray(), before.asArray());
});

test('despawn during async load cannot resurrect; restart uses only the latest anchor/token', async (t) => {
    const pending = deferred();
    const h = harness(t, { loader: () => pending.promise });
    const { monster } = h;
    monster.cfg.spawnDelay = 0;
    monster.startChase(new Vector3(10, 0, 0));
    const firstToken = monster.chaseToken;
    monster.despawn();
    monster.startChase(new Vector3(0, 0, -3));
    assert.ok(monster.chaseToken > firstToken);
    const asset = model(h.scene);
    pending.resolve(asset.container);
    await monster.preload();
    await Promise.resolve();
    assert.equal(monster.state, 'pending', 'Loading itself never spawns');
    assert.equal(monster.pivot.isEnabled(), false);
    assert.equal(monster.readyToken, monster.chaseToken);
    monster.update(0.05);
    assert.equal(monster.state, 'spawning');
    assert.ok(monster.pivot.position.z < -3, 'Latest anchor is used');
    assert.equal(h.load.mock.callCount(), 1);
    monster.despawn();
    h.tick(10);
    assert.equal(monster.state, 'dormant');
    assert.equal(monster.pivot.isEnabled(), false);
});

test('load resolved after despawn stays hidden until an explicit restart', async (t) => {
    const pending = deferred();
    const h = harness(t, { loader: () => pending.promise });
    h.monster.startChase();
    h.monster.despawn();
    pending.resolve(model(h.scene).container);
    await h.monster.preload();
    await Promise.resolve();
    h.tick(2);
    assert.equal(h.monster.readyToken, null);
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.monster.pivot.isEnabled(), false);
    await h.chase();
    assert.equal(h.load.mock.callCount(), 1);
});

test('GLTF normalization preserves root transforms and fits refreshed vertices, not empty roots', async (t) => {
    let asset;
    const h = harness(t, { loader(scene) {
        asset = model(scene, { transformed: true });
        // Deliberately leave stale geometry bounds as a real loader/vertex edit can.
        const positions = asset.body.getVerticesData(VertexBuffer.PositionKind);
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] += 20;
            positions[i + 1] *= 2;
        }
        asset.body.updateVerticesData(VertexBuffer.PositionKind, positions, false);
        return Promise.resolve(asset.container);
    } });
    await h.monster.preload();
    assert.equal(asset.material.maxSimultaneousLights, 10);
        assert.equal(asset.root.parent, h.monster.fit);
    assert.equal(asset.body.parent, asset.root);
    assert.deepEqual(asset.root.position.asArray(), [4, 3, -7]);
    assert.deepEqual(asset.root.scaling.asArray(), [-1, 2, 1]);
    assert.deepEqual(asset.root.rotationQuaternion.asArray(), Quaternion.RotationAxis(Vector3.Up(), 0.6).asArray());
    closeTo(h.monster.scaleFactor, 2.3 / 16);
    const bounds = h.monster.getBounds(asset.container.meshes);
    closeTo(bounds.max.y - bounds.min.y, MONSTER_CONFIG.height);
    closeTo(bounds.min.y, 0);
    closeTo(bounds.min.x + bounds.max.x, 0);
    closeTo(bounds.min.z + bounds.max.z, 0);
    assert.equal(h.monster.pivot.isEnabled(), false);
    h.monster.dispose();
    assert.equal(asset.root.isDisposed(), true);
    assert.equal(asset.body.isDisposed(), true);
    assert.equal(h.scene.materials.includes(asset.material), false);
});

test('load failure produces an owned hidden fallback with the same light/capture rules', async (t) => {
    const h = harness(t, { loader: async () => { throw new Error('decoder unavailable'); } });
    const warnings = t.mock.method(console, 'warn', () => {});
    await h.monster.preload();
    assert.equal(warnings.mock.callCount(), 1);
    assert.equal(h.monster.usingPlaceholder, true);
    assert.equal(h.monster.pivot.isEnabled(), false);
    const body = [...h.monster.meshSet][0];
    const material = body.material;
    assert.equal(material.maxSimultaneousLights, 10);
    await h.chase();
    h.systems.playerController.flashlightEnabled = true;
    h.monster.pivot.position.set(0, 0, 0.5);
    h.monster.darkExposure = 10;
    h.monster.update(0.1);
    assert.equal(body.isEnabled(), false);
    assert.equal(h.events.length, 0);
    h.monster.despawn();
    h.monster.dispose();
    h.monster.dispose();
    assert.equal(body.isDisposed(), true);
    assert.equal(h.scene.materials.includes(material), false);
    assert.equal(h.listeners.get('keydown').size, 0);
});

test('dispose owns late load cleanup, including rejection, without fallback resurrection', async (t) => {
    const pending = deferred();
    const h = harness(t, { loader: () => pending.promise });
    const promise = h.monster.preload();
    const asset = model(h.scene);
    h.monster.dispose();
    pending.resolve(asset.container);
    assert.equal(await promise, false);
    assert.equal(asset.body.isDisposed(), true);
    assert.equal(asset.root.isDisposed(), true);
    assert.equal(h.monster.meshSet.size, 0);
    assert.equal(h.listeners.get('keydown').size, 0);
    assert.equal(h.systems.eventSystem.listeners.get('game_ended').length, 0);
    assert.equal(await h.monster.preload(), false);
});

test('a rejected late load is handled after dispose', async (t) => {
    const pending = deferred();
    const h = harness(t, { loader: () => pending.promise });
    const promise = h.monster.preload();
    h.monster.dispose();
    pending.reject(new Error('late decoder rejection'));
    assert.equal(await promise, false);
    assert.equal(h.monster.usingPlaceholder, false);
    assert.equal(h.monster.meshSet.size, 0);
});

test('safe spawning remains hidden and actual model animations pause/resume with the runtime', async (t) => {
    let asset;
    const h = harness(t, { loader(scene) {
        asset = model(scene, { animated: true });
        return Promise.resolve(asset.container);
    } });
    const { monster, systems } = h;
    systems.playerController.flashlightEnabled = true;
    monster.cfg.spawnDelay = 0;
    monster.cfg.spawnFreezeTime = 1;
    monster.startChase();
    await monster.preload();
    await Promise.resolve();
    monster.update(0.05);
    assert.equal(monster.state, 'spawning');
    assert.equal(asset.body.isEnabled(), false);
    assert.equal(!!asset.group.isPlaying, false);
    closeTo(monster.darkExposure, 0);
    systems.playerController.flashlightEnabled = false;
    monster.update(0.05);
    assert.equal(asset.body.isEnabled(), true);
    assert.equal(asset.group.isPlaying, true);
    systems.playerController.controlsLocked = true;
    monster.update(0.05);
    assert.equal(asset.group.isPlaying, false);
    systems.playerController.controlsLocked = false;
    monster.update(0.05);
    assert.equal(asset.group.isPlaying, true);
    monster.despawn();
    assert.equal(asset.group.isStarted, false);
    assert.equal(asset.body.isEnabled(), false);
    monster.dispose();
    assert.equal(h.scene.animationGroups.includes(asset.group), false);
});

test('debug never unlocks the player or starts after ending; leaving story cancels pursuit', async (t) => {
    const h = harness(t);
    h.systems.playerController.controlsLocked = true;
    h.document.key('h');
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.systems.playerController.controlsLocked, true);
    h.systems.playerController.controlsLocked = false;
    h.systems.playerController.frozen = true;
    h.document.key('h');
    assert.equal(h.monster.state, 'dormant');
    h.systems.playerController.frozen = false;
    await h.chase();
    h.systems.sceneManager.currentScene = 'horror_scene';
    h.monster.update(0.05);
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.monster.pivot.isEnabled(), false);
    h.systems.sceneManager.currentScene = 'experiment_lab';
    h.systems.eventSystem.emit('game_ended', { ending: 'B' });
    h.document.key('h');
    h.monster.startChase();
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.monster.ended, true);
});
