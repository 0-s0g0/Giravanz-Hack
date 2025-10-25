'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Laugh, Smile, Annoyed, Frown,Loader } from 'lucide-react';
import logo from '@/public/emblem_nonBG.png'
import kaba from '@/public/kaba.jpg'
import nagai from '@/public/nagai.jpg'
import sunzin from '@/public/sunzin.jpg'
import VideoPreview from './components/VideoPreview';
import ScoreDisplay from './components/ScoreDisplay';
import SessionControls from './components/SessionControls';
import CirclesBackground from '@/app/background/cycle-background'

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
  const [audioScore, setAudioScore] = useState<number>(0);
  const [audioHighScore, setAudioHighScore] = useState<number>(0);
  const [isNewHigh, setIsNewHigh] = useState<boolean>(false);
  const [detectedWords, setDetectedWords] = useState<Array<{id: number; word: string; timestamp: number; imageUrl?: string}>>([]);
  const [audioVolume, setAudioVolume] = useState<number[]>(Array(20).fill(0));

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecognitionRunningRef = useRef<boolean>(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeAnimationRef = useRef<number | null>(null);

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
      console.log('✅ Connected to server with socket ID:', newSocket.id);

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

      // セッション監視（結果を受信するためのルーム参加）
      console.log('📡 Joining session monitoring room:', sessionId);
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
      console.log('Attempting to start camera and audio capture...');
      setWaitingForMaster(false);
      handleStart();
    });

    // 顔検出データを受信
    newSocket.on('face_detection', (data) => {
      console.log('🎭 Face detection:', {
        group_id: data.group_id,
        face_count: data.face_count,
        score: data.score,
        faces: data.faces
      });
      setFaceDetections(data);
    });

    // 音声分析結果をリアルタイムで受信
    newSocket.on('audio_analysis_update', (data) => {
      console.log('Audio analysis update:', data);
      setAudioScore(data.current_score);
      setAudioHighScore(data.high_score);
      setIsNewHigh(data.is_new_high);
    });

    newSocket.on('session_results', (data) => {
      console.log('🎉 Session results received:', data);
      console.log('Number of groups in results:', data.results?.length);
      console.log('Winner group:', data.winner_group_id);

      try {
        // 結果をローカルストレージに保存
        localStorage.setItem('sessionResults', JSON.stringify(data));
        console.log('✅ Results saved to localStorage');

        // 結果画面に遷移
        console.log('🚀 Navigating to results page...');
        router.push(`/results?sessionId=${sessionId}`);
      } catch (error) {
        console.error('❌ Error processing session results:', error);
      }
    });

    // エラーハンドリング
    newSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
    });

    setSocket(newSocket);
    socketRef.current = newSocket;

    return () => {
      console.log('🔄 Cleaning up socket connection');
      newSocket.close();
      socketRef.current = null;
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


  /**
   * スコアに基づいて表情アイコンを決定する
   * @param score 表情スコア (0.0 - 100.0)
   * @returns 対応するLucideアイコンコンポーネント
   */
  const getFaceIcon = (score: number | undefined): React.ReactElement => {
    const iconSize = 80;
    const iconClass = "text-orange-600";

    if (score === undefined || score < 0) {
      return <Loader size={iconSize} className={iconClass} />;
    }
    if (score >= 75) {
      return <Laugh size={iconSize} className={iconClass} />;
    }
    if (score >= 50) {
      return <Smile size={iconSize} className={iconClass} />;
    }
    if (score >= 25) {
      return <Annoyed size={iconSize} className={iconClass} />;
    }
    return <Frown size={iconSize} className={iconClass} />;
  };

  // 検出する応援キーワードリスト
  const CHEER_KEYWORDS = [
    'がんばれ', '頑張れ', 'ガンバレ','がん','ガン',
    'いいね', 'イイネ','いね','イネ',
    'やったー', 'ヤッター',
    'ゴール',
    'ギラヴァンツ', 'ぎら','ギラ',
    'ボール',
    'すごい', 'スゴイ',
    'ナイス',
    'よし', 'ヨシ',
    'いけ', 'イケ',
    'すんじん', 'スンジン','新人',
    'かば','カバ',
    'ながい','ナガイ','長い','長井','永井'

  ];

  const KEYWORD_IMAGE_MAP: Record<string, any> = {
    'ギラヴァンツ': logo.src, // Next.js Imageの場合、.srcでURLを取得
    'ぎらヴぁんツ': logo.src,
    'ギラ': logo.src,
    'すんじん': sunzin.src,
    '新人': sunzin.src,
    'スンジン': sunzin.src,
    'かば': kaba.src,
    'カバ': kaba.src,
    'ながい': nagai.src,
    'ナガイ': nagai.src,
    '長井': nagai.src,
    '永井': nagai.src,
    '長い': nagai.src,

  };

  /**
   * 音声認識を開始する（Web Speech API）
   */
  const startSpeechRecognition = async () => {
    console.log('🎤 音声認識の初期化を開始します...');

    // マイク権限の確認
    try {
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      console.log('🎙️ マイク権限の状態:', permissionStatus.state);
    } catch (e) {
      console.warn('⚠️ マイク権限の確認に失敗:', e);
    }

    // ブラウザ対応チェック
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    console.log('🔍 ブラウザの音声認識サポート:', {
      hasSpeechRecognition: !!(window as any).SpeechRecognition,
      hasWebkitSpeechRecognition: !!(window as any).webkitSpeechRecognition,
      isSupported: !!SpeechRecognition
    });

    if (!SpeechRecognition) {
      console.error('❌ このブラウザは音声認識に対応していません');
      alert('このブラウザは音声認識に対応していません。Chromeブラウザをご利用ください。');
      return;
    }

    console.log('✅ 音声認識APIが利用可能です');
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = true; // 継続的に認識
    recognition.interimResults = true; // リアルタイム結果を取得

    console.log('🔧 音声認識の設定:', {
      lang: 'ja-JP',
      continuous: true,
      interimResults: true
    });

    recognition.onresult = (event: any) => {
      console.log('🎤 音声認識イベント発生', {
        resultLength: event.results.length,
        isFinal: event.results[event.results.length - 1].isFinal
      });

      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      console.log('🎤 音声認識結果:', {
        transcript: transcript,
        isFinal: isFinal,
        confidence: result[0].confidence
      });

      // キーワードマッチング
      const transcriptLower = transcript.toLowerCase();
      CHEER_KEYWORDS.forEach(keyword => {
        // キーワードがトランスクリプトに含まれているかチェック
        // ただし、CHEER_KEYWORDSはすでに大文字・小文字を区別しないバージョンを含んでいるため、
        // 厳密なチェックにはKEYWORD_IMAGE_MAPのキーと照合するのがより良いです。
        const normalizedKeyword = keyword.toLowerCase();
        
        if (transcriptLower.includes(normalizedKeyword)) {
          // KEYWORD_IMAGE_MAPから画像URLを取得
          const imageUrl = KEYWORD_IMAGE_MAP[keyword] || KEYWORD_IMAGE_MAP[normalizedKeyword];
          
          console.log('✅ キーワード検出:', {
            keyword: keyword,
            transcript: transcript,
            isFinal: isFinal,
            imageUrl: imageUrl // 追加
          });
          
          const newWord = {
            id: Date.now() + Math.random(),
            word: keyword,
            timestamp: Date.now(),
            imageUrl: imageUrl // 画像URLを追加
          };
          
          setDetectedWords(prev => [...prev, newWord]);

          // 3秒後に自動削除
          setTimeout(() => {
            setDetectedWords(prev => prev.filter(w => w.id !== newWord.id));
          }, 3000);
        }
      });
    };

    recognition.onstart = () => {
      console.log('🎤 音声認識が開始されました');
      isRecognitionRunningRef.current = true;
    };

    recognition.onaudiostart = () => {
      console.log('🔊 マイクの音声入力が開始されました');
    };

    recognition.onaudioend = () => {
      console.log('🔇 マイクの音声入力が終了しました');
    };

    recognition.onsoundstart = () => {
      console.log('🔉 音声が検出されました');
    };

    recognition.onsoundend = () => {
      console.log('🔈 音声の検出が終了しました');
    };

    recognition.onspeechstart = () => {
      console.log('🗣️ 発話が検出されました');
    };

    recognition.onspeechend = () => {
      console.log('🤐 発話が終了しました');
    };

    recognition.onerror = (event: any) => {
      console.error('❌ 音声認識エラー:', {
        error: event.error,
        message: event.message,
        timestamp: new Date().toISOString()
      });

      // 全てのエラータイプをログに出力
      if (event.error === 'no-speech') {
        console.warn('⚠️ 音声が検出されませんでした（no-speech）');
      } else if (event.error === 'audio-capture') {
        console.error('❌ マイクへのアクセスに失敗しました（audio-capture）');
      } else if (event.error === 'not-allowed') {
        console.error('❌ マイクの使用が許可されていません（not-allowed）');
      } else if (event.error === 'network') {
        console.error('❌ ネットワークエラーが発生しました（network）');
      } else {
        console.error('❌ 未知のエラー:', event.error);
      }

      // not-allowed以外のエラー時は再起動を試みる
      if (event.error !== 'not-allowed' && event.error !== 'aborted') {
        console.log('⚠️ 音声認識を再起動します（エラー後、1秒後）...');
        setTimeout(() => {
          if (recognitionRef.current && !isRecognitionRunningRef.current) {
            try {
              console.log('🔄 エラー後の再起動: recognition.start() を呼び出します');
              recognition.start();
              console.log('✅ recognition.start() の呼び出しが成功しました（エラー後）');
            } catch (e) {
              console.error('❌ 音声認識の再起動に失敗:', e);
              if (e instanceof Error) {
                console.error('エラー後の再起動失敗詳細:', {
                  name: e.name,
                  message: e.message
                });
              }
            }
          } else if (isRecognitionRunningRef.current) {
            console.log('⏭️ エラー後、音声認識は既に動作中のため、再起動をスキップします');
          }
        }, 1000);
      } else if (event.error === 'aborted') {
        console.log('⏹️ 音声認識が中断されました（aborted）、onendで処理します');
      }
    };

    recognition.onend = () => {
      console.log('🛑 音声認識が終了しました', {
        hasRecognitionRef: !!recognitionRef.current,
        isRecognitionRunning: isRecognitionRunningRef.current,
        isRunning: isRunning
      });

      isRecognitionRunningRef.current = false;

      // continuous: true なので、通常は自動的に継続するはず
      // onend が呼ばれたということは何か問題が発生した可能性がある
      // recognitionRef が存在し、まだセッション中なら再起動を試みる
      if (recognitionRef.current) {
        console.log('🔄 音声認識を自動再起動します（500ms後）...');
        setTimeout(() => {
          if (recognitionRef.current && !isRecognitionRunningRef.current) {
            try {
              console.log('🔄 認識を再起動中... recognition.start() を呼び出します');
              recognition.start();
              console.log('✅ recognition.start() の呼び出しが成功しました（再起動）');
            } catch (e) {
              console.error('❌ 音声認識の再起動に失敗:', e);
              if (e instanceof Error) {
                console.error('再起動エラー詳細:', {
                  name: e.name,
                  message: e.message
                });
              }
            }
          } else if (isRecognitionRunningRef.current) {
            console.log('⏭️ 音声認識は既に動作中のため、再起動をスキップします');
          } else {
            console.log('⏹️ タイムアウト後、recognitionRefがnullになっていました');
          }
        }, 500);
      } else {
        console.log('⏹️ 音声認識は停止されました（recognitionRefがnull）');
      }
    };

    recognitionRef.current = recognition;

    console.log('🚀 recognition.start() を呼び出します...');
    try {
      recognition.start();
      console.log('✅ recognition.start() の呼び出しが成功しました');
      console.log('⏳ onstart イベントを待っています...');
    } catch (e) {
      console.error('❌ recognition.start() の呼び出しで例外が発生:', e);
      if (e instanceof Error) {
        console.error('エラー詳細:', {
          name: e.name,
          message: e.message,
          stack: e.stack
        });
      }
    }
  };

  /**
   * 音声認識を停止する
   */
  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      console.log('🛑 音声認識を停止します...');
      recognitionRef.current.stop();
      recognitionRef.current = null;
      isRecognitionRunningRef.current = false;
      console.log('✅ 音声認識を停止しました');
    }
  };




  const startCamera = async () => {
    try {
      console.log('Requesting camera and microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true
      });

      console.log('Camera and microphone access granted!');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      mediaStreamRef.current = stream;

      // 音声解析の準備
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      console.log('Camera setup complete');
      return true;
    } catch (error) {
      console.error('Error accessing camera/microphone:', error);
      alert('カメラとマイクのアクセスが必要です');
      return false;
    }
  };

  const captureFrame = () => {
    if (!canvasRef.current || !videoRef.current || !socketRef.current) {
      console.warn('captureFrame: Missing canvas, video, or socket', {
        canvas: !!canvasRef.current,
        video: !!videoRef.current,
        socket: !!socketRef.current
      });
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('captureFrame: Could not get canvas context');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(',')[1];
        if (base64 && socketRef.current) {
          console.log('Sending video frame to server');
          socketRef.current.emit('video_frame', {
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

  const captureAudio = (): NodeJS.Timeout | null => {
    if (!mediaStreamRef.current || !socketRef.current) {
      console.warn('captureAudio: Missing media stream or socket', {
        mediaStream: !!mediaStreamRef.current,
        socket: !!socketRef.current
      });
      return null;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext) {
      console.warn('captureAudio: No audio context');
      return null;
    }

    console.log('Setting up audio capture');
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    // analyserの参照を保存
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const capture = () => {
      analyser.getByteFrequencyData(dataArray);

      // 音声データをBase64エンコード
      const base64 = btoa(String.fromCharCode.apply(null, Array.from(dataArray)));

      if (socketRef.current) {
        console.log('Sending audio stream to server');
        socketRef.current.emit('audio_stream', {
          session_id: sessionId,
          group_id: groupId,
          audio_data: base64,
          timestamp: Date.now()
        });
      }
    };

    // リアルタイム波形用のアニメーションループを開始
    startVolumeVisualization();

    // 1秒ごとに音声をキャプチャ
    const audioInterval = setInterval(capture, 1000);
    console.log('Audio capture interval started');
    return audioInterval;
  };

  // リアルタイムで音量を取得して波形を更新
  const startVolumeVisualization = () => {
    const updateVolume = () => {
      if (!analyserRef.current) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // 20本のバーに分割
      const barCount = 20;
      const volumes: number[] = [];

      for (let i = 0; i < barCount; i++) {
        const start = Math.floor((i * bufferLength) / barCount);
        const end = Math.floor(((i + 1) * bufferLength) / barCount);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += dataArray[j];
        }
        const avg = sum / (end - start);
        volumes.push(avg);
      }

      setAudioVolume(volumes);
      volumeAnimationRef.current = requestAnimationFrame(updateVolume);
    };

    updateVolume();
  };

  // 波形のアニメーションを停止
  const stopVolumeVisualization = () => {
    if (volumeAnimationRef.current) {
      cancelAnimationFrame(volumeAnimationRef.current);
      volumeAnimationRef.current = null;
    }
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
    console.log('handleStart called');
    const cameraReady = await startCamera();
    if (!cameraReady) {
      console.error('Camera not ready, aborting start');
      return;
    }

    console.log('Setting isRunning to true');
    setIsRunning(true);

    // 動画フレームを2秒ごとにキャプチャ
    console.log('Starting video frame capture (every 2 seconds)');
    frameIntervalRef.current = setInterval(captureFrame, 2000);

    // 音声を1秒ごとにキャプチャ
    console.log('Starting audio capture (every 1 second)');
    audioIntervalRef.current = captureAudio();

    // 音声認識を開始
    console.log('Starting speech recognition');
    startSpeechRecognition();

    console.log('All capture intervals started successfully');
  };

  const handleSessionEnd = () => {
    console.log('🛑 handleSessionEnd called');
    setIsRunning(false);

    // インターバルをクリア
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }

    // 音声認識を停止
    stopSpeechRecognition();

    // 波形のアニメーションを停止
    stopVolumeVisualization();
    analyserRef.current = null;

    // メディアストリームを停止
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }

    // セッション終了を通知
    if (socketRef.current) {
      console.log('📤 Sending session_end event to server');
      socketRef.current.emit('session_end', { session_id: sessionId });
      console.log('✅ session_end event sent');
    } else {
      console.error('❌ Socket not available to send session_end');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const faceIcon = getFaceIcon(faceDetections?.score);

  return (
    <div className="min-h-screen p-4">
      <CirclesBackground/>
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
          <VideoPreview
            videoRef={videoRef}
            canvasRef={canvasRef}
            isRunning={isRunning}
            faceDetections={faceDetections}
            detectedWords={detectedWords}
          />

          {/* コントロールボタン */}
          <SessionControls
            isRunning={isRunning}
            isReady={isReady}
            isMaster={isMaster}
            waitingForMaster={waitingForMaster}
            groupName={groupName}
            readyStatus={readyStatus}
            onReady={handleReady}
            onMasterStart={handleMasterStart}
            onSessionEnd={handleSessionEnd}
          />

          {/* ステータス */}
          {isRunning && (
            <>
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <p className="text-green-800 font-semibold">録画・録音中...</p>
                </div>
                <p className="text-sm text-green-700 mt-2">
                  音声と表情をリアルタイムで分析しています
                </p>
              </div>

              {/* リアルタイムスコア表示 */}
              <ScoreDisplay
                audioScore={audioScore}
                audioHighScore={audioHighScore}
                isNewHigh={isNewHigh}
                audioVolume={audioVolume}
                faceDetections={faceDetections}
                faceIcon={faceIcon}
              />
            </>
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
