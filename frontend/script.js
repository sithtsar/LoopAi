const micButton = document.getElementById('micButton');
const statusText = document.getElementById('status');
const audioPlayer = document.getElementById('audioPlayer');
const visualizerCanvas = document.getElementById('visualizer');
const cards = document.querySelectorAll('.card');

// Icons
const MIC_ICON = `<svg class="mic-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
const STOP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;

let analyser;
let dataArray;
let animationId;
let sessionId = localStorage.getItem('sessionId') || Math.random().toString(36).substring(2);
localStorage.setItem('sessionId', sessionId);

let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Initialize Canvas Context
const ctx = visualizerCanvas.getContext('2d');
visualizerCanvas.width = visualizerCanvas.offsetWidth;
visualizerCanvas.height = visualizerCanvas.offsetHeight;

// Handle Resize
window.addEventListener('resize', () => {
    visualizerCanvas.width = visualizerCanvas.offsetWidth;
    visualizerCanvas.height = visualizerCanvas.offsetHeight;
});

// Initial "Silent" Visualizer State
function drawIdleVisualizer() {
    ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    ctx.beginPath();
    ctx.moveTo(0, visualizerCanvas.height / 2);
    ctx.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
    ctx.strokeStyle = '#27272a'; // Dark gray line
    ctx.lineWidth = 2;
    ctx.stroke();
}

drawIdleVisualizer();

micButton.addEventListener('click', async () => {
    if (isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        // Set up analyser
        const audioContext = getAudioContext();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 512; // Higher resolution for smoother look
        analyser.smoothingTimeConstant = 0.6; // Smooth out the bars

        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            resetUIState();
            if (animationId) cancelAnimationFrame(animationId);
            drawIdleVisualizer();
            
            stream.getTracks().forEach(track => track.stop());
            // Do not close audioContext
            
            await sendAudio(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        updateUIState('recording');
        drawVisualizer();

    } catch (error) {
        console.error('Error accessing microphone:', error);
        statusText.textContent = 'Microphone access denied';
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        updateUIState('processing');
    }
}

async function sendAudio(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.wav');

    try {
        const response = await fetch('http://localhost:8000/talk', {
            method: 'POST',
            headers: { 'session-id': sessionId },
            body: formData
        });

        if (response.ok) {
            updateUIState('playing');
            await playStreamingAudio(response);
        } else {
            statusText.textContent = 'Error processing audio';
            resetUIState();
        }
    } catch (error) {
        console.error('Error sending audio:', error);
        statusText.textContent = 'Network error';
        resetUIState();
    }
}

// Audio Context Management
let audioCtx;

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

async function playStreamingAudio(response) {
    const audioContext = getAudioContext();
    const reader = response.body.getReader();
    const chunks = [];

    // Visualization for playback (optional: if we could pipe this to analyser)
    // Since we decode all at once in current logic (concatenating buffers), we can visualize it.
    // For streaming playback, we need to connect the source to an analyser too.

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
    }

    const audioBuffer = await audioContext.decodeAudioData(concatenateBuffers(chunks));
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create analyser for playback visualization
    // Reuse the global analyser if possible, or create a new one connected to destination
    // To avoid conflict with mic analyser, we use a separate connection or switch modes.
    // For simplicity in this prototype:
    
    const playbackAnalyser = audioContext.createAnalyser();
    playbackAnalyser.fftSize = 512;
    playbackAnalyser.smoothingTimeConstant = 0.7; 
    
    source.connect(playbackAnalyser);
    playbackAnalyser.connect(audioContext.destination);
    
    // Switch global analyser reference to this one so drawVisualizer picks it up
    analyser = playbackAnalyser; 
    drawVisualizer(); // Start visualizing

    source.start();

    source.onended = () => {
        cancelAnimationFrame(animationId);
        drawIdleVisualizer();
        resetUIState();
        // Do not close the context, just let it be
    };
}

function concatenateBuffers(buffers) {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
    }
    return result.buffer;
}

function drawVisualizer() {
    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    function draw() {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, width, height);
        
        // Styling
        const barWidth = (width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;
        
        // Create Gradient
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, '#18181b'); // Dark base
        gradient.addColorStop(0.5, '#a1a1aa'); // Mid
        gradient.addColorStop(1, '#fafafa'); // Bright top

        // Mirrored Center Visualization
        // We'll take the lower half of the frequencies (bass/mids) as they are more visible usually
        const relevantData = dataArray.slice(0, bufferLength / 2); 
        const len = relevantData.length;
        const cx = width / 2;
        
        // We will draw bars extending outwards from the center
        // But a simpler "modern" look is often just the bars centered vertically
        
        const barCount = 64; // Limit bars for cleaner look
        const step = Math.floor(len / barCount);
        const spacing = 4;
        const totalBarWidth = (width - (barCount * spacing)) / barCount;

        for (let i = 0; i < barCount; i++) {
            // Average out the chunk
            let sum = 0;
            for(let j=0; j<step; j++) {
                sum += relevantData[i*step + j] || 0;
            }
            const avg = sum / step;

            // Scale height
            barHeight = (avg / 255) * height * 0.8; // 80% max height
            
            // Center vertically
            const y = (height - barHeight) / 2;
            const xPos = (i * (totalBarWidth + spacing)) + (spacing/2);

            // Rounded caps look nicer
            roundRect(ctx, xPos, y, totalBarWidth, barHeight, 4, gradient);
        }
    }

    draw();
}

// Utility helper for rounded rectangles on canvas
function roundRect(ctx, x, y, w, h, r, fillStyle) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y,   x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x,   y+h, r);
    ctx.arcTo(x,   y+h, x,   y,   r);
    ctx.arcTo(x,   y,   x+w, y,   r);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
}


function updateUIState(state) {
    switch(state) {
        case 'recording':
            micButton.innerHTML = STOP_ICON;
            micButton.classList.add('recording');
            statusText.textContent = 'Listening...';
            break;
        case 'processing':
            micButton.innerHTML = MIC_ICON;
            micButton.classList.remove('recording');
            statusText.textContent = 'Thinking...';
            break;
        case 'playing':
            statusText.textContent = 'Speaking...';
            break;
    }
}

function resetUIState() {
    micButton.innerHTML = MIC_ICON;
    micButton.classList.remove('recording');
    statusText.textContent = 'Ready to listen';
}

// Card Interactions
cards.forEach(card => {
    card.addEventListener('click', async () => {
        const query = card.getAttribute('data-query');
        updateUIState('processing');
        await sendText(query);
    });
});

async function sendText(query) {
    try {
        const response = await fetch(`http://localhost:8000/text?query=${encodeURIComponent(query)}`, {
            method: 'POST',
            headers: {
                'session-id': sessionId
            }
        });

        if (response.ok) {
            updateUIState('playing');
            await playStreamingAudio(response);
        } else {
            statusText.textContent = 'Network error';
            resetUIState();
        }
    } catch (error) {
        console.error('Error sending text:', error);
        statusText.textContent = 'Network error';
        resetUIState();
    }
}