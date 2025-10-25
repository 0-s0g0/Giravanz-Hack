"""
表情スコア算出モジュール
ぞのくん担当

imagescore.pyのアルゴリズムを統合:
- Py-Featを使用した表情分析
- 感情カテゴリからArousal(覚醒度)を推定
- Arousalを0〜30または0〜100のスコアに変換
"""
import numpy as np
import cv2
from typing import Optional, Dict
import logging
from feat import Detector
import io
from PIL import Image
import torch
import tempfile
import os

logger = logging.getLogger(__name__)


# ========= imagescore.pyから移植したユーティリティ =========

# 感情→覚醒度（アラウザル）近似重み
EMO_TO_AROUSAL = {
    "anger": 0.70,
    "disgust": 0.20,
    "fear": 0.80,
    "happiness": 0.60,
    "sadness": -0.60,
    "surprise": 0.90,
    "neutral": -0.10,
}


def norm_arousal_to_0_30(a: float) -> int:
    """
    Arousal(-1～1) → 0〜30
    まず0〜100スコアに変換し、0.3を掛けて四捨五入した整数値を返す。

    Args:
        a: Arousal値 (-1.0 ~ 1.0)

    Returns:
        0〜30のスコア
    """
    a = max(-1.0, min(1.0, float(a)))  # 安全にクリップ
    score_100 = (a + 1.0) / 2.0 * 100.0
    score_30 = round(score_100 * 0.3)
    return int(score_30)


def norm_arousal_to_0_100(a: float) -> int:
    """
    Arousal(-1～1) → 0〜100

    Args:
        a: Arousal値 (-1.0 ~ 1.0)

    Returns:
        0〜100のスコア
    """
    a = max(-1.0, min(1.0, float(a)))  # 安全にクリップ
    score_100 = (a + 1.0) / 2.0 * 100.0
    return int(round(score_100))


def estimate_arousal_from_emotions(emotions: Dict[str, float]) -> Optional[float]:
    """
    感情カテゴリ確率から近似arousalを算出（重み付き平均）

    Args:
        emotions: 感情名をキー、確率を値とする辞書
                  例: {'anger': 0.1, 'happiness': 0.7, 'neutral': 0.2}

    Returns:
        推定されたArousal値 (-1.0 ~ 1.0)、算出できない場合はNone
    """
    avail = [emo for emo in EMO_TO_AROUSAL.keys() if emo in emotions]
    if not avail:
        return None
    num, den = 0.0, 0.0
    for emo in avail:
        p = float(emotions[emo])
        num += p * EMO_TO_AROUSAL[emo]
        den += p
    return num / den if den > 0 else None


# ========= 表情分析クラス =========

