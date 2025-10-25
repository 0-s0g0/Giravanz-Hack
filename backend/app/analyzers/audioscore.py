import sounddevice as sd
import scipy.io.wavfile as wavfile
import numpy as np
import os
import time
import atexit
import matplotlib.pyplot as plt # グラフ描画ライブラリ

# ----------------------------------------------------
# 📌 グローバル設定 
# ----------------------------------------------------
SAMPLE_RATE = 44100    #サンプリングレート (Hz)。これは、1秒間に何回音の波形を計測するかを示している
RECORD_DURATION = 1    #録音時間 (秒)。マイクから音声を1秒間取得し、そのデータを分析することを繰り返しているよ
CHANNANNELS = 1    #チャンネル数
OUTPUT_FILENAME = "temp_recording.wav"   #出力ファイル名
TARGET_FREQUENCY = 2500 # ターゲット周波数 (Hz),周波数分析をするときの閾値

# 💡 dBFSをdB (SPLスケール) に変換するためのオフセット設定 💡
DB_OFFSET = 170         # ベースオフセット
DB_SCALE_FACTOR = 500     # 非線形スケーリングの強度、この値を大きくするほどに、最終的なdB値に与える影響がより大きくなり、引き延ばされる

# 🌟 ハイスコア記録用のグローバル変数 🌟
HIGH_SCORE = 0.0
# 🌟 グラフ記録用のリスト 🌟
SCORE_HISTORY = []
PROCESS_COUNT = 0

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
    elif db_value <= 75:
        return 10
    elif db_value <= 100:
        return 15
    elif db_value <= 110:
        return 20
    elif db_value <= 140:
        calculated_score = (db_value - 110) * 0.9 + 20
        # 🚨 50点満点の上限を設定し、丸める
        # 50点で頭打ちにする
        return min(round(calculated_score), 50)
    else: # 140 dB以上
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
        # 🚨 ここ！dtype_info.max に *50 を掛けて基準値を50倍に拡大しています
        reference_rms = dtype_info.max * 50   # <--- これが基準値拡大のコード
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
    # 🚨 非線形スケーリング 🚨
    # ------------------------------------------------------------------
    
    normalized_dbfs = np.clip(max_dbfs + 100, 0, 100) / 100
    
    if normalized_dbfs <= 1e-10:
        db_value = 0.0
    else:
        non_linear_scale = np.log10(normalized_dbfs * 100) / 2 # log10(100) = 2
        db_value = DB_OFFSET + DB_SCALE_FACTOR * (non_linear_scale - 1)
        db_value = np.clip(db_value, 0.0, 160.0)
    
    initial_score = score_from_db_value(db_value)
    
    return data, rate, initial_score, db_value

# ----------------------------------------------------
# 📌 メインの周波数解析と補正ロジック 
# ----------------------------------------------------

def analyze_and_correct_score(data, rate, initial_score, db_value):
    """
    周波数解析を行い、割合を計算して点数を補正し、ハイスコアと履歴を更新する。
    """
    global HIGH_SCORE 
    global PROCESS_COUNT
    
    PROCESS_COUNT += 1 # 処理回数をカウント

    N = len(data)
    yf = np.fft.rfft(data)
    
    amplitude_spectrum = np.abs(yf)
    xf = np.fft.rfftfreq(N, 1.0 / rate)
    
    # 🚨 ターゲット周波数 TARGET_FREQUENCY = 2500 Hz を使用
    high_freq_indices = np.where(xf >= TARGET_FREQUENCY)
    
    high_freq_amplitude_sum = np.sum(amplitude_spectrum[high_freq_indices])
    total_amplitude_sum = np.sum(amplitude_spectrum)
    
    if total_amplitude_sum <= 1e-10:
        percentage = 0.0
    else:
        percentage = (high_freq_amplitude_sum / total_amplitude_sum) 
    
    final_score = initial_score 
    
    if 0 <= percentage < 80:
        correction_factor = (1 + percentage * 0.005)
        final_score *= correction_factor
    elif 80 <= percentage <= 100:
        correction_factor = 1.4
        final_score *= correction_factor

    # 🌟 結果の表示 🌟
    print(f"📊 ピーク音量 (非線形dB値): {db_value:.2f} dB")
    print(f"✅ 元の点数: {initial_score:.2f} 点")
    print(f"📈 {TARGET_FREQUENCY}Hz以上の周波数割合 (音量和の比率): {percentage:.2f} %")
    print(f"🌟 **最終的な点数**: {final_score:.2f} 点")
    
    # 🌟 ハイスコアと履歴の更新 🌟
    SCORE_HISTORY.append(final_score)
    is_new_high = False
    if final_score > HIGH_SCORE:
        HIGH_SCORE = final_score
        is_new_high = True

    print(f"🏆 **現在のハイスコア**: {HIGH_SCORE:.2f} 点" + (" 🎉 **NEW RECORD!**" if is_new_high else ""))
    print("-" * 40)
    
# ----------------------------------------------------
# 📌 グラフ描画関数
# ----------------------------------------------------
def plot_score_history():
    """
    処理終了時に点数の履歴をグラフ表示する。
    """
    if not SCORE_HISTORY:
        print("⚠ 点数データがありません。グラフは表示されません。")
        return

    # グラフの生成
    plt.figure(figsize=(10, 5))
    x_values = np.array(range(1, len(SCORE_HISTORY) + 1)) * RECORD_DURATION # 時間 (秒) に変換
    
    # 点数の折れ線グラフ
    plt.plot(x_values, SCORE_HISTORY, marker='o', linestyle='-', color='b', label='最終点数')
    
    # ハイスコアの水平線
    if HIGH_SCORE > 0:
        plt.axhline(HIGH_SCORE, color='r', linestyle='--', label=f'最終ハイスコア ({HIGH_SCORE:.2f})')

    # 🌟 タイトルとラベルを再設定 (変更なし) 🌟
    plt.title('点数の時間的推移')
    plt.xlabel('経過時間 (秒)')
    plt.ylabel('最終点数')
    
    # X軸の目盛りを5秒刻みにする
    max_time = x_values[-1] if x_values.size > 0 else RECORD_DURATION
    plt.xticks(np.arange(0, max_time + RECORD_DURATION, RECORD_DURATION)) 
    
    plt.grid(True, linestyle=':', alpha=0.6)
    plt.legend()
    plt.tight_layout()
    plt.show()


# ----------------------------------------------------
# 📌 実行ループとクリーンアップ 
# ----------------------------------------------------

def cleanup():
    """終了時に一時ファイルを削除"""
    # グラフ描画は終了後に行うため、ここでは一時ファイル削除のみ
    if os.path.exists(OUTPUT_FILENAME):
        os.remove(OUTPUT_FILENAME)
        print(f"\n一時ファイル '{OUTPUT_FILENAME}' を削除しました。👋")

# 🚨 終了時処理を登録
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

    # 🌟 終了処理とハイスコア表示 🌟
    print("\n========================================")
    print(f"🏆 **最終ハイスコア**: {HIGH_SCORE:.2f} 点")
    print("========================================")
    
    # グラフ表示
    plot_score_history()

    # 最終的な結果を確認するための停止
    print("\n結果を確認したら、ウィンドウを閉じてください。")
    input("Enterキーを押してウィンドウを閉じてください。")