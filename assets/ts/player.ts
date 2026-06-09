/**
 * Custom Music Player for Hugo Stack Theme
 * Features: play/pause, prev/next, progress/seek, volume/mute,
 *   play modes (list/single/random), playlist panel, LRC lyrics,
 *   audio visualizer, playback speed, state persistence, audio focus
 */

// --------------- Types ---------------

interface Track {
    name: string;
    artist: string;
    url: string;
    cover?: string;
    lrc?: string;
}

type PlayMode = 'list' | 'single' | 'random';

interface PlayerState {
    index: number;
    currentTime: number;
    paused: boolean;
    volume: number;
    muted: boolean;
    mode: PlayMode;
    rate: number;
}

interface LyricLine {
    time: number;  // seconds
    text: string;
}

// --------------- SVG Icons (inline) ---------------

const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>',
    lyric: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
};

// --------------- Player Class ---------------

class CustomPlayer {
    private audio: HTMLAudioElement;
    private playlist: Track[];
    private currentIndex: number = 0;
    private playMode: PlayMode = 'list';
    private playbackRate: number = 1;
    private isShuffled: boolean = false;

    // Lyrics
    private lyrics: LyricLine[] = [];
    private lyricTimer: number | null = null;

    // Visualizer
    private audioCtx: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private visTimer: number | null = null;

    // History for shuffle back-navigation
    private history: number[] = [];

    // DOM elements
    private container!: HTMLElement;
    private els!: {
        playBtn: HTMLElement;
        progressWrap: HTMLElement;
        progressFill: HTMLElement;
        currentTime: HTMLElement;
        durationTime: HTMLElement;
        cover: HTMLImageElement;
        title: HTMLElement;
        artist: HTMLElement;
        volumeSlider: HTMLInputElement;
        volumeBtn: HTMLElement;
        modeBtn: HTMLElement;
        speedBtn: HTMLElement;
        lyricBtn: HTMLElement;
        panelBtn: HTMLElement;
        panel: HTMLElement;
        lyricsWrap: HTMLElement;
        visualizer: HTMLElement;
    };

    // dragging state
    private isDragging: boolean = false;
    private wasPlayingBeforeDrag: boolean = false;

    constructor(playlist: Track[]) {
        this.playlist = playlist;
        this.audio = new Audio();
        this.audio.preload = 'metadata';

        if (this.playlist.length > 0) {
            this.restoreState();
        } else {
            this.currentIndex = -1;
        }

        this.buildUI();
        this.bindEvents();
        this.bindKeyboard();
        this.bindAudioFocus();

        if (this.currentIndex >= 0) {
            this.loadTrack(this.currentIndex);
        }
    }

    // --------------- State Persistence ---------------

    private saveState(): void {
        const state: PlayerState = {
            index: this.currentIndex,
            currentTime: this.audio.currentTime,
            paused: this.audio.paused,
            volume: this.audio.volume,
            muted: this.audio.muted,
            mode: this.playMode,
            rate: this.playbackRate,
        };
        try { localStorage.setItem('custom-player-state', JSON.stringify(state)); } catch { /* quota */ }
    }

    private restoreState(): void {
        try {
            const raw = localStorage.getItem('custom-player-state');
            if (!raw) { this.currentIndex = 0; return; }
            const state: PlayerState = JSON.parse(raw);
            this.currentIndex = Math.min(state.index, this.playlist.length - 1);
            this.audio.volume = state.volume ?? 1;
            this.audio.muted = state.muted ?? false;
            this.playMode = state.mode ?? 'list';
            this.playbackRate = state.rate ?? 1;
            this.audio.playbackRate = this.playbackRate;
            // currentTime restored after 'loadedmetadata'
            const savedTime = state.currentTime ?? 0;
            const savedPaused = state.paused ?? true;
            // Store for restore after load
            (this as any)._savedTime = savedTime;
            (this as any)._savedPaused = savedPaused;
        } catch {
            this.currentIndex = 0;
        }
    }

    // --------------- UI Construction ---------------

