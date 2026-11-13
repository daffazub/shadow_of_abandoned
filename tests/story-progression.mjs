import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import {
    NullEngine, Scene, UniversalCamera, Vector3,
    MeshBuilder, SceneLoader, Mesh, AssetContainer, StandardMaterial,
} from '@babylonjs/core';
import { SceneManager } from '../src/systems/SceneManager.js';
import { EnvironmentManager } from '../src/systems/EnvironmentManager.js';
import { MonsterManager } from '../src/systems/MonsterManager.js';
import { InteractionManager } from '../src/systems/InteractionManager.js';
import { EventSystem } from '../src/systems/EventSystem.js';
import { PropLibrary, PROP_CONFIG } from '../src/systems/PropLibrary.js';

// DynamicTexture remains real; only its browser canvas/text rasterization is stubbed.
class TestOffscreenCanvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.context = {
            canvas: this,
            font: '',
            measureText(text) { return { width: text.length * 24 }; },
            clearRect() {}, fillRect() {}, fillText() {},
            save() {}, restore() {}, translate() {}, scale() {}, drawImage() {},
        };
    }
    getContext(kind) {
        assert.equal(kind, '2d');
        return this.context;
    }
}

function makeDocument() {
    function element(tag = 'div') {
        const listeners = new Map();
        return {
            tagName: tag.toUpperCase(), style: {}, dataset: Object.create(null),
            children: new Set(), parentNode: null, className: '', textContent: '',
            addEventListener(type, callback) {
                if (!listeners.has(type)) listeners.set(type, new Set());
                listeners.get(type).add(callback);
            },
            removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
            dispatchEvent(event) {
                event.target ??= this;
                for (const callback of listeners.get(event.type) || []) callback(event);
                this[`on${event.type}`]?.(event);
                return true;
            },
            appendChild(node) {
                node.remove();
                node.parentNode = this;
                this.children.add(node);
                return node;
            },
            append(...nodes) { nodes.forEach((node) => this.appendChild(node)); },
            remove() {
                this.parentNode?.children.delete(this);
                this.parentNode = null;
            },
            set innerHTML(html) {
                for (const child of [...this.children]) child.remove();
                this.markup = html;
                // Only this parsed child is queried by Game; this is not an HTML renderer.
                if (html.includes('class="document-close"')) {
                    const close = element('span');
                    close.className = 'document-close';
                    this.appendChild(close);
                }
            },
            get innerHTML() { return this.markup || ''; },
            querySelector(selector) {
                assert.ok(selector.startsWith('.'), 'Only class selectors are needed by Game');
                for (const child of this.children) {
                    if (child.className.split(/\s+/).includes(selector.slice(1))) return child;
                    const nested = child.querySelector(selector);
                    if (nested) return nested;
                }
                return null;
            },
        };
    }
    const body = element('body');
    return Object.assign(element('document'), {
        body, children: body.children,
        getElementById() { return null; },
        pointerLockExits: 0,
        exitPointerLock() { this.pointerLockExits++; },
        createElement(tag) {
            return tag === 'canvas' ? new TestOffscreenCanvas(1, 1) : element(tag);
        },
    });
}

// main.js has no export and registers browser startup handlers. Evaluate only the
// unchanged Game class, not its imports/bootstrap, to test actual B event wiring.
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const gameStart = mainSource.indexOf('class Game {');
const gameEnd = mainSource.indexOf('// Initialize game when page loads', gameStart);
assert.ok(gameStart >= 0 && gameEnd > gameStart, 'Locate Game class without browser bootstrap');
const gameClassSource = mainSource.slice(gameStart, gameEnd);

