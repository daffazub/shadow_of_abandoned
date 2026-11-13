import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    NullEngine, Scene, UniversalCamera, Vector3, Quaternion, Mesh,
    MeshBuilder, SceneLoader, Ray, VertexBuffer,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { SceneManager } from '../src/systems/SceneManager.js';
import * as StoryAreas from '../src/systems/StoryAreas.js';

const AREA_NAMES = ['restricted_area', 'experiment_lab'];
const SAFE_Z = { restricted_area: [2, 7, 11.5], experiment_lab: [2, 11.5] };
const assetURL = new URL('../public/assets/models/corridor_baru.glb', import.meta.url);

// Keep Babylon's DynamicTexture/material lifetime real; only rasterization is stubbed.
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

function harness(t) {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network fetch'); });
    for (const [name, value] of [
        ['OffscreenCanvas', TestCanvas],
        ['document', { createElement: () => new TestCanvas(1, 1) }],
    ]) {
        const old = Object.getOwnPropertyDescriptor(globalThis, name);
        Object.defineProperty(globalThis, name, { configurable: true, value });
        t.after(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
    }
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new UniversalCamera('player', new Vector3(0, 1.8, 2), scene);
    const interactables = new Map();
    const batteryProbes = [];
    const interaction = {
        interactables, currentInteractable: null,
        registerInteractable(mesh, type, data) { interactables.set(mesh.uniqueId, { mesh, type, data }); },
        spawnBattery(position) {
            batteryProbes.push(position.clone());
            const mesh = MeshBuilder.CreateBox('battery', { size: 0.1 }, scene);
            mesh.position.copyFrom(position);
            return mesh;
        },
        showMessage() {}, updateInteractionUI() {}, dispose() { interactables.clear(); },
    };
    const systems = {
        interactionManager: interaction,
        playerController: { controlsLocked: false },
        environmentManager: { setupStoryLighting() {}, startEntityPursuit() {}, stopEntityPursuit() {} },
        propLibrary: { async preload() {}, attach() { return false; }, getFittedSize() { return null; }, removeHighlight() {} },
        eventSystem: { emit() {} },
        audioManager: { playAmbient() {}, stopAmbient() {} },
    };
    const manager = Object.assign(Object.create(SceneManager.prototype), {
        scene, systems, currentScene: null, sceneData: new Map(), sceneObjects: [],
        environmentMeshes: [], safeZones: [], triggerObservers: [], objectCounter: 0,
        tableMaterial: null, levelBuilder: null, isTransitioning: false,
    });
    systems.sceneManager = manager;
    manager.initializeScenes();
    manager.initializeStoryScenes();
    t.after(() => { scene.dispose(); engine.dispose(); });
    return { scene, manager, interaction, batteryProbes };
}

function near(actual, expected, label, epsilon = 0.0001) {
    assert.ok(Math.abs(actual - expected) < epsilon, `${label}: ${actual} ~= ${expected}`);
}

function nearVector(actual, expected, label, epsilon) {
    actual.asArray().forEach((value, axis) => near(value, expected[axis], `${label}[${axis}]`, epsilon));
}

function mapped(point) {
    return [-point.z - 5.225, point.y - 2.52, point.x + 5];
}

function worldSamples(mesh) {
    const vertices = mesh.getVerticesData(VertexBuffer.PositionKind);
    mesh.computeWorldMatrix(true);
    // Sample separated vertices, not just bounds: stretching/shearing must fail too.
    const offsets = [0, Math.floor(vertices.length / 6) * 3, vertices.length - 3];
    return offsets.map((offset) => Vector3.TransformCoordinates(
        Vector3.FromArray(vertices, offset), mesh.getWorldMatrix(),
    ));
}

function mockCorridor(scene) {
    const root = new Mesh('__root__', scene);
    root.position.set(11, 13, 17);
    root.scaling.set(2, 3, -4);
    root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
    const source = MeshBuilder.CreateBox('source_geometry', { width: 3, height: 4, depth: 9 }, scene);
    source.parent = root;
    source.position.set(4, 5, 6);
    source.scaling.set(0.75, 1.25, 1.5);
    source.rotationQuaternion = Quaternion.RotationAxis(Vector3.Right(), 0.17);
    return { meshes: [root, source], animationGroups: [], transformNodes: [] };
}

function assertLayout(manager, name) {
    const data = manager.sceneData.get(name);
    assert.deepEqual(data.playerStart.asArray(), [0, 1.8, 2]);
    const door = data.interactables.find((item) => item.type === 'door');
    assert.deepEqual(door.position.asArray(), [0, 2.075, 12.6]);
    assert.deepEqual(door.data.size, { w: 3.1, h: 4.15, d: 0.2 });
    assert.deepEqual(data.interactables.filter((item) => item.type === 'battery').map((item) => item.position.asArray()),
        name === 'restricted_area' ? [[0.8, 0, 4], [-0.8, 0, 10]] : [[0.8, 0, 4]]);
    if (name === 'experiment_lab') {
        for (const [type, position] of [
            ['generator', [-0.75, 0, 8.5]], ['switch', [0.85, 1.1, 8.5]], ['note', [-0.95, 0, 5.5]],
        ]) assert.deepEqual(data.interactables.find((item) => item.type === type).position.asArray(), position);
        assert.equal(data.interactables.find((item) => item.type === 'note').deskAxis, 'z');
    }
    return door;
}

function assertSafeZones(zones, name) {
    assert.deepEqual(zones.map((zone) => zone.position.asArray()), SAFE_Z[name].map((z) => [0, 0, z]));
    assert.ok(zones.every((zone) => zone.radius === 1.5));
}

function rayHit(scene, from, to, predicate) {
    const direction = to.subtract(from);
    for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
    return scene.pickWithRay(new Ray(from, direction.normalizeToNew(), direction.length()), predicate);
}

test('story corridor exports its shared layout and rigid transform', () => {
    assert.ok(StoryAreas.STORY_AREA_LAYOUT, 'Export STORY_AREA_LAYOUT for story placements');
    assert.ok(StoryAreas.STORY_CORRIDOR_TRANSFORM, 'Export STORY_CORRIDOR_TRANSFORM for corridor placement');
});

for (const name of AREA_NAMES) {
    test(`${name}: fallback shell fits the unscaled corridor; imported overlays do not collide`, (t) => {
        const { scene, manager } = harness(t);
        assertLayout(manager, name);
        const baselineMaterials = scene.materials.length;
        const baselineTextures = scene.textures.length;
        const fallback = StoryAreas.buildStoryArea(scene, name);
        assertSafeZones(fallback.safeZones, name);
        const floor = fallback.meshes.find((mesh) => mesh.name === `${name}_floor`);
        assert.ok(floor, 'Default builder still supplies a fallback floor');
        floor.computeWorldMatrix(true);
        const bounds = floor.getBoundingInfo().boundingBox;
        near(bounds.maximumWorld.x - bounds.minimumWorld.x, 3.1, 'fallback width');
        near(bounds.maximumWorld.z - bounds.minimumWorld.z, 15, 'fallback length');
        near(bounds.maximumWorld.y, 0, 'floor surface');
        const ceiling = fallback.meshes.find((mesh) => mesh.name === `${name}_ceiling`);
        assert.ok(ceiling);
        ceiling.computeWorldMatrix(true);
        near(ceiling.getBoundingInfo().boundingBox.minimumWorld.y, 4.15, 'ceiling clearance');
        fallback.meshes.forEach((mesh) => mesh.dispose(false, true));
        assert.equal(scene.materials.length, baselineMaterials, 'Fallback materials are owned and disposable');
        assert.equal(scene.textures.length, baselineTextures, 'Fallback sign textures are disposable');

        const imported = StoryAreas.buildStoryArea(scene, name, { useCorridor: true });
        assertSafeZones(imported.safeZones, name);
        assert.ok(imported.meshes.length > 0, 'Keep story signs/markers');
        assert.ok(imported.meshes.every((mesh) => !mesh.checkCollisions), 'Overlay must not obstruct source geometry');
        assert.ok(!imported.meshes.some((mesh) => /_(floor|ceiling|wall_|back_wall|entrance_wall|tube_|machine_|.*partition|.*lintel)/.test(mesh.name)),
            'Successful import must not add a procedural room or laboratory machines');
        imported.meshes.forEach((mesh) => mesh.dispose(false, true));
        assert.equal(scene.materials.length, baselineMaterials, 'Overlay materials are disposable');
        assert.equal(scene.textures.length, baselineTextures, 'Overlay sign textures are disposable');
    });

    test(`${name}: imported hierarchy uses only the rigid wrapper and is cleaned up`, async (t) => {
        const { scene, manager } = harness(t);
        const imports = [];
        t.mock.method(SceneLoader, 'ImportMeshAsync', async (...args) => {
            assert.deepEqual(args.slice(0, 3), ['', '/assets/models/', 'corridor_baru.glb']);
            assert.equal(args[3], scene);
            const result = mockCorridor(scene);
            imports.push(result);
            return result;
        });
        await manager.loadEnvironment('horror_scene_glb');
        const initial = imports[0];
        const reference = worldSamples(initial.meshes[1]);
        const originalQuaternion = initial.meshes[0].rotationQuaternion.asArray();
        nearVector(initial.meshes[0].position, [0, 0, 0], 'original root position');
        nearVector(initial.meshes[0].scaling, [1, 1, 1], 'original root scaling reset');
        assert.equal(initial.meshes[0].parent, null, 'Initial horror scene has no story wrapper');
        initial.meshes[0].dispose(false, true);

        await manager.loadScene(name);
        assert.equal(imports.length, 2, 'Story environment must import corridor_baru.glb too');
        const [root, source] = imports[1].meshes;
        const wrapper = root.parent;
        assert.ok(wrapper, 'Story corridor is parented to a rigid wrapper');
        nearVector(wrapper.position, [-5.225, -2.52, 5], 'wrapper translation');
        nearVector(wrapper.scaling, [1, 1, 1], 'wrapper scale');
        near(wrapper.rotation.y, -Math.PI / 2, 'wrapper rotation');
        nearVector(root.position, [0, 0, 0], 'root position after original setup');
        nearVector(root.scaling, [1, 1, 1], 'root scale after original setup');
        assert.deepEqual(root.rotationQuaternion.asArray(), originalQuaternion, 'Keep original GLTF conversion rotation');
        assert.equal(source.parent, root);
        nearVector(source.scaling, [0.75, 1.25, 1.5], 'source local scale');
        const samples = worldSamples(source);
        samples.forEach((point, index) => nearVector(point, mapped(reference[index]), 'rigid source vertex'));
        near(Vector3.Distance(samples[0], samples[2]), Vector3.Distance(reference[0], reference[2]), 'unscaled vertex distance');
        assertSafeZones(manager.safeZones, name);
        const overlays = manager.environmentMeshes.filter((mesh) => !imports[1].meshes.includes(mesh));
        assert.ok(overlays.every((mesh) => !mesh.checkCollisions), 'Only noncolliding story overlays accompany imported geometry');
        assert.ok(source.checkCollisions && source.isPickable, 'Original loader enables source collisions and picking');
        const tracked = [...manager.environmentMeshes, ...manager.sceneObjects];
        manager.clearScene();
        assert.ok(tracked.every((mesh) => mesh.isDisposed()));
        assert.ok(wrapper.isDisposed(), 'Do not leak the story wrapper across transitions');
        assert.equal(scene.transformNodes.length, 0);
        assert.equal(manager.safeZones.length, 0);
        assert.equal(manager.triggerObservers.length, 0);
    });

    for (const synchronous of [true, false]) {
        test(`${name}: ${synchronous ? 'synchronous throw' : 'rejected import'} uses only the story fallback`, async (t) => {
            const { scene, manager } = harness(t);
            t.mock.method(SceneLoader, 'ImportMeshAsync', () => {
                const error = new Error('Intentional offline corridor failure');
                if (synchronous) throw error;
                return Promise.reject(error);
            });
            const legacyFallback = t.mock.method(manager, 'createFallbackCorridor', () => {});
            await manager.loadScene(name);
            assert.equal(legacyFallback.mock.callCount(), 0, 'Story failure must not build the initial horror fallback too');
            assert.ok(scene.getMeshByName(`${name}_floor`));
            assertSafeZones(manager.safeZones, name);
            manager.clearScene();
            await manager.loadEnvironment('horror_scene_glb');
            assert.equal(legacyFallback.mock.callCount(), 1, 'Preserve initial horror-scene fallback behavior');
        });
    }

    test(`${name}: actual corridor GLB supports the route, doors, objectives, and safe zones`, async (t) => {
        const { scene, manager, interaction, batteryProbes } = harness(t);
        const importMesh = SceneLoader.ImportMeshAsync.bind(SceneLoader);
        const pluginObserver = SceneLoader.OnPluginActivatedObservable.add((plugin) => { plugin.skipMaterials = true; });
        t.after(() => SceneLoader.OnPluginActivatedObservable.remove(pluginObserver));
        const data = `data:base64,${readFileSync(assetURL).toString('base64')}`;
        const imports = [];
        t.mock.method(SceneLoader, 'ImportMeshAsync', async (...args) => {
            assert.deepEqual(args.slice(0, 3), ['', '/assets/models/', 'corridor_baru.glb']);
            const result = await importMesh('', '', data, scene, undefined, '.glb');
            imports.push(result);
            return result;
        });
        await manager.loadEnvironment('horror_scene_glb');
        const reference = new Map(imports[0].meshes.filter((mesh) => mesh.geometry).map((mesh) => [mesh.name, worldSamples(mesh)]));
        imports[0].meshes[0].dispose(false, true);
        await manager.loadScene(name);
        assert.equal(imports.length, 2, 'Story environment must import corridor_baru.glb too');
        const imported = new Set(imports[1].meshes);
        const geometry = imports[1].meshes.filter((mesh) => mesh.geometry);
        assert.ok(geometry.length > 0, 'Exercise the actual asset, not substitute boxes');
        for (const mesh of geometry) {
            assert.ok(mesh.checkCollisions && mesh.isPickable);
            worldSamples(mesh).forEach((point, index) => nearVector(point, mapped(reference.get(mesh.name)[index]), `actual ${mesh.name} vertex`, 0.001));
        }
        const sourceOnly = (mesh) => imported.has(mesh) && !!mesh.geometry;
        const doorData = assertLayout(manager, name);
        assertSafeZones(manager.safeZones, name);
        const objectives = manager.sceneData.get(name).interactables;
        await t.test('battery floor probes start inside the corridor, not above its roof', () => {
            const batteries = objectives.filter((item) => item.type === 'battery');
            assert.equal(batteryProbes.length, batteries.length);
            for (const [index, probe] of batteryProbes.entries()) {
                const target = batteries[index].position;
                near(probe.x, target.x, 'battery probe x');
                near(probe.z, target.z, 'battery probe z');
                const floor = rayHit(scene, new Vector3(probe.x, 0.25, probe.z), new Vector3(probe.x, -0.25, probe.z), sourceOnly);
                assert.ok(floor?.hit, 'Source floor exists below the battery probe');
                assert.ok(probe.y > floor.pickedPoint.y && probe.y <= 1.8,
                    `Battery probe y=${probe.y} must be above floor y=${floor.pickedPoint.y} and <=1.8, below the roof`);
            }
        });
        if (name === 'experiment_lab') {
            const note = [...interaction.interactables.values()].find((item) => item.data.id === 'doc_final');
            const table = manager.sceneObjects.find((mesh) => mesh.name === `${note.mesh.name}_table`);
            const floor = rayHit(scene, new Vector3(note.mesh.position.x, 0.25, note.mesh.position.z), new Vector3(note.mesh.position.x, -0.25, note.mesh.position.z), sourceOnly);
            assert.ok(floor?.hit, 'Source floor exists below the final note');
            await t.test('final note sits on the floor-supported desk, not the roof', () => {
                near(note.mesh.position.y, floor.pickedPoint.y + 0.815, 'final note floor-relative height', 0.01);
            });
            await t.test('final-note desk is supported by the corridor floor, not the roof', () => {
                assert.ok(table, 'Final note has a caller-owned desk anchor');
                near(table.position.y, floor.pickedPoint.y + 0.4, 'desk center floor-relative height', 0.01);
            });
        }
        for (const position of [scene.activeCamera.position, ...manager.safeZones.map((zone) => zone.position), ...objectives.map((item) => item.position)]) {
            const floor = rayHit(scene, new Vector3(position.x, 0.25, position.z), new Vector3(position.x, -0.25, position.z), sourceOnly);
            assert.ok(floor?.hit, `Actual floor below (${position.x}, ${position.z})`);
            near(floor.pickedPoint.y, 0, 'source floor matches story floor', 0.01);
        }
        for (const zone of manager.safeZones) {
            const ceiling = rayHit(scene, new Vector3(0, 1.8, zone.position.z), new Vector3(0, 5, zone.position.z), sourceOnly);
            assert.ok(ceiling?.hit, `Source ceiling above safe zone z=${zone.position.z}`);
            // The source has lower overhead details beneath its 4.15 m shell.
            assert.ok(ceiling.pickedPoint.y > 3 && ceiling.pickedPoint.y < 4.17, 'Source overhead geometry preserves player clearance');
        }
        for (const item of objectives.filter((item) => item.type !== 'door')) {
            const hit = rayHit(scene, new Vector3(0, 1.3, item.position.z), new Vector3(item.position.x, 1.3, item.position.z), sourceOnly);
            assert.ok(!hit?.hit, `Source geometry leaves ${item.type} reachable from the center route`);
        }
        for (const x of [-0.4, 0, 0.4]) {
            const hit = rayHit(scene, new Vector3(x, 1.8, 2), new Vector3(x, 1.8, doorData.position.z + 0.5), sourceOnly);
            assert.ok(!hit?.hit, `Source geometry must leave the central route open at x=${x}; hit ${hit?.pickedMesh?.name}`);
        }
        const door = [...interaction.interactables.values()].find((item) => item.type === 'door');
        const approach = new Vector3(0, 1.8, 11.5);
        const beyond = new Vector3(0, 1.8, 13.1);
        const colliding = (mesh) => mesh.checkCollisions && !!mesh.geometry;
        assert.equal(rayHit(scene, approach, beyond, colliding)?.pickedMesh, door.mesh, 'The closed door blocks the source route');
        door.mesh.checkCollisions = false;
        assert.ok(!rayHit(scene, approach, beyond, colliding)?.hit, 'The open door permits crossing the progression threshold');
        const wrapper = imports[1].meshes[0].parent;
        const tracked = [...manager.environmentMeshes, ...manager.sceneObjects];
        manager.clearScene();
        assert.ok(tracked.every((mesh) => mesh.isDisposed()), 'Dispose imported geometry and overlays on scene clear');
        assert.ok(wrapper.isDisposed(), 'Dispose the rigid wrapper on scene clear');
    });
}
