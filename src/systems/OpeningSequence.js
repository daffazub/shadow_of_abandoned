export class OpeningSequence {
    constructor(scene, systems) {
        this.scene = scene;
        this.systems = systems;
        this.hasStarted = false;
        this.triggersActivated = {
            objectLook: false,
            firstMovement: false
        };
        this.stepCount = 0;
    }

    start() {
        if (this.hasStarted) return;
        this.hasStarted = true;

        // Start ambient audio
        this.startAmbientAudio();
        
        // Show narration after brief delay
        setTimeout(() => this.showNarration(), 1000);
        
        // Setup environmental clues
        this.setupEnvironmentalClues();
        
        // Setup triggers
        this.setupTriggers();
    }

    startAmbientAudio() {
        // Base ambient sounds
        this.systems.audioManager.playAmbient('ambient_asylum');
        
        // Random environmental sounds
        this.scheduleRandomSounds();
    }

    scheduleRandomSounds() {
        const sounds = ['door_creak', 'static', 'entity_whisper'];
        
        const playRandomSound = () => {
            const sound = sounds[Math.floor(Math.random() * sounds.length)];
            this.systems.audioManager.playSound(sound, { volume: 0.15 });
            
            // Schedule next sound
            setTimeout(playRandomSound, 15000 + Math.random() * 15000);
        };
        
        setTimeout(playRandomSound, 5000);
    }

    showNarration() {
        const narration = `Patient intake records from Blackwood Asylum show 127 individuals admitted between 1970-1973. All files end abruptly on November 15th, 1973. The experimental wing was sealed following an 'incident' that left the facility abandoned overnight. You are not supposed to be here.`;
        
        const overlay = document.createElement('div');
        overlay.className = 'narration-overlay';
        overlay.innerHTML = `
            <div class="narration-text">${narration}</div>
        `;
        
        document.body.appendChild(overlay);
        console.log('Opening narration displayed');
        
        // Remove after 8 seconds
        setTimeout(() => {
            overlay.remove();
            console.log('Opening narration removed');
        }, 8000);
    }

    setupEnvironmentalClues() {
        // Clue 1: Torn Patient Transfer Form
        const clipboard = this.scene.getMeshByName('intake_clipboard');
        if (clipboard) {
            this.systems.interactionManager.registerInteractable(clipboard, 'document', {
                title: 'Patient Transfer Form',
                content: 'Subject 23 - TRANSFER TO WING C - EXPERIMENTAL PROTOCOL 7\n[Blood stains obscure the remaining text]'
            });
        }

        // Clue 2: Broken Audio Recorder
        const recorder = this.scene.getMeshByName('broken_recorder');
        if (recorder) {
            this.systems.interactionManager.registerInteractable(recorder, 'device', {
                title: 'Audio Recording Device',
                content: 'Cracked tape recorder with partially ejected cassette.\nLabel reads: "SESSION 47 - DR. [ILLEGIBLE]"'
            });
        }

        // Clue 3: Keycard Fragment
        const keycard = this.scene.getMeshByName('keycard_fragment');
        if (keycard) {
            this.systems.interactionManager.registerInteractable(keycard, 'key_item', {
                title: 'Security Keycard Fragment',
                content: 'Half of a security access card showing "CLEARANCE LEV-" and part of a photograph.'
            });
        }
    }

    setupTriggers() {
        // Object look trigger
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.pickInfo?.pickedMesh?.name === 'broken_recorder' && !this.triggersActivated.objectLook) {
                this.triggersActivated.objectLook = true;
                this.systems.audioManager.playSound('static', { volume: 0.4 });
            }
        });

        // Movement trigger
        this.systems.eventSystem.on('player_moved', () => {
            this.stepCount++;
            if (this.stepCount === 3 && !this.triggersActivated.firstMovement) {
                this.triggersActivated.firstMovement = true;
                this.systems.audioManager.playSound('door_slam', { volume: 0.3 });
            }
        });
    }

    update(deltaTime) {
        // Opening sequence doesn't need continuous updates
    }
}