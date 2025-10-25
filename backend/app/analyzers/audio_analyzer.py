"""
音量レベル測定モジュール
audioscore.pyのアルゴリズムを統合
"""
import numpy as np
import io
import scipy.io.wavfile as wavfile
from typing import Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class AudioAnalyzer:
    """音声分析クラス - 音量と周波数に基づくスコアリング"""

    # 設定値
    SAMPLE_RATE = 44100
    TARGET_FREQUENCY = 1500  # ターゲット周波数 (Hz)
    DB_OFFSET = 120  # dBFSをdB (SPLスケール) に変換するためのオフセット

    def __init__(self):
        """初期化"""
        self.high_score = 0.0

    def score_from_db_value(self, db_value: float) -> float:
        """
        仮のdB (SPL) 値に基づいて点数を算出する

        Args:
            db_value: dB値

        Returns:
            float: 基本スコア (0-50点)
        """
        if db_value <= 70:
            return 0
        elif db_value <= 80:
            return 10
        elif db_value <= 90:
            return 15
        elif db_value <= 100:
            return 20
        elif db_value <= 110:
            return 25
        elif db_value <= 120:
            return 30
        else:  # 120 dB以上
            return 50

    def calculate_db_and_initial_score(
        self,
        data: np.ndarray
    ) -> Tuple[Optional[float], Optional[float]]:
        """
        音声データからピークdBFSを計算し、それを仮のdB値に変換して、元の点数を計算する

        Args:
            data: 音声データ (numpy array)

        Returns:
            Tuple[Optional[float], Optional[float]]: (initial_score, db_value)
        """
        # ステレオの場合はモノラルに変換
        if data.ndim > 1:
            data = np.mean(data, axis=1).astype(data.dtype)

        # データ型に応じたリファレンス値を設定
        if np.issubdtype(data.dtype, np.integer):
            dtype_info = np.iinfo(data.dtype)
            reference_rms = dtype_info.max
        elif np.issubdtype(data.dtype, np.floating):
            reference_rms = 1.0
        else:
            logger.error(f"Unsupported data type: {data.dtype}")
            return None, None

        # ピーク振幅を計算
        max_amplitude = np.max(np.abs(data))

        if max_amplitude <= 1e-10:
            max_dbfs = -100.0
        else:
            max_dbfs = 20 * np.log10(max_amplitude / reference_rms)

        # dBFS値を仮のdB値に変換
        db_value = max_dbfs + self.DB_OFFSET

        # 元の点数を計算
        initial_score = self.score_from_db_value(db_value)

        return initial_score, db_value

    def analyze_frequency_and_correct_score(
        self,
        data: np.ndarray,
        rate: int,
        initial_score: float,
        db_value: float
    ) -> Dict[str, float]:
        """
        周波数解析を行い、割合を計算して点数を補正する
        音量（振幅の和）の比率を計算

        Args:
            data: 音声データ (numpy array)
            rate: サンプリングレート
            initial_score: 初期スコア
            db_value: dB値

        Returns:
            Dict: 分析結果
        """
        # ステレオの場合はモノラルに変換
        if data.ndim > 1:
            data = np.mean(data, axis=1).astype(data.dtype)

        N = len(data)
        yf = np.fft.rfft(data)

        # 振幅スペクトル（音量）を計算
        amplitude_spectrum = np.abs(yf)

        # 周波数軸を計算
        xf = np.fft.rfftfreq(N, 1.0 / rate)

        # TARGET_FREQUENCY以上のインデックスを取得
        high_freq_indices = np.where(xf >= self.TARGET_FREQUENCY)

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

        # 点数補正ロジック
        if 0 <= percentage < 80:
            correction_factor = (1 + percentage * 0.005)
            final_score *= correction_factor
        elif 80 <= percentage <= 100:
            correction_factor = 1.4
            final_score *= correction_factor

        # ハイスコアの更新
        is_new_high = False
        if final_score > self.high_score:
            self.high_score = final_score
            is_new_high = True

        return {
            'db_value': db_value,
            'initial_score': initial_score,
            'high_freq_percentage': percentage,
            'final_score': final_score,
            'high_score': self.high_score,
            'is_new_high': is_new_high
        }

    def analyze_audio_from_bytes(
        self,
        audio_data: bytes,
        sample_rate: Optional[int] = None
    ) -> Optional[Dict[str, float]]:
        """
        音声バイトデータからスコアを算出

        Args:
            audio_data: 音声バイナリデータ (WAV形式)
            sample_rate: サンプリングレート (Noneの場合は自動検出)

        Returns:
            Dict: 分析結果、エラー時はNone
                {
                    'db_value': float,
                    'initial_score': float,
                    'high_freq_percentage': float,
                    'final_score': float,
                    'high_score': float,
                    'is_new_high': bool
                }
        """
        try:
            # バイトデータをnumpy配列に変換
            audio_io = io.BytesIO(audio_data)
            rate, data = wavfile.read(audio_io)

            # サンプリングレートの確認
            if sample_rate is None:
                sample_rate = rate

            # 初期スコアとdB値を計算
            initial_score, db_value = self.calculate_db_and_initial_score(data)

            if initial_score is None or db_value is None:
                logger.error("Failed to calculate initial score and db value")
                return None

            # 周波数解析とスコア補正
            result = self.analyze_frequency_and_correct_score(
                data, sample_rate, initial_score, db_value
            )

            logger.info(
                f"Audio analysis result: "
                f"dB={result['db_value']:.2f}, "
                f"initial={result['initial_score']:.2f}, "
                f"high_freq%={result['high_freq_percentage']:.2f}, "
                f"final={result['final_score']:.2f}"
            )

            return result

        except Exception as e:
            logger.error(f"Error analyzing audio: {e}")
            return None

    def analyze_audio_from_array(
        self,
        data: np.ndarray,
        sample_rate: int
    ) -> Optional[Dict[str, float]]:
        """
        numpy配列から直接スコアを算出

        Args:
            data: 音声データ (numpy array)
            sample_rate: サンプリングレート

        Returns:
            Dict: 分析結果、エラー時はNone
        """
        try:
            # 初期スコアとdB値を計算
            initial_score, db_value = self.calculate_db_and_initial_score(data)

            if initial_score is None or db_value is None:
                logger.error("Failed to calculate initial score and db value")
                return None

            # 周波数解析とスコア補正
            result = self.analyze_frequency_and_correct_score(
                data, sample_rate, initial_score, db_value
            )

            return result

        except Exception as e:
            logger.error(f"Error analyzing audio: {e}")
            return None

    def analyze_frequency_data(
        self,
        frequency_data: np.ndarray
    ) -> Optional[Dict[str, float]]:
        """
        周波数データ（FFT済み）から直接スコアを算出
        フロントエンドから送信される analyser.getByteFrequencyData() の結果を分析

        Args:
            frequency_data: 周波数データ (0-255のUint8Array)

        Returns:
            Dict: 分析結果、エラー時はNone
        """
        try:
            if len(frequency_data) == 0:
                logger.warning("Empty frequency data received")
                return None

            # 周波数データを正規化 (0-1の範囲に)
            normalized_data = frequency_data / 255.0

            # 平均振幅を計算してdB値を推定
            avg_amplitude = np.mean(normalized_data)
            max_amplitude = np.max(normalized_data)

            # 振幅からdB値を推定（仮の計算）
            if max_amplitude <= 1e-10:
                db_value = 50.0  # 最小値
            else:
                # 0-1の範囲を50-120dBに変換
                db_value = 50 + (max_amplitude * 70)

            # 初期スコアを計算
            initial_score = self.score_from_db_value(db_value)

            # 高周波数成分の割合を計算
            # analyserのbinは周波数順に並んでいる
            # ターゲット周波数以上のbinの割合を計算
            # 仮にサンプリングレート44100Hz、2048サンプルの場合
            # 各binは約21.5Hz (44100/2048)
            # 1500Hzは約70番目のbin (1500/21.5)

            total_bins = len(frequency_data)
            # 高周波数の開始bin（全体の約1/3から）
            high_freq_start = int(total_bins * 0.33)

            high_freq_sum = np.sum(normalized_data[high_freq_start:])
            total_sum = np.sum(normalized_data)

            if total_sum <= 1e-10:
                percentage = 0.0
            else:
                percentage = (high_freq_sum / total_sum) * 100

            final_score = initial_score

            # 点数補正ロジック
            if 0 <= percentage < 80:
                correction_factor = (1 + percentage * 0.005)
                final_score *= correction_factor
            elif 80 <= percentage <= 100:
                correction_factor = 1.4
                final_score *= correction_factor

            # ハイスコアの更新
            is_new_high = False
            if final_score > self.high_score:
                self.high_score = final_score
                is_new_high = True

            return {
                'db_value': db_value,
                'initial_score': initial_score,
                'high_freq_percentage': percentage,
                'final_score': final_score,
                'high_score': self.high_score,
                'is_new_high': is_new_high
            }

        except Exception as e:
            logger.error(f"Error analyzing frequency data: {e}")
            return None

    def reset_high_score(self):
        """ハイスコアをリセット"""
        self.high_score = 0.0


# 後方互換性のための関数（既存のコードで使用されている場合）
def analyze_audio_volume(audio_data: bytes) -> float:
    """
    音声データから音量レベルを測定（後方互換性用）

    Args:
        audio_data: 音声バイナリデータ (WAV形式)

    Returns:
        float: 音量レベル (0.0 ~ 1.0)
    """
    analyzer = AudioAnalyzer()
    result = analyzer.analyze_audio_from_bytes(audio_data)

    if result is None:
        return 0.0

    # final_scoreを0.0-1.0の範囲に正規化 (最大100点と仮定)
    return min(result['final_score'] / 100.0, 1.0)
