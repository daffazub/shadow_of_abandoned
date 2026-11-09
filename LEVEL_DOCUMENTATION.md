# Shadows of the Abandoned - Complete Asylum Level

## Overview

A comprehensive 3D horror level built with Babylon.js featuring a complete abandoned mental asylum with multiple interconnected areas, atmospheric lighting, interactive elements, and progressive horror mechanics.

## Level Structure

### 1. Asylum Entrance (25x20 units)
- **Starting Point**: Player spawns at coordinates (0, 1.8, -8)
- **Environment**: Large reception area with broken furniture and debris
- **Lighting**: Dim overhead lights with flickering effects
- **Props**: Reception desk, broken chairs, scattered papers
- **Interactables**:
  - Admission Log document revealing backstory
  - Corridor Access Key hidden behind reception
  - Security Report document
  - Locked door to main corridor

### 2. Main Corridor (4x40 units)
- **Layout**: Long central hallway connecting all major areas
- **Environment**: Narrow corridor with doors to patient rooms
- **Lighting**: Flickering fluorescent lights creating horror atmosphere
- **Props**: Abandoned gurneys, wheelchairs, medical equipment
- **Interactables**:
  - Dr. Hartwell's research journal
  - Light switch controlling corridor illumination
  - Research Wing Key
  - Maintenance log document
  - Multiple patient room doors (some locked)

### 3. Patient Rooms (12 rooms, 8x6 units each)
- **Layout**: 6 rooms on each side of the main corridor
- **Environment**: Small cells with basic furniture
- **Lighting**: Single dim bulb per room (some flickering)
- **Props**: Metal beds, nightstands, broken sinks
- **Atmosphere**: Each room tells a story through environmental details
- **Interactables**:
  - Patient belongings
  - Hidden notes and documents
  - Keys to other areas

### 4. Research Wing (30x25 units)
- **Layout**: Large laboratory and office area
- **Environment**: Scientific equipment, research tables, filing cabinets
- **Lighting**: Emergency red lighting system
- **Props**: Research equipment, computers, specimen containers
- **Interactables**:
  - Final evacuation log
  - Experiment documentation
  - Main generator controls
  - Basement Access Key

### 5. Basement - The Source (20x15 units, -4 units below ground)
- **Layout**: Underground facility with boiler room and storage
- **Environment**: Dark, cramped spaces with industrial equipment
- **Lighting**: Minimal lighting, mostly darkness
- **Props**: Boiler, pipes, storage boxes, machinery
- **Interactables**:
  - Dr. Hartwell's final confession
  - Entity banishment controls
  - Final sequence trigger

## Interactive Elements

### Documents & Story Progression
- **Admission Logs**: Reveal the asylum's history and patient intake
- **Research Notes**: Detail the failed experiments and entity manifestation
- **Security Reports**: Document strange occurrences and system failures
- **Final Logs**: Evacuation orders and entity containment failure

### Keys & Access Control
- **Corridor Access Key**: Opens main hallway from entrance
- **Research Wing Key**: Grants access to restricted laboratory area
- **Basement Access Key**: Unlocks final area containing the truth
- **Patient Room Keys**: Access to individual cells (optional exploration)

### Mechanical Interactions
- **Light Switches**: Control corridor and area lighting
- **Generator Controls**: Restore power to facility systems
- **Entity Banishment System**: Final sequence to contain the entity
- **Emergency Systems**: Backup lighting and security protocols

## Atmospheric Systems

### Dynamic Lighting
- **Entrance**: Warm but dim lighting suggesting abandonment
- **Corridor**: Flickering fluorescents creating unease
- **Patient Rooms**: Single bulbs, some broken, creating shadows
- **Research Wing**: Red emergency lighting indicating danger
- **Basement**: Minimal lighting, relying on player's flashlight

### Particle Effects
- **Dust Particles**: Floating throughout all areas for atmosphere
- **Electrical Sparks**: From damaged lighting and equipment
- **Smoke/Fog**: In basement and research areas
- **Shadow Particles**: During entity encounters

### Audio Design
- **Ambient Sounds**: Different for each area (wind, dripping, electrical hum)
- **Interactive Audio**: Footsteps, door creaks, paper rustling
- **Horror Stingers**: Random whispers, static, heartbeat
- **Entity Audio**: Growls, whispers, and pursuit sounds
- **Environmental Audio**: Generator hum, electrical buzzing

