export class EventSystem {
    constructor() {
        this.listeners = new Map();
        this.gameState = {
            keysCollected: 0,
            notesRead: 0,
            generatorStarted: false,
            powerRestored: false,
            entityEncounters: 0,
            currentArea: 'entrance'
        };
    }
    
    on(eventName, callback) {
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        this.listeners.get(eventName).push(callback);
    }
    
    off(eventName, callback) {
        if (this.listeners.has(eventName)) {
            const callbacks = this.listeners.get(eventName);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    emit(eventName, data = {}) {
        console.log(`Event: ${eventName}`, data);
        
        // Update game state based on events
        this.updateGameState(eventName, data);
        
        // Trigger event listeners
        if (this.listeners.has(eventName)) {
            this.listeners.get(eventName).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }
        
        // Check for story progression
        this.checkStoryProgression(eventName, data);
    }
    
    updateGameState(eventName, data) {
        switch (eventName) {
            case 'key_collected':
                this.gameState.keysCollected++;
                break;
            case 'note_read':
                this.gameState.notesRead++;
                break;
            case 'generator_started':
                this.gameState.generatorStarted = true;
                break;
            case 'power_restored':
                this.gameState.powerRestored = true;
                break;
            case 'entity_encounter':
                this.gameState.entityEncounters++;
                break;
            case 'area_entered':
                this.gameState.currentArea = data.area;
                break;
        }
    }
    
    checkStoryProgression(eventName, data) {
        // First key collected - trigger entity introduction
        if (eventName === 'key_collected' && this.gameState.keysCollected === 1) {
            setTimeout(() => {
                this.emit('story_trigger', { 
                    type: 'entity_introduction',
                    message: 'You hear a faint whisper echoing through the halls...'
                });
            }, 2000);
        }
        
        // First note read - reveal backstory
        if (eventName === 'note_read' && this.gameState.notesRead === 1) {
            this.emit('story_trigger', {
                type: 'backstory_reveal',
                message: 'The experiments... they went too far...'
            });
        }
        
        // Generator started - power restoration sequence
        if (eventName === 'generator_started') {
            setTimeout(() => {
                this.emit('power_restored');
                this.emit('story_trigger', {
                    type: 'power_restored',
                    message: 'Emergency lighting activated. Exit route available.'
                });
            }, 3000);
        }
        
        // Multiple entity encounters - escalate threat
        if (eventName === 'entity_encounter' && this.gameState.entityEncounters >= 3) {
            this.emit('story_trigger', {
                type: 'entity_aggressive',
                message: 'It knows you\'re here. RUN.'
            });
        }
        
        // Restricted area entered - chase sequence
        if (eventName === 'area_entered' && data.area === 'restricted') {
            this.emit('story_trigger', {
                type: 'chase_sequence',
                message: 'UNAUTHORIZED ACCESS DETECTED'
            });
        }
    }
    
    // Story-specific event handlers
    setupStoryEvents(systems) {
        this.on('story_trigger', (data) => {
            this.handleStoryTrigger(data, systems);
        });
        
        this.on('entity_encounter', (data) => {
            this.handleEntityEncounter(data, systems);
        });
        
        this.on('chase_sequence', (data) => {
            this.handleChaseSequence(data, systems);
        });
    }
    
    handleStoryTrigger(data, systems) {
        switch (data.type) {
            case 'entity_introduction':
                systems.audioManager.playEntitySound(systems.playerController.getPosition());
                this.showMessage(data.message);
                break;
                
            case 'backstory_reveal':
                this.showMessage(data.message);
                break;
                
            case 'power_restored':
                systems.environmentManager.restorePower();
                this.showMessage(data.message);
                break;
                
            case 'entity_aggressive':
                systems.audioManager.playStinger(2);
                this.showMessage(data.message);
                break;
                
            case 'chase_sequence':
                systems.audioManager.playStinger(3);
                systems.environmentManager.startChaseSequence();
                this.showMessage(data.message);
                break;
        }
    }
    
    handleEntityEncounter(data, systems) {
        // Play entity sounds
        systems.audioManager.playEntitySound(data.position);
        
        // Flicker lights
        systems.environmentManager.flickerLights();
        
        // Drain flashlight battery faster
        if (systems.playerController.flashlightEnabled) {
            systems.playerController.batteryLevel = Math.max(0, systems.playerController.batteryLevel - 10);
        }
    }
    
    handleChaseSequence(data, systems) {
        // Start chase music
        systems.audioManager.playAmbient('chase_music');
        
        // Lock doors behind player
        systems.environmentManager.lockDoorsInArea(this.gameState.currentArea);
        
        // Spawn entity pursuit
        systems.environmentManager.startEntityPursuit();
    }
    
    showMessage(message, duration = 3000) {
        // Create temporary message overlay
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: absolute;
            bottom: 150px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.8);
            color: #fff;
            padding: 20px;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 16px;
            z-index: 1000;
            max-width: 400px;
            text-align: center;
        `;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            document.body.removeChild(messageDiv);
        }, duration);
    }
    
    getGameState() {
        return { ...this.gameState };
    }
    
    setGameState(newState) {
        this.gameState = { ...this.gameState, ...newState };
    }
}