function harness(t) {
    t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network fetch'); });
    const imports = t.mock.method(SceneLoader, 'ImportMeshAsync', () => { throw new Error('Unexpected asset import'); });
    const monsterLoads = t.mock.method(SceneLoader, 'LoadAssetContainerAsync', async (path, file, target) => {
        assert.equal(path, '/assets/models/monster/');
        assert.equal(file, 'smiley_monster.glb');
        assert.equal(target, scene);
        const container = new AssetContainer(scene);
        const root = new Mesh('monster_conversion_root', scene);
        const body = MeshBuilder.CreateBox('monster_body', { height: 4 }, scene);
        body.parent = root;
        body.position.y = 2;
        container.rootNodes.push(root);
        container.meshes.push(root, body);
        container.removeAllFromScene();
        return container;
    });
    const oldCanvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: TestOffscreenCanvas });
    const document = makeDocument();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
    const engine = new NullEngine();
    const scene = new Scene(engine);
    scene.activeCamera = new UniversalCamera('test-player', new Vector3(0, 1.8, 2), scene);
    const events = [];
    const audio = [];
    const messages = [];
    const systems = {
        eventSystem: new EventSystem(),
        playerController: {
            controlsLocked: false, flashlightEnabled: false,
            batteryLevel: 100, flashlight: { intensity: 1 },
            resets: 0, resetInput() { this.resets++; },
        },
        audioManager: Object.fromEntries(['playSound', 'playAmbient', 'stopAmbient'].map((method) => [
            method, (...args) => audio.push([method, ...args]),
        ])),
        propLibrary: {
            async preload() {}, attach() { return null; },
            getFittedSize() { return null; }, removeHighlight() {},
        },
    };
    const originalEmit = systems.eventSystem.emit.bind(systems.eventSystem);
    systems.eventSystem.emit = (name, data = {}) => {
        // Snapshot mutable switch/door data at emission time.
        events.push({ name, data: { ...data } });
        originalEmit(name, data);
    };
    const interaction = Object.assign(Object.create(InteractionManager.prototype), {
        scene, systems, interactables: new Map(), inventory: new Map(), documentsFound: [],
        currentInteractable: null, pickupCounter: 0, interactionUI: { style: {} },
        showMessage: (...args) => messages.push(args),
    });
    const environment = Object.assign(Object.create(EnvironmentManager.prototype), {
        scene, systems, lights: [], particleSystems: [], lightIntervals: new Set(), lightTimeouts: new Set(),
        flickerInterval: null, powerRestored: false,
    });
    const manager = Object.assign(Object.create(SceneManager.prototype), {
        scene, systems, currentScene: null, sceneData: new Map(), sceneObjects: [],
        triggerObservers: [], objectCounter: 0, tableMaterial: null,
        environmentMeshes: [], safeZones: [], isTransitioning: false,
        // LevelBuilder's constructor preloads legacy models; these scenes do not use it.
        levelBuilder: null,
    });
    Object.assign(systems, { sceneManager: manager, environmentManager: environment, interactionManager: interaction });
    const monster = new MonsterManager(scene, systems);
    systems.monsterManager = monster;
    manager.initializeScenes();
    manager.initializeStoryScenes();
    const timers = [];
    const Game = runInNewContext(`${gameClassSource}\nGame;`, {
        document, console, setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
    });
    const game = Object.assign(Object.create(Game.prototype), {
        systems, scene, camera: scene.activeCamera, engine, gameEnded: false,
        finalSequenceStarted: false, activeOverlay: null,
    });
    const frame = () => scene.onBeforeRenderObservable.notifyObservers(scene);
    const endingEvents = () => events.filter((event) => event.name === 'ending_requested');
    const find = (id) => [...interaction.interactables.values()].find((item) => item.data.id === id);
    const interact = (item) => { interaction.currentInteractable = item; return interaction.tryInteract(); };
    t.after(() => {
        monster.dispose();
        systems.eventSystem.stopStoryTimers();
        environment.dispose();
        scene.dispose();
        engine.dispose();
        for (const [name, descriptor] of [['OffscreenCanvas', oldCanvas], ['document', oldDocument]]) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    });
    return { scene, systems, manager, interaction, environment, events, audio, messages, document,
        monster, monsterLoads, imports, game, timers, frame, endingEvents, find, interact };
}

function closeTo(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-8, `Expected ${actual} to be approximately ${expected}`);
}

// Story tests isolate an already spawned chase; spawn/navigation/asset failure
// behavior is exercised independently by monster-integration.mjs.
async function chasing(h, position) {
    assert.equal(h.monster.state, 'pending', 'Load a story scene before starting its chase');
    await h.monster.preload();
    h.monster.state = 'chasing';
    h.monster.pivot.position.copyFrom(position);
    h.monster.floorY = position.y;
    h.monster.lastPos.copyFrom(position);
}

test('Environment pursuit wrappers delegate to the single monster and reuse its model', async (t) => {
    const h = harness(t);
    const start = t.mock.method(h.monster, 'startChase');
    const stop = t.mock.method(h.monster, 'despawn');
    await h.manager.loadScene('restricted_area');
    await h.monster.preload();
    assert.equal(start.mock.callCount(), 1, 'Scene loading uses the runtime start wrapper');
    assert.equal(h.monster.state, 'pending');
    h.environment.startEntityPursuit();
    assert.equal(start.mock.callCount(), 2);
    h.environment.stopEntityPursuit();
    assert.equal(stop.mock.callCount(), 1);
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.monster.pivot.isEnabled(), false);
    h.environment.startEntityPursuit();
    await h.monster.preload();
    assert.equal(start.mock.callCount(), 3);
    assert.equal(h.monster.state, 'pending');
    assert.equal(h.monsterLoads.mock.callCount(), 1, 'Restart reuses the only monster container');
    assert.equal(h.imports.mock.callCount(), 1, 'Only the corridor import is attempted, never a second ghost');
    assert.equal(h.imports.mock.calls[0].arguments[2], 'corridor_baru.glb');
    assert.equal(h.environment.updatePursuit, undefined);
    assert.equal(h.environment.ensureEntityModel, undefined);

    h.game.setupEventListeners();
    const doorOpened = t.mock.method(h.monster, 'onDoorOpened');
    h.systems.eventSystem.emit('door_opened', { id: 'restricted_gate' });
    assert.equal(doorOpened.mock.callCount(), 1, 'Actual Game door listener reaches the same monster');
    assert.equal(h.monsterLoads.mock.callCount(), 1);
});

