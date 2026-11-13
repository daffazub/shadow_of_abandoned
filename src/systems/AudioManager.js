import { Sound, Vector3 } from '@babylonjs/core';

// Semua file ada di public/assets/audio/
const AUDIO_BASE = '/assets/audio/';

// Efek suara sekali putar.
// files   : satu file, atau beberapa varian (dipilih acak agar tidak monoton)
// volume  : volume dasar (dikali masterVolume dan volume saat dipanggil)
// spatial : true = suara 3D, terdengar datang dari arah tertentu
const SOUND_DEFS = {
	footstep_concrete: {
		files: [
			'footsteps/concrete_1.mp3',
			'footsteps/concrete_2.mp3',
			'footsteps/concrete_3.mp3',
		],
		volume: 0.8,
	},
	door_creak: { files: ['interactions/door_creak.mp3'], volume: 0.9 },
	door_locked: { files: ['interactions/door_locked.mp3'], volume: 0.9 },
	door_slam: { files: ['interactions/door_slam.mp3'], volume: 1.0 },
	flashlight_click: { files: ['ui/flashlight_click.mp3'], volume: 0.8 },
	paper_rustle: { files: ['interactions/paper_rustle.mp3'], volume: 0.9 },
	key_pickup: { files: ['interactions/key_pickup.mp3'], volume: 0.9 },
	switch_flip: { files: ['interactions/switch_flip.mp3'], volume: 0.9 },
	generator_start: { files: ['interactions/generator_start.mp3'], volume: 1.0 },
	entity_whisper: { files: ['entity/whisper.mp3'], volume: 0.9, spatial: true },
	entity_growl: { files: ['entity/growl.mp3'], volume: 1.0, spatial: true },
	heartbeat: { files: ['stingers/heartbeat.mp3'], volume: 1.0 },
	static: { files: ['stingers/static.mp3'], volume: 0.8 },
	intro_wake: { files: ['intro/intro_wake_clair_de_lune.mp3'], volume: 0.35 },
	intro_waterphone: { files: ['intro/intro_waterphone_scrape.mp3'], volume: 0.45 },
	intro_whoosh: { files: ['intro/intro_whoosh_release.mp3'], volume: 0.4 },
	electrical_spark: { files: ['electrical_spark.mp3'], volume: 0.35 },
};

// Suara latar yang diputar berulang (loop)
const AMBIENT_DEFS = {
	ambient_asylum: { file: 'ambient/asylum_base.mp3', volume: 0.6 },
	ambient_corridor: { file: 'ambient/corridor_wind.mp3', volume: 0.6 },
	ambient_basement: { file: 'ambient/basement_drip.mp3', volume: 0.6 },
	entity_pursuit: { file: 'ambient/entity_pursuit.mp3', volume: 0.8 },
	generator_running: { file: 'ambient/generator_loop.mp3', volume: 0.6 },
};

export class AudioManager {
	constructor(scene) {
		this.scene = scene;
		this.sounds = new Map(); // nama -> daftar entry (varian)
		this.ambientSounds = new Map(); // nama -> entry yang sedang berputar
		this.isEnabled = true;
		this.masterVolume = 0.7;

		this.fileCache = new Map(); // url -> true/false (file ada atau tidak)
		this.loading = new Map(); // nama -> Promise yang sedang memuat
		this.lastVariant = new Map(); // nama -> indeks varian terakhir
		this.warned = new Set();
		this.proceduralContext = null;

		this.initializeAudio();
	}

	initializeAudio() {
		// Muat semua suara di awal supaya tidak ada jeda saat pertama dipakai
		Object.keys(SOUND_DEFS).forEach((name) => this.ensureLoaded(name));
		Object.keys(AMBIENT_DEFS).forEach((name) => this.ensureLoaded(name));
		console.log('Audio system initialized - preloading sounds');
	}

	// ---------------------------------------------------------------
	// PEMUATAN FILE
	// ---------------------------------------------------------------

