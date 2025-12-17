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
            recordText.textContent = "放開結束"; // Change text to indicate active recording
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

        // Add a small delay to ensure the last part of the audio is captured
        setTimeout(() => {
            isRecording = false;
            recordBtn.classList.remove('recording');
            recordText.textContent = "按住說話";
            statusText.textContent = "處理中...";

            if (recorder && input) {
                // Stop recording
                recorder.disconnect();
                input.disconnect();
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
            }

            // Process audio
            if (recorder && recorder.audioData) {
                const audioData = recorder.audioData;
                const wavBlob = exportWAV(audioData.buffer, audioData.size, audioContext.sampleRate);
                sendAudioToServer(wavBlob);
            }
        }, 500); // 500ms delay
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
                    // Separate the intro and the content
                    addMessage("我猜你想說的是...", 'received');
                    const messageDiv = addMessage(data.text, 'received');

                    // Only show feedback for valid results (filtering out error messages if any)
                    if (!data.text.includes("抱歉") && !data.text.includes("錯誤")) {
                        showFeedbackOptions(messageDiv, data.text);
                    }
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
        return messageDiv; // Return the div for appending subsequent options
    }

    function showFeedbackOptions(parentMessageDiv, originalText) {
        const optionsContainer = document.createElement('div');
        optionsContainer.classList.add('feedback-options');

        const options = [
            { label: '完全正確', value: 'perfect' },
            { label: '差不多正確', value: 'good' },
            { label: '幾乎錯誤', value: 'bad' }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.classList.add('feedback-btn');
            btn.textContent = opt.label;

            btn.onclick = function () {
                // Disable all buttons in this group
                const allBtns = optionsContainer.querySelectorAll('.feedback-btn');
                allBtns.forEach(b => {
                    b.disabled = true;
                    b.style.opacity = '0.6';
                    b.style.cursor = 'default';
                });

                // Highlight selected
                btn.classList.add('selected');
                btn.style.opacity = '1';

                // Handle Logic based on selection
                if (opt.value === 'perfect') {
                    addMessage("很棒！歡迎繼續練習。👍", 'received');
                } else if (opt.value === 'good') {
                    handleAlmostCorrect(originalText);
                } else if (opt.value === 'bad') {
                    handleAlmostWrong(originalText);
                }
            };

            optionsContainer.appendChild(btn);
        });

        parentMessageDiv.appendChild(optionsContainer);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function handleAlmostCorrect(originalText) {
        // Fetch mock suggestions from server
        fetch('/get_similar_suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: originalText })
        })
            .then(res => res.json())
            .then(data => {
                const suggestions = data.suggestions; // Expecting array of 2 strings

                // Format the message with numbered options
                const suggestionMsg = `還是你想說的是...\n1. ${suggestions[0]}\n2. ${suggestions[1]}`;
                addMessage(suggestionMsg, 'received');

                // Create buttons container
                const optionsContainer = document.createElement('div');
                optionsContainer.classList.add('feedback-options');

                const choices = [
                    { label: '1 正確', text: suggestions[0] },
                    { label: '2 正確', text: suggestions[1] },
                    { label: '都不正確', text: null }
                ];

                choices.forEach(choice => {
                    const btn = document.createElement('button');
                    btn.classList.add('feedback-btn');
                    btn.textContent = choice.label;
                    btn.onclick = () => {
                        // Disable buttons
                        const btns = optionsContainer.querySelectorAll('.feedback-btn');
                        btns.forEach(b => {
                            b.disabled = true;
                            b.style.opacity = '0.6';
                            b.style.cursor = 'default';
                        });

                        // Highlight selected
                        btn.classList.add('selected');
                        btn.style.opacity = '1';

                        if (choice.text) {
                            addMessage(`好的，確認是「${choice.text}」。`, 'received');
                        } else {
                            // If "None", fallback to manual input like 'bad' case
                            addMessage("那請告訴我正確的內容：", 'received');
                            handleAlmostWrong(originalText);
                        }
                    };
                    optionsContainer.appendChild(btn);
                });

                // Append options to the LAST received message bubble
                const lastMsg = chatWindow.lastElementChild;
                lastMsg.appendChild(optionsContainer);
                chatWindow.scrollTop = chatWindow.scrollHeight;
            });
    }

    function handleAlmostWrong(originalText) {
        // Show input field for correction
        const inputContainer = document.createElement('div');
        inputContainer.style.marginTop = '10px';
        inputContainer.style.display = 'flex';
        inputContainer.style.gap = '5px';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '請輸入正確內容...';
        input.style.flex = '1';
        input.style.padding = '8px';
        input.style.borderRadius = '5px';
        input.style.border = '1px solid #ccc';

        const sendBtn = document.createElement('button');
        sendBtn.textContent = '送出';
        sendBtn.style.padding = '8px 15px';
        sendBtn.style.backgroundColor = 'var(--btn-primary)';
        sendBtn.style.color = 'white';
        sendBtn.style.border = 'none';
        sendBtn.style.borderRadius = '5px';
        sendBtn.style.cursor = 'pointer';

        sendBtn.onclick = () => {
            const correctText = input.value.trim();
            if (!correctText) return;

            // Remove input UI
            inputContainer.remove();

            // Show user correction
            addMessage(`修正：${correctText}`, 'sent');

            // Analyze
            addMessage("分析發音中...", 'received');

            fetch('/analyze_correction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wrong_text: originalText,
                    correct_text: correctText
                })
            })
                .then(res => res.json())
                .then(data => {
                    addMessage(`💡 發音建議：\n${data.advice}`, 'received');
                });
        };

        inputContainer.appendChild(input);
        inputContainer.appendChild(sendBtn);

        // Append to the last message bubble
        const lastMsg = chatWindow.lastElementChild;
        lastMsg.appendChild(inputContainer);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
});