test('Game systems loop updates the monster once; Environment update does not advance pursuit', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    await chasing(h, new Vector3(0, 0, 7));
    h.scene.activeCamera.position.set(0, 1.8, 8.5);
    const update = t.mock.method(h.monster, 'update');
    t.mock.method(h.game.engine, 'getDeltaTime', () => 100);
    h.environment.update(0.1);
    assert.equal(update.mock.callCount(), 0);
    closeTo(h.monster.darkExposure, 0);
    h.game.update();
    assert.equal(update.mock.callCount(), 1);
    assert.deepEqual(Array.from(update.mock.calls[0].arguments), [0.1]);
    closeTo(h.monster.darkExposure, 0.1);
});

test('single monster clamps long/negative/invalid deltas and requires proximity for C', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    await chasing(h, new Vector3(0, 0, 4));
    h.scene.activeCamera.position.set(0, 1.8, 8.5);
    h.monster.update(30);
    closeTo(h.monster.darkExposure, 0.1);
    closeTo(h.monster.time, 0.1);
    const position = h.monster.pivot.position.clone();
    for (const delta of [-1, 0, NaN, Infinity]) h.monster.update(delta);
    closeTo(h.monster.darkExposure, 0.1);
    closeTo(h.monster.time, 0.1);
    assert.deepEqual(h.monster.pivot.position.asArray(), position.asArray());
    h.monster.darkExposure = 9;
    h.monster.update(0.1);
    assert.equal(h.endingEvents().length, 0, 'Exposure alone cannot capture a distant player');
});

test('Environment disposal leaves monster lifecycle and asset ownership to the app', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    await chasing(h, new Vector3(0, 0, 7));
    const container = h.monster.container;
    const pivot = h.monster.pivot;
    const dispose = t.mock.method(h.monster, 'dispose');
    const despawn = t.mock.method(h.monster, 'despawn');
    h.environment.dispose();
    assert.equal(dispose.mock.callCount(), 0);
    assert.equal(despawn.mock.callCount(), 0);
    assert.equal(h.monster.state, 'chasing');
    assert.equal(h.monster.container, container);
    assert.ok(!pivot.isDisposed());
    assert.ok(container.meshes.every((mesh) => !mesh.isDisposed()));
    h.monster.dispose();
    assert.equal(dispose.mock.callCount(), 1);
    assert.ok(pivot.isDisposed());
    assert.equal(h.monster.container, null);
    assert.equal(h.monster.disposed, true);
});

test('restricted -> lab requires an open door and crossing; transition locks and preserves progress', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('restricted_area');
    assert.ok(h.manager.safeZones.length > 0);
    assert.equal(h.monster.state, 'pending');
    const door = h.find('laboratory_door');
    h.interaction.addToInventory('key', { id: 'restricted_key', name: 'Restricted Key' });
    h.interaction.documentsFound.push('doc_experiment');
    const oldMeshes = [...h.manager.environmentMeshes, ...h.manager.sceneObjects];
    const transitions = [];
    const realTransition = h.manager.transitionTo.bind(h.manager);
    h.manager.transitionTo = (...args) => {
        const pending = realTransition(...args);
        transitions.push(pending);
        return pending;
    };
    h.scene.activeCamera.position.set(0, 1.8, door.mesh.position.z + 0.36);
    h.frame();
    assert.equal(transitions.length, 0, 'A closed door must not transition');
    assert.equal(h.interact(door), true);
    assert.equal(door.data.isOpen, true);
    assert.equal(door.mesh.checkCollisions, false);
    assert.equal(h.interact(door), false, 'Door interaction is consumed');
    h.scene.activeCamera.position.x = door.data.size.w / 2 + 0.1;
    h.frame();
    assert.equal(transitions.length, 0, 'Crossing outside the doorway must not transition');
    h.scene.activeCamera.position.set(0, 1.8, door.mesh.position.z + 0.35);
    h.frame();
    assert.equal(transitions.length, 0, 'Threshold itself is not past the door');
    h.scene.activeCamera.position.z += 0.01;
    h.systems.playerController.controlsLocked = true;
    h.frame();
    assert.equal(transitions.length, 0, 'Controls lock suppresses progression');
    h.systems.playerController.controlsLocked = false;
    h.frame();
    assert.equal(h.manager.isTransitioning, true);
    assert.equal(h.systems.playerController.controlsLocked, true);
    h.frame();
    assert.equal(transitions.length, 1, 'Only one transition may start');
    await transitions[0];
    assert.equal(h.manager.currentScene, 'experiment_lab');
    assert.equal(h.manager.isTransitioning, false);
    assert.equal(h.systems.playerController.controlsLocked, false);
    assert.equal(h.systems.playerController.resets, 2);
    assert.equal(h.document.children.size, 0, 'Transition cover removed');
    assert.deepEqual(h.scene.activeCamera.position.asArray(), [0, 1.8, 2]);
    assert.ok(oldMeshes.every((mesh) => mesh.isDisposed()));
    assert.equal(h.interaction.hasItem('key', 'restricted_key'), true);
    assert.deepEqual(h.interaction.documentsFound, ['doc_experiment']);
    assert.ok(h.find('asylum_exit'));
    assert.ok(h.find('destruction_switch'));
    assert.equal(h.monster.state, 'pending');
    assert.deepEqual(h.events.filter((event) => event.name === 'scene_loaded').map((event) => event.data.scene),
        ['restricted_area', 'experiment_lab']);
});