## Entity Encounter System

### Progressive Horror
1. **Entrance**: Subtle hints - shadows, whispers
2. **Corridor**: Flickering lights, distant sounds
3. **Research Wing**: Direct encounters, light manipulation
4. **Basement**: Full manifestation, active pursuit

### Trigger Zones
- **Proximity Triggers**: Activate when player approaches specific areas
- **Story Triggers**: Linked to document discovery and key collection
- **Random Encounters**: Procedural scares throughout exploration
- **Final Sequence**: Climactic entity confrontation

## Technical Implementation

### Modular Architecture
```
LevelBuilder.js - Main level construction system
├── Room Creation - Modular room generation
├── Prop Placement - Furniture and debris systems
├── Lighting Setup - Dynamic lighting per area
├── Material System - Textures and visual effects
└── Trigger Zones - Interactive area detection
```

### Performance Optimization
- **LOD System**: Detailed models only when close to player
- **Culling**: Hide objects outside player view
- **Texture Compression**: Optimized materials for web deployment
- **Particle Limits**: Controlled particle counts for performance
- **Audio Streaming**: Load sounds on demand

### Collision System
- **Wall Collisions**: Prevent player from walking through walls
- **Prop Collisions**: Furniture and equipment block movement
- **Door Interactions**: Proper collision detection for openings
- **Trigger Zones**: Invisible collision areas for events

## Story Integration

### Narrative Flow
1. **Discovery Phase**: Player explores and finds initial documents
2. **Understanding Phase**: Research notes reveal the experiments
3. **Revelation Phase**: Truth about the entity emerges
4. **Confrontation Phase**: Final sequence to contain the threat

### Environmental Storytelling
- **Visual Clues**: Scratches on walls, overturned furniture
- **Document Placement**: Strategic positioning tells story
- **Lighting Cues**: Darkness indicates danger areas
- **Audio Cues**: Sounds guide player attention

## Customization & Extension

### Adding New Areas
```javascript
// Create new room type
levelBuilder.createCustomRoom({
    width: 15,
    depth: 10,
    height: 4,
    position: new Vector3(x, y, z),
    theme: 'medical_lab'
});
```

### Custom Interactions
```javascript
// Register new interactable
interactionManager.registerInteractable(mesh, 'custom_type', {
    title: 'Custom Item',
    action: 'custom_action',
    data: { /* custom data */ }
});
```

### Lighting Modifications
```javascript
// Add custom lighting setup
environmentManager.createCustomLighting({
    type: 'horror_spotlight',
    position: new Vector3(x, y, z),
    intensity: 0.5,
    color: new Color3(1, 0, 0)
});
```

## Asset Requirements

### 3D Models (Optional - Procedural Generation Available)
- Asylum furniture (beds, chairs, desks)
- Medical equipment (gurneys, cabinets)
- Architectural elements (doors, windows)
- Debris and clutter objects

### Textures
- Wall materials (dirty, moldy, bloodstained)
- Floor textures (tile, concrete, metal)
- Prop textures (rust, wear, damage)
- Particle textures (dust, smoke, sparks)

### Audio Files (Procedural Generation Available)
- Ambient tracks (wind, electrical hum, dripping)
- Interactive sounds (footsteps, doors, switches)
- Horror stingers (whispers, static, heartbeat)
- Entity sounds (growls, pursuit audio)

## Browser Compatibility

### Minimum Requirements
- WebGL 2.0 support
- Modern browser (Chrome 80+, Firefox 75+, Safari 13+, Edge 80+)
- 4GB RAM recommended
- Dedicated graphics card preferred

### Performance Targets
- 60 FPS on mid-range hardware
- 30 FPS minimum on integrated graphics
- Sub-3 second loading times
- Responsive controls with <50ms input latency

## Development Notes

### Code Organization
- Modular system architecture for easy maintenance
- Event-driven communication between systems
- Procedural generation fallbacks for missing assets
- Comprehensive error handling and logging

### Testing Considerations
- Cross-browser compatibility testing
- Performance profiling on various hardware
- Accessibility features (subtitles, colorblind support)
- Mobile device compatibility (touch controls)

This complete asylum level provides a comprehensive horror experience with multiple areas to explore, a compelling narrative told through environmental storytelling, and progressive horror mechanics that build tension throughout the player's journey.