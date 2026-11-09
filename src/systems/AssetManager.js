import { SceneLoader, AssetsManager, Mesh, StandardMaterial, Color3, Texture, Sound } from '@babylonjs/core';

export class AssetManager {
    constructor(scene) {
        this.scene = scene;
        this.loadedAssets = new Map();
        this.assetsManager = new AssetsManager(scene);
    }
    
    async loadModel(name, path) {
        if (this.loadedAssets.has(name)) {
            return this.loadedAssets.get(name);
        }
        
        try {
            // Load model with proper path handling
            const result = await SceneLoader.ImportMeshAsync('', '/assets/models/', path, this.scene);
            this.loadedAssets.set(name, result);
            
            console.log(`Model ${name} loaded successfully with ${result.meshes.length} meshes`);
            
            // Setup collisions and materials for imported meshes
            result.meshes.forEach((mesh, index) => {
                if (mesh.name && mesh.geometry) {
                    // Enable collision for all solid meshes
                    mesh.checkCollisions = true;
                    
                    // Handle collision meshes (invisible but solid)
                    if (mesh.name.toLowerCase().includes('collision')) {
                        mesh.isVisible = false;
                        mesh.checkCollisions = true;
                    }
                    // Handle walls, floors, ceilings
                    else if (mesh.name.toLowerCase().includes('wall') || 
                             mesh.name.toLowerCase().includes('floor') ||
                             mesh.name.toLowerCase().includes('ceiling')) {
                        mesh.checkCollisions = true;
                        // Ensure material exists
                        if (!mesh.material) {
                            mesh.material = this.createHorrorMaterial(`${name}_${index}`);
                        }
                    }
                    // Handle props and furniture
                    else {
                        mesh.checkCollisions = true;
                        if (!mesh.material) {
                            mesh.material = this.createPlaceholderMaterial();
                        }
                    }
                }
            });
            
            return result;
        } catch (error) {
            console.warn(`Failed to load model ${name}:`, error);
            return null;
        }
    }
    
    async createModelInstance(modelName, position, rotation = null, scale = null) {
        const modelData = this.loadedAssets.get(modelName);
        console.log(`Creating instance for model: ${modelName}`, modelData ? 'Model found' : 'Model not found');
        
        if (!modelData) {
            console.warn(`Model ${modelName} not loaded`);
            return null;
        }
        
        console.log('Model meshes:', modelData.meshes.map(m => m.name));
        
        // Clone the first mesh as instance
        const originalMesh = modelData.meshes.find(m => m.geometry) || modelData.meshes[0];
        if (!originalMesh) {
            console.warn('No suitable mesh found for instancing');
            return null;
        }
        
        console.log('Using mesh for instance:', originalMesh.name);
        
        const instance = originalMesh.createInstance(`${modelName}_instance_${Date.now()}`);
        instance.position.copyFrom(position);
        
        if (rotation) {
            instance.rotation.copyFrom(rotation);
        }
        
        if (scale) {
            instance.scaling.copyFrom(scale);
        }
        
        instance.checkCollisions = true;
        console.log('Model instance created at position:', instance.position);
        return instance;
    }
    
    async loadTexture(name, path) {
        if (this.loadedAssets.has(name)) {
            return this.loadedAssets.get(name);
        }
        
        const texture = new Texture(`assets/textures/${path}`, this.scene);
        this.loadedAssets.set(name, texture);
        return texture;
    }
    
    async loadSound(name, path) {
        if (this.loadedAssets.has(name)) {
            return this.loadedAssets.get(name);
        }
        
        const sound = new Sound(name, `assets/audio/${path}`, this.scene, null, {
            loop: false,
            autoplay: false
        });
        
        this.loadedAssets.set(name, sound);
        return sound;
    }
    
    createPlaceholderMesh(name, size = 1) {
        const mesh = Mesh.CreateBox(name, size, this.scene);
        mesh.material = this.scene.getMaterialByName('placeholder') || this.createPlaceholderMaterial();
        mesh.checkCollisions = true;
        return mesh;
    }
    
    async loadTableModel() {
        // Load the industrial coffee table GLTF model
        return await this.loadModel('table', 'industrial_coffee_table_4k.gltf');
    }
    
    async loadCorridorModel() {
        // Load the horror corridor GLB model with proper collision setup
        try {
            const result = await this.loadModel('horror_corridor1', 'horror_corridor_1.glb');
            if (result && result.meshes) {
                // Setup collision for corridor meshes
                result.meshes.forEach(mesh => {
                    if (mesh.name && mesh.geometry) {
                        mesh.checkCollisions = true;
                        // Make walls and floors solid
                        if (mesh.name.toLowerCase().includes('wall') || 
                            mesh.name.toLowerCase().includes('floor') ||
                            mesh.name.toLowerCase().includes('ceiling')) {
                            mesh.isPickable = false; // Not interactive but solid
                        }
                    }
                });
            }
            return result;
        } catch (error) {
            console.error('Failed to load horror corridor model:', error);
            return null;
        }
    }
    
    createPlaceholderMaterial() {
        const material = new StandardMaterial('placeholder', this.scene);
        material.diffuseColor = new Color3(0.5, 0.5, 0.5);
        material.emissiveColor = new Color3(0.1, 0.1, 0.1);
        return material;
    }
    
    createHorrorMaterial(name) {
        const material = new StandardMaterial(name, this.scene);
        material.diffuseColor = new Color3(0.3, 0.35, 0.3);
        material.specularColor = new Color3(0.05, 0.05, 0.05);
        material.roughness = 0.8;
        return material;
    }
    
    getLoadedModel(name) {
        return this.loadedAssets.get(name);
    }
    
    dispose() {
        this.loadedAssets.clear();
        this.assetsManager.reset();
    }
}