	// Mengecek apakah file benar-benar ada. Vite mengembalikan index.html
	// (status 200) untuk file yang tidak ada, jadi tipe isi juga diperiksa.
	async fileExists(url) {
		if (this.fileCache.has(url)) return this.fileCache.get(url);

		let ok = false;
		try {
			const res = await fetch(url, { method: 'HEAD' });
			const type = res.headers.get('content-type') || '';
			ok = res.ok ? !type.includes('text/html') : res.status === 405;
		} catch (e) {
			ok = false;
		}
		this.fileCache.set(url, ok);
		return ok;
	}

	async createEntry(entryName, soundName, file, opts) {
		const url = AUDIO_BASE + file;
		const entry = {
			name: soundName,
			sound: null,
			ready: false,
			pending: false,
			pendingOptions: null,
			baseVolume: opts.volume ?? 1,
			spatial: !!opts.spatial,
			loop: !!opts.loop,
		};

		const exists = await this.fileExists(url);

		if (!exists) {
			// File tidak ditemukan: pakai suara sintetis sederhana sebagai cadangan
			if (!this.warned.has(url)) {
				console.warn(`Audio file not found: ${url} (using fallback)`);
				this.warned.add(url);
			}
			entry.sound = entry.loop
				? this.createProceduralAmbient(soundName)
				: this.createProceduralSound(soundName);
			entry.ready = true;
			return entry;
		}

		entry.sound = new Sound(
			entryName,
			url,
			this.scene,
			() => {
				entry.ready = true;
				// Jika sempat diminta main sebelum selesai dimuat, putar sekarang
				if (entry.pending) {
					entry.pending = false;
					this.startEntry(entry, entry.pendingOptions || {});
				}
			},
			{
				loop: entry.loop,
				autoplay: false,
				volume: entry.baseVolume * this.masterVolume,
				spatialSound: entry.spatial,
				maxDistance: 25,
			}
		);

		return entry;
	}

	ensureLoaded(name) {
		if (this.sounds.has(name)) return Promise.resolve(this.sounds.get(name));
		if (this.loading.has(name)) return this.loading.get(name);

		const isAmbient = !SOUND_DEFS[name] && !!AMBIENT_DEFS[name];
		const def = SOUND_DEFS[name] || AMBIENT_DEFS[name];

		if (!def) {
			if (!this.warned.has(name)) {
				console.warn(`Sound "${name}" is not defined in AudioManager`);
				this.warned.add(name);
			}
			return Promise.resolve(null);
		}

		const files = def.files || [def.file];
		const promise = Promise.all(
			files.map((file, i) =>
				this.createEntry(`${name}_${i}`, name, file, {
					volume: def.volume,
					spatial: def.spatial,
					loop: isAmbient,
				})
			)
		).then((entries) => {
			this.sounds.set(name, entries);
			this.loading.delete(name);
			return entries;
		});

		this.loading.set(name, promise);
		return promise;
	}

	// Memuat file kustom di luar daftar di atas
	async loadSound(name, path, options = {}) {
		try {
			const entry = await this.createEntry(name, name, path, {
				volume: options.volume ?? 1.0,
				spatial: options.spatial || false,
				loop: options.loop || false,
			});
			this.sounds.set(name, [entry]);
			return entry.sound;
		} catch (error) {
			console.warn(`Failed to load sound ${name}:`, error);
			return null;
		}
	}

	// ---------------------------------------------------------------
	// MEMUTAR SUARA
	// ---------------------------------------------------------------

