import sounddevice as sd
import scipy.io.wavfile as wavfile
import numpy as np
import os
import time
import atexit

# ----------------------------------------------------
# 📌 グローバル設定 (変更なし)
# ----------------------------------------------------
SAMPLE_RATE = 44100
RECORD_DURATION = 5
CHANNANNELS = 1
OUTPUT_FILENAME = "temp_recording.wav"
TARGET_FREQUENCY = 1500 # ターゲット周波数 (Hz)

# 💡 dBFSをdB (SPLスケール) に変換するためのオフセット設定 💡
DB_OFFSET = 120

# 🌟 ハイスコア記録用のグローバル変数 🌟
HIGH_SCORE = 0.0

# ----------------------------------------------------
# 📌 点数計算関数 (変更なし)
# ----------------------------------------------------

def score_from_db_value(db_value):
    """
    仮のdB (SPL) 値に基づいて点数を算出する。
    """
    # 元のロジックに従って点数を計算
    if db_value <= 50:
        return 0
    elif db_value <= 60:
        return 10
    elif db_value <= 70:
        return 15
    elif db_value <= 80:
        return 20
    elif db_value <= 90:
        return 25
    elif db_value <= 100:
        return 30
    elif db_value <= 110:
        return 35
    elif db_value <= 120:
        return 40
    elif db_value <= 130:
        return 45
    elif db_value <= 140:
        return 47.5
    else: # 140以上
        return 50

def calculate_initial_score_and_db(file_path):
    """
    WAVファイルからピークdBFSを計算し、それを仮のdB値に変換して、元の点数を計算する。
    """
    if not os.path.exists(file_path):
        return None, None, None, None

    try:
        rate, data = wavfile.read(file_path)
    except Exception as e:
        print(f"エラー: WAVファイルの読み込み中に問題が発生しました: {e}")
        return None, None, None, None

    if data.ndim > 1:
        data = np.mean(data, axis=1).astype(data.dtype)

    if np.issubdtype(data.dtype, np.integer):
        dtype_info = np.iinfo(data.dtype)
        reference_rms = dtype_info.max
    elif np.issubdtype(data.dtype, np.floating):
        reference_rms = 1.0
    else:
        return None, None, None, None
    
    max_amplitude = np.max(np.abs(data))
    
    if max_amplitude <= 1e-10:
        max_dbfs = -100.0
    else:
        max_dbfs = 20 * np.log10(max_amplitude / reference_rms)
    
    # dBFS値を仮のdB値に変換
    db_value = max_dbfs + DB_OFFSET
    
    # 元の点数を計算 (dB値を使用)
    initial_score = score_from_db_value(db_value)
    
    return data, rate, initial_score, db_value

# ----------------------------------------------------
# 📌 メインの周波数解析と補正ロジック (★ここを修正★)
# ----------------------------------------------------

def analyze_and_correct_score(data, rate, initial_score, db_value):
    """
    周波数解析を行い、割合を計算して点数を補正する。
    音量（振幅の和）の比率を計算するように変更。
    """
    global HIGH_SCORE 

    N = len(data)
    yf = np.fft.rfft(data)
    
    # ★修正点1: 振幅スペクトル（音量）を計算★
    amplitude_spectrum = np.abs(yf)
    
    xf = np.fft.rfftfreq(N, 1.0 / rate)
    
    high_freq_indices = np.where(xf >= TARGET_FREQUENCY)
    
    # ★修正点2: 1500Hz以上の振幅の和を計算★
    high_freq_amplitude_sum = np.sum(amplitude_spectrum[high_freq_indices])
    
    # ★修正点3: 全周波数の振幅の和を計算★
    total_amplitude_sum = np.sum(amplitude_spectrum)
    
    if total_amplitude_sum <= 1e-10:
        percentage = 0.0
    else:
        # ★修正点4: 振幅の和の比率で割合を計算★
        percentage = (high_freq_amplitude_sum / total_amplitude_sum) * 100
    
    final_score = initial_score 
    
    # 点数補正ロジック (変更なし)
    if 0 <= percentage < 80:
        correction_factor = (1 + percentage * 0.005)
        final_score *= correction_factor
    elif 80 <= percentage <= 100:
        correction_factor = 1.4
        final_score *= correction_factor

    # 🌟 結果の表示 🌟
    print(f"📊 ピーク音量 (仮のdB値): {db_value:.2f} dB")
    print(f"✅ 元の点数: {initial_score:.2f} 点")
    print(f"📈 1500Hz以上の周波数割合 (音量和の比率): {percentage:.2f} %")
    print(f"🌟 **最終的な点数**: {final_score:.2f} 点")
    
    # 🌟 ハイスコアの更新 🌟
    is_new_high = False
    if final_score > HIGH_SCORE:
        HIGH_SCORE = final_score
        is_new_high = True

    # 🌟 常に現在のハイスコアを表示 🌟
    print(f"🏆 **現在のハイスコア**: {HIGH_SCORE:.2f} 点" + (" 🎉 **NEW RECORD!**" if is_new_high else ""))
    print("-" * 40)
    
# ----------------------------------------------------
# 📌 実行ループとクリーンアップ (変更なし)
# ----------------------------------------------------

def cleanup():
    """終了時に一時ファイルを削除"""
    if os.path.exists(OUTPUT_FILENAME):
        os.remove(OUTPUT_FILENAME)
        print(f"\n一時ファイル '{OUTPUT_FILENAME}' を削除しました。👋")

atexit.register(cleanup)

def main_loop():
    print("--- 🎙️ 5秒音声解析システム起動 🎙️ ---")
    print(f"💡 仮のdB値オフセット: {DB_OFFSET} (設定の確認を推奨)")
    print(f"ターゲット周波数: {TARGET_FREQUENCY} Hz, 録音時間: {RECORD_DURATION} 秒")
    print("Ctrl+Cでいつでも停止できます。")
    print("-" * 40)
    
    while True:
        try:
            print(f"▶️ {RECORD_DURATION}秒間の録音を開始...")
            recording = sd.rec(int(RECORD_DURATION * SAMPLE_RATE), 
                               samplerate=SAMPLE_RATE, 
                               channels=CHANNANNELS, 
                               dtype='int16')
            sd.wait()
            print("✅ 録音完了。")
            
            wavfile.write(OUTPUT_FILENAME, SAMPLE_RATE, recording)
            print(f"💾 '{OUTPUT_FILENAME}' に保存完了。")
            
            data, rate, initial_score, db_value = calculate_initial_score_and_db(OUTPUT_FILENAME)
            
            if data is not None and rate is not None and initial_score is not None:
                analyze_and_correct_score(data, rate, initial_score, db_value)

            time.sleep(1)

        except KeyboardInterrupt:
            print("\nユーザーによる停止: プログラムを終了します。")
            break
        except Exception as e:
            print(f"\n予期せぬエラーが発生しました: {e}")
            time.sleep(5)

# 実行開始
if __name__ == "__main__":
    main_loop()

    # 🌟 終了処理とハイスコア表示の追加 🌟
    print("\n========================================")
    print(f"🏆 **最終ハイスコア**: {HIGH_SCORE:.2f} 点")
    print("========================================")
    
    print("\n結果を確認したら、Enterキーを押してウィンドウを閉じてください。")
    input()