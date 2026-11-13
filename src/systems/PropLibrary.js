import {
	Color3,
	HighlightLayer,
	Matrix,
	MeshBuilder,
	StandardMaterial,
	TransformNode,
	Vector3,
} from "@babylonjs/core";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader.js";

const TABLE_HEIGHT = 0.8;

// Semua ukuran, orientasi, warna, dan perilaku fitting model ada di sini.
// Jika model terlihat miring/terlalu besar, ubah parameter di objek ini saja.
export const PROP_CONFIG = {
	key_ward: {
		file: "key_ward.glb",
		longest: 0.28,
		flatten: true,
		tint: new Color3(1, 1, 1),
		highlight: new Color3(1.0, 0.8, 0.3),
	},
	key_restricted: {
		file: "key_restricted.glb",
		longest: 0.28,
		flatten: true,
		tint: new Color3(1, 1, 1),
		highlight: new Color3(1.0, 0.5, 0.3),
	},
	battery: {
		file: "battery.glb",
		height: 0.3,
		flatten: false,
		tint: new Color3(1, 1, 1),
		highlight: new Color3(0.3, 1.0, 0.4),
	},
	document: {
		file: "document.glb",
		longest: 0.35,
		flatten: true,
		tint: new Color3(0.82, 0.76, 0.60),
		highlight: new Color3(1.0, 0.95, 0.7),
	},
	desk: {
		file: "desk.glb",
		height: TABLE_HEIGHT,
		// Putar supaya sisi panjang meja mengikuti koridor (sumbu Z).
		rotation: new Vector3(0, Math.PI / 2, 0),
		tint: new Color3(0.55, 0.50, 0.45),
		highlight: null,
	},
	iron_gate: {
		file: "iron_gate.glb",
		tint: new Color3(1, 1, 1),
		highlight: null,
	},
};

function transformedBounds(bounds, rotation) {
	const result = {
		min: new Vector3(Infinity, Infinity, Infinity),
		max: new Vector3(-Infinity, -Infinity, -Infinity),
	};
	const matrix = Matrix.RotationYawPitchRoll(rotation.y, rotation.x, rotation.z);
	for (const x of [bounds.min.x, bounds.max.x]) {
		for (const y of [bounds.min.y, bounds.max.y]) {
			for (const z of [bounds.min.z, bounds.max.z]) {
				const point = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
				result.min.minimizeInPlace(point);
				result.max.maximizeInPlace(point);
			}
		}
	}
	return result;
}

function boundsSize(bounds) {
	return bounds.max.subtract(bounds.min);
}

export class PropLibrary {
	constructor(scene) {
		this.scene = scene;
		this.containers = new Map();
		this.sizes = new Map();
		this.bounds = new Map();
		this.failed = new Set();
		this.highlightLayer = new HighlightLayer("prop_highlights", scene, {
			blurHorizontalSize: 1.5,
			blurVerticalSize: 1.5,
		});
		this.highlightLayer.intensity = 0.65;
	}

	async preload() {
		const entries = Object.entries(PROP_CONFIG);
		await Promise.all(entries.map(([name, config]) => this.loadOne(name, config)));
	}

	async loadOne(name, config) {
		if (this.containers.has(name) || this.failed.has(name)) return;
		try {
			const container = await SceneLoader.LoadAssetContainerAsync(
			"/assets/models/props/",
			config.file,
			this.scene
			);
			container.materials.forEach((material) => { material.maxSimultaneousLights = 10; });
			this.applyTint(container, config.tint);
			if (name === "iron_gate") {
				container.materials.forEach((material) => {
					if (material.emissiveColor) material.emissiveColor = new Color3(0.06, 0.05, 0.05);
				});
			}
			this.containers.set(name, container);
			const triangles = container.meshes.reduce(
				(total, mesh) => total + Math.floor(mesh.getTotalIndices() / 3),
				0
			);
			const sourceBounds = this.getContainerBounds(container);
			this.bounds.set(name, sourceBounds);
			console.log(`[PropLibrary] ${name}: ${triangles} triangles`);
			console.log(`[PropLibrary] ${name} ukuran asli: ${this.formatSize(boundsSize(sourceBounds))}`);
			if (name === "iron_gate" && triangles > 15000) {
				console.warn(`[PropLibrary] iron_gate memiliki ${triangles} segitiga (> 15.000).`);
			}
			this.sizes.set(name, this.calculateFit(name, sourceBounds, config));
			console.log(
				`[PropLibrary] ${name} ukuran akhir: ${this.formatSize(this.sizes.get(name))}`
			);
		} catch (error) {
			this.failed.add(name);
			console.warn(
				`[PropLibrary] Model ${name} (${config.file}) gagal dimuat; placeholder dipakai.`,
				error
			);
		}
	}

