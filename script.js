/**
 * KlavarStudio Core
 * Fase 7.2: Full Song Export (Meta + Notes)
 */

// --- AUDIO ENGINE ---
const SoundEngine = {
    ctx: null,
    
    init() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
    },

    playTone(frequency, durationSec = 0.5, type = 'sine') {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume(); 

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.02); 
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime + durationSec - 0.02); 
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + durationSec); 

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + durationSec);
    },

    getFreq(noteName) {
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const match = noteName.match(/([A-G]#?)(-?\d+)/);
        if (!match) return 440;

        const note = match[1];
        const octave = parseInt(match[2]);
        const semitoneIndex = notes.indexOf(note);
        
        const baseC4 = 60; 
        const midiNum = baseC4 + (octave - 4) * 12 + semitoneIndex;
        return 440 * Math.pow(2, (midiNum - 69) / 12);
    }
};

// --- EDITOR CORE ---
const KlavarEditor = {
    canvas: null, ctx: null, width: 0, height: 0,
    STORAGE_KEY: 'klavarstudio_notes_v1',

    config: {
        keyWidth: 14, beatHeight: 80, lineThickness: 1.5, 
        gridColor: '#333', beatColor: '#ddd', measureColor: '#999',
        colorRight: '#e74c3c', colorLeft: '#3498db',
        beatsPerMeasure: 4, 
        
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
        zoom: 1.0, scrollX: 0, scrollY: 0, 
        currentHand: 'R', 
        currentDuration: 1, 
        currentFinger: 0, 
        notes: [], history: [], 
        hoverCursor: null,
        isPlaying: false, bpm: 120, startTime: 0,       
        playbackBeat: 0, playedNotes: []     
    },

    init() {
        this.canvas = document.getElementById('klavarCanvas');
        this.ctx = this.canvas.getContext('2d');
        document.body.addEventListener('click', () => SoundEngine.init(), { once: true });

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.canvas.addEventListener('wheel', (e) => this.handleScroll(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mouseleave', () => { }); 

        this.loadStateFromLocalStorage();
        
        if (!this.state.hoverCursor) {
            this.state.hoverCursor = {
                beat: 0, note: "C4", octave: 4, baseNote: "C", slot: 0, type: "white"
            };
        }
        this.resize();
    },

    setBPM(val) { 
        this.state.bpm = parseInt(val) || 120; 
        // Update input field if changed programmatically (e.g. import)
        const input = document.getElementById('bpmInput');
        if(input) input.value = this.state.bpm;
    },

    setTimeSignature(val) {
        this.config.beatsPerMeasure = parseInt(val);
        // Update select box if changed programmatically
        const select = document.getElementById('timeSignature');
        if(select) select.value = this.config.beatsPerMeasure;
        this.draw();
    },

    setFingerTool(number) {
        this.state.currentFinger = number;
        for(let i=0; i<=5; i++) {
            const btn = document.getElementById(`btn-fing-${i}`);
            if(btn) btn.classList.remove('active');
        }
        const activeBtn = document.getElementById(`btn-fing-${number}`);
        if(activeBtn) activeBtn.classList.add('active');

        if (this.state.hoverCursor) {
             const { beat, note } = this.state.hoverCursor;
             const idx = this.state.notes.findIndex(n => n.beat === beat && n.note === note);
             if (idx >= 0) { this.setFinger(number); }
        }
    },

    setFinger(number) {
        if (!this.state.hoverCursor) return;
        const { beat, note } = this.state.hoverCursor;
        const idx = this.state.notes.findIndex(n => n.beat === beat && n.note === note);
        
        if (idx >= 0) {
            this.saveState();
            if (number === 0) {
                delete this.state.notes[idx].finger; 
            } else {
                this.state.notes[idx].finger = number;
            }
            this.saveStateToLocalStorage();
            this.draw();
        }
    },

    play() {
        if (this.state.isPlaying) return; 
        SoundEngine.init(); 
        this.state.isPlaying = true;
        this.state.startTime = performance.now();
        this.state.playbackBeat = 0; 
        this.state.playedNotes = []; 
        this.state.scrollY = 0; 
        this.playbackLoop();
    },

    stop() {
        this.state.isPlaying = false;
        this.draw(); 
    },

    clearAllNotes() {
        if (!this.state.notes.length) return;
        if (!confirm("Weet je zeker dat je alle noten wilt verwijderen?")) return;
        this.saveState(); 
        this.state.notes = [];
        this.state.playedNotes = [];
        this.state.scrollY = 0; 
        this.saveStateToLocalStorage();
        this.draw();
    },

    playbackLoop() {
        if (!this.state.isPlaying) return;

        const now = performance.now();
        const secondsElapsed = (now - this.state.startTime) / 1000;
        const beatsPerSecond = this.state.bpm / 60;
        
        this.state.playbackBeat = secondsElapsed * beatsPerSecond;

        const { beatHeight } = this.config;
        const { zoom } = this.state;
        const currentBeatHeight = beatHeight * zoom;
        const centerOffset = this.height * 0.5;
        const targetScrollY = (this.state.playbackBeat * currentBeatHeight) - centerOffset;
        this.state.scrollY = Math.max(0, targetScrollY);

        this.state.notes.forEach((note, index) => {
            if (this.state.playedNotes.includes(index)) return;
            const delta = this.state.playbackBeat - note.beat;
            if (delta >= 0 && delta < 0.1) {
                const durationSec = note.duration * (60 / this.state.bpm);
                SoundEngine.playTone(SoundEngine.getFreq(note.note), durationSec);
                this.state.playedNotes.push(index);
            }
        });

        this.draw();
        requestAnimationFrame(() => this.playbackLoop());
    },

    saveStateToLocalStorage() { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.state.notes)); } catch (e) {} },
    loadStateFromLocalStorage() { try { const s = localStorage.getItem(this.STORAGE_KEY); if (s) { this.state.notes = JSON.parse(s); this.state.history.push(s); } } catch (e) {} },
    showImportPanel() { const p = document.getElementById('importPanel'); p.style.display = p.style.display==='none'?'block':'none'; },
    
    // --- UPDATED IMPORT ---
    importJSON() { 
        const i = document.getElementById('importInput'); 
        try { 
            const data = JSON.parse(i.value); 
            this.saveState(); 
            
            // Check: Is het de OUDE structuur (Array) of NIEUWE (Object)?
            if (Array.isArray(data)) {
                this.state.notes = data; 
                alert("Let op: Oude data structuur geladen (geen BPM/Maatsoort info).");
            } else if (data.notes) {
                // Nieuwe structuur!
                this.state.notes = data.notes;
                
                // Laad metadata indien aanwezig
                if (data.meta) {
                    if (data.meta.beatsPerMeasure) this.setTimeSignature(data.meta.beatsPerMeasure);
                    if (data.meta.bpm) this.setBPM(data.meta.bpm);
                }
            } else {
                throw new Error("Ongeldig formaat");
            }
            
            this.saveStateToLocalStorage(); 
            this.draw(); 
            this.showImportPanel(); 
        } catch(e) { alert("Foutieve JSON data"); console.error(e); } 
    },
    
    // --- UPDATED EXPORT ---
    exportJSON() { 
        // We maken nu een compleet Song Object
        const songData = {
            meta: {
                title: "Klavar Export",
                beatsPerMeasure: this.config.beatsPerMeasure,
                bpm: this.state.bpm,
                exportedAt: new Date().toISOString()
            },
            notes: this.state.notes
        };

        const out = JSON.stringify(songData, null, 2); 
        console.log(out); 
        navigator.clipboard.writeText(out).then(()=>alert("JSON (Song Data) gekopieerd!")).catch(()=>alert("Zie console")); 
    },

    resize() {
        const p = this.canvas.parentElement; this.width = p.clientWidth; this.height = p.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.width * dpr; this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr); this.draw();
    },
    saveState() { if (this.state.history.length > 50) this.state.history.shift(); this.state.history.push(JSON.stringify(this.state.notes)); },
    undo() { if (this.state.history.length === 0) return; this.state.notes = JSON.parse(this.state.history.pop()); this.saveStateToLocalStorage(); this.draw(); },
    setHand(h) { this.state.currentHand = h; document.getElementById('btn-hand-l').classList.toggle('active', h==='L'); document.getElementById('btn-hand-r').classList.toggle('active', h==='R'); this.draw(); },
    setDuration(d) { this.state.currentDuration = d; document.querySelectorAll('[id^="btn-dur-"]').forEach(b => b.classList.remove('active')); const btn = document.getElementById(`btn-dur-${d}`); if(btn) btn.classList.add('active'); this.draw(); },
    zoomIn() { this.state.zoom *= 1.1; this.draw(); },
    zoomOut() { this.state.zoom /= 1.1; this.draw(); },
    
    moveKeyboardCursor(dBeat, dPitch) {
        if (!this.state.hoverCursor) return;
        let { beat, note, octave, baseNote } = this.state.hoverCursor;
        const { pitchMap } = this.config;

        beat += dBeat;
        if (beat < 0) beat = 0;

        if (dPitch !== 0) {
            let currentIndex = pitchMap.findIndex(p => p.note === baseNote);
            if (currentIndex === -1) currentIndex = 0;
            let newIndex = currentIndex + dPitch;
            if (newIndex >= pitchMap.length) { newIndex = 0; octave += 1; } 
            else if (newIndex < 0) { newIndex = pitchMap.length - 1; octave -= 1; }

            const newPitch = pitchMap[newIndex];
            baseNote = newPitch.note;
            note = `${baseNote}${octave}`;
            this.state.hoverCursor.type = newPitch.type;
            this.state.hoverCursor.slot = newPitch.slot;
        }

        this.state.hoverCursor.beat = Math.round(beat * 4) / 4;
        this.state.hoverCursor.baseNote = baseNote;
        this.state.hoverCursor.octave = octave;
        this.state.hoverCursor.note = note;

        const { beatHeight } = this.config;
        const { zoom, scrollY } = this.state;
        const currentBeatHeight = beatHeight * zoom;
        const cursorPixelY = this.state.hoverCursor.beat * currentBeatHeight;
        const screenY = cursorPixelY - scrollY;

        if (screenY > this.height * 0.8) this.state.scrollY += (screenY - (this.height * 0.8));
        if (screenY < this.height * 0.1) {
            this.state.scrollY += (screenY - (this.height * 0.1));
            if (this.state.scrollY < 0) this.state.scrollY = 0;
        }
        this.draw();
    },

    handleKeyDown(e) {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.clearAllNotes(); return; }
        }

        if (e.shiftKey) {
            if (['Digit0','Digit1','Digit2','Digit3','Digit4','Digit5'].includes(e.code)) {
                e.preventDefault();
                this.setFingerTool(parseInt(e.code.replace('Digit','')));
                return;
            }
        }

        const step = 0.25; 
        switch(e.key) {
            case 'ArrowUp': e.preventDefault(); this.moveKeyboardCursor(-step, 0); break;
            case 'ArrowDown': e.preventDefault(); this.moveKeyboardCursor(step, 0); break;
            case 'ArrowLeft': e.preventDefault(); this.moveKeyboardCursor(0, -1); break;
            case 'ArrowRight': e.preventDefault(); this.moveKeyboardCursor(0, 1); break;
            case ' ': 
                e.preventDefault();
                if (this.state.isPlaying) { this.stop(); } 
                else { this.handleClick(); } 
                break;
            case 'l': case 'L': this.setHand('L'); break;
            case 'r': case 'R': this.setHand('R'); break;
            case '1': if(!e.shiftKey) this.setDuration(1); break;
            case '2': if(!e.shiftKey) this.setDuration(2); break;
            case '3': if(!e.shiftKey) this.setDuration(0.5); break;
            case '4': if(!e.shiftKey) this.setDuration(4); break;
            case '5': if(!e.shiftKey) this.setDuration(0.25); break;
        }
    },

    handleScroll(e) { e.preventDefault(); if(e.shiftKey) this.state.scrollX += e.deltaY; else { this.state.scrollY -= e.deltaY; if(this.state.scrollY < 0) this.state.scrollY = 0; } this.draw(); },
    getLocationFromMouse(mx, my) {
        const { scrollX, scrollY, zoom } = this.state; const { keyWidth, beatHeight, pitchMap } = this.config;
        const cKW = keyWidth * zoom; const cBH = beatHeight * zoom; const cX = this.width/2 - scrollX;
        const absY = my + scrollY; const beat = Math.round((absY/cBH)*4)/4;
        const dist = mx - cX; const octW = 12 * cKW; const octIdx = Math.floor(dist/octW);
        const locX = dist - (octIdx * octW); const slot = locX / cKW;
        let best = pitchMap[0], minD = Infinity;
        pitchMap.forEach(p => { const d = Math.abs(p.slot - slot); if (d < minD) { minD = d; best = p; } });
        return { beat: beat, note: `${best.note}${4+octIdx}`, octave: 4+octIdx, type: best.type, slot: best.slot, baseNote: best.note };
    },
    handleMouseMove(e) { const r = this.canvas.getBoundingClientRect(); this.state.hoverCursor = this.getLocationFromMouse(e.clientX - r.left, e.clientY - r.top); if(!this.state.isPlaying) this.draw(); },
    
    handleClick(e) {
        if (!this.state.hoverCursor) return;
        this.saveState();
        const { beat, note } = this.state.hoverCursor;
        const idx = this.state.notes.findIndex(n => n.beat === beat && n.note === note);
        
        if (idx >= 0) {
            this.state.notes.splice(idx, 1);
        } else { 
            const newNote = { beat, note, duration: this.state.currentDuration, hand: this.state.currentHand };
            if (this.state.currentFinger > 0) newNote.finger = this.state.currentFinger;
            this.state.notes.push(newNote);
            SoundEngine.playTone(SoundEngine.getFreq(note), this.state.currentDuration * (60/this.state.bpm)); 
        }
        this.saveStateToLocalStorage(); this.draw();
    },

    draw() {
        const { width, height, ctx } = this;
        const { keyWidth, beatHeight, pitchMap, colorLeft, colorRight, beatsPerMeasure } = this.config;
        const { scrollY, scrollX, zoom, notes, hoverCursor, currentHand, currentDuration, isPlaying, playbackBeat } = this.state;

        ctx.clearRect(0, 0, width, height);
        ctx.save();

        const cKW = keyWidth * zoom; const cBH = beatHeight * zoom; const octW = 12 * cKW; const cX = width/2 - scrollX;
        const startBeat = Math.floor(scrollY / cBH); const endBeat = startBeat + Math.ceil(height / cBH) + 1;

        ctx.lineWidth = 1;
        for (let i = startBeat; i < endBeat; i++) {
            const y = (i * cBH) - scrollY;
            if (i % beatsPerMeasure === 0) {
                ctx.strokeStyle = this.config.measureColor; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
                ctx.fillStyle = '#666'; ctx.font = '12px Arial'; ctx.fillText(`Maat ${i/beatsPerMeasure + 1}`, 10, y - 5);
            } else {
                ctx.strokeStyle = this.config.beatColor; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
        }
        
        const octs = 8;
        for (let o = -octs; o <= octs; o++) {
            const ox = cX + (o * octW); const isC = (o===0);
            pitchMap.filter(p => p.type === 'black').forEach(d => {
                const lx = ox + (d.slot * cKW);
                ctx.beginPath(); ctx.strokeStyle = this.config.gridColor; ctx.lineWidth = this.config.lineThickness;
                if (isC && (d.note === 'C#' || d.note === 'D#')) { ctx.setLineDash([5, 5]); ctx.strokeStyle = '#555'; } else ctx.setLineDash([]);
                ctx.moveTo(lx, 0); ctx.lineTo(lx, height); ctx.stroke();
            });
            if (isC) { ctx.fillStyle = '#2980b9'; ctx.font = 'bold 12px Arial'; ctx.fillText("C4", ox - 5, height - 20); }
        }

        const drawNote = (n, ghost=false) => {
            const m = n.note.match(/([A-G]#?)(-?\d+)/); if(!m) return;
            const p = pitchMap.find(x => x.note === m[1]); if(!p) return;
            const x = cX + ((parseInt(m[2])-4)*octW) + (p.slot*cKW);
            const y = (n.beat * cBH) - scrollY;
            const h = ghost ? currentHand : (n.hand || 'R'); const col = h==='L'?colorLeft:colorRight;
            
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - (n.duration * cBH)); 
            ctx.strokeStyle = col; ctx.lineWidth = 2; if(ghost) ctx.globalAlpha=0.5; ctx.stroke(); ctx.globalAlpha=1;
            
            ctx.beginPath(); ctx.arc(x, y, cKW*0.45, 0, Math.PI*2);
            if(ghost) { 
                ctx.fillStyle = col; ctx.globalAlpha=0.3; ctx.fill(); ctx.globalAlpha=1; 
            } else {
                if (p.type==='black') { ctx.fillStyle = col; ctx.fill(); }
                else { ctx.fillStyle = 'white'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=col; ctx.stroke(); }
                if (n.finger) {
                    ctx.fillStyle = (p.type==='black') ? 'white' : 'black';
                    ctx.font = 'bold 10px Arial';
                    const textWidth = ctx.measureText(n.finger).width;
                    ctx.fillText(n.finger, x - (textWidth/2), y + 3); 
                }
            }
        };
        notes.forEach(n => drawNote(n));
        
        if (hoverCursor && !isPlaying) drawNote({ beat: hoverCursor.beat, note: hoverCursor.note, duration: currentDuration }, true);

        if (isPlaying) {
            const playY = (playbackBeat * cBH) - scrollY;
            ctx.beginPath(); ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.moveTo(0, playY); ctx.lineTo(width, playY); ctx.stroke();
            ctx.fillStyle = 'red'; ctx.beginPath(); ctx.moveTo(0, playY); ctx.lineTo(10, playY - 5); ctx.lineTo(10, playY + 5); ctx.fill();
        }

        ctx.restore();
    }
};

window.onload = () => KlavarEditor.init();