    private buildUI(): void {
        const container = document.querySelector('.custom-player');
        if (!container) return;
        this.container = container as HTMLElement;

        const modeIcon = this.playMode === 'single' ? '🔂' : this.playMode === 'random' ? '🔀' : '🔁';

        container.innerHTML = `
<div class="custom-player__progress-wrap">
    <div class="custom-player__progress-fill"><div class="custom-player__progress-thumb"></div></div>
</div>
<div class="custom-player__main">
    <div class="custom-player__controls">
        <button class="custom-player__btn" data-action="prev" title="上一首">${ICONS.prev}</button>
        <button class="custom-player__btn custom-player__btn--play" data-action="play" title="播放/暂停">${ICONS.play}</button>
        <button class="custom-player__btn" data-action="next" title="下一首">${ICONS.next}</button>
    </div>
    <div class="custom-player__info">
        <div class="custom-player__visualizer"></div>
        <img class="custom-player__cover" src="" alt="" />
        <div class="custom-player__meta">
            <span class="custom-player__title">-</span>
            <span class="custom-player__artist">-</span>
        </div>
    </div>
    <div class="custom-player__time">
        <span class="custom-player__current">00:00</span>
        <span>/</span>
        <span class="custom-player__duration">00:00</span>
    </div>
    <button class="custom-player__btn" data-action="lyric" title="歌词">${ICONS.lyric}</button>
    <div class="custom-player__volume-wrap">
        <button class="custom-player__btn" data-action="mute" title="静音">${ICONS.volume}</button>
        <input type="range" class="custom-player__volume-slider" min="0" max="100" value="${Math.round(this.audio.muted ? 0 : this.audio.volume * 100)}" />
    </div>
    <span class="custom-player__speed" data-action="speed" title="播放速度">${this.playbackRate}x</span>
    <button class="custom-player__btn custom-player__panel-toggle" data-action="mode" title="播放模式">${modeIcon}</button>
    <button class="custom-player__btn custom-player__panel-toggle" data-action="panel" title="播放列表">${ICONS.list}</button>
</div>
<div class="custom-player__lyrics-wrap"></div>
<div class="custom-player__panel"></div>`;

        this.els = {
            playBtn: container.querySelector('[data-action="play"]')!,
            progressWrap: container.querySelector('.custom-player__progress-wrap')!,
            progressFill: container.querySelector('.custom-player__progress-fill')!,
            currentTime: container.querySelector('.custom-player__current')!,
            durationTime: container.querySelector('.custom-player__duration')!,
            cover: container.querySelector('.custom-player__cover')!,
            title: container.querySelector('.custom-player__title')!,
            artist: container.querySelector('.custom-player__artist')!,
            volumeSlider: container.querySelector('.custom-player__volume-slider')! as HTMLInputElement,
            volumeBtn: container.querySelector('[data-action="mute"]')!,
            modeBtn: container.querySelector('[data-action="mode"]')!,
            speedBtn: container.querySelector('[data-action="speed"]')!,
            lyricBtn: container.querySelector('[data-action="lyric"]')!,
            panelBtn: container.querySelector('[data-action="panel"]')!,
            panel: container.querySelector('.custom-player__panel')!,
            lyricsWrap: container.querySelector('.custom-player__lyrics-wrap')!,
            visualizer: container.querySelector('.custom-player__visualizer')!,
        };

        this.renderPlaylistPanel();

        if (this.audio.muted || this.audio.volume === 0) {
            this.els.volumeBtn.innerHTML = ICONS.mute;
        }
    }

    private renderPlaylistPanel(): void {
        if (!this.els?.panel) return;
        this.els.panel.innerHTML = this.playlist
            .map((t, i) => `
                <div class="custom-player__panel-item${i === this.currentIndex ? ' active' : ''}" data-index="${i}">
                    <span class="custom-player__panel-index">${i === this.currentIndex ? '▶' : i + 1}</span>
                    ${t.cover
                        ? `<img class="custom-player__panel-cover" src="${t.cover}" alt="" />`
                        : `<span class="custom-player__panel-cover custom-player__cover--default">♪</span>`}
                    <div class="custom-player__panel-info">
                        <div class="custom-player__panel-title">${this.esc(t.name)}</div>
                        <div class="custom-player__panel-artist">${this.esc(t.artist)}</div>
                    </div>
                    <button class="custom-player__panel-del" data-action="del" data-index="${i}" title="移除">×</button>
                </div>
            `).join('');
    }

