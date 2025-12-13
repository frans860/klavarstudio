/**
 * KlavarStudio Core
 * Fase 3.5: Correcte Spacing (12-grid) & Audio
 */

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
        
        // Volume envelop (zachte attack, snelle decay)
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.5);
    },

    getFreq(noteName) {
        // Simpele conversie van nootnaam naar frequentie
        // A4 = 440Hz.
        const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        const match = noteName.match(/([A-G]#?)(-?\d+)/);
        if (!match) return 440;

        const note = match[1];
        const octave = parseInt(match[2]);
        
        const semitoneIndex = notes.indexOf(note);
        // A4 is de referentie. A is index 9. C4 is index 0.
        // MIDI nummer berekening is makkelijker. C4 = 60. A4 = 69.
        const baseC4 = 60; 
        const midiNum = baseC4 + (octave - 4) * 12 + semitoneIndex;
        
        // Freq formule: 440 * 2^((midi - 69) / 12)
        return 440 * Math.pow(2, (midiNum - 69) / 12);
    }
};

const KlavarEditor = {
    canvas: null, ctx: null, width: 0, height: 0,

    config: {
        // Let op: keyWidth is nu smaller omdat we er 12 per octaaf hebben ipv 7
        keyWidth: 14,       
        beatHeight: 80,     
        lineThickness: 1.5, 
        gridColor: '#333', beatColor: '#ddd', measureColor: '#999',
        colorRight: '#e74c3c', colorLeft: '#3498db',
        
        // NIEUW: 12-slot grid (Semitone Grid)
        // Dit lost het B-C probleem op. Elke stap is een halve toonafstand.
        pitchMap: [
            { note: 'C',  type: 'white', slot: 0 },
            { note: 'C#', type: 'black', slot: 1 },
            { note: 'D',  type: 'white', slot: 2 },
            { note: 'D#', type: 'black', slot: 3 },
            { note: 'E',  type: 'white', slot: 4 },
            { note: 'F',  type: 'white', slot: 5 }, // Direct naast E
            { note: 'F#', type: 'black', slot: 6 },
            { note: 'G',  type: 'white', slot: 7 },
            { note: 'G#', type: 'black', slot: 8 },
            { note: 'A',  type: 'white', slot: 9 },
            { note: 'A#', type: 'black', slot: 10 },
            { note: 'B',  type: 'white', slot: 11 } // Direct naast volgende C
        ]
    },

    state: {
        zoom: 1.0,
        scrollX: 0, scrollY: 0,
        currentHand: 'R', currentDuration: 1,
        notes: [], history: [],
        hoverCursor: null
    },

    init() {
        this.canvas = document.getElementById('klavarCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Audio init bij eerste interactie (browser policy)
        document.body.addEventListener('click', () => SoundEngine.init(), { once: true });

        window.addEventListener('resize', () => this.resize());
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        this.canvas.addEventListener('wheel', (e) => this.handleScroll(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
        this.canvas.addEventListener('mouseleave', () => { this.state.hoverCursor = null; this.draw(); });

        this.resize();
    },

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

    // --- UI HELPERS ---
    setHand(hand) {
        this.state.currentHand = hand;
        document.getElementById('btn-hand-l').classList.toggle('active', hand === 'L');
        document.getElementById('btn-hand-r').classList.toggle('active', hand === 'R');
        this.draw();
    },

    setDuration(dur) {
        this.state.currentDuration = dur;
        
        // Reset alle knoppen
        const allButtons = document.querySelectorAll('[id^="btn-dur-"]');
        allButtons.forEach(btn => btn.classList.remove('active'));
    
        // Activeer de juiste knop (moet als string matchen in ID)
        const activeBtn = document.getElementById(`btn-dur-${dur}`);
        if (activeBtn) activeBtn.classList.add('active');
    
        this.draw();
    },

    undo() {
        if (this.state.history.length === 0) return;
        const previous = this.state.history.pop();
        this.state.notes = JSON.parse(previous);
        this.draw();
    },

    handleKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this.undo(); return; }
        
        switch(e.key.toLowerCase()) {
            case 'l': this.setHand('L'); break;
            case 'r': this.setHand('R'); break;
            
            // Cijfertoetsen voor duur
            case '1': this.setDuration(1); break;
            case '2': this.setDuration(2); break;
            case '3': this.setDuration(0.5); break; // 3 voor 'halve tel' (ligt lekker naast 1 en 2)
            case '4': this.setDuration(4); break;
            case '5': this.setDuration(0.25); break; // 5 voor 1/4 tel (optioneel)
        }
    },

    // --- LOGIC ---
    getLocationFromMouse(mouseX, mouseY) {
        const { scrollX, scrollY, zoom } = this.state;
        const { keyWidth, beatHeight, pitchMap } = this.config;

        const currentKeyWidth = keyWidth * zoom;
        const currentBeatHeight = beatHeight * zoom;
        const centerX = this.width / 2 - scrollX;

        // Y-Axis
        const absoluteY = mouseY + scrollY;
        const snappedBeat = Math.round((absoluteY / currentBeatHeight) * 4) / 4;

        // X-Axis (Hier is de logica aangepast voor 12 slots)
        const distFromCenter = mouseX - centerX;
        
        // 1 Octaaf = 12 * keyWidth (ipv 7)
        const octaveWidth = 12 * currentKeyWidth; 
        
        const octaveIndex = Math.floor(distFromCenter / octaveWidth);
        let localX = distFromCenter - (octaveIndex * octaveWidth);
        let slotVal = localX / currentKeyWidth;

        // Vind dichtstbijzijnde slot
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
            baseNote: bestMatch.note,
            octave: finalOctave,
            type: bestMatch.type,
            slot: bestMatch.slot
        };
    },

    handleClick(e) {
        if (!this.state.hoverCursor) return;
        
        // Save history
        if (this.state.history.length > 50) this.state.history.shift();
        this.state.history.push(JSON.stringify(this.state.notes));

        const { beat, note } = this.state.hoverCursor;
        const existingIndex = this.state.notes.findIndex(n => n.beat === beat && n.note === note);

        if (existingIndex >= 0) {
            this.state.notes.splice(existingIndex, 1);
        } else {
            this.state.notes.push({
                beat: beat,
                note: note,
                duration: this.state.currentDuration,
                hand: this.state.currentHand
            });
            // SPEEL GELUID
            SoundEngine.playTone(SoundEngine.getFreq(note));
        }
        this.draw();
    },

    handleScroll(e) { /* zelfde als voorheen */
        e.preventDefault();
        if (e.shiftKey) this.state.scrollX += e.deltaY;
        else {
            this.state.scrollY -= e.deltaY; 
            if (this.state.scrollY < 0) this.state.scrollY = 0;
        }
        this.draw();
    },
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.state.hoverCursor = this.getLocationFromMouse(e.clientX - rect.left, e.clientY - rect.top);
        this.draw();
    },

    exportJSON() { console.log(JSON.stringify(this.state.notes, null, 2)); alert("JSON in Console!"); },

    // --- DRAW ---
    draw() {
        const { width, height, ctx } = this;
        const { keyWidth, beatHeight, pitchMap, colorLeft, colorRight } = this.config;
        const { scrollY, scrollX, zoom, notes, hoverCursor, currentHand, currentDuration } = this.state;

        ctx.clearRect(0, 0, width, height);
        ctx.save();

        const currentKeyWidth = keyWidth * zoom;
        const currentBeatHeight = beatHeight * zoom;
        const octaveWidth = 12 * currentKeyWidth; // Aangepaste breedte!
        const centerX = width / 2 - scrollX;

        // 1. Horizontale Lijnen (Tellen)
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

        // 2. Verticale Lijnen (Klavar Grid)
        const octavesToDraw = 6;
        for (let oct = -octavesToDraw; oct <= octavesToDraw; oct++) {
            const octaveX = centerX + (oct * octaveWidth);
            const isCenterOctave = (oct === 0);

            // Alleen zwarte toetsen tekenen (slots: 1, 3, 6, 8, 10)
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
                // Plaats de tekst iets links van de eerste zwarte toets
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

            // X calculation based on 12-grid
            const x = centerX + ((octave - 4) * octaveWidth) + (pitchInfo.slot * currentKeyWidth);
            const y = (n.beat * currentBeatHeight) - scrollY;
            const radius = currentKeyWidth * 0.45; // Iets groter

            const hand = isGhost ? currentHand : (n.hand || 'R');
            const mainColor = hand === 'L' ? colorLeft : colorRight;

            // Stokje (Omhoog)
            const stemLength = (n.duration * currentBeatHeight);
            ctx.beginPath();
            ctx.moveTo(x, y); 
            ctx.lineTo(x, y - stemLength); // Naar boven
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