	has(name) {
		return this.containers.has(name);
	}

	getFittedSize(name, opts = {}) {
		const size = this.sizes.get(name);
		if (!size) return null;
		if (name === "iron_gate" && opts.width && opts.height) {
			const rotated = Math.abs((opts.rotationY || 0) % Math.PI) > 0.1;
			return rotated
				? new Vector3(opts.depth ?? size.z, opts.height, opts.width)
				: new Vector3(opts.width, opts.height, opts.depth ?? size.z);
		}
		if (name === "desk" && opts.axis && this.bounds.has(name)) {
			const config = PROP_CONFIG[name];
			const oriented = { ...config, rotation: new Vector3(0, opts.axis === "x" ? 0 : Math.PI / 2, 0) };
			return this.calculateFit(name, this.bounds.get(name), oriented);
		}
		return size.clone();
	}


	attach(name, anchor, opts = {}) {
		const container = this.containers.get(name);
		const config = PROP_CONFIG[name];
		if (!container || !config || !anchor || anchor.isDisposed()) return false;
		let pivot;
		const ownedMaterials = [];
		try {
			// Fit di origin sebelum parenting: posisi/rotasi anchor tidak mencemari ukuran.
			pivot = new TransformNode(`${anchor.id}_${name}_pivot`, this.scene);
			const instance = container.instantiateModelsToScene((nodeName) => `${anchor.id}_${nodeName}`, false, { doNotInstantiate: true });
			instance.rootNodes.forEach((root) => { root.parent = pivot; });
			const source = pivot.getHierarchyBoundingVectors(true, (mesh) => mesh.getTotalVertices() > 0);
			const sourceSize = boundsSize(source);
			if (![sourceSize.x, sourceSize.y, sourceSize.z].every((n) => Number.isFinite(n) && n > 0)) throw new Error("Model has invalid bounds");
			if (name === "iron_gate") {
				const sx = (opts.width ?? sourceSize.x) / sourceSize.x;
				const requestedY = (opts.height ?? sourceSize.y) / sourceSize.y;
				const distortion = Math.max(sx, requestedY) / Math.min(sx, requestedY);
				const sy = distortion > 1.25 ? sx : requestedY;
				pivot.scaling.set(sx, sy, sx);
				const gap = (opts.height ?? sourceSize.y) - sourceSize.y * sy;
				if (gap > 0.01) {
					const panel = MeshBuilder.CreateBox(`${anchor.id}_gate_fill`, {
						width: sourceSize.x, height: gap / sy, depth: (opts.depth ?? 0.2) / sx,
					}, this.scene);
					panel.parent = pivot;
					panel.position.set((source.min.x + source.max.x) / 2, source.max.y + gap / (2 * sy), (source.min.z + source.max.z) / 2);
					const mat = new StandardMaterial(`${anchor.id}_gate_fill_mat`, this.scene);
					mat.diffuseColor = new Color3(0.06, 0.055, 0.05);
					mat.emissiveColor = new Color3(0.03, 0.025, 0.025);
					panel.material = mat;
					ownedMaterials.push(mat);
				}
				console.log(`[PropLibrary] iron_gate scale x=${sx.toFixed(3)} y=${sy.toFixed(3)} z=${sx.toFixed(3)}, top panel=${Math.max(0, gap).toFixed(3)} m`);
				pivot.rotation.copyFrom(this.getVisualRotation(name, opts));
			} else {
				pivot.rotation.copyFrom(this.getVisualRotation(name, opts));
				const size = boundsSize(pivot.getHierarchyBoundingVectors(true, (mesh) => mesh.getTotalVertices() > 0));
				const fit = this.getFittedSize(name, opts);
				const scale = Math.min(fit.x / size.x, fit.y / size.y, fit.z / size.z);
				if (!Number.isFinite(scale) || scale <= 0) throw new Error("Invalid fitted scale");
				pivot.scaling.setAll(scale);
			}
			const fitted = pivot.getHierarchyBoundingVectors(true, (mesh) => mesh.getTotalVertices() > 0);
			anchor.computeWorldMatrix(true);
			const anchorY = anchor.getAbsolutePosition().y;
			pivot.parent = anchor;
			pivot.position.set(-(fitted.min.x + fitted.max.x) / 2, (opts.surfaceY ?? anchorY) - anchorY - fitted.min.y, -(fitted.min.z + fitted.max.z) / 2);
			const meshes = pivot.getChildMeshes(false);
			meshes.forEach((mesh) => {
				mesh.isPickable = false;
				mesh.checkCollisions = false;
				mesh.visibility = 1;
			});
			anchor.metadata = { ...anchor.metadata, propPivot: pivot, propVisualMeshes: meshes, propOwnedMaterials: ownedMaterials };
			if (config.highlight) {
				anchor.metadata.propHighlightMeshes = meshes.filter((mesh) => mesh.getTotalVertices() > 0);
				anchor.metadata.propHighlightMeshes.forEach((mesh) => this.highlightLayer.addMesh(mesh, config.highlight));
			}
			anchor.visibility = 0;
			return true;
		} catch (error) {
			this.removeHighlight(anchor);
			pivot?.dispose();
			ownedMaterials.forEach((material) => material.dispose());
			anchor.visibility = 1;
			console.warn(`[PropLibrary] ${name} gagal dipasang; placeholder tetap terlihat.`, error);
			return false;
		}
	}

