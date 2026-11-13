import { HemisphericLight, DirectionalLight, SpotLight, Color3, Vector3,
         ParticleSystem, Texture, Animation, Color4, PointLight, Scene } from '@babylonjs/core';

import { STORY_AREA_LAYOUT } from './StoryAreas.js';

export class EnvironmentManager {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.lights = [];
        this.particleSystems = [];
        this.flickerInterval = null;
        this.powerRestored = false;
        this.lightIntervals = new Set();
        this.lightTimeouts = new Set();
        
        this.setupBasicLighting();
        this.createAtmosphericEffects();
    }
    
    lightTimeout(callback, delay) {
        const handle = setTimeout(() => {
            this.lightTimeouts.delete(handle);
            callback();
        }, delay);
        this.lightTimeouts.add(handle);
        return handle;
    }

    lightInterval(callback, delay) {
        const handle = setInterval(callback, delay);
        this.lightIntervals.add(handle);
        return handle;
    }

    stopLightTimers() {
        this.lightIntervals.forEach((handle) => clearInterval(handle));
        this.lightTimeouts.forEach((handle) => clearTimeout(handle));
        this.lightIntervals.clear();
        this.lightTimeouts.clear();
        this.flickerInterval = null;
    }

    setupBasicLighting() {
        // Very dim ambient light for horror atmosphere
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.05;
        ambient.diffuse = new Color3(0.3, 0.3, 0.4);
        this.lights.push(ambient);
        
        // Add atmospheric corridor lighting
        this.setupAtmosphericLighting();
    }
    
    setupAtmosphericLighting() {
        // Corridor emergency lights
        const corridorPositions = [
            new Vector3(0, 3.5, 5),
            new Vector3(0, 3.5, 15),
            new Vector3(0, 3.5, 25),
            new Vector3(0, 3.5, 35)
        ];
        
        corridorPositions.forEach((pos, index) => {
            const light = new SpotLight(`corridor_${index}`, 
                pos, 
                new Vector3(0, -1, 0), 
                Math.PI / 6, 2, this.scene);
            light.intensity = 0.15;
            light.diffuse = new Color3(0.8, 0.7, 0.5);
            light.range = 12;
            this.lights.push(light);
            
            // Add subtle flickering
            if (Math.random() > 0.5) {
                this.addSubtleFlicker(light);
            }
        });
    }
    
    addSubtleFlicker(light) {
        const originalIntensity = light.intensity;
        this.lightInterval(() => {
            if (Math.random() < 0.1) {
                light.intensity = originalIntensity * (0.5 + Math.random() * 0.5);
                this.lightTimeout(() => {
                    light.intensity = originalIntensity;
                }, 100 + Math.random() * 200);
            }
        }, 2000 + Math.random() * 3000);
    }
    
    setupDimLighting() {
        this.clearLights();
        
        // Minimal ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.05;
        ambient.diffuse = new Color3(0.3, 0.3, 0.4);
        this.lights.push(ambient);
        
        // Single overhead light
        const overhead = new SpotLight('overhead', 
            new Vector3(0, 3.5, 0), 
            new Vector3(0, -1, 0), 
            Math.PI / 3, 2, this.scene);
        overhead.intensity = 0.3;
        overhead.diffuse = new Color3(0.8, 0.7, 0.5);
        this.lights.push(overhead);
    }
    
    setupFlickeringLights() {
        this.clearLights();
        
        // Dim ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.03;
        ambient.diffuse = new Color3(0.2, 0.2, 0.3);
        this.lights.push(ambient);
        
        // Flickering corridor lights
        const positions = [
            new Vector3(0, 3.5, -8),
            new Vector3(0, 3.5, -3),
            new Vector3(0, 3.5, 3),
            new Vector3(0, 3.5, 8)
        ];
        
        positions.forEach((pos, index) => {
            const light = new SpotLight(`flicker_${index}`, 
                pos, 
                new Vector3(0, -1, 0), 
                Math.PI / 4, 2, this.scene);
            light.intensity = 0.2;
            light.diffuse = new Color3(0.9, 0.8, 0.6);
            this.lights.push(light);
        });
        
        this.startFlickering();
    }
    
    setupEmergencyLighting() {
        this.clearLights();
        
        // Red emergency ambient
        const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.08;
        ambient.diffuse = new Color3(0.4, 0.1, 0.1);
        this.lights.push(ambient);
        
        // Emergency exit lights
        const exitLight1 = new SpotLight('exit1', 
            new Vector3(-5, 3, 8), 
            new Vector3(0, -1, 0.2), 
            Math.PI / 6, 1, this.scene);
        exitLight1.intensity = 0.4;
        exitLight1.diffuse = new Color3(1, 0.2, 0.2);
        this.lights.push(exitLight1);
        
        const exitLight2 = new SpotLight('exit2', 
            new Vector3(5, 3, 8), 
            new Vector3(0, -1, -0.2), 
            Math.PI / 6, 1, this.scene);
        exitLight2.intensity = 0.4;
        exitLight2.diffuse = new Color3(1, 0.2, 0.2);
        this.lights.push(exitLight2);
    }
    
    startFlickering() {
        if (this.flickerInterval) {
            clearInterval(this.flickerInterval);
        }
        
        this.flickerInterval = this.lightInterval(() => {
            this.lights.forEach(light => {
                if (light.name.includes('flicker')) {
                    // Random flicker
                    if (Math.random() < 0.3) {
                        const originalIntensity = light.intensity;
                        light.intensity = Math.random() * 0.1;
                        
                        this.lightTimeout(() => {
                            light.intensity = originalIntensity;
                        }, 50 + Math.random() * 200);
                    }
                }
            });
        }, 1000 + Math.random() * 2000);
    }
    
    flickerLights() {
        // Immediate flicker effect for entity encounters
        this.lights.forEach(light => {
            if (light.name !== 'ambient') {
                const originalIntensity = light.intensity;
                light.intensity = 0;
                
                this.lightTimeout(() => {
                    light.intensity = originalIntensity * 0.3;
                    this.lightTimeout(() => {
                        light.intensity = originalIntensity;
                    }, 100);
                }, 50);
            }
        });
    }
    
    createAtmosphericEffects() {
        this.createDustParticles();
        this.createFogEffect();
    }
    
    createDustParticles() {
        const dustSystem = new ParticleSystem('dust', 200, this.scene);
        
        // Dust texture (create simple white texture)
        dustSystem.particleTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', this.scene);
        
        // Babylon applies the emitter transform, so these bounds stay camera-local.
        dustSystem.emitter = this.scene.activeCamera;
        dustSystem.minEmitBox = new Vector3(-10, -2, -10);
        dustSystem.maxEmitBox = new Vector3(10, 4, 10);
        
        // Particle properties
        dustSystem.color1 = new Color4(0.8, 0.8, 0.7, 0.25);
        dustSystem.color2 = new Color4(0.6, 0.6, 0.5, 0.15);
        dustSystem.colorDead = new Color4(0.4, 0.4, 0.3, 0);
        
        dustSystem.minSize = 0.01;
        dustSystem.maxSize = 0.05;
        dustSystem.minLifeTime = 5;
        dustSystem.maxLifeTime = 15;
        dustSystem.emitRate = 20;
        
        // Movement
        dustSystem.direction1 = new Vector3(-0.1, -0.1, -0.1);
        dustSystem.direction2 = new Vector3(0.1, 0.1, 0.1);
        dustSystem.minEmitPower = 0.1;
        dustSystem.maxEmitPower = 0.3;
        dustSystem.updateSpeed = 0.01;
        
        dustSystem.gravity = new Vector3(0, -0.1, 0);
        
        dustSystem.start();
        this.dustSystem = dustSystem;
        this.particleSystems.push(dustSystem);
    }
    
    createFogEffect() {
        // Enhanced fog for horror atmosphere
        this.scene.fogEnabled = true;
        this.scene.fogMode = Scene.FOGMODE_EXP2;
        this.scene.fogColor = new Color3(0.08, 0.08, 0.12);
        this.scene.fogDensity = 0.015;
        this.scene.fogStart = 5.0;
        this.scene.fogEnd = 30.0;
    }
    
    restorePower() {
        if (this.powerRestored) return;
        this.powerRestored = true;
        
        // Gradually restore lighting
        const restoreAnimation = () => {
            let intensity = 0;
            const maxIntensity = 0.6;
            const step = 0.02;
            
            const interval = this.lightInterval(() => {
                intensity += step;
                
                // Add new lights
                if (intensity === step) {
                    this.addPowerRestoredLights();
                }
                
                // Update light intensities
                this.lights.forEach(light => {
                    if (light.name.includes('power_restored')) {
                        light.intensity = Math.min(intensity, maxIntensity);
                    }
                });
                
                if (intensity >= maxIntensity) {
                    clearInterval(interval);
                    this.systems.eventSystem.emit('power_fully_restored');
                }
            }, 100);
        };
        
        this.lightTimeout(restoreAnimation, 1000);
    }
    
    addPowerRestoredLights() {
        if (this.systems.sceneManager.currentScene === 'experiment_lab') {
            const layout = STORY_AREA_LAYOUT.experiment_lab;
            const zone = { position: layout.generator.clone(), radius: layout.powerRadius };
            this.systems.sceneManager.safeZones.push(zone);
            const light = new PointLight('power_restored_generator', zone.position.add(new Vector3(0, 3, 0)), this.scene);
            light.diffuse = new Color3(0.55, 0.85, 1);
            light.range = 11;
            light.intensity = 0;
            this.lights.push(light);
            return;
        }
        // Main corridor lighting
        const mainLight = new DirectionalLight('power_restored_main', new Vector3(0, -1, 0.3), this.scene);
        mainLight.intensity = 0;
        mainLight.diffuse = new Color3(0.9, 0.9, 1.0);
        this.lights.push(mainLight);
        
        // Exit pathway lights
        for (let i = 0; i < 5; i++) {
            const pathLight = new SpotLight(`power_restored_path_${i}`, 
                new Vector3(0, 2.5, 8 + i * 2), 
                new Vector3(0, -1, 0), 
                Math.PI / 8, 1, this.scene);
            pathLight.intensity = 0;
            pathLight.diffuse = new Color3(0.8, 1.0, 0.8);
            this.lights.push(pathLight);
        }
    }
    
    startChaseSequence() {
        // Dramatic lighting changes for chase
        this.lights.forEach(light => {
            if (!light.name.includes('flashlight')) {
                // Strobe effect
                let strobeCount = 0;
                const strobeInterval = this.lightInterval(() => {
                    light.intensity = light.intensity > 0 ? 0 : 0.8;
                    strobeCount++;
                    
                    if (strobeCount > 10) {
                        clearInterval(strobeInterval);
                        light.intensity = 0.1; // Dim after strobe
                    }
                }, 200);
            }
        });
        
        // Add red warning lights
        this.addChaseWarningLights();
    }
    
    addChaseWarningLights() {
        const warningPositions = [
            new Vector3(-3, 3, 0),
            new Vector3(3, 3, 0),
            new Vector3(0, 3, -5),
            new Vector3(0, 3, 5)
        ];
        
        warningPositions.forEach((pos, index) => {
            const warningLight = new SpotLight(`chase_warning_${index}`, 
                pos, 
                new Vector3(0, -1, 0), 
                Math.PI / 4, 2, this.scene);
            warningLight.intensity = 0.6;
            warningLight.diffuse = new Color3(1, 0, 0);
            this.lights.push(warningLight);
            
            // Pulsing animation
            const pulseAnimation = Animation.CreateAndStartAnimation(
                `pulse_${index}`, warningLight, 'intensity', 
                30, 60, 0.6, 0.1, 1, () => {
                    // Loop the animation
                    pulseAnimation.restart();
                }
            );
        });
    }
    
    lockDoorsInArea(area) {
        // Find and lock doors in the current area
        this.systems.interactionManager.interactables.forEach(interactable => {
            if (interactable.type === 'door') {
                interactable.data.locked = true;
                interactable.data.chaseMode = true;
            }
        });
    }
    
    setupStoryLighting(name, safeZones) {
        this.clearLights();
        this.powerRestored = false;
        const ambient = new HemisphericLight('story_ambient', Vector3.Up(), this.scene);
        ambient.intensity = 0.12;
        ambient.diffuse = name === 'restricted_area' ? new Color3(0.6, 0.18, 0.15) : new Color3(0.25, 0.4, 0.7);
        this.lights.push(ambient);
        safeZones.forEach((zone, index) => {
            const light = new PointLight(`safe_zone_${index}`, zone.position.add(new Vector3(0, 2.8, 0)), this.scene);
            light.intensity = 1.1;
            light.range = 7;
            light.diffuse = new Color3(0.7, 0.85, 1);
            this.lights.push(light);
        });
    }

    // Compatibility entry points: the single MonsterManager owns all pursuit state.
    startEntityPursuit() {
        this.systems.monsterManager?.startChase();
    }

    stopEntityPursuit() {
        this.systems.monsterManager?.despawn();
    }

    createEntityEffects() {
        // Shadow particles
        const shadowSystem = new ParticleSystem('shadows', 100, this.scene);
        shadowSystem.particleTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAFfeTFYmwAAAABJRU5ErkJggg==', this.scene);
        
        shadowSystem.emitter = this.scene.activeCamera;
        shadowSystem.minEmitBox = new Vector3(-5, 0, -5);
        shadowSystem.maxEmitBox = new Vector3(5, 3, 5);
        
        shadowSystem.color1 = new Color4(0.1, 0.1, 0.1, 0.3);
        shadowSystem.color2 = new Color4(0.05, 0.05, 0.05, 0.15);
        shadowSystem.colorDead = new Color4(0, 0, 0, 0);
        
        shadowSystem.minSize = 0.5;
        shadowSystem.maxSize = 2.0;
        shadowSystem.minLifeTime = 2;
        shadowSystem.maxLifeTime = 5;
        shadowSystem.emitRate = 30;
        
        shadowSystem.start();
        this.particleSystems.push(shadowSystem);
    }
    
    clearLights() {
        this.stopLightTimers();
        this.lights.forEach(light => {
            if (light.name !== 'flashlight') {
                light.dispose();
            }
        });
        this.lights = this.lights.filter(light => light.name === 'flashlight');
        
        if (this.flickerInterval) {
            clearInterval(this.flickerInterval);
            this.flickerInterval = null;
        }
    }
    
    update() {
        // The camera may be created after the environment, replaced, or removed.
        if (this.dustSystem) {
            this.dustSystem.emitter = this.scene.activeCamera;
        }
    }
    
    dispose() {
        this.clearLights();
        
        this.particleSystems.forEach(system => {
            system.dispose();
        });
        this.particleSystems = [];
        this.dustSystem = null;
    }
}