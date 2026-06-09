/**
 * Custom Music Player for Hugo Stack Theme
 * Features: play/pause, prev/next, progress/seek, volume/mute,
 *   play modes (list/single/random), playlist panel, LRC lyrics,
 *   audio visualizer, playback speed, state persistence, audio focus
 */
(function () {
    "use strict";

    // --------------- SVG Icons ---------------
    var ICONS = {
        play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>',
        volume: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>',
        mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
        list: '<svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z"/></svg>',
        lyric: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
    };

    // --------------- Helpers ---------------
    function fmtTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
        var m = Math.max(0, Math.floor(seconds / 60));
        var s = Math.max(0, Math.floor(seconds % 60));
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // --------------- CustomPlayer Class ---------------
    function CustomPlayer(playlist) {
        this.playlist = playlist || [];
        this.currentIndex = -1;
        this.playMode = 'list'; // 'list' | 'single' | 'random'
        this.playbackRate = 1;
        this.history = [];
        this.lyrics = [];
        this.lyricTimer = null;
        this.audioCtx = null;
        this.analyser = null;
        this.visTimer = null;
        this.isDragging = false;
        this.wasPlayingBeforeDrag = false;

        this.audio = new Audio();
        this.audio.preload = 'metadata';

        if (this.playlist.length > 0) {
            this.restoreState();
        }

        this.buildUI();
        this.bindEvents();
        this.bindKeyboard();
        this.bindAudioFocus();

        if (this.currentIndex >= 0 && this.currentIndex < this.playlist.length) {
            this.loadTrack(this.currentIndex);
        }
    }

    CustomPlayer.prototype.saveState = function () {
        var state = {
            index: this.currentIndex,
            currentTime: this.audio.currentTime,
            paused: this.audio.paused,
            volume: this.audio.volume,
            muted: this.audio.muted,
            mode: this.playMode,
            rate: this.playbackRate,
        };
        try { localStorage.setItem('custom-player-state', JSON.stringify(state)); } catch (e) { /* quota */ }
    };

    CustomPlayer.prototype.restoreState = function () {
        try {
            var raw = localStorage.getItem('custom-player-state');
            if (!raw) { this.currentIndex = 0; return; }
            var state = JSON.parse(raw);
            this.currentIndex = Math.min(state.index, this.playlist.length - 1);
            this.currentIndex = Math.max(0, this.currentIndex);
            this.audio.volume = state.volume != null ? state.volume : 1;
            this.audio.muted = !!state.muted;
            this.playMode = state.mode || 'list';
            this.playbackRate = state.rate || 1;
            this.audio.playbackRate = this.playbackRate;
            this._savedTime = state.currentTime || 0;
            this._savedPaused = state.paused != null ? state.paused : true;
        } catch (e) {
            this.currentIndex = 0;
        }
    };

    // --------------- UI ---------------
    CustomPlayer.prototype.buildUI = function () {
        var existing = document.querySelector('.custom-player');
        if (existing) existing.remove();

        var container = document.createElement('div');
        container.className = 'custom-player';
        this.container = container;

        var modeIcon = this.playMode === 'single' ? '\uD83D\uDD02' : this.playMode === 'random' ? '\uD83D\uDD00' : '\uD83D\uDD01';

        container.innerHTML =
            '<div class="custom-player__progress-wrap">' +
            '<div class="custom-player__progress-fill"><div class="custom-player__progress-thumb"></div></div>' +
            '</div>' +
            '<div class="custom-player__main">' +
            '<div class="custom-player__controls">' +
            '<button class="custom-player__btn" data-action="prev" title="\u4E0A\u4E00\u9996">' + ICONS.prev + '</button>' +
            '<button class="custom-player__btn custom-player__btn--play" data-action="play" title="\u64AD\u653E/\u6682\u505C">' + ICONS.play + '</button>' +
            '<button class="custom-player__btn" data-action="next" title="\u4E0B\u4E00\u9996">' + ICONS.next + '</button>' +
            '</div>' +
            '<div class="custom-player__info">' +
            '<div class="custom-player__visualizer"></div>' +
            '<img class="custom-player__cover" src="" alt="" />' +
            '<div class="custom-player__meta">' +
            '<span class="custom-player__title">-</span>' +
            '<span class="custom-player__artist">-</span>' +
            '</div>' +
            '</div>' +
            '<div class="custom-player__time">' +
            '<span class="custom-player__current">00:00</span><span>/</span><span class="custom-player__duration">00:00</span>' +
            '</div>' +
            '<button class="custom-player__btn" data-action="lyric" title="\u6B4C\u8BCD">' + ICONS.lyric + '</button>' +
            '<div class="custom-player__volume-wrap">' +
            '<button class="custom-player__btn" data-action="mute" title="\u9759\u97F3">' + ICONS.volume + '</button>' +
            '<input type="range" class="custom-player__volume-slider" min="0" max="100" value="' + Math.round(this.audio.muted ? 0 : this.audio.volume * 100) + '" />' +
            '</div>' +
            '<span class="custom-player__speed" data-action="speed" title="\u64AD\u653E\u901F\u5EA6">' + this.playbackRate + 'x</span>' +
            '<button class="custom-player__btn custom-player__panel-toggle" data-action="mode" title="\u64AD\u653E\u6A21\u5F0F">' + modeIcon + '</button>' +
            '<button class="custom-player__btn custom-player__panel-toggle" data-action="panel" title="\u64AD\u653E\u5217\u8868">' + ICONS.list + '</button>' +
            '</div>' +
            '<div class="custom-player__lyrics-wrap"></div>' +
            '<div class="custom-player__panel"></div>';

        document.body.appendChild(container);

        this.els = {
            playBtn: container.querySelector('[data-action="play"]'),
            progressWrap: container.querySelector('.custom-player__progress-wrap'),
            progressFill: container.querySelector('.custom-player__progress-fill'),
            currentTime: container.querySelector('.custom-player__current'),
            durationTime: container.querySelector('.custom-player__duration'),
            cover: container.querySelector('.custom-player__cover'),
            title: container.querySelector('.custom-player__title'),
            artist: container.querySelector('.custom-player__artist'),
            volumeSlider: container.querySelector('.custom-player__volume-slider'),
            volumeBtn: container.querySelector('[data-action="mute"]'),
            modeBtn: container.querySelector('[data-action="mode"]'),
            speedBtn: container.querySelector('[data-action="speed"]'),
            lyricBtn: container.querySelector('[data-action="lyric"]'),
            panelBtn: container.querySelector('[data-action="panel"]'),
            panel: container.querySelector('.custom-player__panel'),
            lyricsWrap: container.querySelector('.custom-player__lyrics-wrap'),
            visualizer: container.querySelector('.custom-player__visualizer'),
        };

        if (this.audio.muted || this.audio.volume === 0) {
            this.els.volumeBtn.innerHTML = ICONS.mute;
        }

        this.renderPlaylistPanel();
    };

    CustomPlayer.prototype.renderPlaylistPanel = function () {
        if (!this.els || !this.els.panel) return;
        var self = this;
        this.els.panel.innerHTML = this.playlist.map(function (t, i) {
            var activeClass = i === self.currentIndex ? ' active' : '';
            var playingMark = i === self.currentIndex ? '\u25B6' : (i + 1);
            return '<div class="custom-player__panel-item' + activeClass + '" data-index="' + i + '">' +
                '<span class="custom-player__panel-index">' + playingMark + '</span>' +
                (t.cover
                    ? '<img class="custom-player__panel-cover" src="' + t.cover + '" alt="" />'
                    : '<div class="custom-player__panel-cover custom-player__cover--default">\u266A</div>') +
                '<div class="custom-player__panel-info">' +
                '<div class="custom-player__panel-title">' + esc(t.name || '') + '</div>' +
                '<div class="custom-player__panel-artist">' + esc(t.artist || '') + '</div>' +
                '</div>' +
                '<button class="custom-player__panel-del" data-action="del" data-index="' + i + '" title="\u79FB\u9664">\u00D7</button>' +
                '</div>';
        }).join('');
    };

    // --------------- Track Loading ---------------
    CustomPlayer.prototype.loadTrack = function (index) {
        if (index < 0 || index >= this.playlist.length) return;
        var track = this.playlist[index];
        this.currentIndex = index;

        this.els.title.textContent = track.name || '\u672A\u77E5\u6B4C\u66F2';
        this.els.artist.textContent = track.artist || '\u672A\u77E5\u6B4C\u624B';
        this.els.cover.src = track.cover || '';
        this.els.cover.style.display = track.cover ? '' : 'none';
        this.els.durationTime.textContent = '00:00';
        this.els.currentTime.textContent = '00:00';
        this.els.progressFill.style.width = '0';

        this.audio.src = track.url;
        this.audio.load();
        this.loadLyrics(track);
        this.setupVisualizer();

        var self = this;
        var savedTime = self._savedTime;
        var savedPaused = self._savedPaused;
        var isRestore = savedTime !== undefined;

        function onReady() {
            self.els.durationTime.textContent = fmtTime(self.audio.duration);
            if (isRestore && savedTime > 0 && savedTime < self.audio.duration) {
                self.audio.currentTime = savedTime;
                delete self._savedTime;
                self.els.progressFill.style.width = (savedTime / self.audio.duration * 100) + '%';
                self.els.currentTime.textContent = fmtTime(savedTime);
                if (!savedPaused) self.play();
                delete self._savedPaused;
            } else if (isRestore) {
                delete self._savedTime;
                delete self._savedPaused;
                self.updatePlayBtn();
            }
            self.audio.removeEventListener('loadedmetadata', onReady);
        }
        this.audio.addEventListener('loadedmetadata', onReady);
    };

    // --------------- Lyrics ---------------
    CustomPlayer.prototype.loadLyrics = function (track) {
        this.lyrics = [];
        this.stopLyricSync();
        if (!this.els.lyricsWrap) return;
        this.els.lyricsWrap.innerHTML = '';
        if (!track.lrc) return;

        var self = this;
        if (track.lrc.indexOf('http') === 0 || track.lrc.indexOf('/') === 0) {
            fetch(track.lrc)
                .then(function (r) { return r.text(); })
                .then(function (text) { self.parseLRC(text); })
                .catch(function () {});
        } else {
            this.parseLRC(track.lrc);
        }
    };

    CustomPlayer.prototype.parseLRC = function (lrcText) {
        var lines = lrcText.split(/\r?\n/);
        var parsed = [];
        for (var i = 0; i < lines.length; i++) {
            var match = lines[i].match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/);
            if (match) {
                var min = parseInt(match[1], 10);
                var sec = parseInt(match[2], 10);
                var ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
                var time = min * 60 + sec + ms / 1000;
                var text = match[4].trim();
                if (text) parsed.push({ time: time, text: text });
            }
        }
        this.lyrics = parsed.sort(function (a, b) { return a.time - b.time; });
        var self = this;
        this.els.lyricsWrap.innerHTML = this.lyrics.map(function (l) {
            return '<div class="custom-player__lyric" data-time="' + l.time + '">' + esc(l.text) + '</div>';
        }).join('');

        var lyricEls = this.els.lyricsWrap.querySelectorAll('.custom-player__lyric');
        lyricEls.forEach(function (el) {
            el.addEventListener('click', function () {
                var t = parseFloat(el.getAttribute('data-time') || '0');
                self.audio.currentTime = t;
            });
        });
    };

    CustomPlayer.prototype.syncLyrics = function () {
        if (this.lyrics.length === 0) return;
        var ct = this.audio.currentTime;
        var lyricEls = this.els.lyricsWrap.querySelectorAll('.custom-player__lyric');
        var activeIdx = -1;
        for (var i = 0; i < this.lyrics.length; i++) {
            if (this.lyrics[i].time <= ct) activeIdx = i; else break;
        }
        lyricEls.forEach(function (el, i) {
            if (i === activeIdx) {
                el.classList.add('active');
                el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            } else {
                el.classList.remove('active');
            }
        });
    };

    CustomPlayer.prototype.startLyricSync = function () {
        this.stopLyricSync();
        var self = this;
        this.lyricTimer = setInterval(function () { self.syncLyrics(); }, 250);
    };

    CustomPlayer.prototype.stopLyricSync = function () {
        if (this.lyricTimer !== null) {
            clearInterval(this.lyricTimer);
            this.lyricTimer = null;
        }
    };

    // --------------- Visualizer ---------------
    CustomPlayer.prototype.setupVisualizer = function () {
        if (!this.audioCtx) {
            try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        }
        if (!this.analyser) {
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 64;
            this.analyser.smoothingTimeConstant = 0.7;
        }
        try {
            var source = this.audioCtx.createMediaElementSource(this.audio);
            source.connect(this.analyser);
            this.analyser.connect(this.audioCtx.destination);
        } catch (e) { /* already connected */ }
    };

    CustomPlayer.prototype.startVisualizer = function () {
        if (this.visTimer !== null || !this.analyser || !this.els.visualizer) return;
        var bars = this.els.visualizer;
        bars.innerHTML = '';
        var bufferLength = this.analyser.frequencyBinCount;
        var barCount = Math.min(16, bufferLength);
        var dataArray = new Uint8Array(bufferLength);
        for (var i = 0; i < barCount; i++) {
            var bar = document.createElement('div');
            bar.className = 'custom-player__visualizer-bar';
            bar.style.height = '2px';
            bars.appendChild(bar);
        }
        var self = this;
        function draw() {
            if (!self.analyser) return;
            self.analyser.getByteFrequencyData(dataArray);
            var barEls = bars.children;
            for (var j = 0; j < barCount; j++) {
                var val = dataArray[Math.floor(j * bufferLength / barCount)] / 255;
                barEls[j].style.height = Math.max(2, val * 16) + 'px';
            }
            self.visTimer = requestAnimationFrame(draw);
        }
        this.visTimer = requestAnimationFrame(draw);
    };

    CustomPlayer.prototype.stopVisualizer = function () {
        if (this.visTimer !== null) {
            cancelAnimationFrame(this.visTimer);
            this.visTimer = null;
        }
    };

    // --------------- Playback Control ---------------
    CustomPlayer.prototype.play = function () {
        if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
        this.audio.play().catch(function () {});
    };

    CustomPlayer.prototype.pause = function () { this.audio.pause(); };

    CustomPlayer.prototype.togglePlay = function () {
        if (this.currentIndex < 0 || this.playlist.length === 0) return;
        if (this.audio.paused) this.play(); else this.pause();
    };

    CustomPlayer.prototype.prev = function () {
        if (this.playlist.length === 0) return;
        if (this.audio.currentTime > 2) { this.audio.currentTime = 0; return; }
        if (this.playMode === 'random' && this.history.length > 1) {
            this.history.pop();
            var prev = this.history.pop();
            if (prev !== undefined && prev !== this.currentIndex) {
                this.currentIndex = prev;
                this.loadTrack(this.currentIndex);
                this.play();
                return;
            }
        }
        if (this.currentIndex <= 0) this.currentIndex = this.playlist.length - 1;
        else this.currentIndex--;
        this.loadTrack(this.currentIndex);
        this.play();
    };

    CustomPlayer.prototype.next = function () {
        if (this.playlist.length === 0) return;
        this.history.push(this.currentIndex);
        this.currentIndex = this.getNextIndex();
        this.loadTrack(this.currentIndex);
        this.play();
    };

    CustomPlayer.prototype.getNextIndex = function () {
        if (this.playlist.length === 0) return -1;
        if (this.playMode === 'single') return this.currentIndex;
        if (this.playMode === 'random') {
            if (this.playlist.length === 1) return 0;
            var next;
            do { next = Math.floor(Math.random() * this.playlist.length); }
            while (next === this.currentIndex && this.playlist.length > 1);
            return next;
        }
        return (this.currentIndex + 1) % this.playlist.length;
    };

    CustomPlayer.prototype.seek = function (percent) {
        if (isNaN(this.audio.duration)) return;
        this.audio.currentTime = percent * this.audio.duration;
    };

    CustomPlayer.prototype.setVolume = function (value) {
        this.audio.volume = Math.max(0, Math.min(1, value));
        this.audio.muted = this.audio.volume === 0;
        this.els.volumeSlider.value = Math.round(this.audio.volume * 100);
        this.els.volumeBtn.innerHTML = (this.audio.muted || this.audio.volume === 0) ? ICONS.mute : ICONS.volume;
    };

    CustomPlayer.prototype.toggleMute = function () {
        this.audio.muted = !this.audio.muted;
        this.els.volumeBtn.innerHTML = this.audio.muted ? ICONS.mute : ICONS.volume;
        this.els.volumeSlider.value = this.audio.muted ? '0' : Math.round(this.audio.volume * 100);
    };

    CustomPlayer.prototype.switchMode = function () {
        var modes = ['list', 'single', 'random'];
        var idx = modes.indexOf(this.playMode);
        this.playMode = modes[(idx + 1) % modes.length];
        var icons = { list: '\uD83D\uDD01', single: '\uD83D\uDD02', random: '\uD83D\uDD00' };
        this.els.modeBtn.textContent = icons[this.playMode];
    };

    CustomPlayer.prototype.switchSpeed = function () {
        var rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
        var idx = rates.indexOf(this.playbackRate);
        this.playbackRate = rates[(idx + 1) % rates.length];
        this.audio.playbackRate = this.playbackRate;
        this.els.speedBtn.textContent = this.playbackRate + 'x';
    };

    CustomPlayer.prototype.togglePanel = function () {
        this.els.panel.classList.toggle('open');
        this.renderPlaylistPanel();
    };

    CustomPlayer.prototype.toggleLyrics = function () {
        this.els.lyricsWrap.classList.toggle('open');
    };

    CustomPlayer.prototype.switchTrack = function (index) {
        if (index === this.currentIndex) return;
        this.history.push(this.currentIndex);
        this.loadTrack(index);
        this.play();
        this.els.panel.classList.remove('open');
    };

    CustomPlayer.prototype.removeTrack = function (index) {
        if (this.playlist.length <= 1) return;
        var wasCurrent = index === this.currentIndex;
        this.playlist.splice(index, 1);
        if (wasCurrent) {
            if (index >= this.playlist.length) this.currentIndex = this.playlist.length - 1;
            this.loadTrack(this.currentIndex);
        } else if (index < this.currentIndex) {
            this.currentIndex--;
        }
        this.renderPlaylistPanel();
    };

    CustomPlayer.prototype.addTrack = function (track) {
        this.playlist.push(track);
        if (this.currentIndex < 0) { this.currentIndex = 0; this.loadTrack(0); }
        this.renderPlaylistPanel();
    };

    CustomPlayer.prototype.destroy = function () {
        this.pause();
        this.stopVisualizer();
        this.stopLyricSync();
        this.saveState();
        this.audio.src = '';
        this.audio.load();
    };

    // --------------- Event Bindings ---------------
    CustomPlayer.prototype.bindEvents = function () {
        var self = this;
        var c = this.container;

        self.els.playBtn.addEventListener('click', function () { self.togglePlay(); });
        c.querySelector('[data-action="prev"]').addEventListener('click', function () { self.prev(); });
        c.querySelector('[data-action="next"]').addEventListener('click', function () { self.next(); });

        // Progress bar
        var wrap = self.els.progressWrap;
        function getPercent(e) {
            var rect = wrap.getBoundingClientRect();
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        }
        wrap.addEventListener('mousedown', function (e) {
            self.isDragging = true;
            self.wasPlayingBeforeDrag = !self.audio.paused;
            if (self.wasPlayingBeforeDrag) self.pause();
            self.seek(getPercent(e));
            self.saveState();
        });
        wrap.addEventListener('touchstart', function (e) {
            self.isDragging = true;
            self.wasPlayingBeforeDrag = !self.audio.paused;
            if (self.wasPlayingBeforeDrag) self.pause();
            self.seek(getPercent(e));
            self.saveState();
        }, { passive: true });

        function onMove(e) { if (self.isDragging) self.seek(getPercent(e)); }
        function onUp() { if (self.isDragging) { self.isDragging = false; if (self.wasPlayingBeforeDrag) self.play(); } }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', onUp);

        // Volume
        self.els.volumeSlider.addEventListener('input', function () {
            self.setVolume(parseFloat(self.els.volumeSlider.value) / 100);
        });
        self.els.volumeBtn.addEventListener('click', function () { self.toggleMute(); });

        // Mode
        self.els.modeBtn.addEventListener('click', function () { self.switchMode(); });

        // Speed
        self.els.speedBtn.addEventListener('click', function () { self.switchSpeed(); });

        // Panel
        self.els.panelBtn.addEventListener('click', function () { self.togglePanel(); });

        // Lyrics
        self.els.lyricBtn.addEventListener('click', function () { self.toggleLyrics(); });

        // Panel items
        self.els.panel.addEventListener('click', function (e) {
            var target = e.target;
            var item = target.closest('.custom-player__panel-item');
            var delBtn = target.closest('[data-action="del"]');
            if (delBtn) {
                e.stopPropagation();
                var idx = parseInt(delBtn.getAttribute('data-index'), 10);
                if (!isNaN(idx)) self.removeTrack(idx);
                return;
            }
            if (item) {
                var idx2 = parseInt(item.getAttribute('data-index'), 10);
                if (!isNaN(idx2)) self.switchTrack(idx2);
            }
        });

        // Audio events
        self.audio.addEventListener('loadedmetadata', function () {
            self.els.durationTime.textContent = fmtTime(self.audio.duration);
            self.saveState();
        });
        self.audio.addEventListener('timeupdate', function () {
            if (!self.isDragging && !isNaN(self.audio.duration)) {
                var pct = (self.audio.currentTime / self.audio.duration) * 100;
                self.els.progressFill.style.width = pct + '%';
                self.els.currentTime.textContent = fmtTime(self.audio.currentTime);
            }
            self.saveState();
        });
        self.audio.addEventListener('play', function () {
            self.updatePlayBtn();
            self.startVisualizer();
            self.startLyricSync();
            self.saveState();
        });
        self.audio.addEventListener('pause', function () {
            self.updatePlayBtn();
            self.stopVisualizer();
            self.stopLyricSync();
            self.saveState();
        });
        self.audio.addEventListener('ended', function () {
            self.stopVisualizer();
            self.stopLyricSync();
            if (self.playMode === 'single') { self.audio.currentTime = 0; self.play(); }
            else self.next();
        });
        self.audio.addEventListener('error', function () {
            console.warn('CustomPlayer: audio error, retrying...');
            var track = self.playlist[self.currentIndex];
            if (track) {
                setTimeout(function () { self.audio.src = track.url; self.audio.load(); }, 2000);
            }
        });
    };

    CustomPlayer.prototype.bindKeyboard = function () {
        var self = this;
        document.addEventListener('keydown', function (e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.code) {
                case 'Space': e.preventDefault(); self.togglePlay(); break;
                case 'ArrowLeft':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); self.prev(); }
                    else { e.preventDefault(); self.audio.currentTime = Math.max(0, self.audio.currentTime - 5); }
                    break;
                case 'ArrowRight':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); self.next(); }
                    else { e.preventDefault(); self.audio.currentTime = Math.min(self.audio.duration || 0, self.audio.currentTime + 5); }
                    break;
                case 'ArrowUp': e.preventDefault(); self.setVolume(Math.min(1, self.audio.volume + 0.1)); break;
                case 'ArrowDown': e.preventDefault(); self.setVolume(Math.max(0, self.audio.volume - 0.1)); break;
                case 'KeyM': if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); self.toggleMute(); } break;
                case 'KeyL': if (e.ctrlKey || e.metaKey) { self.switchMode(); } break;
            }
        });
    };

    CustomPlayer.prototype.bindAudioFocus = function () {
        var self = this;
        window.addEventListener('beforeunload', function () { self.saveState(); });
        window.addEventListener('pagehide', function () { self.saveState(); });
    };

    CustomPlayer.prototype.updatePlayBtn = function () {
        this.els.playBtn.innerHTML = this.audio.paused ? ICONS.play : ICONS.pause;
        this.els.playBtn.title = this.audio.paused ? '\u64AD\u653E' : '\u6682\u505C';
    };

    // --------------- Global Init ---------------
    window.initPlayer = function (playlist) {
        return new CustomPlayer(playlist);
    };
})();