test('ending A exit emits exactly once across repeated frames', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    const door = h.find('asylum_exit');
    h.scene.activeCamera.position.set(0, 1.8, door.mesh.position.z + 0.5);
    h.frame();
    assert.equal(h.endingEvents().length, 0, 'Closed exit cannot end game');
    h.interact(door);
    h.systems.playerController.controlsLocked = true;
    h.frame();
    assert.equal(h.endingEvents().length, 0, 'Locked controls suppress ending');
    h.systems.playerController.controlsLocked = false;
    h.scene.activeCamera.position.x = door.data.size.w / 2 + 0.1;
    h.frame();
    assert.equal(h.endingEvents().length, 0, 'Cannot exit outside door width');
    h.scene.activeCamera.position.x = 0;
    h.frame();
    assert.deepEqual(h.endingEvents().map((event) => event.data.ending), ['A']);
    h.frame();
    h.frame();
    assert.equal(h.endingEvents().length, 1, 'Ending A must be requested only once after crossing the exit');
});

for (const source of ['interaction switch_toggled', 'legacy switch_activated']) {
    test(`ending B compatibility: ${source} uses actual Game listeners and final sequence`, async (t) => {
        const h = harness(t);
        await h.manager.loadScene('experiment_lab');
        h.game.setupEventListeners();
        const toggle = h.find('destruction_switch');
        h.systems.eventSystem.emit('switch_activated', { controls: 'unrelated' });
        assert.equal(h.game.finalSequenceStarted, false);
        if (source.startsWith('interaction')) {
            assert.equal(h.interact(toggle), true);
            assert.equal(toggle.data.isOn, true);
            assert.deepEqual(toggle.mesh.material.emissiveColor.asArray(), [0, 1, 0]);
            const event = h.events.find((event) => event.name === 'switch_toggled');
            assert.equal(event.data.controls, 'final_sequence');
        } else {
            h.systems.eventSystem.emit('switch_activated', toggle.data);
        }
        assert.equal(h.game.finalSequenceStarted, true);
        assert.equal(h.systems.playerController.controlsLocked, true);
        assert.equal(h.monster.state, 'dormant');
        assert.equal(h.interact(toggle), false, 'Final sequence locks further interaction');
        h.systems.eventSystem.emit('switch_toggled', toggle.data);
        h.systems.eventSystem.emit('switch_activated', toggle.data);
        assert.equal(h.timers.length, 1, 'Final sequence is one-shot for both event names');
        assert.equal(h.timers[0].delay, 5000);
        h.timers[0].callback();
        assert.equal(h.game.gameEnded, true);
        assert.equal([...h.document.children][0].dataset.ending, 'B');
        h.game.showGameComplete();
        assert.deepEqual(h.events.filter((event) => event.name === 'game_ended').map((event) => event.data.ending), ['B']);
    });
}

test('clearScene removes scene resources/observers but preserves inventory and documents', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    h.interaction.addToInventory('key', { id: 'restricted_key' });
    h.interact(h.find('doc_final'));
    const inventory = h.interaction.inventory;
    const documents = h.interaction.documentsFound;
    const meshes = [...h.manager.sceneObjects, ...h.manager.environmentMeshes];
    const observers = [...h.manager.triggerObservers];
    assert.ok(observers.length > 0);
    h.manager.clearScene();
    assert.ok(meshes.every((mesh) => mesh.isDisposed()));
    assert.equal(h.manager.sceneObjects.length, 0);
    assert.equal(h.manager.environmentMeshes.length, 0);
    assert.equal(h.manager.safeZones.length, 0);
    assert.equal(h.manager.triggerObservers.length, 0);
    // Babylon marks removed observers immediately, then splices them on a timer.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(observers.every((observer) => !h.scene.onBeforeRenderObservable.observers.includes(observer)));
    assert.equal(h.monster.state, 'dormant');
    assert.equal(h.interaction.interactables.size, 0);
    assert.equal(h.interaction.currentInteractable, null);
    assert.equal(h.interaction.interactionUI.style.display, 'none');
    assert.equal(h.interaction.inventory, inventory);
    assert.equal(h.interaction.documentsFound, documents);
    assert.equal(h.interaction.hasItem('key', 'restricted_key'), true);
    assert.deepEqual(documents, ['doc_final']);
    h.frame();
    assert.equal(h.endingEvents().length, 0, 'Removed progression observers do not emit');
});