    // --------------- Track Loading ---------------

    private loadTrack(index: number): void {
        if (index < 0 || index >= this.playlist.length) return;

        const track = this.playlist[index];
        this.currentIndex = index;

        // Update UI info
        this.els.title.textContent = track.name || '未知歌曲';
        this.els.artist.textContent = track.artist || '未知歌手';
        this.els.cover.src = track.cover || '';
        this.els.cover.style.display = track.cover ? '' : 'none';
        this.els.durationTime.textContent = '00:00';
        this.els.currentTime.textContent = '00:00';
        this.els.progressFill.style.width = '0';

        // Load audio
        this.audio.src = track.url;
        this.audio.load();

        // Load lyrics
        this.loadLyrics(track);

        // Setup audio context for visualization
        this.setupVisualizer();

        // Handle restore after metadata loads
        const savedTime = (this as any)._savedTime;
        const savedPaused = (this as any)._savedPaused;
        const isRestore = savedTime !== undefined;

        const onReady = () => {
            this.els.durationTime.textContent = this.fmtTime(this.audio.duration);
            if (isRestore && savedTime > 0 && savedTime < this.audio.duration) {
                this.audio.currentTime = savedTime;
                delete (this as any)._savedTime;
                this.els.progressFill.style.width = `${(savedTime / this.audio.duration) * 100}%`;
                this.els.currentTime.textContent = this.fmtTime(savedTime);
                if (!savedPaused) {
                    this.play();
                }
                delete (this as any)._savedPaused;
            } else if (isRestore) {
                delete (this as any)._savedTime;
                delete (this as any)._savedPaused;
                this.updatePlayBtn();
            }
            this.audio.removeEventListener('loadedmetadata', onReady);
        };
        this.audio.addEventListener('loadedmetadata', onReady);
    }

    // --------------- Lyrics ---------------

    private loadLyrics(track: Track): void {
        this.lyrics = [];
        this.stopLyricSync();
        this.els.lyricsWrap.innerHTML = '';

        if (!track.lrc) return;

        const lrcStr = track.lrc || '';
        if (lrcStr.indexOf('http') === 0 || lrcStr.indexOf('/') === 0) {
            fetch(track.lrc)
                .then(r => r.text())
                .then(text => this.parseLRC(text))
                .catch(() => { /* ignore */ });
        } else {
            this.parseLRC(track.lrc);
        }
    }

    private parseLRC(lrcText: string): void {
        const lines = lrcText.split(/\r?\n/);
        const parsed: LyricLine[] = [];

        for (const line of lines) {
            const match = line.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/);
            if (match) {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
                const time = min * 60 + sec + ms / 1000;
                const text = match[4].trim();
                if (text) parsed.push({ time, text });
            }
        }
        this.lyrics = parsed.sort((a, b) => a.time - b.time);

        // Render lyrics
        this.els.lyricsWrap.innerHTML = this.lyrics
            .map(l => `<div class="custom-player__lyric" data-time="${l.time}">${this.esc(l.text)}</div>`)
            .join('');

