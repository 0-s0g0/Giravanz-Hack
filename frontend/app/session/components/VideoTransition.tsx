'use client';

import { useEffect, useRef, useState } from 'react';

interface VideoTransitionProps {
  type: 'start' | 'end';
  onComplete: () => void;
}

export default function VideoTransition({ type, onComplete }: VideoTransitionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // マウント後すぐにアニメーション開始
    setTimeout(() => setIsVisible(true), 50);

    const video = videoRef.current;
    if (!video) return;

    // 動画の読み込みが完了したら再生
    const handleLoadedData = () => {
      video.play().catch(err => {
        console.error('Video playback failed:', err);
      });
    };

    // 動画終了時のハンドラ
    const handleEnded = () => {
      if (type === 'start') {
        // start動画は終了後にフェードアウトしてコールバック
        setIsVisible(false);
        setTimeout(() => {
          onComplete();
        }, 500);
      } else {
        // end動画は終了したらループ再生（session_resultsが来るまで）
        video.currentTime = 0;
        video.play().catch(err => {
          console.error('Video loop failed:', err);
        });
        onComplete();
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('ended', handleEnded);

    // 念のため手動で読み込み開始
    video.load();

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onComplete, type]);

  const videoSrc = type === 'start' ? '/start.mp4' : '/end.mp4';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
      }`}
      style={{
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        preload="auto"
      >
        <source src={videoSrc} type="video/mp4" />
      </video>
    </div>
  );
}
