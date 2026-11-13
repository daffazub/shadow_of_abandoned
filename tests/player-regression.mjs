import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, Scene, UniversalCamera, Vector3, MeshBuilder } from '@babylonjs/core';
import { PlayerController } from '../src/systems/PlayerController.js';

function fixture(t) {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new UniversalCamera('player', new Vector3(0, 1.8, 0), scene);
    const footsteps = [];
    const player = Object.assign(Object.create(PlayerController.prototype), {
        camera, scene, systems: { audioManager: { playFootstep() { footsteps.push(true); } } },
        controlsLocked: false, keys: {}, mouseMovement: { x: 0, y: 0 },
        moveSpeed: 3, collisionDistance: 0.6, isMoving: false,
        lastFootstepTime: 0, footstepInterval: 500, mouseSensitivity: 0.002,
        flashlight: { intensity: 3 }, flashlightEnabled: true,
        flashlightIntensity: 3, batteryLevel: 50, batteryDrainRate: 0.5,
        flickerChance: 0, updateUI() {},
    });
    t.after(() => { scene.dispose(); engine.dispose(); });
    return { player, scene, camera, footsteps };
}

test('control lock pauses battery use as well as movement', (t) => {
    const { player, camera } = fixture(t);
    player.controlsLocked = true;
    player.keys.w = true;
    player.update(10);
    assert.equal(player.batteryLevel, 50);
    assert.equal(player.flashlight.intensity, 3);
    assert.equal(camera.position.z, 0);
    assert.deepEqual(player.keys, {});
    player.controlsLocked = false;
    player.update(0.1);
    assert.equal(player.batteryLevel, 49.95);
});

test('merged frozen state blocks movement, mouse look and battery drain', (t) => {
    const { player, camera, footsteps } = fixture(t);
    player.frozen = true;
    player.keys.w = true;
    player.mouseMovement.x = 100;
    player.handleMovement(0.1);
    player.handleMouseLook();
    assert.equal(camera.position.z, 0);
    assert.equal(camera.rotation.y, 0);
    player.update(1);
    assert.deepEqual(player.keys, {});
    assert.deepEqual(player.mouseMovement, { x: 0, y: 0 });
    assert.equal(player.batteryLevel, 50);
    assert.equal(footsteps.length, 0);
});

test('returning from a stalled frame cannot consume the whole battery', (t) => {
    const { player } = fixture(t);
    player.update(600);
    assert.equal(player.batteryLevel, 49.95);
});

test('negative frame delta cannot recharge the flashlight', (t) => {
    const { player } = fixture(t);
    player.update(-1);
    assert.equal(player.batteryLevel, 50);
});

test('blocked movement does not play footsteps', (t) => {
    const { player, scene, camera, footsteps } = fixture(t);
    const wall = MeshBuilder.CreateBox('wall', { width: 4, height: 4, depth: 0.2 }, scene);
    wall.position.set(0, 2, 0.5);
    wall.checkCollisions = true;
    wall.computeWorldMatrix(true);
    player.keys.w = true;
    player.update(0.016);
    assert.equal(camera.position.z, 0);
    assert.equal(player.isMoving, false);
    assert.equal(footsteps.length, 0);
});

test('free WASD movement stays horizontal and normalized', (t) => {
    const { player, camera } = fixture(t);
    player.flashlightEnabled = false;
    player.keys.w = true;
    player.keys.d = true;
    camera.rotation.x = Math.PI / 3;
    player.update(0.05);
    assert.ok(Math.abs(Math.hypot(camera.position.x, camera.position.z) - 0.15) < 1e-6);
    assert.equal(camera.position.y, 1.8);
    assert.equal(player.isMoving, true);
});
