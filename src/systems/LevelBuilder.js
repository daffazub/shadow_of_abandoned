import { Vector3, MeshBuilder, StandardMaterial, Color3, SpotLight, PointLight, ParticleSystem, Texture, Animation } from '@babylonjs/core';

export class LevelBuilder {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.meshes = [];
        this.lights = [];
        this.materials = new Map();
        this.modelsLoaded = false;
        
        this.initializeMaterials();
        this.loadModels();
    }
    
    async loadModels() {
        if (this.modelsLoaded) return;
        
        try {
            // Load the table GLTF model
            await this.systems.assetManager.loadTableModel();
            this.modelsLoaded = true;
            console.log('GLTF models loaded successfully');
        } catch (error) {
            console.warn('Failed to load GLTF models, using placeholders:', error);
            this.modelsLoaded = false;
        }
    }
    
    initializeMaterials() {
        // Wall materials
        this.materials.set('wall_dirty', this.createWallMaterial('wall_dirty', new Color3(0.35, 0.4, 0.35)));
        this.materials.set('wall_moldy', this.createWallMaterial('wall_moldy', new Color3(0.25, 0.3, 0.2)));
        this.materials.set('wall_blood', this.createWallMaterial('wall_blood', new Color3(0.4, 0.2, 0.2)));
        
        // Floor materials
        this.materials.set('floor_tile', this.createFloorMaterial('floor_tile', new Color3(0.3, 0.3, 0.35)));
        this.materials.set('floor_concrete', this.createFloorMaterial('floor_concrete', new Color3(0.25, 0.25, 0.25)));
        
        // Prop materials
        this.materials.set('metal_rusty', this.createMetalMaterial('metal_rusty', new Color3(0.4, 0.25, 0.1)));
        this.materials.set('wood_old', this.createWoodMaterial('wood_old', new Color3(0.3, 0.2, 0.1)));
        this.materials.set('fabric_torn', this.createFabricMaterial('fabric_torn', new Color3(0.2, 0.15, 0.1)));
    }
    
    createWallMaterial(name, color) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        material.specularColor = new Color3(0.1, 0.1, 0.1);
        material.roughness = 0.8;
        return material;
    }
    
    createFloorMaterial(name, color) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        material.specularColor = new Color3(0.2, 0.2, 0.2);
        material.roughness = 0.6;
        return material;
    }
    
    createMetalMaterial(name, color) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        material.specularColor = new Color3(0.3, 0.3, 0.3);
        material.roughness = 0.7;
        return material;
    }
    
    createWoodMaterial(name, color) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        material.specularColor = new Color3(0.05, 0.05, 0.05);
        material.roughness = 0.9;
        return material;
    }
    
    createFabricMaterial(name, color) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = color;
        material.specularColor = new Color3(0.01, 0.01, 0.01);
        material.roughness = 1.0;
        return material;
    }
    
    // Main level creation methods
    createAsylumEntrance() {
        const config = {
            width: 25,
            depth: 20,
            height: 4.5,
            position: Vector3.Zero()
        };
        
        this.createRoom(config, 'floor_tile', 'wall_dirty');
        this.createEntranceProps(config);
        this.createEntranceLighting(config);
        this.createEntranceTriggers(config);
        
        return config;
    }
    
    createMainCorridor() {
        const config = {
            width: 4,
            depth: 40,
            height: 4,
            position: new Vector3(0, 0, 20)
        };
        
        this.createCorridor(config, 'floor_concrete', 'wall_moldy');
        this.createCorridorProps(config);
        this.createFlickeringLights(config);
        this.createCorridorTriggers(config);
        
        return config;
    }
    
    createPatientRooms() {
        const rooms = [];
        
        // Left side rooms
        for (let i = 0; i < 6; i++) {
            const config = {
                width: 8,
                depth: 6,
                height: 3.5,
                position: new Vector3(-10, 0, 10 + i * 8)
            };
            
            this.createRoom(config, 'floor_tile', 'wall_blood');
            this.createPatientRoomProps(config, i);
            this.createDimLighting(config);
            rooms.push(config);
        }
        
        // Right side rooms
        for (let i = 0; i < 6; i++) {
            const config = {
                width: 8,
                depth: 6,
                height: 3.5,
                position: new Vector3(10, 0, 10 + i * 8)
            };
            
            this.createRoom(config, 'floor_tile', 'wall_dirty');
            this.createPatientRoomProps(config, i + 6);
            this.createDimLighting(config);
            rooms.push(config);
        }
        
        return rooms;
    }
    
    createResearchWing() {
        const config = {
            width: 30,
            depth: 25,
            height: 5,
            position: new Vector3(0, 0, 60)
        };
        
        this.createRoom(config, 'floor_concrete', 'wall_moldy');
        this.createResearchProps(config);
        this.createEmergencyLighting(config);
        this.createResearchTriggers(config);
        
        return config;
    }
    
    createBasement() {
        const config = {
            width: 20,
            depth: 15,
            height: 3,
            position: new Vector3(0, -4, 80)
        };
        
        this.createRoom(config, 'floor_concrete', 'wall_blood');
        this.createBasementProps(config);
        this.createMinimalLighting(config);
        this.createBasementTriggers(config);
        
        return config;
    }
    
    // Room creation utilities
    createRoom(config, floorMaterial, wallMaterial) {
        const { width, depth, height, position } = config;
        
        // Floor
        const floor = MeshBuilder.CreateGround(`floor_${Date.now()}`, { width, height: depth }, this.scene);
        floor.position = new Vector3(position.x, position.y, position.z);
        floor.material = this.materials.get(floorMaterial);
        floor.checkCollisions = true;
        this.meshes.push(floor);
        
        // Ceiling
        const ceiling = MeshBuilder.CreateGround(`ceiling_${Date.now()}`, { width, height: depth }, this.scene);
        ceiling.position = new Vector3(position.x, position.y + height, position.z);
        ceiling.rotation.x = Math.PI;
        ceiling.material = this.materials.get(wallMaterial);
        this.meshes.push(ceiling);
        
        // Walls
        this.createWalls(config, wallMaterial);
    }
    
    createCorridor(config, floorMaterial, wallMaterial) {
        const { width, depth, height, position } = config;
        
        // Floor
        const floor = MeshBuilder.CreateGround(`corridor_floor_${Date.now()}`, { width, height: depth }, this.scene);
        floor.position = new Vector3(position.x, position.y, position.z);
        floor.material = this.materials.get(floorMaterial);
        floor.checkCollisions = true;
        this.meshes.push(floor);
        
        // Ceiling
        const ceiling = MeshBuilder.CreateGround(`corridor_ceiling_${Date.now()}`, { width, height: depth }, this.scene);
        ceiling.position = new Vector3(position.x, position.y + height, position.z);
        ceiling.rotation.x = Math.PI;
        ceiling.material = this.materials.get(wallMaterial);
        this.meshes.push(ceiling);
        
        // Side walls only
        this.createCorridorWalls(config, wallMaterial);
        
        // Add doors to rooms
        this.createCorridorDoors(config);
    }
    
    createWalls(config, materialName) {
        const { width, depth, height, position } = config;
        const material = this.materials.get(materialName);
        
        const walls = [
            { pos: new Vector3(position.x, position.y + height/2, position.z + depth/2), size: { width, height, depth: 0.3 } },
            { pos: new Vector3(position.x, position.y + height/2, position.z - depth/2), size: { width, height, depth: 0.3 } },
            { pos: new Vector3(position.x + width/2, position.y + height/2, position.z), size: { width: 0.3, height, depth } },
            { pos: new Vector3(position.x - width/2, position.y + height/2, position.z), size: { width: 0.3, height, depth } }
        ];
        
        walls.forEach((wall, index) => {
            const wallMesh = MeshBuilder.CreateBox(`wall_${Date.now()}_${index}`, wall.size, this.scene);
            wallMesh.position.copyFrom(wall.pos);
            wallMesh.material = material;
            wallMesh.checkCollisions = true;
            this.meshes.push(wallMesh);
        });
    }
    
    createCorridorWalls(config, materialName) {
        const { width, depth, height, position } = config;
        const material = this.materials.get(materialName);
        
        // Left wall
        const leftWall = MeshBuilder.CreateBox(`corridor_wall_left_${Date.now()}`, { width: 0.3, height, depth }, this.scene);
        leftWall.position = new Vector3(position.x - width/2, position.y + height/2, position.z);
        leftWall.material = material;
        leftWall.checkCollisions = true;
        this.meshes.push(leftWall);
        
        // Right wall
        const rightWall = MeshBuilder.CreateBox(`corridor_wall_right_${Date.now()}`, { width: 0.3, height, depth }, this.scene);
        rightWall.position = new Vector3(position.x + width/2, position.y + height/2, position.z);
        rightWall.material = material;
        rightWall.checkCollisions = true;
        this.meshes.push(rightWall);
    }
    
    // Props and furniture
    createEntranceProps(config) {
        const { position } = config;
        
        // Reception desk using table model
        this.createTable(new Vector3(position.x + 8, position.y, position.z - 5));
        
        // Broken chairs
        for (let i = 0; i < 3; i++) {
            const chair = this.createProp(`chair_${i}`, { width: 0.8, height: 1.5, depth: 0.8 },
                new Vector3(position.x - 6 + i * 2, position.y + 0.75, position.z + 3), 'fabric_torn');
        }
        
        // Debris
        this.createDebris(position, 5);
    }
    
    createCorridorProps(config) {
        const { position, depth } = config;
        
        // Gurneys
        for (let i = 0; i < 3; i++) {
            const gurney = this.createProp(`gurney_${i}`, { width: 2, height: 0.8, depth: 0.8 },
                new Vector3(position.x + (i % 2 === 0 ? -1.5 : 1.5), position.y + 0.4, position.z - depth/2 + 5 + i * 8), 'metal_rusty');
        }
        
        // Wheelchairs
        for (let i = 0; i < 2; i++) {
            const wheelchair = this.createProp(`wheelchair_${i}`, { width: 1, height: 1.2, depth: 1.2 },
                new Vector3(position.x + (i % 2 === 0 ? 1.2 : -1.2), position.y + 0.6, position.z + 10 + i * 15), 'metal_rusty');
        }
    }
    
    createPatientRoomProps(config, roomIndex) {
        const { position } = config;
        
        // Bed
        const bed = this.createProp(`bed_${roomIndex}`, { width: 2, height: 0.6, depth: 1 },
            new Vector3(position.x + 2, position.y + 0.3, position.z + 1), 'metal_rusty');
        
        // Nightstand using table model (scaled down)
        this.createTable(new Vector3(position.x + 3.2, position.y, position.z + 1.5), null, new Vector3(0.5, 0.5, 0.5));
        
        // Sink (broken)
        const sink = this.createProp(`sink_${roomIndex}`, { width: 0.8, height: 0.9, depth: 0.5 },
            new Vector3(position.x - 2.5, position.y + 0.45, position.z - 2), 'metal_rusty');
        
        // Random debris
        this.createDebris(position, 2);
    }
    
    createResearchProps(config) {
        const { position } = config;
        
        // Research tables using GLTF model
        for (let i = 0; i < 4; i++) {
            this.createTable(new Vector3(position.x - 8 + i * 5, position.y, position.z + 5));
        }
        
        // Equipment cabinets
        for (let i = 0; i < 3; i++) {
            const cabinet = this.createProp(`cabinet_${i}`, { width: 1.5, height: 2.2, depth: 0.8 },
                new Vector3(position.x + 10, position.y + 1.1, position.z - 8 + i * 4), 'metal_rusty');
        }
        
        // Generator
        const generator = this.createProp('generator', { width: 2, height: 1.5, depth: 1.2 },
            new Vector3(position.x - 12, position.y + 0.75, position.z - 8), 'metal_rusty');
    }
    
    createBasementProps(config) {
        const { position } = config;
        
        // Boiler
        const boiler = this.createProp('boiler', { width: 3, height: 2.5, depth: 2 },
            new Vector3(position.x - 6, position.y + 1.25, position.z + 4), 'metal_rusty');
        
        // Pipes
        for (let i = 0; i < 5; i++) {
            const pipe = this.createProp(`pipe_${i}`, { width: 0.2, height: 2.8, depth: 0.2 },
                new Vector3(position.x + 3 + i * 1.5, position.y + 1.4, position.z - 5), 'metal_rusty');
        }
        
        // Storage boxes
        for (let i = 0; i < 6; i++) {
            const box = this.createProp(`box_${i}`, { width: 1, height: 1, depth: 1 },
                new Vector3(position.x + 5 + (i % 3) * 1.2, position.y + 0.5, position.z + 2 + Math.floor(i / 3) * 1.2), 'wood_old');
        }
    }
    
    createProp(name, size, position, materialName) {
        const prop = MeshBuilder.CreateBox(name, size, this.scene);
        prop.position.copyFrom(position);
        prop.material = this.materials.get(materialName);
        prop.checkCollisions = true;
        this.meshes.push(prop);
        return prop;
    }
    
    createTable(position, rotation = null, scale = null) {
        console.log(`Creating table at position:`, position, `Models loaded: ${this.modelsLoaded}`);
        
        if (this.modelsLoaded) {
            // Use GLTF table model
            const tableInstance = this.systems.assetManager.createModelInstance('table', position, rotation, scale);
            if (tableInstance) {
                console.log('GLTF table instance created successfully');
                this.meshes.push(tableInstance);
                return tableInstance;
            } else {
                console.warn('Failed to create GLTF table instance, using fallback');
            }
        }
        
        // Fallback to placeholder if model not loaded
        console.log('Using placeholder table');
        const table = this.createProp(`table_${Date.now()}`, { width: 2, height: 0.8, depth: 1.2 }, position, 'wood_old');
        if (rotation) table.rotation.copyFrom(rotation);
        if (scale) table.scaling.copyFrom(scale);
        return table;
    }
    
    createDebris(centerPos, count) {
        for (let i = 0; i < count; i++) {
            const debris = this.createProp(`debris_${Date.now()}_${i}`, 
                { width: 0.3 + Math.random() * 0.5, height: 0.1 + Math.random() * 0.3, depth: 0.3 + Math.random() * 0.5 },
                new Vector3(
                    centerPos.x + (Math.random() - 0.5) * 8,
                    centerPos.y + 0.1,
                    centerPos.z + (Math.random() - 0.5) * 8
                ),
                Math.random() > 0.5 ? 'wood_old' : 'metal_rusty'
            );
        }
    }
    
    // Doors
    createCorridorDoors(config) {
        const { position, depth } = config;
        
        // Doors to patient rooms
        for (let i = 0; i < 6; i++) {
            // Left side doors
            const leftDoor = this.createDoor(`door_left_${i}`, 
                new Vector3(position.x - 2, position.y + 1.25, position.z - depth/2 + 5 + i * 8));
            
            // Right side doors
            const rightDoor = this.createDoor(`door_right_${i}`, 
                new Vector3(position.x + 2, position.y + 1.25, position.z - depth/2 + 5 + i * 8));
        }
    }
    
    createDoor(name, position) {
        const door = MeshBuilder.CreateBox(name, { width: 1.8, height: 2.5, depth: 0.1 }, this.scene);
        door.position.copyFrom(position);
        door.material = this.materials.get('wood_old');
        door.checkCollisions = true;
        this.meshes.push(door);
        return door;
    }
    
    // Lighting systems
    createEntranceLighting(config) {
        const { position, width, depth } = config;
        
        // Main overhead lights
        for (let i = 0; i < 4; i++) {
            const light = new PointLight(`entrance_light_${i}`, 
                new Vector3(position.x - width/4 + (i % 2) * width/2, position.y + 3.8, position.z - depth/4 + Math.floor(i/2) * depth/2), 
                this.scene);
            light.diffuse = new Color3(0.8, 0.7, 0.5);
            light.intensity = 0.6;
            light.range = 12;
            this.lights.push(light);
        }
    }
    
    createFlickeringLights(config) {
        const { position, depth } = config;
        
        // Corridor lights that flicker
        for (let i = 0; i < Math.floor(depth / 8); i++) {
            const light = new PointLight(`corridor_light_${i}`, 
                new Vector3(position.x, position.y + 3.5, position.z - depth/2 + 4 + i * 8), 
                this.scene);
            light.diffuse = new Color3(0.9, 0.9, 0.8);
            light.intensity = 0.4;
            light.range = 8;
            
            // Add flickering animation
            this.addFlickerAnimation(light);
            this.lights.push(light);
        }
    }
    
    createDimLighting(config) {
        const { position } = config;
        
        const light = new PointLight(`room_light_${Date.now()}`, 
            new Vector3(position.x, position.y + 3, position.z), this.scene);
        light.diffuse = new Color3(0.6, 0.5, 0.4);
        light.intensity = 0.3;
        light.range = 6;
        this.lights.push(light);
    }
    
    createEmergencyLighting(config) {
        const { position, width, depth } = config;
        
        // Red emergency lights
        for (let i = 0; i < 6; i++) {
            const light = new PointLight(`emergency_light_${i}`, 
                new Vector3(position.x - width/3 + (i % 3) * width/3, position.y + 4.5, position.z - depth/3 + Math.floor(i/3) * depth/3), 
                this.scene);
            light.diffuse = new Color3(1, 0.2, 0.2);
            light.intensity = 0.5;
            light.range = 10;
            
            // Slow pulsing
            this.addPulseAnimation(light);
            this.lights.push(light);
        }
    }
    
    createMinimalLighting(config) {
        const { position } = config;
        
        // Single dim light
        const light = new PointLight(`basement_light`, 
            new Vector3(position.x, position.y + 2.5, position.z), this.scene);
        light.diffuse = new Color3(0.4, 0.4, 0.3);
        light.intensity = 0.2;
        light.range = 8;
        this.lights.push(light);
    }
    
    addFlickerAnimation(light) {
        const flickerAnim = Animation.CreateAndStartAnimation(
            `flicker_${light.name}`,
            light,
            'intensity',
            30,
            120,
            light.intensity,
            light.intensity * 0.1,
            1,
            undefined,
            () => {
                // Random flicker timing
                setTimeout(() => this.addFlickerAnimation(light), 1000 + Math.random() * 3000);
            }
        );
    }
    
    addPulseAnimation(light) {
        const pulseAnim = Animation.CreateAndStartAnimation(
            `pulse_${light.name}`,
            light,
            'intensity',
            30,
            60,
            light.intensity,
            light.intensity * 0.3,
            1
        );
    }
    
    // Trigger zones
    createEntranceTriggers(config) {
        const { position } = config;
        
        this.createTrigger(position, 3, 'area_entered', { area: 'entrance' });
        this.createTrigger(new Vector3(position.x, position.y, position.z + 8), 2, 'approaching_corridor', {});
    }
    
    createCorridorTriggers(config) {
        const { position, depth } = config;
        
        // Entity encounters at specific points
        this.createTrigger(new Vector3(position.x, position.y, position.z - depth/4), 2, 'entity_encounter', { intensity: 1 });
        this.createTrigger(new Vector3(position.x, position.y, position.z + depth/4), 2, 'entity_encounter', { intensity: 2 });
    }
    
    createResearchTriggers(config) {
        const { position } = config;
        
        this.createTrigger(position, 4, 'area_entered', { area: 'research_wing' });
        this.createTrigger(new Vector3(position.x - 10, position.y, position.z), 2, 'generator_proximity', {});
    }
    
    createBasementTriggers(config) {
        const { position } = config;
        
        this.createTrigger(position, 3, 'area_entered', { area: 'basement' });
        this.createTrigger(new Vector3(position.x, position.y, position.z + 5), 2, 'entity_encounter', { intensity: 3 });
    }
    
    createTrigger(position, radius, event, data) {
        const triggerMesh = MeshBuilder.CreateSphere(`trigger_${Date.now()}`, { diameter: radius * 2 }, this.scene);
        triggerMesh.position.copyFrom(position);
        triggerMesh.isVisible = false;
        
        let triggered = false;
        this.scene.registerBeforeRender(() => {
            if (!triggered) {
                const playerPos = this.scene.activeCamera.position;
                const distance = Vector3.Distance(playerPos, position);
                
                if (distance <= radius) {
                    this.systems.eventSystem.emit(event, data);
                    triggered = true;
                }
            }
        });
    }
    
    // Cleanup
    dispose() {
        this.meshes.forEach(mesh => mesh.dispose());
        this.lights.forEach(light => light.dispose());
        this.materials.forEach(material => material.dispose());
        
        this.meshes = [];
        this.lights = [];
        this.materials.clear();
    }
}