	removeHighlight(anchor) {
		const meshes = anchor?.metadata?.propHighlightMeshes || [];
		meshes.forEach((mesh) => this.highlightLayer.removeMesh(mesh));
		if (anchor?.metadata) delete anchor.metadata.propHighlightMeshes;
	}

	applyTint(container, tint) {
		if (!tint) return;
		container.materials.forEach((material) => {
			if (material.albedoColor) {
				material.albedoColor = material.albedoColor.multiply(tint);
			}
		});
	}

	getContainerBounds(container) {
		const bounds = {
			min: new Vector3(Infinity, Infinity, Infinity),
			max: new Vector3(-Infinity, -Infinity, -Infinity),
		};
		container.meshes.forEach((mesh) => {
			if (mesh.getTotalVertices() === 0) return;
			mesh.computeWorldMatrix(true);
			mesh.refreshBoundingInfo();
			const box = mesh.getBoundingInfo().boundingBox;
			const matrix = mesh.getWorldMatrix();
			for (const x of [box.minimum.x, box.maximum.x]) {
				for (const y of [box.minimum.y, box.maximum.y]) {
					for (const z of [box.minimum.z, box.maximum.z]) {
						const point = Vector3.TransformCoordinates(new Vector3(x, y, z), matrix);
						bounds.min.minimizeInPlace(point);
						bounds.max.maximizeInPlace(point);
					}
				}
			}
		});
		return bounds;
	}

	getVisualRotation(name, opts = {}) {
		const config = PROP_CONFIG[name];
		const rotation = (config.rotation || Vector3.Zero()).clone();
		if (name === "desk" && opts.axis) rotation.y = opts.axis === "x" ? 0 : Math.PI / 2;
		if (name === "iron_gate" && opts.rotationY) rotation.y += opts.rotationY;
		if (config.flatten) {
			const sourceBounds = this.getContainerBounds(this.containers.get(name));
			const sourceSize = boundsSize(sourceBounds);
			const thinnest = [sourceSize.x, sourceSize.y, sourceSize.z].indexOf(
				Math.min(sourceSize.x, sourceSize.y, sourceSize.z)
			);
			if (thinnest === 0) rotation.z += Math.PI / 2;
			if (thinnest === 2) rotation.x += Math.PI / 2;
		}
		return rotation;
	}

	calculateFit(name, sourceBounds, config) {
		const rotation = this.getRotationForBounds(sourceBounds, config);
		const rotated = transformedBounds(sourceBounds, rotation);
		const rotatedSize = boundsSize(rotated);
		if (config.longest) {
			const scale = config.longest / Math.max(rotatedSize.x, rotatedSize.y, rotatedSize.z);
			return rotatedSize.scale(scale);
		}
		if (config.height) {
			const scale = config.height / rotatedSize.y;
			return rotatedSize.scale(scale);
		}
		if (name === "iron_gate") return rotatedSize;
		return rotatedSize;
	}

	getRotationForBounds(sourceBounds, config) {
		const sourceSize = boundsSize(sourceBounds);
		const rotation = (config.rotation || Vector3.Zero()).clone();
		if (config.flatten) {
			const thinnest = [sourceSize.x, sourceSize.y, sourceSize.z].indexOf(
				Math.min(sourceSize.x, sourceSize.y, sourceSize.z)
			);
			if (thinnest === 0) rotation.z += Math.PI / 2;
			if (thinnest === 2) rotation.x += Math.PI / 2;
		}
		return rotation;
	}

	formatSize(size) {
		return `w=${size.x.toFixed(3)} h=${size.y.toFixed(3)} d=${size.z.toFixed(3)} m`;
	}
}
