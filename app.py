from flask import Flask, render_template, request, jsonify
import speech_recognition as sr
import os
import uuid

app = Flask(__name__)

# Ensure upload directory exists
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'audio_data' not in request.files:
        return jsonify({'error': 'No audio data'}), 400
    
    file = request.files['audio_data']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # Save the file temporarily
    filename = f"{uuid.uuid4()}.wav"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    recognizer = sr.Recognizer()
    try:
        with sr.AudioFile(filepath) as source:
            audio_data = recognizer.record(source)
            # Use Google Web Speech API (default) - supports Traditional Chinese
            text = recognizer.recognize_google(audio_data, language="zh-TW")
            response_text = f"我猜你想說的是... {text}"
            return jsonify({'text': response_text})
    except sr.UnknownValueError:
        return jsonify({'text': "抱歉，我不確定你說了什麼。"})
    except sr.RequestError as e:
        return jsonify({'error': f"Speech service error: {e}"})
    except Exception as e:
        return jsonify({'error': str(e)})
    finally:
        # Cleanup
        if os.path.exists(filepath):
            os.remove(filepath)

if __name__ == '__main__':
    app.run(debug=True, port=5001)