        // Click to seek
        this.els.lyricsWrap.querySelectorAll('.custom-player__lyric').forEach(el => {
            el.addEventListener('click', () => {
                const t = parseFloat((el as HTMLElement).dataset.time || '0');
                this.audio.currentTime = t;
            });
        });
    }

    private syncLyrics(): void {
        if (this.lyrics.length === 0) return;
        const ct = this.audio.currentTime;
        const lyricsEls = this.els.lyricsWrap.querySelectorAll('.custom-player__lyric');
        let activeIdx = -1;

        for (let i = 0; i < this.lyrics.length; i++) {
            if (this.lyrics[i].time <= ct) activeIdx = i;
            else break;
        }

        lyricsEls.forEach((el, i) => {
            if (i === activeIdx) {
                el.classList.add('active');
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } else {
                el.classList.remove('active');
            }
        });
    }

    private startLyricSync(): void {
        this.stopLyricSync();
        this.lyricTimer = window.setInterval(() => this.syncLyrics(), 250);
    }

    private stopLyricSync(): void {
        if (this.lyricTimer !== null) {
            clearInterval(this.lyricTimer);
            this.lyricTimer = null;
        }
    }

    // --------------- Visualizer ---------------

    private setupVisualizer(): void {
        if (!this.audioCtx) {
            try {
                this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            } catch { return; }
        }
        if (!this.analyser) {
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64;
            this.analyser.smoothingTimeConstant = 0.7;
        }

        try {
            const source = this.audioCtx.createMediaElementSource(this.audio);
            source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
        } catch {
            // Already connected or cross-origin
        }
    }

    private startVisualizer(): void {
        if (this.visTimer !== null || !this.analyser) return;
        const bars = this.els.visualizer;
        if (!bars) return;

        // Create bar elements
        bars.innerHTML = '';
        const bufferLength = this.analyser.frequencyBinCount;
        const barCount = Math.min(16, bufferLength);
        const dataArray = new Uint8Array(bufferLength);

        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement('div');
            bar.className = 'custom-player__visualizer-bar';
            bar.style.height = '2px';
            bars.appendChild(bar);
        }

        const draw = () => {
            if (!this.analyser) return;
            this.analyser.getByteFrequencyData(dataArray);
            const barEls = bars.children;
            for (let i = 0; i < barCount; i++) {
                const val = dataArray[Math.floor(i * bufferLength / barCount)] / 255;
                (barEls[i] as HTMLElement).style.height = `${Math.max(2, val * 16)}px`;
            }
            this.visTimer = requestAnimationFrame(draw);
        };
        this.visTimer = requestAnimationFrame(draw);
    }

    private stopVisualizer(): void {
        if (this.visTimer !== null) {
            cancelAnimationFrame(this.visTimer);
            this.visTimer = null;
        }
    }

    // --------------- Playback Control ---------------

    private play(): void {
        if (this.audioCtx?.state === 'suspended') {
            this.audioCtx.resume();
        }
        this.audio.play().catch(() => { /* user gesture required */ });
    }

    private pause(): void {
        this.audio.pause();
    }

    togglePlay(): void {
        if (this.currentIndex < 0 || this.playlist.length === 0) return;
        if (this.audio.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    prev(): void {
        if (this.playlist.length === 0) return;

        // If played for more than 2 seconds, restart current track
        if (this.audio.currentTime > 2) {
            this.audio.currentTime = 0;
            return;
        }

        if (this.playMode === 'random' && this.history.length > 1) {
            this.history.pop(); // remove current
            const prev = this.history.pop(); // get previous
            if (prev !== undefined && prev !== this.currentIndex) {
                this.currentIndex = prev;
                this.loadTrack(this.currentIndex);
                this.play();
                return;
            }
        }

        if (this.currentIndex <= 0) {
            this.currentIndex = this.playlist.length - 1;
        } else {
            this.currentIndex--;
        }
        this.loadTrack(this.currentIndex);
        this.play();
    }

    next(): void {
        if (this.playlist.length === 0) return;
        this.history.push(this.currentIndex);
        this.currentIndex = this.getNextIndex();
        this.loadTrack(this.currentIndex);
        this.play();
    }

    private getNextIndex(): number {
        if (this.playlist.length === 0) return -1;
        if (this.playMode === 'single') return this.currentIndex;
        if (this.playMode === 'random') {
            if (this.playlist.length === 1) return 0;
            let next: number;
            do {
                next = Math.floor(Math.random() * this.playlist.length);
            } while (next === this.currentIndex && this.playlist.length > 1);
            return next;
        }
        // list mode
        return (this.currentIndex + 1) % this.playlist.length;
    }

    seek(percent: number): void {
        if (isNaN(this.audio.duration)) return;
        this.audio.currentTime = percent * this.audio.duration;
    }

    setVolume(value: number): void {
        this.audio.volume = Math.max(0, Math.min(1, value));
        this.audio.muted = this.audio.volume === 0;
        this.els.volumeSlider.value = String(Math.round(this.audio.volume * 100));
        this.els.volumeBtn.innerHTML = this.audio.muted || this.audio.volume === 0 ? ICONS.mute : ICONS.volume;
    }

    toggleMute(): void {
        this.audio.muted = !this.audio.muted;
        this.els.volumeBtn.innerHTML = this.audio.muted ? ICONS.mute : ICONS.volume;
        this.els.volumeSlider.value = this.audio.muted ? '0' : String(Math.round(this.audio.volume * 100));
    }

    switchMode(): void {
        const modes: PlayMode[] = ['list', 'single', 'random'];
        const idx = modes.indexOf(this.playMode);
        this.playMode = modes[(idx + 1) % modes.length];
        const icons = { list: '🔁', single: '🔂', random: '🔀' };
        this.els.modeBtn.textContent = icons[this.playMode];
    }

    switchSpeed(): void {
        const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const idx = rates.indexOf(this.playbackRate);
        this.playbackRate = rates[(idx + 1) % rates.length];
        this.audio.playbackRate = this.playbackRate;
        this.els.speedBtn.textContent = `${this.playbackRate}x`;
    }

    togglePanel(): void {
        this.els.panel.classList.toggle('open');
        this.renderPlaylistPanel();
    }

    toggleLyrics(): void {
        this.els.lyricsWrap.classList.toggle('open');
    }

    switchTrack(index: number): void {
        if (index === this.currentIndex) return;
        this.history.push(this.currentIndex);
        this.loadTrack(index);
        this.play();
        this.els.panel.classList.remove('open');
    }

    removeTrack(index: number): void {
        if (this.playlist.length <= 1) return;
        const wasCurrent = index === this.currentIndex;
        this.playlist.splice(index, 1);

        if (wasCurrent) {
            if (index >= this.playlist.length) {
                this.currentIndex = this.playlist.length - 1;
            }
            this.loadTrack(this.currentIndex);
        } else if (index < this.currentIndex) {
            this.currentIndex--;
        }

        this.renderPlaylistPanel();
    }

    // --------------- Event Bindings ---------------

    private bindEvents(): void {
        // Play/Pause
        this.els.playBtn.addEventListener('click', () => this.togglePlay());

        // Prev/Next
        this.container.querySelector('[data-action="prev"]')!.addEventListener('click', () => this.prev());
        this.container.querySelector('[data-action="next"]')!.addEventListener('click', () => this.next());

        // Progress bar
        this.bindProgressEvents();

        // Volume
        this.els.volumeSlider.addEventListener('input', () => {
            this.setVolume(parseFloat(this.els.volumeSlider.value) / 100);
        });
        this.els.volumeBtn.addEventListener('click', () => this.toggleMute());

        // Mode
        this.els.modeBtn.addEventListener('click', () => this.switchMode());

        // Speed
        this.els.speedBtn.addEventListener('click', () => this.switchSpeed());

        // Panel
        this.els.panelBtn.addEventListener('click', () => this.togglePanel());

        // Lyrics
        this.els.lyricBtn.addEventListener('click', () => this.toggleLyrics());

        // Panel item click & delete (delegation)
        this.els.panel.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const item = target.closest('.custom-player__panel-item') as HTMLElement;
            const delBtn = target.closest('[data-action="del"]') as HTMLElement;

            if (delBtn) {
                e.stopPropagation();
                const idx = parseInt(delBtn.dataset.index || '', 10);
                if (!isNaN(idx)) this.removeTrack(idx);
                return;
            }

            if (item) {
                const idx = parseInt(item.dataset.index || '', 10);
                if (!isNaN(idx)) this.switchTrack(idx);
            }
        });

        // Audio events
        this.audio.addEventListener('loadedmetadata', () => {
            this.els.durationTime.textContent = this.fmtTime(this.audio.duration);
            this.saveState();
        });

        this.audio.addEventListener('timeupdate', () => {
            if (!this.isDragging && !isNaN(this.audio.duration)) {
                const pct = (this.audio.currentTime / this.audio.duration) * 100;
                this.els.progressFill.style.width = `${pct}%`;
                this.els.currentTime.textContent = this.fmtTime(this.audio.currentTime);
            }
            this.saveState();
        });

        this.audio.addEventListener('play', () => {
            this.updatePlayBtn();
            this.startVisualizer();
            this.startLyricSync();
            this.saveState();
        });

        this.audio.addEventListener('pause', () => {
            this.updatePlayBtn();
            this.stopVisualizer();
            this.stopLyricSync();
            this.saveState();
        });

        this.audio.addEventListener('ended', () => {
            this.stopVisualizer();
            this.stopLyricSync();
            if (this.playMode === 'single') {
                this.audio.currentTime = 0;
                this.play();
            } else {
                this.next();
            }
        });

        this.audio.addEventListener('error', () => {
            // Retry on error
            console.warn('CustomPlayer: audio error, retrying...');
            const track = this.playlist[this.currentIndex];
            if (track) {
                setTimeout(() => {
                    this.audio.src = track.url;
                    this.audio.load();
                }, 2000);
            }
        });

        this.audio.addEventListener('waiting', () => {
            // Buffering - could show a loading indicator
        });

        // Playlist drag-over for touch devices (simple index-based reorder would add complexity)
    }

    private bindProgressEvents(): void {
        const wrap = this.els.progressWrap;

        const getPercent = (e: MouseEvent | TouchEvent): number => {
            const rect = wrap.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        };

        wrap.addEventListener('mousedown', (e: MouseEvent) => {
            this.isDragging = true;
            this.wasPlayingBeforeDrag = !this.audio.paused;
            if (this.wasPlayingBeforeDrag) this.pause();
            this.seek(getPercent(e));
            this.saveState();
        });

        wrap.addEventListener('touchstart', (e: TouchEvent) => {
            this.isDragging = true;
            this.wasPlayingBeforeDrag = !this.audio.paused;
            if (this.wasPlayingBeforeDrag) this.pause();
            this.seek(getPercent(e));
            this.saveState();
        }, { passive: true });

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!this.isDragging) return;
            this.seek(getPercent(e));
        };

        const onUp = () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            if (this.wasPlayingBeforeDrag) this.play();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove as any, { passive: true });
        document.addEventListener('touchend', onUp);
    }

    private bindKeyboard(): void {
        document.addEventListener('keydown', (e) => {
            // Don't capture when typing in input fields
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'ArrowLeft':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.prev(); }
                    else { e.preventDefault(); this.audio.currentTime = Math.max(0, this.audio.currentTime - 5); }
                    break;
                case 'ArrowRight':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.next(); }
                    else { e.preventDefault(); this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + 5); }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.setVolume(Math.min(1, this.audio.volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.setVolume(Math.max(0, this.audio.volume - 0.1));
                    break;
                case 'KeyM':
                    if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); this.toggleMute(); }
                    break;
                case 'KeyL':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.switchMode(); }
                    break;
            }
        });
    }

    private bindAudioFocus(): void {
        // Pause when tab is hidden (optional, commented out as it may annoy users)
        // document.addEventListener('visibilitychange', () => {
        //     if (document.hidden && !this.audio.paused) {
        //         this.pause();
        //     }
        // });

        // Save state before page unload
        window.addEventListener('beforeunload', () => this.saveState());
        window.addEventListener('pagehide', () => this.saveState());
    }

    // --------------- Helpers ---------------

    private updatePlayBtn(): void {
        this.els.playBtn.innerHTML = this.audio.paused ? ICONS.play : ICONS.pause;
        this.els.playBtn.title = this.audio.paused ? '播放' : '暂停';
    }

    private fmtTime(seconds: number): string {
        if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
        const m = Math.max(0, Math.floor(seconds / 60));
        const s = Math.max(0, Math.floor(seconds % 60));
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    private esc(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --------------- Public API ---------------

    public addTrack(track: Track): void {
        this.playlist.push(track);
        if (this.currentIndex < 0) {
            this.currentIndex = 0;
            this.loadTrack(0);
        }
        this.renderPlaylistPanel();
    }

    public getCurrentTrack(): Track | null {
        return this.currentIndex >= 0 ? this.playlist[this.currentIndex] : null;
    }

    public destroy(): void {
        this.pause();
        this.stopVisualizer();
        this.stopLyricSync();
        this.saveState();
        this.audio.src = '';
        this.audio.load();
    }
}

// --------------- Initialization ---------------

function initPlayer(playlist: Track[]): CustomPlayer {
    // Remove existing container if any (PJAX re-init)
    const existing = document.querySelector('.custom-player');
    if (existing) existing.remove();

    // Create container
    const container = document.createElement('div');
    container.className = 'custom-player';
    document.body.appendChild(container);

    return new CustomPlayer(playlist);
}

// Expose globally for IIFE bundle
(window as any).initPlayer = initPlayer;
(window as any).CustomPlayer = CustomPlayer;
