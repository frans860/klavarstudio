/**
 * KlavarStudio Core (Compleet gecombineerd)
 * Inclusief: 12-grid, Audio, Auto-Save, Rendering
 */

// --- AUDIO ENGINE ---
const SoundEngine = {
    ctx: null,
    
    init() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    },

    playTone(frequency, type = 'sine') {
        if (!this.ctx) this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    },

    getFreq(noteName) {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const match = noteName.match(/([A-G]#?)(-?\d+)/);
        if (!match) return 440;

        const note = match[1];
        const octave = parseInt(match[2]);
        const semitoneIndex = notes.indexOf(note);
        
        // MIDI calc: C4 = 60
        const baseC4 = 60; 
        const midiNum = baseC4 + (octave - 4) * 12 + semitoneIndex;
        return 440 * Math.pow(2, (midiNum - 69) / 12);
    }
};

// --- EDITOR CORE ---
const KlavarEditor = {
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
    STORAGE_KEY: 'klavarstudio_notes_v1',

    config: {
        keyWidth: 14,       // Smaller want we hebben nu 12 stapjes ipv 7
        beatHeight: 80,     
        lineThickness: 1.5, 
        gridColor: '#333',  
        beatColor: '#ddd', 
        measureColor: '#999',
        
        colorRight: '#e74c3c', 
        colorLeft: '#3498db',
        
        // 12-Grid (Semitones)
        pitchMap: [
            { note: 'C',  type: 'white', slot: 0 },
            { note: 'C#', type: 'black', slot: 1 },
            { note: 'D',  type: 'white', slot: 2 },
            { note: 'D#', type: 'black', slot: 3 },
            { note: 'E',  type: 'white', slot: 4 },
            { note: 'F',  type: 'white', slot: 5 }, 
            { note: 'F#', type: 'black', slot: 6 },
            { note: 'G',  type: 'white', slot: 7 },
            { note: 'G#', type: 'black', slot: 8 },
            { note: 'A',  type: 'white', slot: 9 },
            { note: 'A#', type: 'black', slot: 10 },
            { note: 'B',  type: 'white', slot: 11 } 
        ]
    },

    state: {
        zoom: 1.0,
        scrollX: 0, 
        scrollY: 0, 
        currentHand: 'R', 
        currentDuration: 1, 
        notes: [], 
        history: [], 
        hoverCursor: null
    },

    init() {
        this.canvas = document.getElementById('klavarCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Audio unlock
        document.body.addEventListener('click', () => SoundEngine.init(), { once: true });

        // Listeners
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        this.canvas.addEventListener('wheel', (e) => this.handleScroll(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mouseleave', () => { this.state.hoverCursor = null; this.draw(); });

        // Load data
        this.loadStateFromLocalStorage();
        this.resize(); // Trigger initial draw
    },

    // --- STORAGE & IMPORT ---
    saveStateToLocalStorage() {
        try {
            const dataToSave = JSON.stringify(this.state.notes);
            localStorage.setItem(this.STORAGE_KEY, dataToSave);
            const status = document.getElementById('autoSaveStatus');
            if (status) {
                status.textContent = "Autosave: Saved!";
                setTimeout(() => status.textContent = "Autosave: AAN", 1000);
            }
        } catch (e) { console.error("Save failed", e); }
    },

    loadStateFromLocalStorage() {
        try {
            const savedData = localStorage.getItem(this.STORAGE_KEY);
            if (savedData) {
                this.state.notes = JSON.parse(savedData);
                this.state.history.push(savedData);
            }
        } catch (e) { console.warn("Load failed", e); }
    },

    showImportPanel() {
        const panel = document.getElementById('importPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },

    importJSON() {
        const inputArea = document.getElementById('importInput');
        try {
            const importedNotes = JSON.parse(inputArea.value);
            if (Array.isArray(importedNotes)) {
                this.saveState(); // Voor undo
                this.state.notes = importedNotes;
                this.saveStateToLocalStorage();
                this.draw();
                this.showImportPanel(); // Verberg
                alert(`Gelukt! ${importedNotes.length} noten geladen.`);
            }
        } catch (e) { alert("Foutieve JSON data"); }
    },

    exportJSON() {
        const output = JSON.stringify(this.state.notes, null, 2);
        console.log(output);
        navigator.clipboard.writeText(output).then(() => alert("JSON gekopieerd naar klembord!")).catch(() => alert("Kijk in de console (F12)"));
    },

    // --- LOGIC & HELPERS ---
    
    resize() {
        const parent = this.canvas.parentElement;
        this.width = parent.clientWidth;
        this.height = parent.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);
        this.draw();
    },

    saveState() {
        if (this.state.history.length > 50) this.state.history.shift();
        this.state.history.push(JSON.stringify(this.state.notes));
    },

    undo() {
        if (this.state.history.length === 0) return;
        const prev = this.state.history.pop();
        this.state.notes = JSON.parse(prev);
        this.saveStateToLocalStorage();
        this.draw();
    },

    setHand(hand) {
        this.state.currentHand = hand;
        document.getElementById('btn-hand-l').classList.toggle('active', hand === 'L');
        document.getElementById('btn-hand-r').classList.toggle('active', hand === 'R');
        this.draw();
    },

    setDuration(dur) {
        this.state.currentDuration = dur;
        document.querySelectorAll('[id^="btn-dur-"]').forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-dur-${dur}`);
        if(btn) btn.classList.add('active');
        this.draw();
    },

    zoomIn() { this.state.zoom *= 1.1; this.draw(); },
    zoomOut() { this.state.zoom /= 1.1; this.draw(); },

    handleKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
        // Block keys if typing in textarea
        if (e.target.tagName === 'TEXTAREA') return;

        switch(e.key.toLowerCase()) {
            case 'l': this.setHand('L'); break;
            case 'r': this.setHand('R'); break;
            case '1': this.setDuration(1); break;
            case '2': this.setDuration(2); break;
            case '3': this.setDuration(0.5); break;
            case '4': this.setDuration(4); break;
            case '5': this.setDuration(0.25); break;
        }
    },

    handleScroll(e) {
        e.preventDefault();
        if (e.shiftKey) this.state.scrollX += e.deltaY;
        else {
            this.state.scrollY -= e.deltaY;
            if (this.state.scrollY < 0) this.state.scrollY = 0;
        }
        this.draw();
    },

    // CORE: Mouse to Note calculation (12 Grid)
    getLocationFromMouse(mouseX, mouseY) {
        const { scrollX, scrollY, zoom } = this.state;
        const { keyWidth, beatHeight, pitchMap } = this.config;

        const currentKeyWidth = keyWidth * zoom;
        const currentBeatHeight = beatHeight * zoom;
        const centerX = this.width / 2 - scrollX;

        // Y: Beat
        const absoluteY = mouseY + scrollY;
        const snappedBeat = Math.round((absoluteY / currentBeatHeight) * 4) / 4;

        // X: Note (12 slots per octave)
        const distFromCenter = mouseX - centerX;
        const octaveWidth = 12 * currentKeyWidth;
        
        const octaveIndex = Math.floor(distFromCenter / octaveWidth);
        const localX = distFromCenter - (octaveIndex * octaveWidth);
        const slotVal = localX / currentKeyWidth;

        // Find nearest slot
        let bestMatch = pitchMap[0];
        let minDiff = Infinity;
        pitchMap.forEach(p => {
            const diff = Math.abs(p.slot - slotVal);
            if (diff < minDiff) { minDiff = diff; bestMatch = p; }
        });

        const finalOctave = 4 + octaveIndex;
        return {
            beat: snappedBeat,
            note: `${bestMatch.note}${finalOctave}`,
            octave: finalOctave,
            type: bestMatch.type,
            slot: bestMatch.slot
        };
    },

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.state.hoverCursor = this.getLocationFromMouse(e.clientX - rect.left, e.clientY - rect.top);
        this.draw();
    },

    handleClick(e) {
        if (!this.state.hoverCursor) return;
        this.saveState(); 

        const { beat, note } = this.state.hoverCursor;
        const idx = this.state.notes.findIndex(n => n.beat === beat && n.note === note);

        if (idx >= 0) {
            this.state.notes.splice(idx, 1);
        } else {
            this.state.notes.push({
                beat: beat,
                note: note,
                duration: this.state.currentDuration,
                hand: this.state.currentHand
            });
            SoundEngine.playTone(SoundEngine.getFreq(note));
        }
        this.saveStateToLocalStorage();
        this.draw();
    },

    // --- DRAWING ---
    draw() {
        const { width, height, ctx } = this;
        const { keyWidth, beatHeight, pitchMap, colorLeft, colorRight } = this.config;
        const { scrollY, scrollX, zoom, notes, hoverCursor, currentHand, currentDuration } = this.state;

        ctx.clearRect(0, 0, width, height);
        ctx.save();

        const currentKeyWidth = keyWidth * zoom;
        const currentBeatHeight = beatHeight * zoom;
        const octaveWidth = 12 * currentKeyWidth;
        const centerX = width / 2 - scrollX;

        // 1. Horizontale Lijnen
        const startBeat = Math.floor(scrollY / currentBeatHeight);
        const endBeat = startBeat + Math.ceil(height / currentBeatHeight) + 1;
        ctx.lineWidth = 1;

        for (let i = startBeat; i < endBeat; i++) {
            const drawY = (i * currentBeatHeight) - scrollY;
            if (i % 4 === 0) {
                ctx.strokeStyle = this.config.measureColor;
                ctx.beginPath(); ctx.moveTo(0, drawY); ctx.lineTo(width, drawY); ctx.stroke();
                ctx.fillStyle = '#666'; ctx.font = '12px Arial'; ctx.fillText(`Maat ${i/4 + 1}`, 10, drawY - 5);
            } else {
                ctx.strokeStyle = this.config.beatColor;
                ctx.beginPath(); ctx.moveTo(0, drawY); ctx.lineTo(width, drawY); ctx.stroke();
            }
        }

        // 2. Verticale Lijnen (Black keys only)
        const octavesToDraw = 8;
        for (let oct = -octavesToDraw; oct <= octavesToDraw; oct++) {
            const octaveX = centerX + (oct * octaveWidth);
            const isCenterOctave = (oct === 0);

            pitchMap.filter(p => p.type === 'black').forEach(def => {
                const lineX = octaveX + (def.slot * currentKeyWidth);
                ctx.beginPath();
                ctx.strokeStyle = this.config.gridColor;
                ctx.lineWidth = this.config.lineThickness;

                if (isCenterOctave && (def.note === 'C#' || def.note === 'D#')) {
                    ctx.setLineDash([5, 5]); ctx.strokeStyle = '#555';
                } else { ctx.setLineDash([]); }
                
                ctx.moveTo(lineX, 0); ctx.lineTo(lineX, height); ctx.stroke();
            });
            
            if (isCenterOctave) {
                ctx.fillStyle = '#2980b9'; ctx.font = 'bold 12px Arial'; 
                ctx.fillText("C4", octaveX - 5, height - 20);
            }
        }

        // 3. Noten Tekenen
        const drawNote = (n, isGhost = false) => {
            const match = n.note.match(/([A-G]#?)(-?\d+)/);
            if (!match) return;
            const noteName = match[1];
            const octave = parseInt(match[2]);
            const pitchInfo = pitchMap.find(p => p.note === noteName);
            if (!pitchInfo) return;

            const x = centerX + ((octave - 4) * octaveWidth) + (pitchInfo.slot * currentKeyWidth);
            const y = (n.beat * currentBeatHeight) - scrollY;
            const radius = currentKeyWidth * 0.45;

            const hand = isGhost ? currentHand : (n.hand || 'R');
            const mainColor = hand === 'L' ? colorLeft : colorRight;

            // Stokje (Omhoog)
            const stemLength = (n.duration * currentBeatHeight);
            
            ctx.beginPath();
            ctx.moveTo(x, y); 
            ctx.lineTo(x, y - stemLength);
            ctx.strokeStyle = mainColor;
            ctx.lineWidth = 2;
            if (isGhost) ctx.globalAlpha = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // Bolletje
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            if (isGhost) {
                ctx.fillStyle = mainColor; ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1.0;
            } else {
                if (pitchInfo.type === 'black') {
                    ctx.fillStyle = mainColor; ctx.fill();
                } else {
                    ctx.fillStyle = 'white'; ctx.fill();
                    ctx.lineWidth = 2; ctx.strokeStyle = mainColor; ctx.stroke();
                }
            }
        };

        notes.forEach(n => drawNote(n, false));

        if (hoverCursor) {
            drawNote({
                beat: hoverCursor.beat,
                note: hoverCursor.note,
                duration: currentDuration,
                hand: currentHand
            }, true);
        }

        ctx.restore();
    }
};

window.onload = () => KlavarEditor.init();