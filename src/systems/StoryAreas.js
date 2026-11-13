import {
	Color3,
	DynamicTexture,
	Mesh,
	MeshBuilder,
	StandardMaterial,
	Vector3,
} from "@babylonjs/core";

// Rigidly turn the original eastbound passage toward +Z; retain asset proportions.
export const STORY_CORRIDOR_TRANSFORM = {
	position: new Vector3(-5.225, -2.52, 5),
	rotationY: -Math.PI / 2,
};

export const STORY_AREA_LAYOUT = {
	width: 3.1,
	length: 15,
	height: 4.15,
	doorZ: 12.6,
	restricted_area: {
		safeZ: [2, 7, 11.5],
		batteries: [new Vector3(0.8, 0, 4), new Vector3(-0.8, 0, 10)],
	},
	experiment_lab: {
		safeZ: [2, 11.5],
		batteries: [new Vector3(0.8, 0, 4)],
		note: new Vector3(-0.95, 0, 5.5),
		generator: new Vector3(-0.75, 0, 8.5),
		switch: new Vector3(0.85, 1.1, 8.5),
		powerRadius: 2.5,
	},
};

/**
 * Imported corridors supply all architecture. Add only non-solid story markers;
 * build a small matching shell only when the GLB cannot be loaded.
 * Each returned mesh owns its material and textures for scene cleanup.
 */
export function buildStoryArea(scene, name, { useCorridor = false } = {}) {
	const layout = STORY_AREA_LAYOUT[name];
	if (!layout) throw new Error(`Unknown story area: ${name}`);
	const meshes = [];
	const safeZones = layout.safeZ.map((z) => ({
		position: new Vector3(0, 0, z), radius: 1.5,
	}));
	const { width, length, height, doorZ } = STORY_AREA_LAYOUT;
	const wall = new Color3(0.26, 0.29, 0.28);
	const metal = new Color3(0.12, 0.15, 0.17);
	const cyan = new Color3(0.16, 0.85, 0.72);
	const red = new Color3(1, 0.06, 0.025);
	const restricted = name === "restricted_area";

	function track(mesh, color, { solid = false, floor = false, emissive = false } = {}) {
		const material = new StandardMaterial(`${mesh.name}_material`, scene);
		material.diffuseColor = color.clone();
		material.specularColor = new Color3(0.12, 0.12, 0.12);
		material.maxSimultaneousLights = 10;
		if (emissive) material.emissiveColor = color.clone();
		mesh.material = material;
		mesh.checkCollisions = solid;
		mesh.isPickable = solid;
		if (!floor) mesh.metadata = { isDecor: true };
		meshes.push(mesh);
		return mesh;
	}

	function box(id, x, y, z, w, h, d, color, options) {
		const mesh = MeshBuilder.CreateBox(`${name}_${id}`, { width: w, height: h, depth: d }, scene);
		mesh.position.set(x, y, z);
		return track(mesh, color, options);
	}

	function sign(id, text, x, y, z, w, h, color = cyan) {
		const mesh = MeshBuilder.CreatePlane(`${name}_${id}`, {
			width: w, height: h, sideOrientation: Mesh.DOUBLESIDE,
		}, scene);
		mesh.position.set(x, y, z);
		track(mesh, Color3.White(), { emissive: true });
		const texture = new DynamicTexture(`${mesh.name}_text`, { width: 1024, height: 256 }, scene, false);
		const context = texture.getContext();
		let fontSize = 72;
		context.font = `bold ${fontSize}px sans-serif`;
		while (context.measureText(text).width > 960 && fontSize > 20) {
			fontSize -= 2;
			context.font = `bold ${fontSize}px sans-serif`;
		}
		texture.drawText(text, null, 154, `bold ${fontSize}px sans-serif`, color.toHexString(), "#101718", true);
		mesh.material.diffuseTexture = texture;
		mesh.material.emissiveTexture = texture;
		mesh.material.backFaceCulling = false;
		return mesh;
	}

	if (!useCorridor) {
		box("floor", 0, -0.1, length / 2, width, 0.2, length,
			new Color3(0.16, 0.18, 0.18), { solid: true, floor: true });
		box("ceiling", 0, height + 0.1, length / 2, width, 0.2, length, metal, { solid: true });
		for (const side of [-1, 1]) {
			box(`wall_${side}`, side * (width / 2 + 0.1), height / 2,
				length / 2, 0.2, height, length, wall, { solid: true });
		}
		box("entrance_wall", 0, height / 2, -0.1, width + 0.4, height, 0.2, wall, { solid: true });
		box("back_wall", 0, height / 2, length + 0.1, width + 0.4, height, 0.2, wall, { solid: true });
	}

	for (const z of layout.safeZ) {
		for (const side of [-1, 1]) {
			box(`safe_marker_${side}_${z}`, side * 1.48, 2.8, z,
				0.04, 0.28, 0.4, restricted ? red : cyan, { emissive: true });
		}
	}
	sign("area_label", restricted ? "RESTRICTED WING" : "EXPERIMENT LAB", 0, 3.5, 3, 2.7, 0.5);
	sign("exit_label", restricted ? "LABORATORY AHEAD" : "EXIT", 0, 3.5, doorZ - 0.2, 2.7, 0.5);
	if (restricted) {
		sign("stay_in_light", "STAY IN LIGHT", 0, 3.4, 7, 2.5, 0.45, new Color3(1, 0.65, 0.12));
	} else {
		sign("power_label", "POWER", -0.75, 2.6, layout.generator.z, 1.2, 0.4);
		sign("switch_label", "DESTROY MACHINE", 0.65, 2.1, layout.switch.z, 1.7, 0.4, red);
	}
	return { meshes, safeZones };
}