for (const ending of ['A', 'C']) {
    test(`actual Game ending ${ending} creates one overlay and guards all subsequent endings`, async (t) => {
        const h = harness(t);
        await h.manager.loadScene('experiment_lab');
        assert.equal(h.monster.state, 'pending');
        h.game.setupEventListeners();
        h.game.showDocument('Existing document', 'Read before ending');
        const documentOverlay = h.game.activeOverlay;
        h.environment.startEntityPursuit();
        h.systems.eventSystem.emit('ending_requested', { ending });
        assert.equal(h.game.gameEnded, true);
        assert.equal(h.game.activeOverlay, null);
        assert.equal(documentOverlay.parentNode, null);
        assert.equal(h.systems.playerController.controlsLocked, true);
        assert.equal(h.scene.activeCamera.applyGravity, false);
        assert.equal(h.monster.state, 'dormant');
        assert.equal(h.interaction.interactionUI.style.display, 'none');
        assert.equal(h.document.pointerLockExits, 2, 'Document and ending each release pointer lock');
        const overlay = [...h.document.children][0];
        assert.equal(overlay.dataset.ending, ending);
        assert.ok(overlay.className.includes('ending-overlay'));
        assert.equal([...overlay.children][0].children.size, 3, 'Title, copy, and replay button');
        for (const next of ['A', 'B', 'C']) h.systems.eventSystem.emit('ending_requested', { ending: next });
        h.game.showEnding(ending);
        h.game.showGameComplete();
        h.game.startFinalSequence();
        h.game.showDocument('Too late', 'Must not replace ending');
        assert.equal(h.document.children.size, 1);
        assert.equal([...h.document.children][0], overlay);
        assert.equal(h.timers.length, 0);
        assert.deepEqual(h.events.filter((event) => event.name === 'game_ended').map((event) => event.data.ending), [ending]);
    });
}

test('actual Game final-sequence guard ignores A/C until B completes', (t) => {
    const h = harness(t);
    h.game.setupEventListeners();
    h.game.startFinalSequence();
    for (const ending of ['A', 'B', 'C']) h.systems.eventSystem.emit('ending_requested', { ending });
    h.game.showDocument('Too late', 'Final sequence in progress');
    assert.equal(h.game.gameEnded, false);
    assert.equal(h.document.children.size, 0);
    assert.equal(h.systems.playerController.controlsLocked, true);
    assert.equal(h.timers.length, 1);
    h.timers[0].callback();
    assert.equal([...h.document.children][0].dataset.ending, 'B');
    assert.deepEqual(h.events.filter((event) => event.name === 'game_ended').map((event) => event.data.ending), ['B']);
});

for (const closeWith of ['button', 'backdrop', 'keyboard']) {
    test(`actual Game document locks pursuit/interaction and closes via ${closeWith}`, async (t) => {
        const h = harness(t);
        await h.manager.loadScene('experiment_lab');
        h.game.setupEventListeners();
        h.game.setupDocumentShortcuts();
        // The generator area is unlit until power is restored, unlike the exit light.
        h.scene.activeCamera.position.set(0, 1.8, 8.5);
        await chasing(h, new Vector3(0, 0, 8.5));
        h.monster.darkExposure = 7.95;
        const before = h.monster.pivot.position.clone();
        assert.equal(h.interact(h.find('doc_final')), true);
        const overlay = h.game.activeOverlay;
        assert.ok(overlay);
        assert.equal(h.document.pointerLockExits, 1, 'Document releases pointer lock for its close button');
        assert.equal(h.systems.playerController.controlsLocked, true);
        assert.equal(h.interact(h.find('destruction_switch')), false);
        const time = h.monster.time;
        for (let i = 0; i < 10; i++) h.monster.update(0.1);
        closeTo(h.monster.time, time);
        closeTo(h.monster.darkExposure, 7.95);
        assert.deepEqual(h.monster.pivot.position.asArray(), before.asArray());
        assert.equal(h.endingEvents().length, 0);
        overlay.dispatchEvent({ type: 'click', target: overlay.querySelector('.document-close') });
        assert.equal(h.game.activeOverlay, overlay, 'Clicks on document content do not act as backdrop');
        if (closeWith === 'button') overlay.querySelector('.document-close').dispatchEvent({ type: 'click' });
        else if (closeWith === 'backdrop') overlay.dispatchEvent({ type: 'click' });
        else h.document.dispatchEvent({ type: 'keydown', key: 'X' });
        assert.equal(h.game.activeOverlay, null);
        assert.equal(overlay.parentNode, null);
        assert.equal(h.systems.playerController.controlsLocked, false);
        h.monster.update(0.1);
        assert.deepEqual(h.endingEvents().map((event) => event.data.ending), ['C']);
        assert.equal(h.game.gameEnded, true, 'Pursuit resumes and actual Game handles C');
    });
}

