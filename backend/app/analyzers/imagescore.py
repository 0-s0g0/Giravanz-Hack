import os
import time
import csv
from pathlib import Path
import cv2
from feat import Detector


# ========= ユーティリティ =========
def ensure_dir(p: str) -> None:
    Path(p).mkdir(parents=True, exist_ok=True)


def norm_arousal_to_0_30(a: float) -> int:
    """
    Arousal(-1～1) → 0〜100 → 0〜30
    まず0〜100スコアに変換し、0.3を掛けて四捨五入した整数値を返す。
    """
    a = max(-1.0, min(1.0, float(a)))  # 安全にクリップ
    score_100 = (a + 1.0) / 2.0 * 100.0
    score_30 = round(score_100 * 0.3)
    return int(score_30)


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


def estimate_arousal_from_emotions(row) -> float:
    """感情カテゴリ確率から近似arousalを算出（重み付き平均）"""
    avail = [emo for emo in EMO_TO_AROUSAL.keys() if emo in row.index]
    if not avail:
        return None
    num, den = 0.0, 0.0
    for emo in avail:
        p = float(row[emo])
        num += p * EMO_TO_AROUSAL[emo]
        den += p
    return num / den if den > 0 else None


# ========= メイン処理 =========
def run(
    duration_sec: int = 60,
    capture_interval: int = 5,
    save_dir: str = "faces_bmp",
    csv_path: str = "excitement_scores.csv",
    camera_index: int = 0,
    mirror: bool = True,
    device: str = "cpu",
):
    """
    カメラを起動し、指定間隔ごとに顔を切り出してBMP保存。
    Py-FeatでValence/Arousalまたは感情確率→近似Arousalを算出。
    Arousalを基に0〜30スコアを計算し、CSVに記録（実行ごとにリセット）。
    """
    ensure_dir(save_dir)

    # 顔検出器
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    face_cascade = cv2.CascadeClassifier(cascade_path)
    if face_cascade.empty():
        raise RuntimeError("顔分類器(haar)を読み込めませんでした。")

    # 表情推定モデル
    detector = Detector(device=device)

    # 🚩 CSVを毎回新規作成（過去ログ削除）
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        csv.writer(f).writerow(
            ["file", "valence", "arousal", "excitement_score_0_30", "mode"]
        )
    print(f"📄 新しいログファイルを作成しました: {csv_path}")

    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print("カメラを開けませんでした。")
        return

    print(
        f"起動: {duration_sec}秒後に自動停止 / {capture_interval}秒ごとに顔のみBMP保存 "
        f"/ 出力: {save_dir} / スコア: {csv_path}"
    )

    start = time.time()
    last = start
    idx = 0
    all_scores_30 = []

    while True:
        ret, frame = cap.read()
        if not ret:
            print("フレーム取得に失敗しました。終了します。")
            break

        if mirror:
            frame = cv2.flip(frame, 1)

        # 顔検出
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        faces = face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
        )

        # 表示（確認用）
        disp = frame.copy()
        for x, y, w, h in faces:
            cv2.rectangle(disp, (x, y), (x + w, y + h), (0, 255, 0), 2)
        cv2.imshow("Camera - Face capture & arousal scoring (press 'q' to quit)", disp)

        now = time.time()

        # 指定間隔で保存＆評価
        if now - last >= capture_interval:
            if len(faces) == 0:
                print("顔未検出：このタイミングはスキップ")
            else:
                for x, y, w, h in faces:
                    idx += 1
                    crop = frame[y : y + h, x : x + w]
                    out_path = os.path.join(save_dir, f"face_{idx:03d}.bmp")
                    if not cv2.imwrite(out_path, crop):
                        print(f"保存失敗: {out_path}")
                        continue

                    try:
                        res = detector.detect_image(out_path)
                        row = res.iloc[0]

                        # arousal値の取得
                        if "arousal" in res.columns:
                            valence = (
                                float(row["valence"])
                                if "valence" in res.columns
                                else None
                            )
                            arousal = float(row["arousal"])
                            mode = "VA"
                        else:
                            arousal_est = estimate_arousal_from_emotions(row)
                            if arousal_est is None:
                                raise KeyError(
                                    "Neither 'arousal' nor emotion columns found."
                                )
                            valence = None
                            arousal = float(arousal_est)
                            mode = "EMO-approx"

                        # --- 0〜30スコア ---
                        score_30 = norm_arousal_to_0_30(arousal)
                        all_scores_30.append(score_30)

                        with open(csv_path, "a", newline="", encoding="utf-8-sig") as f:
                            csv.writer(f).writerow(
                                [
                                    os.path.basename(out_path),
                                    valence,
                                    arousal,
                                    score_30,
                                    mode,
                                ]
                            )

                        print(
                            f"保存: {out_path} | mode={mode} "
                            f"arousal={arousal:.3f} → excitement(0-30)={score_30}"
                        )

                    except Exception as e:
                        print(f"評価失敗: {out_path} | {e}")

            last = now

        # 自動停止／手動終了
        if now - start >= duration_sec:
            print(f"{duration_sec}秒経過のため自動停止します。")
            break
        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("手動終了しました。")
            break

    cap.release()
    cv2.destroyAllWindows()

    # --- 最終平均値（四捨五入整数） ---
    if all_scores_30:
        avg_score = round(sum(all_scores_30) / len(all_scores_30))
        print(
            f"\n📊 最終評価値（平均スコア）: {avg_score} / 30 （{len(all_scores_30)} 枚の平均）"
        )
    else:
        print("\n⚠️ 有効なスコアが算出されませんでした。")

    print("終了")


if __name__ == "__main__":
    run(
        duration_sec=60,
        capture_interval=5,
        save_dir="faces_bmp",
        csv_path="excitement_scores.csv",
        camera_index=0,
        mirror=True,
        device="cpu",
    )
