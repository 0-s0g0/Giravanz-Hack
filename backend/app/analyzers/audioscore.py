import sounddevice as sd
import scipy.io.wavfile as wavfile
import numpy as np
import os
import time
import atexit

# ----------------------------------------------------
# 📌 グローバル設定 
# ----------------------------------------------------
SAMPLE_RATE = 44100
RECORD_DURATION = 5
CHANNANNELS = 1
OUTPUT_FILENAME = "temp_recording.wav"
TARGET_FREQUENCY = 1800 # ターゲット周波数 (Hz)

# 💡 dBFSをdB (SPLスケール) に変換するためのオフセット設定 💡
# 🚨 修正: 非線形スケール調整用の定数に変更
DB_OFFSET = 150           # ベースオフセット (約 120 dB が最大)
DB_SCALE_FACTOR = 450     # 非線形スケーリングの強度

# 🌟 ハイスコア記録用のグローバル変数 🌟
HIGH_SCORE = 0.0

# ----------------------------------------------------
# 📌 点数計算関数 (変更なし)
# ----------------------------------------------------
# ... (score_from_db_value 関数はそのまま)
def score_from_db_value(db_value):
    """
    仮のdB (SPL) 値に基づいて点数を算出する。
    """
    # 元のロジックに従って点数を計算
    if db_value <= 50:
        return 0
    elif db_value <= 75:
        return 10
    elif db_value <= 100:
        return 15
    elif db_value <= 110:
        return 20
    elif db_value <= 116:
        return 25
    elif db_value <= 122:
        return 20
    elif db_value <= 128:
        return 35
    elif db_value <= 134:
        return 40
    elif db_value <= 140:
        return 45
    else: # 150以上
        return 50


def calculate_initial_score_and_db(file_path):
    """
    WAVファイルからピークdBFSを計算し、それを非線形に仮のdB値に変換して、元の点数を計算する。
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
        # 🌟 基準値は50倍のまま 🌟
        reference_rms = dtype_info.max * 50
    elif np.issubdtype(data.dtype, np.floating):
        reference_rms = 1
    else:
        return None, None, None, None
    
    max_amplitude = np.max(np.abs(data))
    
    if max_amplitude <= 1e-10:
        max_dbfs = -100.0
    else:
        # max_dbfsは-33.98dBが最大
        max_dbfs = 20 * np.log10(max_amplitude / reference_rms)
    
    # ------------------------------------------------------------------
    # 🚨 修正: 非線形スケーリングを導入 🚨
    # dBFSの絶対値のlogを取り、静音を圧縮し、爆音を引き延ばす
    # ------------------------------------------------------------------
    
    # 1. dBFSを0〜100の範囲に正規化（例: -100dBFSを0、0dBFSを100）
    normalized_dbfs = np.clip(max_dbfs + 100, 0, 100) / 100
    
    if normalized_dbfs <= 1e-10:
        # 無音に近い場合は0 dBに設定
        db_value = 0.0
    else:
        # 2. 対数（log）を使って非線形な重み付けを適用
        # log10(x) / log10(100) は 0から1の範囲。xが1に近いほどゆっくり変化。
        
        # 非線形なスケール値 (0〜1の範囲)
        non_linear_scale = np.log10(normalized_dbfs * 100) / 2 # log10(100) = 2
        
        # スケール値にスケールファクターを掛け、オフセットを足す
        db_value = DB_OFFSET + DB_SCALE_FACTOR * (non_linear_scale - 1)
        
        # 最小値と最大値のクリップ (最小0 dB, 最大は理論上 160 dB程度)
        db_value = np.clip(db_value, 0.0, 160.0)
    
    # 元の点数を計算 (dB値を使用)
    initial_score = score_from_db_value(db_value)
    
    return data, rate, initial_score, db_value

# ----------------------------------------------------
# 📌 メインの周波数解析と補正ロジック (変更なし)
# ----------------------------------------------------
# ... (analyze_and_correct_score、cleanup、main_loop 関数は変更なし)
def analyze_and_correct_score(data, rate, initial_score, db_value):
    """
    周波数解析を行い、割合を計算して点数を補正する。
    音量（振幅の和）の比率を計算するように変更。
    """
    global HIGH_SCORE 

    N = len(data)
    yf = np.fft.rfft(data)
    
    # 振幅スペクトル（音量）を計算
    amplitude_spectrum = np.abs(yf)
    
    xf = np.fft.rfftfreq(N, 1.0 / rate)
    
    high_freq_indices = np.where(xf >= TARGET_FREQUENCY)
    
    # 1500Hz以上の振幅の和を計算
    high_freq_amplitude_sum = np.sum(amplitude_spectrum[high_freq_indices])
    
    # 全周波数の振幅の和を計算
    total_amplitude_sum = np.sum(amplitude_spectrum)
    
    if total_amplitude_sum <= 1e-10:
        percentage = 0.0
    else:
        # 振幅の和の比率で割合を計算
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
    print(f"📊 ピーク音量 (非線形dB値): {db_value:.2f} dB")
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
# 📌 実行ループとクリーンアップ 
# ----------------------------------------------------

def cleanup():
    """終了時に一時ファイルを削除"""
    if os.path.exists(OUTPUT_FILENAME):
        os.remove(OUTPUT_FILENAME)
        print(f"\n一時ファイル '{OUTPUT_FILENAME}' を削除しました。👋")

atexit.register(cleanup)

def main_loop():
    print("--- 🎙️ 5秒音声解析システム起動 🎙️ ---")
    print(f"💡 非線形dBスケール適用済 (DB_OFFSET={DB_OFFSET}, SCALE={DB_SCALE_FACTOR})")
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