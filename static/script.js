document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('record-btn');
    const recordText = document.getElementById('record-text');
    const statusText = document.getElementById('status-text');
    const chatWindow = document.getElementById('chat-window');

    let audioContext;
    let mediaStream;
    let recorder;
    let input;
    let isRecording = false;

    // Handle recording interactions
    recordBtn.addEventListener('mousedown', startRecording);
    recordBtn.addEventListener('mouseup', stopRecording);
    recordBtn.addEventListener('mouseleave', () => {
        if (isRecording) stopRecording();
    });

    // Touch events for mobile
    recordBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });
    recordBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    });

    async function startRecording() {
        if (isRecording) return;

        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            input = audioContext.createMediaStreamSource(mediaStream);

            // Create a ScriptProcessorNode with a bufferSize of 4096 and a single input and output channel
            recorder = audioContext.createScriptProcessor(4096, 1, 1);

            let audioData = {
                size: 0,
                buffer: []
            };

            recorder.onaudioprocess = (e) => {
                if (!isRecording) return;
                const inputData = e.inputBuffer.getChannelData(0);
                const bufferData = new Float32Array(inputData);
                audioData.buffer.push(bufferData);
                audioData.size += bufferData.length;
            };

            input.connect(recorder);
            recorder.connect(audioContext.destination);

            isRecording = true;
            recordBtn.classList.add('recording');
            recordText.textContent = "放開結束";
            statusText.textContent = "正在錄音...";

            // Store reference to audioData so stopRecording can access it
            recorder.audioData = audioData;

        } catch (err) {
            console.error('Error accessing microphone:', err);
            statusText.textContent = "無法存取麥克風。";
        }
    }

    function stopRecording() {
        if (!isRecording) return;

        isRecording = false;
        recordBtn.classList.remove('recording');
        recordText.textContent = "按住說話";
        statusText.textContent = "處理中...";

        // Stop recording
        recorder.disconnect();
        input.disconnect();
        mediaStream.getTracks().forEach(track => track.stop());

        // Process audio
        const audioData = recorder.audioData;
        const wavBlob = exportWAV(audioData.buffer, audioData.size, audioContext.sampleRate);

        sendAudioToServer(wavBlob);
    }

    function exportWAV(buffers, bufferLength, sampleRate) {
        const buffer = mergeBuffers(buffers, bufferLength);
        const data = createWavFile(buffer, sampleRate);
        return new Blob([data], { type: 'audio/wav' });
    }

    function mergeBuffers(buffers, len) {
        const result = new Float32Array(len);
        let offset = 0;
        for (let i = 0; i < buffers.length; i++) {
            result.set(buffers[i], offset);
            offset += buffers[i].length;
        }
        return result;
    }

    function createWavFile(samples, sampleRate) {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        floatTo16BitPCM(view, 44, samples);

        return view;
    }

    function floatTo16BitPCM(output, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function sendAudioToServer(audioBlob) {
        addMessage("🎤 (語音訊息)", 'sent');

        const formData = new FormData();
        formData.append('audio_data', audioBlob, 'recording.wav');

        fetch('/transcribe', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(data => {
                statusText.textContent = "";
                if (data.text) {
                    addMessage(data.text, 'received');
                } else if (data.error) {
                    addMessage(`錯誤: ${data.error}`, 'received');
                }
            })
            .catch(error => {
                console.error('Error:', error);
                statusText.textContent = "連線錯誤";
                addMessage("連線錯誤，請稍後再試。", 'received');
            });
    }

    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', type);

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = text;

        messageDiv.appendChild(bubble);
        chatWindow.appendChild(messageDiv);

        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
