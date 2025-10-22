'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

function SessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const groupId = searchParams.get('groupId');

  const [socket, setSocket] = useState<Socket | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [groupName, setGroupName] = useState<string>('');
  const [sessionConfig, setSessionConfig] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [readyStatus, setReadyStatus] = useState<Record<string, boolean>>({});
  const [waitingForMaster, setWaitingForMaster] = useState(false);
  const [faceDetections, setFaceDetections] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // 設定を取得
    const configStr = localStorage.getItem('sessionConfig');
    const groupStr = localStorage.getItem('selectedGroup');

    if (!configStr || !sessionId || !groupId) {
      router.push('/');
      return;
    }

    const config = JSON.parse(configStr);
    const group = groupStr ? JSON.parse(groupStr) : null;

    setSessionConfig(config);
    setGroupName(group?.groupName || `グループ ${groupId}`);
    setTimeLeft(config.durationMinutes * 60);

    // マスターかどうかを判定
    const isMasterGroup = groupId === 'group_1';
    setIsMaster(isMasterGroup);

    // Socket.IO接続
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const newSocket = io(apiUrl);

    newSocket.on('connect', () => {
      console.log('Connected to server');

      // セッション作成
      newSocket.emit('create_session', {
        session_id: sessionId,
        num_groups: config.numGroups,
        duration_minutes: config.durationMinutes
      });

      // グループ参加
      newSocket.emit('join_group', {
        session_id: sessionId,
        group_id: groupId,
        group_name: group?.groupName || `グループ ${groupId}`
      });

      // セッション監視
      newSocket.emit('monitor_session', { session_id: sessionId });
    });

    // 準備状態の更新を受信
    newSocket.on('groups_ready_status', (data: { ready_status: Record<string, boolean> }) => {
      console.log('Ready status update:', data);
      setReadyStatus(data.ready_status);
    });

    // セッション開始を受信
    newSocket.on('session_started', () => {
      console.log('Session started by master');
      setWaitingForMaster(false);
      handleStart();
    });

    // 顔検出データを受信
    newSocket.on('face_detection', (data) => {
      console.log('Face detection:', data);
      setFaceDetections(data);
    });

    newSocket.on('session_results', (data) => {
      console.log('Session results:', data);
      // 結果をローカルストレージに保存
      localStorage.setItem('sessionResults', JSON.stringify(data));
      // 結果画面に遷移
      router.push(`/results?sessionId=${sessionId}`);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [sessionId, groupId, router]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleSessionEnd();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [isRunning, timeLeft]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      mediaStreamRef.current = stream;

      // 音声解析の準備
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      return true;
    } catch (error) {
      console.error('Error accessing camera/microphone:', error);
      alert('カメラとマイクのアクセスが必要です');
      return false;
    }
  };

  const captureFrame = () => {
    if (!canvasRef.current || !videoRef.current || !socket) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (base64 && socket) {
          socket.emit('video_frame', {
            session_id: sessionId,
            group_id: groupId,
            frame_data: base64,
            timestamp: Date.now()
          });
        }
      };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.8);
  };

  const captureAudio = () => {
    if (!mediaStreamRef.current || !socket) return;

    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioContext.createAnalyser();
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const capture = () => {
      analyser.getByteFrequencyData(dataArray);

      // 音声データをBase64エンコード
      const base64 = btoa(String.fromCharCode.apply(null, Array.from(dataArray)));

      socket.emit('audio_stream', {
        session_id: sessionId,
        group_id: groupId,
        audio_data: base64,
        timestamp: Date.now()
      });
    };

    // 1秒ごとに音声をキャプチャ
    const audioInterval = setInterval(capture, 1000);
    return audioInterval;
  };

  const handleReady = () => {
    if (!socket || !sessionId || !groupId) return;

    setIsReady(true);
    socket.emit('group_ready', {
      session_id: sessionId,
      group_id: groupId
    });

    if (!isMaster) {
      setWaitingForMaster(true);
    }
  };

  const handleMasterStart = () => {
    if (!socket || !sessionId) return;

    socket.emit('start_session', {
      session_id: sessionId
    });
  };

  const handleStart = async () => {
    const cameraReady = await startCamera();
    if (!cameraReady) return;

    setIsRunning(true);

    // 動画フレームを2秒ごとにキャプチャ
    const frameInterval = setInterval(captureFrame, 2000);

    // 音声を1秒ごとにキャプチャ
    const audioInterval = captureAudio();

    // クリーンアップ用に保存
    return () => {
      clearInterval(frameInterval);
      if (audioInterval) clearInterval(audioInterval);
    };
  };

  const handleSessionEnd = () => {
    setIsRunning(false);

    // メディアストリームを停止
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // セッション終了を通知
    if (socket) {
      socket.emit('session_end', { session_id: sessionId });
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-yellow-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* ヘッダー */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              {groupName}
            </h1>
            <p className="text-gray-600">
              セッションID: {sessionId}
            </p>
          </div>

          {/* カウントダウン */}
          <div className="mb-6 text-center">
            <div className={`text-6xl font-bold ${timeLeft <= 60 ? 'text-red-500' : 'text-yellow-600'}`}>
              {formatTime(timeLeft)}
            </div>
            <p className="text-gray-600 mt-2">残り時間</p>
          </div>

          {/* ビデオプレビュー */}
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
                  {faceDetections.faces.map((face: any, index: number) => {
                    const videoWidth = faceDetections.image_width;
                    const videoHeight = faceDetections.image_height;

                    // ビデオ要素のサイズに合わせて座標を変換
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
                          😊 {face.smile_score.toFixed(1)}%
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}

              {!isRunning && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                  <p className="text-white text-xl">カメラは開始後に起動します</p>
                </div>
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            {/* 顔検出情報 */}
            {isRunning && faceDetections && (
              <div className="mt-2 p-3 bg-gray-100 rounded-lg text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">
                    検出: {faceDetections.face_count} 人
                  </span>
                  <span className="font-semibold text-yellow-600">
                    スコア: {faceDetections.score?.toFixed(1) || 0}点
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* コントロールボタン */}
          <div className="space-y-4">
            {!isRunning && !isReady && (
              <button
                onClick={handleReady}
                className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-yellow-600 hover:to-yellow-700 transform hover:scale-105 transition duration-200 shadow-lg"
              >
                準備OK
              </button>
            )}

            {isReady && !isRunning && isMaster && (
              <>
                {/* マスター用: 全グループの準備状態 */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">グループの準備状態</h3>
                  <div className="space-y-2">
                    {Object.entries(readyStatus).map(([gid, ready]) => (
                      <div key={gid} className="flex items-center justify-between">
                        <span className="text-sm text-gray-700">{gid}</span>
                        {ready ? (
                          <span className="px-3 py-1 bg-green-500 text-white text-xs rounded-full">準備OK</span>
                        ) : (
                          <span className="px-3 py-1 bg-gray-300 text-gray-600 text-xs rounded-full">待機中</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleMasterStart}
                  disabled={!Object.values(readyStatus).every(ready => ready)}
                  className={`w-full font-semibold py-4 px-6 rounded-lg transition shadow-lg ${
                    Object.values(readyStatus).every(ready => ready)
                      ? 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 transform hover:scale-105'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {Object.values(readyStatus).every(ready => ready)
                    ? 'セッション開始'
                    : '全グループの準備を待っています...'}
                </button>
              </>
            )}

            {isReady && !isRunning && !isMaster && waitingForMaster && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <div className="text-4xl mb-3">⏳</div>
                <p className="text-lg font-semibold text-yellow-800 mb-2">
                  マスターの承認を待っています
                </p>
                <p className="text-sm text-yellow-700">
                  {groupName}が準備完了しました。マスターがセッションを開始するまでお待ちください。
                </p>
              </div>
            )}

            {isRunning && (
              <button
                onClick={handleSessionEnd}
                className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold py-4 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transition shadow-lg"
              >
                セッション終了
              </button>
            )}
          </div>

          {/* ステータス */}
          {isRunning && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <p className="text-green-800 font-semibold">録画・録音中...</p>
              </div>
              <p className="text-sm text-green-700 mt-2">
                音声と表情をリアルタイムで分析しています
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SessionContent />
    </Suspense>
  );
}
