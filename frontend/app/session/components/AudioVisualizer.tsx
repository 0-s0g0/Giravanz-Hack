import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { Mic } from 'lucide-react';

interface AudioVisualizerProps {
  audioVolume: number[];
  size?: number;
  sensitivityPower?: number;
}

export default function AudioVisualizer({
  audioVolume,
  size = 80, // 💡 サイズを小さく設定（動画オーバーレイ用）
  sensitivityPower = 2.0
}: AudioVisualizerProps) {
  const maxVolume = 255;

  // 1. 音量の平均値を計算
  const averageVolume = audioVolume.reduce((sum, vol) => sum + vol, 0) / audioVolume.length;

  // 2. 感度調整（小さい音を強調：平方根カーブを適用）
  const linearNormalized = averageVolume / maxVolume;
  // Math.pow(x, 1 / 2.0) は平方根。小さい値の割合を大きくする。
  const sensitiveNormalized = Math.pow(linearNormalized, 1 / sensitivityPower);

  // 3. パーセンテージに変換（0-100）
  const percentage = Math.min(100, sensitiveNormalized * 100);

  // 4. マイクアイコンのサイズをコンテナサイズに基づいて決定
  const micSize = size * 0.4; // 例: コンテナサイズの40%

  return (
    // mt-4 や justify-center は親コンポーネントで制御するためここでは削除
    <div style={{ width: size, height: size }} className="relative">
      
      {/* 1. 円形のプログレスバー */}
      <CircularProgressbar
        value={percentage}
        // 円周の先端のドットを表現するため、'round'を維持
        styles={buildStyles({
          pathColor: '#f97316',      // 💡 orange-600
          trailColor: '#fde68a',     // 💡 yellow-200
          strokeLinecap: 'round',    
          pathTransitionDuration: 0.075, // 滑らかなトランジション
        })}
        // ラベルは不要なので非表示にするために text= を省略
      />

      {/* 2. 中央のマイクアイコン */}
      <div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <Mic 
          size={micSize} 
          color="#fb923c" // orange-400
          strokeWidth={2.5}
        />
      </div>
    </div>
  );
}