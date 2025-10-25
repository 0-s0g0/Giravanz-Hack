import { ReactNode } from 'react';
import AudioVisualizer from './AudioVisualizer';

interface FaceDetection {
  face_count: number;
  score: number;
  faces?: any[];
  image_width?: number;
  image_height?: number;
}

interface ScoreDisplayProps {
  audioScore: number;
  audioHighScore: number;
  isNewHigh: boolean;
  audioVolume: number[];
  faceDetections: FaceDetection | null;
  faceIcon: ReactNode;
}

export default function ScoreDisplay({
  audioScore,
  audioHighScore,
  isNewHigh,
  audioVolume,
  faceDetections,
  faceIcon,
}: ScoreDisplayProps) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-4">
      {/* 音声スコア */}
      <div className="bg-orange-50 rounded-xl p-6">
         <div className="flex flex-col items-center gap-2 mb-3">
        <div className="font-bold text-gray-800 text-center">音声スコア</div>
        <AudioVisualizer audioVolume={audioVolume} />
       
          
        
        <div className={`text-4xl font-bold ${isNewHigh ? 'text-red-500 animate-pulse' : 'text-orange-600'}`}>
          {audioScore.toFixed(1)}
        </div>
        <div className="text-sm text-gray-600 mt-2">
          最高: {audioHighScore.toFixed(1)}点
        </div>
        {isNewHigh && (
          <div className="mt-2 text-xs font-bold text-red-500 animate-bounce">
            🎉 NEW HIGH SCORE!
          </div>
        )}
</div>
        
      </div>

      {/* 表情スコア */}
      <div className="bg-orange-50 rounded-xl p-6">
        <div className="flex flex-col items-center gap-2 mb-3">
          <h3 className="font-bold text-gray-800">表情スコア</h3>
          <div className="flex flex-col text-yellow-200 items-center gap-2">
            {faceIcon}
            <div className="text-4xl font-bold text-orange-600">
              {faceDetections?.score?.toFixed(1) || '0.0'}
            </div>
          </div>
          <div className="text-sm text-gray-600 mt-2">
            検出人数: {faceDetections?.face_count || 0}人
          </div>
        </div>
      </div>
    </div>
  );
}
