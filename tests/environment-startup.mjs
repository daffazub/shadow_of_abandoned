import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, Scene, UniversalCamera, Vector3, ParticleSystem } from '@babylonjs/core';
import { EnvironmentManager } from '../src/systems/EnvironmentManager.js';

function harness(t, withCamera = false) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    t.after(() => engine.dispose());
    if (withCamera) {
        scene.activeCamera = new UniversalCamera('player', new Vector3(40, 10, -30), scene);
    }
    // Match main.js: construct the environment before setupCamera(). NullEngine
    // supplies in-memory textures, so no browser canvas or image loader is needed.
    const environment = new EnvironmentManager(scene, {});
    t.after(() => environment.dispose());
    const dust = environment.particleSystems.find((system) => system.name === 'dust');
    assert.ok(dust);
    return { scene, environment, dust };
}

function assertLocalBounds(dust) {
    assert.deepEqual(dust.minEmitBox.asArray(), [-10, -2, -10]);
    assert.deepEqual(dust.maxEmitBox.asArray(), [10, 4, 10]);
}

function assertEmissionAroundCamera(dust, camera) {
    const positions = [];
    dust.startPositionFunction = (worldMatrix, position, particle, isLocal) => {
        dust.particleEmitterType.startPositionFunction(worldMatrix, position, particle, isLocal);
        positions.push(position.clone());
    };
    dust.manualEmitCount = 20;
    // Prewarming exercises Babylon's real emitter transform and particle creation
    // without requiring a WebGL draw or a browser render loop.
    dust.animate(true);
    assert.equal(positions.length, 20);
    for (const position of positions) {
        const local = position.subtract(camera.globalPosition);
        assert.ok(local.x >= -10.001 && local.x <= 10.001, `local x: ${local.x}`);
        assert.ok(local.y >= -2.001 && local.y <= 4.001, `local y: ${local.y}`);
        assert.ok(local.z >= -10.001 && local.z <= 10.001, `local z: ${local.z}`);
    }
}

test('environment starts and updates before a camera exists', (t) => {
    const { scene, environment, dust } = harness(t);
    assert.ok(scene.activeCamera == null, 'startup has no active camera');
    assert.doesNotThrow(() => environment.update(1 / 60));
    assert.equal(dust.emitter, scene.activeCamera);
    scene.activeCamera = null;
    assert.doesNotThrow(() => environment.update(1 / 60));
    assert.equal(dust.emitter, null);
    assertLocalBounds(dust);
});

test('pursuit wrappers tolerate startup without a camera or monster system', (t) => {
    const { scene, environment } = harness(t);
    assert.ok(scene.activeCamera == null);
    assert.equal(environment.systems.monsterManager, undefined);
    assert.doesNotThrow(() => environment.startEntityPursuit());
    assert.doesNotThrow(() => environment.stopEntityPursuit());
    assert.doesNotThrow(() => environment.update(1 / 60));
});

test('dust binds to the camera created after environment startup and follows movement', (t) => {
    const { scene, environment, dust } = harness(t);
    const camera = new UniversalCamera('player', new Vector3(40, 10, -30), scene);
    scene.activeCamera = camera;
    environment.update(1 / 60);
    assert.ok(dust.emitter === camera, 'dust emitter must be the active camera');
    assertLocalBounds(dust);
    assertEmissionAroundCamera(dust, camera);

    camera.position.set(-60, 20, 80);
    environment.update(1 / 60);
    assertLocalBounds(dust);
    assertEmissionAroundCamera(dust, camera);
});

test('dust uses an existing camera without adding its position to local bounds', (t) => {
    const { scene, environment, dust } = harness(t, true);
    assert.ok(dust.emitter === scene.activeCamera, 'dust must bind to an existing camera');
    environment.update(1 / 60);
    assertLocalBounds(dust);
    assertEmissionAroundCamera(dust, scene.activeCamera);
});

test('dust follows camera replacement and safely unbinds when no camera is active', (t) => {
    const { scene, environment, dust } = harness(t, true);
    const other = new ParticleSystem('other', 1, scene);
    const otherEmitter = new Vector3(1, 2, 3);
    other.emitter = otherEmitter;
    environment.particleSystems.push(other);

    const replacement = new UniversalCamera('replacement', new Vector3(100, 15, -100), scene);
    scene.activeCamera = replacement;
    environment.update(1 / 60);
    assert.ok(dust.emitter === replacement, 'dust must follow camera replacement');
    assert.equal(other.emitter, otherEmitter);
    assertLocalBounds(dust);
    assertEmissionAroundCamera(dust, replacement);

    scene.activeCamera = null;
    assert.doesNotThrow(() => environment.update(1 / 60));
    assert.equal(dust.emitter, null);
    assert.equal(other.emitter, otherEmitter);
    assertLocalBounds(dust);

    scene.activeCamera = replacement;
    environment.update(1 / 60);
    assert.ok(dust.emitter === replacement, 'dust must rebind after camera removal');
    assertLocalBounds(dust);
});

test('atmospheric fog uses Babylon exponential-squared mode', (t) => {
    const { scene } = harness(t);
    assert.equal(scene.fogEnabled, true);
    assert.equal(scene.fogMode, Scene.FOGMODE_EXP2);
});
