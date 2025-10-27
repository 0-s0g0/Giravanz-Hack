import { RefObject } from 'react';
import { Mic } from 'lucide-react';

interface DetectedWord {
  id: number;
  word: string;
  timestamp: number;
  imageUrl?: string;
}

interface FaceDetection {
  face_count: number;
  score: number;
  faces: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    excitement_score?: number;
  }>;
  image_width: number;
  image_height: number;
}

interface VideoPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isRunning: boolean;
  faceDetections: FaceDetection | null;
  detectedWords: DetectedWord[];
}

export default function VideoPreview({
  videoRef,
  canvasRef,
  isRunning,
  faceDetections,
  detectedWords,
}: VideoPreviewProps) {
  return (
    <div className="mb-6">
      <div className="relative bg-black rounded-lg overflow-hidden" style={{ paddingBottom: '56.25%' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-full h-full object-cover"
        />

        {/* 顔検出のオーバーレイ */}
        {isRunning && faceDetections && faceDetections.faces && (
          <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {faceDetections.faces.map((face, index) => {
              const videoWidth = faceDetections.image_width;
              const videoHeight = faceDetections.image_height;

              const xPercent = (face.x / videoWidth) * 100;
              const yPercent = (face.y / videoHeight) * 100;
              const widthPercent = (face.width / videoWidth) * 100;
              const heightPercent = (face.height / videoHeight) * 100;

              return (
                <g key={index}>
                  <rect
                    x={`${xPercent}%`}
                    y={`${yPercent}%`}
                    width={`${widthPercent}%`}
                    height={`${heightPercent}%`}
                    fill="none"
                    stroke="#00ff00"
                    strokeWidth="3"
                    rx="5"
                  />
                  <text
                    x={`${xPercent}%`}
                    y={`${yPercent - 1}%`}
                    fill="#00ff00"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    {face.excitement_score?.toFixed(1) || '0'}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* 音声認識で検出された単語のオーバーレイ */}
        {isRunning && detectedWords.length > 0 && (
          <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
            {detectedWords.map((item, index) => {
              const randomX = 10 + (index * 23) % 70;
              const randomY = 15 + (index * 17) % 60;
              const hasImage = !!item.imageUrl;

              return (
                <div
                  key={item.id}
                  className="absolute text-4xl font-bold text-yellow-300 transition-opacity duration-300"
                  style={{
                    left: `${randomX}%`,
                    top: `${randomY}%`,
                    textShadow: hasImage ? 'none' : '2px 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(255,255,0,0.5)',
                    animation: 'fadeOut 3s ease-out forwards'
                  }}
                >
                  {hasImage ? (
                    <img
                      src={item.imageUrl}
                      alt={item.word}
                      className="w-24 h-24 object-contain "
                    />
                  ) : (
                    item.word
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!isRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <p className="text-white text-xl">カメラは開始後に起動します</p>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      
    </div>
  );
}