for (const reason of ['transition', 'final sequence', 'game ended']) {
    test(`closing document cannot release ${reason} control lock`, (t) => {
        const h = harness(t);
        h.game.showDocument('Test', 'Content');
        if (reason === 'transition') h.manager.isTransitioning = true;
        else if (reason === 'final sequence') h.game.finalSequenceStarted = true;
        else h.game.gameEnded = true;
        h.game.closeDocument();
        assert.equal(h.game.activeOverlay, null);
        assert.equal(h.document.children.size, 0);
        assert.equal(h.systems.playerController.controlsLocked, true);
    });
}

// Asset IO is mocked, not bounds/fitting/cloning: Babylon owns this in-memory
// AssetContainer, including the vertex-less GLTF-style conversion root.
async function loadMockProp(t, h, library, name) {
    const container = new AssetContainer(h.scene);
    const root = new Mesh(`${name}_conversion_root`, h.scene);
    root.scaling.z = -1;
    const source = MeshBuilder.CreateBox(`${name}_off_origin_source`, { width: 2, height: 1, depth: 0.1 }, h.scene);
    source.position.set(30, 12, -20);
    source.parent = root;
    const material = new StandardMaterial(`${name}_shared_material`, h.scene);
    source.material = material;
    container.meshes.push(root, source);
    container.materials.push(material);
    container.rootNodes.push(root);
    container.removeAllFromScene();
    t.mock.method(SceneLoader, 'LoadAssetContainerAsync', async (path, file, scene) => {
        assert.equal(path, '/assets/models/props/');
        assert.equal(file, PROP_CONFIG[name].file);
        assert.equal(scene, h.scene);
        return container;
    });
    await library.loadOne(name, PROP_CONFIG[name]);
    assert.equal(library.failed.has(name), false);
    assert.equal(library.containers.get(name), container);
    assert.equal(material.maxSimultaneousLights, 10);
    assert.equal(root.getTotalVertices(), 0);
    const bounds = library.getContainerBounds(container);
    for (const [actual, expected] of [[bounds.min.x, 29], [bounds.max.x, 31],
        [bounds.min.y, 11.5], [bounds.max.y, 12.5], [bounds.min.z, 19.95], [bounds.max.z, 20.05]]) {
        assert.ok(Math.abs(actual - expected) < 1e-5, `Source vertex-only bound ${actual} != ${expected}`);
    }
    return { container, material };
}

function assertPropBounds(anchor, { width, height, depth, surfaceY, rotationY = 0 }) {
    const pivot = anchor.metadata.propPivot;
    const bounds = pivot.getHierarchyBoundingVectors(true, (mesh) => mesh.getTotalVertices() > 0);
    const expected = rotationY ? [depth, height, width] : [width, height, depth];
    const size = bounds.max.subtract(bounds.min).asArray();
    size.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-5,
        `Fitted axis ${index}: ${value} != ${expected[index]}`));
    assert.ok(Math.abs(bounds.min.y - surfaceY) < 1e-5, 'Visual base rests at requested surface');
    assert.ok(Math.abs((bounds.min.x + bounds.max.x) / 2 - anchor.position.x) < 1e-5, 'Visual X centered on anchor');
    assert.ok(Math.abs((bounds.min.z + bounds.max.z) / 2 - anchor.position.z) < 1e-5, 'Visual Z centered on anchor');
    closeTo(pivot.rotation.y, rotationY);
    assert.equal(anchor.visibility, 0);
    assert.ok(anchor.metadata.propVisualMeshes.every((mesh) => !mesh.isPickable && !mesh.checkCollisions));
}

for (const gate of [
    { label: 'original rotated gate', width: 3.1, height: 4.15, rotationY: Math.PI / 2 },
    { label: 'story gate', width: 3.1, height: 4.15, rotationY: 0 },
]) {
    test(`prop regression: ${gate.label} fits off-origin geometry, base, and center`, async (t) => {
        const h = harness(t);
        const library = new PropLibrary(h.scene);
        const { container } = await loadMockProp(t, h, library, 'iron_gate');
        const options = { ...gate, depth: 0.2, surfaceY: 2.52 };
        const anchor = MeshBuilder.CreateBox('gate-anchor', {}, h.scene);
        anchor.position.set(7.6, options.surfaceY + gate.height / 2, -5.225);
        assert.equal(library.attach('iron_gate', anchor, options), true);
        assertPropBounds(anchor, options);
        const advertised = library.getFittedSize('iron_gate', options).asArray();
        assert.deepEqual(advertised, gate.rotationY ? [0.2, gate.height, gate.width] : [gate.width, gate.height, 0.2]);
        assert.ok(anchor.metadata.propVisualMeshes.some((mesh) => mesh.name.endsWith('_gate_fill')), 'Tall opening gets a fitted top panel');
        anchor.dispose();
        container.dispose();
    });
}

