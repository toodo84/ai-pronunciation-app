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
            # response_text = f"我猜你想說的是... {text}"  <-- Removed prefix
            return jsonify({'text': text})
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

@app.route('/submit_feedback', methods=['POST'])
def submit_feedback():
    data = request.json
    feedback = data.get('feedback')
    original_text = data.get('text')
    print(f"收到使用者回饋: [{feedback}] 針對文字: {original_text}")
    return jsonify({'status': 'success', 'message': '感謝您的回饋！'})

@app.route('/get_similar_suggestions', methods=['POST'])
def get_similar_suggestions():
    # 這裡暫時回傳模擬資料，未來可接較高階的模型
    text = request.json.get('text', '')
    
    # Simple Mock: 當作是一個簡單的相似音產生器
    # 實際上這裡應該要 call 一個 Corrective AI Model (如 GPT)
    
    suggestions = []
    
    # 策略 1: 改變語氣 (加上語助詞)
    suggestions.append(f"{text}嗎？")
    
    # 策略 2: 隨機替換同音字/相似音字 (Demo用)
    # 這裡如果不接 LLM，很難動態生成有意義的句子。
    # 為了展示介面效果，我們先回傳幾個預設的易混淆情境，或者單純複製原句並修改一點點
    if len(text) > 2:
         # 簡單範例：把最後一個字換掉
         suggestions.append(text[:-1] + "吧")
    else:
         suggestions.append("請再說一次")

    # 如果有特定的關鍵字 (for Demo showing)
    if "魚" in text:
        suggestions = ["紅鯉魚與綠鯉魚與驢", "粉紅鳳凰飛"]
    elif "獅" in text or "師" in text:
        suggestions = ["八百標兵奔北坡", "四是四，十是十"]
        
    return jsonify({'suggestions': suggestions})

from pypinyin import pinyin, Style

@app.route('/analyze_correction', methods=['POST'])
def analyze_correction():
    data = request.json
    wrong_text = data.get('wrong_text', '')
    correct_text = data.get('correct_text', '')
    
    # Convert both to pinyin for comparison (Use Bopomofo)
    wrong_pinyin = pinyin(wrong_text, style=Style.BOPOMOFO)
    correct_pinyin = pinyin(correct_text, style=Style.BOPOMOFO)
    
    # Simple logic to find differences
    advice = []
    
    # 這裡是一個非常簡化的比對邏輯
    min_len = min(len(wrong_pinyin), len(correct_pinyin))
    
    for i in range(min_len):
        w_py = wrong_pinyin[i][0]
        c_py = correct_pinyin[i][0]
        
        if w_py != c_py:
            advice.append(f"第 {i+1} 個字：你唸成了 '{w_py}'，但應該是 '{c_py}'。")
            if 'ㄓ' in c_py and 'ㄗ' in w_py:
                 advice.append(" -> 注意捲舌音 (ㄓ) 的發音。")
            elif 'ㄕ' in c_py and 'ㄙ' in w_py:
                 advice.append(" -> 注意捲舌音 (ㄕ) 的發音。")
            elif 'ㄋ' in c_py and 'ㄌ' in w_py:
                 advice.append(" -> 注意鼻音 (ㄋ) 與邊音 (ㄌ) 的區別。")
                 
    if not advice:
        advice.append("雖然文字不同，但發音非常相似，請多加練習語調。")

    return jsonify({'advice': "\n".join(advice)})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
