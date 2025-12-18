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
    text = request.json.get('text', '')
    suggestions = []
    
    # 策略 1: 加上語助詞 (改變語氣)
    s1 = f"{text}嗎？"
    suggestions.append(s1)
    
    # 策略 2: 嘗試同音字替換 (更真實的模擬)
    # 這裡我們用一個簡單的替換表來示範，未來可以用同音字庫
    # 簡單 Logic: 把文字轉成拼音，再嘗試改掉其中一個字
    try:
        if len(text) >= 2:
            # 簡單範例：把第一個字換成常見的錯別字或同音字
            # 這裡為了 Demo 效果，我們先用簡單的字串操作
            # 真正的同音字庫很大，這裡用幾個常見的例子來 Mock
            
            mock_replacements = {
                '師': '司', '知': '資', '是': '四', '十': '四',
                '去': '气', '我': '偶', '好': '豪', '謝': '屑'
            }
            
            new_text = list(text)
            changed = False
            for i, char in enumerate(new_text):
                if char in mock_replacements:
                    new_text[i] = mock_replacements[char]
                    changed = True
                    break # 只換一個字
            
            s2 = "".join(new_text)
            
            # 如果沒有替換到任何字，就用另一種方式 (改結尾)
            if not changed:
                 s2 = text[:-1] + "吧" if len(text) > 1 else "請再說一次"
            
            suggestions.append(s2)
        else:
             suggestions.append(f"是「{text}」對吧")

    except Exception:
        suggestions.append(text + "...")

    # 防止重複：如果兩個建議一樣，強制修改第二個
    if len(suggestions) < 2:
         suggestions.append(text + " (不確定)")
    elif suggestions[0] == suggestions[1]:
         suggestions[1] = text + "..."

    # 特殊彩蛋 (維持保留)
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
    
    # 使用 pypinyin 轉換，並保留聲調符號
    wrong_pinyin = pinyin(wrong_text, style=Style.BOPOMOFO)
    correct_pinyin = pinyin(correct_text, style=Style.BOPOMOFO)
    
    advice = []

    # 0. 字數差異檢查 (最優先)
    len_diff = len(wrong_text) - len(correct_text)
    if len_diff != 0:
        advice.append(f"⚠️ 字數不符：您輸入了 {len(correct_text)} 個字，但 AI 聽到了 {len(wrong_text)} 個字。")
        
        if len_diff > 0:
            advice.append("   👉 可能原因：因為環境雜音，或是您把某些字的尾音拉太長，導致被誤判成多個字。")
            advice.append("   💡 建議：試著更短促有力地發音，並確保環境安靜。")
        else:
            advice.append("   👉 可能原因：您可能說話太快，或是發生了「吞音/連音」的現象 (例如『這樣』唸成『醬』)。")
            advice.append("   💡 建議：請試著放慢語速，確保每個字的「聲母」都能清楚發出來。")
        
        # 字數不同時，通常逐字比對會錯位，所以我們只比對前面相同長度的部分作為參考
        advice.append("\n--- 以下是前段文字的比對參考 ---")

    
    # 計算比對長度
    min_len = min(len(wrong_pinyin), len(correct_pinyin))
    
    for i in range(min_len):
        w_py = wrong_pinyin[i][0] # 錯誤的注音
        c_py = correct_pinyin[i][0] # 正確的注音
        
        if w_py != c_py:
            # 基本提示
            msg = f"第 {i+1} 個字：你唸成「{w_py}」，但應該是「{c_py}」。"
            advice.append(msg)
            
            # --- 精細規則檢查 ---

            # 1. 聲調檢查 (Tone Check)
            tones = {'ˊ': '二聲 (上揚)', 'ˇ': '三聲 (先降後升)', 'ˋ': '四聲 (重讀下降)', '˙': '輕聲'}
            w_tone = next((t for t in tones if t in w_py), '一聲')
            c_tone = next((t for t in tones if t in c_py), '一聲')
            
            if w_tone != c_tone:
                if c_tone == '一聲':
                    advice.append(f"   👉 聲調錯誤：這是 一聲 (平調)，聲音要拉平且高。")
                else:
                    advice.append(f"   👉 聲調錯誤：這是 {tones.get(c_tone, c_tone)}，請注意語調變化。")

            # 2. 捲舌音/平舌音 (Initial Check)
            if 'ㄓ' in c_py and ('ㄗ' in w_py or 'ㄐ' in w_py):
                 advice.append("   👉 捲舌提醒：這是「ㄓ」，舌頭要往上捲頂住上顎。")
            elif 'ㄕ' in c_py and ('ㄙ' in w_py or 'ㄒ' in w_py):
                 advice.append("   👉 捲舌提醒：這是「ㄕ」，舌頭要捲起來，不要發成平的。")
            elif 'ㄔ' in c_py and ('ㄘ' in w_py or 'ㄑ' in w_py):
                 advice.append("   👉 捲舌提醒：這是「ㄔ」，發音時舌尖要向上。")
            elif 'ㄖ' in c_py and 'ㄌ' in w_py:
                 advice.append("   👉 發音提醒：這是「ㄖ」，舌頭要捲起且震動聲帶。")

            # 3. 鼻音混淆 (Nasal Check) - ㄣ/ㄥ, ㄢ/ㄤ
            if 'ㄣ' in c_py and 'ㄥ' in w_py:
                 advice.append("   👉 前後鼻音：這是「ㄣ」(前鼻音)，舌尖要頂住上排牙齒內側，不要發到喉嚨深處。")
            elif 'ㄥ' in c_py and 'ㄣ' in w_py:
                 advice.append("   👉 前後鼻音：這是「ㄥ」(後鼻音)，口腔要打開，聲音從鼻腔深處共鳴。")
            elif 'ㄢ' in c_py and 'ㄤ' in w_py:
                 advice.append("   👉 韻母提醒：這是「ㄢ」，嘴巴比較扁，結尾舌尖要頂上去。")
            elif 'ㄤ' in c_py and 'ㄢ' in w_py:
                 advice.append("   👉 韻母提醒：這是「ㄤ」，嘴巴要張大，聲音在後面。")
            
            # 4. 鼻音/邊音 (n/l)
            if 'ㄋ' in c_py and 'ㄌ' in w_py:
                 advice.append("   👉 鼻音提醒：這是「ㄋ」，空氣要從鼻子出來，舌頭整片貼上顎。")
            elif 'ㄌ' in c_py and 'ㄋ' in w_py:
                 advice.append("   👉 邊音提醒：這是「ㄌ」，舌尖頂住上顎，空氣從舌頭兩邊流出。")

            # 5. 唇形 (Lip Shape)
            if 'ㄨ' in c_py and 'ㄨ' not in w_py:
                 advice.append("   👉 嘴型提醒：這個音有「ㄨ」，發音時嘴巴要嘟起來像吹蠟燭。")
            elif 'ㄩ' in c_py and 'ㄩ' not in w_py:
                 advice.append("   👉 嘴型提醒：這個音有「ㄩ」，嘴巴要嘟圓，同時發魚的音。")

    if not advice:
        advice.append("雖然文字不同，但發音非常相似 (可能是同音字)。請多加練習語句的流暢度與抑揚頓挫。")

    return jsonify({'advice': "\n".join(advice)})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