test('prop regression: pickup and clearScene preserve shared template materials for reuse', async (t) => {
    const h = harness(t);
    const library = new PropLibrary(h.scene);
    h.systems.propLibrary = library;
    const { container, material } = await loadMockProp(t, h, library, 'key_ward');
    const dispose = t.mock.method(material, 'dispose');
    const createKey = (id, x) => {
        h.manager.createInteractables([{ type: 'key', position: new Vector3(x, 1, 3), data: { id, name: id } }]);
        const item = h.find(id);
        assert.ok(item.mesh.metadata.propPivot, 'Actual createInteractables attached the cached model');
        const visual = item.mesh.metadata.propVisualMeshes.find((mesh) => mesh.getTotalVertices() > 0);
        assert.equal(visual.material, material, 'Instance shares the container material');
        return item;
    };
    // Avoid EventSystem's delayed first-key story trigger; inventory still starts empty.
    h.systems.eventSystem.gameState.keysCollected = 1;
    const picked = createKey('picked-key', 4);
    const survivor = createKey('surviving-key', 6);
    const pickedVisuals = [...picked.mesh.metadata.propVisualMeshes];
    const survivorVisual = survivor.mesh.metadata.propVisualMeshes.find((mesh) => mesh.getTotalVertices() > 0);
    const placeholder = picked.mesh.material;
    const disposePlaceholder = t.mock.method(placeholder, 'dispose');
    assert.equal(h.interact(picked), true);
    assert.equal(picked.mesh.isDisposed(), true);
    assert.ok(pickedVisuals.every((mesh) => mesh.isDisposed()));
    assert.equal(disposePlaceholder.mock.callCount(), 1, 'Pickup owns and disposes its placeholder material');
    assert.equal(dispose.mock.callCount(), 0, 'Pickup must not dispose shared model material');
    assert.equal(survivorVisual.isDisposed(), false);
    assert.equal(survivorVisual.material, material);
    h.manager.clearScene();
    assert.equal(survivor.mesh.isDisposed(), true);
    assert.equal(dispose.mock.callCount(), 0, 'clearScene must not dispose cached model material');
    assert.equal(library.containers.get('key_ward'), container);
    assert.equal(h.interaction.hasItem('key', 'picked-key'), true);
    const reused = createKey('reused-key', -3);
    assert.equal(reused.mesh.metadata.propVisualMeshes.find((mesh) => mesh.getTotalVertices() > 0).material, material);
    assert.equal(dispose.mock.callCount(), 0);
    h.manager.clearScene();
    container.dispose();
});

function fakeSystemTimers(t) {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    return (milliseconds) => t.mock.timers.tick(milliseconds);
}

test('EventSystem scheduled key/generator callbacks fire once and release their handles', (t) => {
    const h = harness(t);
    const tick = fakeSystemTimers(t);
    const events = h.systems.eventSystem;
    events.emit('key_collected', { id: 'ward_key' });
    events.emit('generator_started', { powers: 'facility_lighting' });
    assert.equal(events.storyTimeouts.size, 2);
    tick(1999);
    assert.equal(h.events.filter((event) => event.name === 'story_trigger').length, 0);
    tick(1);
    assert.equal(events.storyTimeouts.size, 1);
    assert.deepEqual(h.events.filter((event) => event.name === 'story_trigger').map((event) => event.data.type), ['entity_introduction']);
    tick(1000);
    assert.equal(events.storyTimeouts.size, 0);
    assert.equal(events.gameState.powerRestored, true);
    assert.deepEqual(h.events.filter((event) => event.name === 'story_trigger').map((event) => event.data.type),
        ['entity_introduction', 'power_restored']);
    tick(10000);
    assert.equal(h.events.filter((event) => event.name === 'power_restored').length, 1);
});

test('game_ended cancels pending key/generator callbacks and permanently stops story scheduling', (t) => {
    const h = harness(t);
    const tick = fakeSystemTimers(t);
    const events = h.systems.eventSystem;
    events.emit('key_collected', { id: 'ward_key' });
    events.emit('generator_started', { powers: 'facility_lighting' });
    assert.equal(events.storyTimeouts.size, 2);
    tick(1000);
    events.emit('game_ended', { ending: 'A' });
    assert.equal(events.storyStopped, true);
    assert.equal(events.storyTimeouts.size, 0);
    let callbackRan = false;
    events.scheduleStory(() => { callbackRan = true; }, 1);
    // Reset only the counter so the first-key path would schedule again if not stopped.
    events.gameState.keysCollected = 0;
    events.emit('key_collected', { id: 'later_key' });
    events.emit('generator_started', { powers: 'facility_lighting' });
    events.emit('note_read', { title: 'Too late' });
    events.stopStoryTimers(); // idempotent
    tick(10000);
    assert.equal(callbackRan, false);
    assert.equal(events.storyTimeouts.size, 0);
    assert.equal(events.gameState.powerRestored, false);
    assert.equal(h.events.filter((event) => ['story_trigger', 'power_restored'].includes(event.name)).length, 0);
});

