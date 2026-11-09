import { HemisphericLight, DirectionalLight, SpotLight, Color3, Vector3, 
         ParticleSystem, Texture, Animation, MeshBuilder } from '@babylonjs/core';

export class EnvironmentManager {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.lights = [];
        this.particleSystems = [];
        this.flickerInterval = null;
        this.powerRestored = false;
        
        this.setupBasicLighting();
        this.createAtmosphericEffects();
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
        setInterval(() => {
            if (Math.random() < 0.1) {
                light.intensity = originalIntensity * (0.5 + Math.random() * 0.5);
                setTimeout(() => {
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
        
        this.flickerInterval = setInterval(() => {
            this.lights.forEach(light => {
                if (light.name.includes('flicker')) {
                    // Random flicker
                    if (Math.random() < 0.3) {
                        const originalIntensity = light.intensity;
                        light.intensity = Math.random() * 0.1;
                        
                        setTimeout(() => {
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
                
                setTimeout(() => {
                    light.intensity = originalIntensity * 0.3;
                    setTimeout(() => {
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
        
        // Emitter
        dustSystem.emitter = this.scene.activeCamera;
        dustSystem.minEmitBox = new Vector3(-10, -2, -10);
        dustSystem.maxEmitBox = new Vector3(10, 4, 10);
        
        // Particle properties
        dustSystem.color1 = new Color3(0.8, 0.8, 0.7);
        dustSystem.color2 = new Color3(0.6, 0.6, 0.5);
        dustSystem.colorDead = new Color3(0.4, 0.4, 0.3);
        
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
        this.particleSystems.push(dustSystem);
    }
    
    createFogEffect() {
        // Enhanced fog for horror atmosphere
        this.scene.fogEnabled = true;
        this.scene.fogMode = 3; // FOGMODE_EXP2
        this.scene.fogColor = new Color3(0.08, 0.08, 0.12);
        this.scene.fogDensity = 0.015;
        this.scene.fogStart = 5.0;
        this.scene.fogEnd = 30.0;
    }
    
    restorePower() {
        this.powerRestored = true;
        
        // Gradually restore lighting
        const restoreAnimation = () => {
            let intensity = 0;
            const maxIntensity = 0.6;
            const step = 0.02;
            
            const interval = setInterval(() => {
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
        
        setTimeout(restoreAnimation, 1000);
    }
    
    addPowerRestoredLights() {
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
                const strobeInterval = setInterval(() => {
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
    
    startEntityPursuit() {
        // Create entity presence effects
        this.createEntityEffects();
        
        // Start pursuit audio
        this.systems.audioManager.playAmbient('entity_pursuit');
        
        // Periodic entity encounters
        this.entityPursuitInterval = setInterval(() => {
            const playerPos = this.scene.activeCamera.position;
            const entityPos = playerPos.add(new Vector3(
                (Math.random() - 0.5) * 10,
                0,
                (Math.random() - 0.5) * 10
            ));
            
            this.systems.eventSystem.emit('entity_encounter', {
                position: entityPos,
                intensity: 2
            });
        }, 3000 + Math.random() * 2000);
    }
    
    createEntityEffects() {
        // Shadow particles
        const shadowSystem = new ParticleSystem('shadows', 100, this.scene);
        shadowSystem.particleTexture = new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAFfeTFYmwAAAABJRU5ErkJggg==', this.scene);
        
        shadowSystem.emitter = this.scene.activeCamera;
        shadowSystem.minEmitBox = new Vector3(-5, 0, -5);
        shadowSystem.maxEmitBox = new Vector3(5, 3, 5);
        
        shadowSystem.color1 = new Color3(0.1, 0.1, 0.1);
        shadowSystem.color2 = new Color3(0.05, 0.05, 0.05);
        shadowSystem.colorDead = new Color3(0, 0, 0);
        
        shadowSystem.minSize = 0.5;
        shadowSystem.maxSize = 2.0;
        shadowSystem.minLifeTime = 2;
        shadowSystem.maxLifeTime = 5;
        shadowSystem.emitRate = 30;
        
        shadowSystem.start();
        this.particleSystems.push(shadowSystem);
    }
    
    clearLights() {
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
    
    update(deltaTime) {
        // Update particle systems
        this.particleSystems.forEach(system => {
            if (system.emitter === this.scene.activeCamera) {
                // Keep particles around player
                system.minEmitBox = this.scene.activeCamera.position.add(new Vector3(-5, -1, -5));
                system.maxEmitBox = this.scene.activeCamera.position.add(new Vector3(5, 2, 5));
            }
        });
    }
    
    dispose() {
        this.clearLights();
        
        this.particleSystems.forEach(system => {
            system.dispose();
        });
        this.particleSystems = [];
        
        if (this.entityPursuitInterval) {
            clearInterval(this.entityPursuitInterval);
        }
    }
}