	resolveSoundPosition(position) {
		if (position) {
			return position instanceof Vector3
				? position
				: new Vector3(position.x, position.y, position.z);
		}
		// Tanpa posisi: taruh suara 3 unit dari pemain, arah acak (terasa "ada di dekat")
		const cam = this.scene.activeCamera;
		if (!cam) return Vector3.Zero();
		const a = Math.random() * Math.PI * 2;
		return cam.position.add(new Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3));
	}

	startEntry(entry, options = {}) {
		if (!entry.ready) {
			entry.pending = true;
			entry.pendingOptions = options;
			return;
		}

		const s = entry.sound;
		const volume =
			(options.volume !== undefined ? options.volume : 1) *
			entry.baseVolume *
			this.masterVolume;

		if (s.setVolume) s.setVolume(volume);
		if (entry.spatial && s.setPosition) {
			s.setPosition(this.resolveSoundPosition(options.position));
		}
		s.play();
	}

	pickVariant(name, entries) {
		if (entries.length === 1) return entries[0];
		// Pilih varian acak, tapi tidak sama dengan yang terakhir
		let idx = Math.floor(Math.random() * entries.length);
		if (idx === this.lastVariant.get(name)) idx = (idx + 1) % entries.length;
		this.lastVariant.set(name, idx);
		return entries[idx];
	}

	playSound(name, options = {}) {
		if (!this.isEnabled) return;

		const entries = this.sounds.get(name);
		if (!entries) {
			// Belum selesai dimuat: tunggu lalu putar
			this.ensureLoaded(name).then((loaded) => {
				if (loaded) this.playSound(name, options);
			});
			return;
		}

		this.startEntry(this.pickVariant(name, entries), options);
	}

	stopSound(name) {
		const entries = this.sounds.get(name);
		if (!entries) return;
		entries.forEach((entry) => {
			entry.pending = false;
			if (entry.sound && entry.sound.stop) entry.sound.stop();
		});
	}

	playAmbient(name) {
		if (!this.isEnabled) return;
		if (this.ambientSounds.has(name)) return; // sudah berputar

		const entries = this.sounds.get(name);
		if (!entries) {
			this.ensureLoaded(name).then((loaded) => {
				if (loaded) this.playAmbient(name);
			});
			return;
		}

		const entry = entries[0];
		this.ambientSounds.set(name, entry);
		this.startEntry(entry);
	}

	stopAmbient(name) {
		const entry = this.ambientSounds.get(name);
		if (entry) {
			entry.pending = false;
			if (entry.sound && entry.sound.stop) entry.sound.stop();
			this.ambientSounds.delete(name);
		}
	}

	playFootstep(surface = 'concrete') {
		this.playSound(`footstep_${surface}`, { volume: Math.random() * 0.3 + 0.6 });
	}

	playStinger(intensity = 1) {
		const options = ['static', 'heartbeat', 'entity_whisper'];
		const name = options[Math.floor(Math.random() * options.length)];
		this.playSound(name, { volume: Math.min(1, 0.5 + intensity * 0.15) });
	}

	playEntitySound(position) {
		this.playSound('entity_whisper', { position: position, volume: 0.8 });
	}

	setMasterVolume(volume) {
		this.masterVolume = Math.max(0, Math.min(1, volume));

		this.sounds.forEach((entries) => {
			entries.forEach((entry) => {
				if (entry.sound && entry.sound.setVolume) {
					entry.sound.setVolume(entry.baseVolume * this.masterVolume);
				}
			});
		});
	}

	toggleAudio() {
		this.isEnabled = !this.isEnabled;

		if (!this.isEnabled) {
			this.sounds.forEach((entries) =>
				entries.forEach((entry) => {
					entry.pending = false;
					if (entry.sound && entry.sound.stop) entry.sound.stop();
				})
			);
			this.ambientSounds.clear();
		}
	}

	// ---------------------------------------------------------------
	// CADANGAN: SUARA SINTETIS (dipakai hanya jika file mp3 tidak ada)
	// ---------------------------------------------------------------

	getProceduralContext() {
		if (!this.proceduralContext) {
			const Ctx = window.AudioContext || window.webkitAudioContext;
			this.proceduralContext = new Ctx();
		}
		if (this.proceduralContext.state === 'suspended') {
			this.proceduralContext.resume();
		}
		return this.proceduralContext;
	}

	createProceduralSound(name) {
		const soundConfig = {
			footstep_concrete: { duration: 0.2, frequency: 200 },
			door_creak: { duration: 1.5, frequency: 150 },
			door_locked: { duration: 0.5, frequency: 300 },
			door_slam: { duration: 0.8, frequency: 80 },
			flashlight_click: { duration: 0.1, frequency: 800 },
			paper_rustle: { duration: 0.6, frequency: 2000 },
			key_pickup: { duration: 0.3, frequency: 1200 },
			switch_flip: { duration: 0.2, frequency: 400 },
			generator_start: { duration: 2.0, frequency: 60 },
			entity_whisper: { duration: 2.5, frequency: 100 },
			entity_growl: { duration: 1.8, frequency: 40 },
			heartbeat: { duration: 1.0, frequency: 80 },
			static: { duration: 0.5, frequency: 5000 },
		};

		const config = soundConfig[name] || { duration: 0.5, frequency: 440 };
		const manager = this;

		return {
			name,
			config,
			volume: 1.0,
			setVolume(vol) {
				this.volume = vol;
			},
			setPosition() {},
			play() {
				try {
					const ctx = manager.getProceduralContext();
					const osc = ctx.createOscillator();
					const gain = ctx.createGain();
					osc.connect(gain);
					gain.connect(ctx.destination);
					osc.frequency.setValueAtTime(this.config.frequency, ctx.currentTime);
					gain.gain.setValueAtTime(this.volume * 0.1, ctx.currentTime);
					gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + this.config.duration);
					osc.start(ctx.currentTime);
					osc.stop(ctx.currentTime + this.config.duration);
				} catch (e) {
					console.log(`Audio: ${this.name}`);
				}
			},
			stop() {},
			dispose() {},
		};
	}

	createProceduralAmbient(name) {
		return {
			name,
			volume: 1,
			isPlaying: false,
			setVolume(vol) {
				this.volume = vol;
			},
			play() {
				this.isPlaying = true;
				console.log(`Ambient fallback (silent): ${this.name}`);
			},
			stop() {
				this.isPlaying = false;
			},
			dispose() {},
		};
	}

	// ---------------------------------------------------------------
	// EVENT HOROR
	// ---------------------------------------------------------------

	triggerEntityEncounter(intensity = 1, position = null) {
		// Urutan suara saat bertemu entitas
		this.playSound('static', { volume: 0.4 });

		setTimeout(() => {
			this.playSound('entity_whisper', {
				volume: Math.min(1, 0.6 * intensity),
				position: position,
			});
		}, 500);

		setTimeout(() => {
			this.playSound('entity_growl', {
				volume: Math.min(1, 0.7 * intensity),
				position: position,
			});
		}, 1500);

		if (intensity >= 2) {
			setTimeout(() => {
				this.playSound('heartbeat', { volume: 0.7 });
			}, 2000);
		}
	}

	createHorrorStinger(type = 'random') {
		const stingers = ['static', 'entity_whisper', 'heartbeat'];
		const soundName =
			type === 'random'
				? stingers[Math.floor(Math.random() * stingers.length)]
				: type;

		this.playSound(soundName, { volume: 0.3 + Math.random() * 0.4 });
	}

	update(deltaTime) {
		// Suara horor acak yang jarang muncul
		if (Math.random() < 0.0005) {
			this.createHorrorStinger();
		}
	}

	dispose() {
		this.sounds.forEach((entries) =>
			entries.forEach((entry) => {
				if (entry.sound && entry.sound.dispose) entry.sound.dispose();
			})
		);
		this.sounds.clear();
		this.ambientSounds.clear();
		this.loading.clear();

		if (this.proceduralContext) {
			this.proceduralContext.close();
			this.proceduralContext = null;
		}
	}
}