test('actual Game startFinalSequence cancels story/light timers before B completion', (t) => {
    const h = harness(t);
    const tick = fakeSystemTimers(t);
    const events = h.systems.eventSystem;
    events.emit('key_collected', { id: 'ward_key' });
    events.emit('generator_started', { powers: 'facility_lighting' });
    h.environment.restorePower();
    const stopStory = t.mock.method(events, 'stopStoryTimers');
    h.game.startFinalSequence();
    assert.equal(stopStory.mock.callCount(), 1);
    assert.equal(events.storyStopped, true);
    assert.equal(events.storyTimeouts.size, 0);
    assert.equal(h.environment.lightTimeouts.size, 0);
    assert.equal(h.environment.lightIntervals.size, 0);
    events.emit('generator_started', { powers: 'facility_lighting' });
    tick(10000);
    assert.equal(h.events.filter((event) => ['story_trigger', 'power_restored', 'power_fully_restored'].includes(event.name)).length, 0);
    assert.equal(h.game.gameEnded, false, 'Game completion timer remains separately queued by the VM harness');
    assert.equal(h.timers.length, 1);
    h.timers[0].callback();
    assert.equal(h.game.gameEnded, true);
    assert.equal([...h.document.children][0].dataset.ending, 'B');
});

for (const cleanup of ['stopLightTimers', 'clearLights', 'dispose']) {
    test(`Environment ${cleanup} cancels pending light timeouts and intervals`, (t) => {
        const h = harness(t);
        const tick = fakeSystemTimers(t);
        let calls = 0;
        h.environment.lightTimeout(() => { calls++; }, 50);
        h.environment.lightInterval(() => { calls++; }, 100);
        h.environment.flickerInterval = h.environment.lightInterval(() => { calls++; }, 200);
        tick(50);
        assert.equal(calls, 1);
        assert.equal(h.environment.lightTimeouts.size, 0, 'Fired timeouts release ownership');
        h.environment.lightTimeout(() => { calls++; }, 500);
        assert.equal(h.environment.lightIntervals.size, 2);
        h.environment[cleanup]();
        assert.equal(h.environment.lightTimeouts.size, 0);
        assert.equal(h.environment.lightIntervals.size, 0);
        assert.equal(h.environment.flickerInterval, null);
        tick(5000);
        assert.equal(calls, 1, 'No pending callback survives cleanup');
    });
}

test('restoring lab power adds one protective safe zone and ramps generator light', async (t) => {
    const h = harness(t);
    await h.manager.loadScene('experiment_lab');
    const tick = fakeSystemTimers(t);
    const originalZones = h.manager.safeZones.length;
    const generator = h.find('experiment_generator');
    h.scene.activeCamera.position.set(generator.mesh.position.x, 1.8, generator.mesh.position.z);
    await chasing(h, new Vector3(generator.mesh.position.x, 0, generator.mesh.position.z - 4));
    h.monster.darkExposure = 2;
    h.monster.update(0.1);
    closeTo(h.monster.darkExposure, 2.1);
    h.environment.restorePower();
    h.environment.restorePower();
    assert.equal(h.environment.lightTimeouts.size, 1, 'Restore request is idempotent');
    tick(1000);
    assert.equal(h.environment.lightTimeouts.size, 0);
    assert.equal(h.manager.safeZones.length, originalZones);
    tick(100);
    assert.equal(h.manager.safeZones.length, originalZones + 1);
    const zone = h.manager.safeZones.at(-1);
    assert.deepEqual(zone.position.asArray(), [-0.75, 0, 8.5]);
    assert.equal(zone.radius, 2.5);
    const light = h.environment.lights.find((entry) => entry.name === 'power_restored_generator');
    assert.ok(light);
    closeTo(light.intensity, 0.02);
    const before = h.monster.pivot.position.clone();
    assert.equal(h.monster.pivot.isEnabled(), true, 'Ghost is visible before generator light protection');
    h.monster.update(0.1);
    closeTo(h.monster.darkExposure, 1.9);
    assert.deepEqual(h.monster.pivot.position.asArray(), before.asArray(), 'Protected pursuit stops moving');
    assert.equal(h.monster.pivot.isEnabled(), false, 'Restored generator light hides the ghost');
    for (const mesh of h.monster.meshSet) assert.equal(mesh.isEnabled(), false);
    assert.equal(h.endingEvents().length, 0);
    for (let i = 0; i < 29; i++) tick(100);
    closeTo(light.intensity, 0.6);
    assert.equal(h.events.filter((event) => event.name === 'power_fully_restored').length, 1);
    tick(5000);
    assert.equal(h.manager.safeZones.length, originalZones + 1);
    assert.equal(h.environment.lights.filter((entry) => entry.name === 'power_restored_generator').length, 1);
    assert.equal(h.events.filter((event) => event.name === 'power_fully_restored').length, 1);
    h.environment.clearLights();
    assert.equal(h.environment.lightIntervals.size, 0);
});