class ExpressionAnalyzer:
    """表情分析クラス（Py-Feat使用）"""

    def __init__(self, device: str = "cpu"):
        """
        初期化

        Args:
            device: 使用するデバイス ("cpu" or "cuda")
        """
        self.device = device
        self.detector = Detector(device=device)

        # 顔検出用（OpenCV Haar Cascade）
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            logger.warning("顔分類器(haar)を読み込めませんでした。")

        logger.info(f"ExpressionAnalyzer initialized with device: {device}")

    def analyze_frame(self, frame_data: np.ndarray) -> Optional[float]:
        """
        フレームから表情スコアを算出

        Args:
            frame_data: 画像データ (numpy array, BGR format)

        Returns:
            表情スコア (0-100)、顔が検出されない場合はNone
        """
        temp_file_path = None
        try:
            # BGR画像を一時ファイルとして保存
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                temp_file_path = tmp_file.name
                
                # PNG形式のバイト列にエンコード
                _, encoded_img = cv2.imencode('.png', frame_data)
                tmp_file.write(encoded_img.tobytes())

            # Py-Featで表情分析: ファイルパスをリストとして渡す
            result = self.detector.detect_image([temp_file_path])

            if result is None or len(result) == 0:
                logger.debug("顔が検出されませんでした")
                return None

            # 最初の顔のデータを取得
            row = result.iloc[0]

            # Arousal値を取得（列名を確認）
            arousal = None
            if "arousal" in row.index:
                arousal = float(row["arousal"])
            else:
                # Arousalがない場合は感情カテゴリから推定
                emotions = {}
                for emo in EMO_TO_AROUSAL.keys():
                    if emo in row.index:
                        emotions[emo] = float(row[emo])
                arousal = estimate_arousal_from_emotions(emotions)

            if arousal is None:
                logger.warning("Arousal値を取得できませんでした")
                return None

            # 0〜100のスコアに変換
            score = norm_arousal_to_0_100(arousal)
            logger.debug(f"Arousal: {arousal:.3f} → Score: {score}")

            return float(score)

        except Exception as e:
            logger.error(f"表情分析エラー: {e}", exc_info=True)
            return None
        finally:
            # 処理後に必ず一時ファイルを削除
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    def analyze_frame_with_detection(self, frame_data: np.ndarray) -> Optional[Dict]:
        """
        フレームから表情スコアと顔の位置を取得

        Args:
            frame_data: 画像データ (numpy array, BGR format)

        Returns:
            dict: {
                'score': float (0-100),
                'faces': [{'x': int, 'y': int, 'width': int, 'height': int, 'arousal': float, 'excitement_score': float}, ...],
                'face_count': int,
                'image_width': int,
                'image_height': int
            }
            顔が検出されない場合はNone
        """
        temp_file_path = None
        try:
            h, w = frame_data.shape[:2]

            # BGR -> Grayに変換 (顔検出用)
            if len(frame_data.shape) == 3 and frame_data.shape[2] == 3:
                frame_gray = cv2.cvtColor(frame_data, cv2.COLOR_BGR2GRAY)
            else:
                frame_gray = frame_data

            # OpenCVで顔検出
            faces_cv = self.face_cascade.detectMultiScale(
                frame_gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80)
            )

            if len(faces_cv) == 0:
                logger.debug("顔が検出されませんでした")
                return None

            # --- 修正箇所：一時ファイルに保存 ---
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_file:
                temp_file_path = tmp_file.name
                
                # BGR画像（frame_data）をPNG形式のバイト列にエンコード
                _, encoded_img = cv2.imencode('.png', frame_data)
                tmp_file.write(encoded_img.tobytes())

            # Py-Featで表情分析: ファイルパスをリストとして渡す
            result = self.detector.detect_image([temp_file_path])
            # --- 修正箇所 終わり ---

            if result is None or len(result) == 0:
                logger.debug("Py-Featで表情を検出できませんでした")
                # ここで再度顔検出を試みる代わりに、OpenCV検出結果を返すべきだが、
                # Py-Featの結果がない場合はスコア算出ができないためNoneを返す。
                return None

            # 各顔の情報を収集
            faces_info = []
            scores = []

            for idx, (x, y, w_face, h_face) in enumerate(faces_cv):
                face_data = {
                    'x': int(x),
                    'y': int(y),
                    'width': int(w_face),
                    'height': int(h_face),
                }

                # 対応するPy-Featの結果を取得（インデックスでマッチング）
                if idx < len(result):
                    row = result.iloc[idx]

                    # Arousal値を取得
                    arousal = None
                    if "arousal" in row.index:
                        arousal = float(row["arousal"])
                    else:
                        emotions = {}
                        for emo in EMO_TO_AROUSAL.keys():
                            if emo in row.index:
                                emotions[emo] = float(row[emo])
                        arousal = estimate_arousal_from_emotions(emotions)

                    if arousal is not None:
                        face_data['arousal'] = arousal
                        excitement_score = norm_arousal_to_0_100(arousal)
                        face_data['excitement_score'] = float(excitement_score)
                        scores.append(excitement_score)
                    else:
                        face_data['arousal'] = 0.0
                        face_data['excitement_score'] = 50.0
                        scores.append(50.0)
                else:
                    face_data['arousal'] = 0.0
                    face_data['excitement_score'] = 50.0
                    scores.append(50.0)

                faces_info.append(face_data)

            # 全体スコア（平均）
            overall_score = sum(scores) / len(scores) if scores else 50.0

            return {
                'score': overall_score,
                'faces': faces_info,
                'face_count': len(faces_info),
                'image_width': w,
                'image_height': h
            }

        except Exception as e:
            logger.error(f"顔検出付き表情分析エラー: {e}", exc_info=True)
            return None
        finally:
            # 処理後に必ず一時ファイルを削除
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)


def analyze_expression(image_data: bytes) -> float:
    """
    画像から表情スコアを算出（後方互換性のため）

    Args:
        image_data: 画像バイナリデータ (JPEG/PNG)

    Returns:
        float: 表情スコア (0.0 ~ 1.0)
    """
    try:
        # バイナリデータをnumpy配列に変換
        img = Image.open(io.BytesIO(image_data))
        frame = np.array(img)

        # BGRに変換（OpenCV形式）
        if len(frame.shape) == 3 and frame.shape[2] == 3:
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # 表情分析
        analyzer = ExpressionAnalyzer()
        score = analyzer.analyze_frame(frame)

        if score is None:
            return 0.5  # デフォルト値

        # 0-100を0-1に正規化
        return score / 100.0

    except Exception as e:
        logger.error(f"analyze_expression エラー: {e}", exc_info=True)
        return 0.5
