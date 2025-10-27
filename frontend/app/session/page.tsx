'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Laugh, Smile, Annoyed, Frown,Loader } from 'lucide-react';
import VideoPreview from './components/VideoPreview';
import ScoreDisplay from './components/ScoreDisplay';
import SessionControls from './components/SessionControls';
import VideoTransition from './components/VideoTransition';
import CirclesBackground from '@/app/background/cycle-background'
import {MovingBackground} from '@/app/background/text-background'
import { CHEER_KEYWORDS, KEYWORD_IMAGE_MAP } from './constants/cheerKeywords'

// グループIDから表示名を生成するヘルパー関数
const getGroupDisplayName = (groupId: string): string => {
  if (groupId === 'group_1') return 'マスター';
  const groupNumber = groupId.replace('group_', '');
  return `グループ ${groupNumber}`;
};

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
  const [showStartVideo, setShowStartVideo] = useState(false);
  const [showEndVideo, setShowEndVideo] = useState(false);
  const endVideoStartTimeRef = useRef<number | null>(null);
  const pendingResultsRef = useRef<any>(null);
  const [scoreHistory, setScoreHistory] = useState<Array<{timestamp: number; audioScore: number; expressionScore: number}>>([]);
  const scoreHistoryRef = useRef<Array<{timestamp: number; audioScore: number; expressionScore: number}>>([]);
  const sessionStartTimeRef = useRef<number | null>(null);

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

    if (!configStr || !sessionId || !groupId) {
      router.push('/');
      return;
    }

    const config = JSON.parse(configStr);

    setSessionConfig(config);

    // グループIDから一貫した表示名を生成
    const displayName = groupId ? getGroupDisplayName(groupId) : 'グループ';
    setGroupName(displayName);
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
        group_name: displayName
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
      console.log('🎬 session_started event received');
      console.log('🎬 Group ID:', groupId);
      console.log('🎬 Is Master:', isMasterGroup);
      setWaitingForMaster(false);
      // start動画を表示
      setShowStartVideo(true);
      console.log('🎬 showStartVideo set to true');
    });

    // セッション終了を受信（全クライアントでend動画を表示）
    newSocket.on('session_ending', (data) => {
      console.log('🎬 session_ending event received');
      console.log('🎬 Group ID:', groupId);
      console.log('🎬 Is Master:', isMasterGroup);

      // セッションを停止
      setIsRunning(false);

      // スコア履歴をlocalStorageに保存（Refから最新の値を取得）
      if (groupId) {
        const scoreHistoryKey = `scoreHistory_${data.session_id}_${groupId}`;
        const historyToSave = scoreHistoryRef.current;
        console.log('📊 Saving score history from session_ending, length:', historyToSave.length);
        console.log('📊 Score history sample:', historyToSave.slice(0, 3));
        localStorage.setItem(scoreHistoryKey, JSON.stringify(historyToSave));
        console.log('✅ Score history saved to localStorage:', scoreHistoryKey);
      }

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
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
          isRecognitionRunningRef.current = false;
        } catch (e) {
          console.error('Error stopping speech recognition:', e);
        }
      }

      // 波形のアニメーションを停止
      if (volumeAnimationRef.current) {
        cancelAnimationFrame(volumeAnimationRef.current);
        volumeAnimationRef.current = null;
      }
      analyserRef.current = null;

      // メディアストリームを停止
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // end動画を表示
      endVideoStartTimeRef.current = Date.now();
      setShowEndVideo(true);
      console.log('🎬 showEndVideo set to true from session_ending');
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

        // end動画が表示されている場合、4秒間の最低表示時間を保証
        if (endVideoStartTimeRef.current !== null) {
          const elapsed = Date.now() - endVideoStartTimeRef.current;
          const minDisplayTime = 4000; // 4秒
          const remainingTime = Math.max(0, minDisplayTime - elapsed);

          console.log(`⏱️ End video elapsed: ${elapsed}ms, remaining: ${remainingTime}ms`);

          // 結果を保留
          pendingResultsRef.current = data;

          // 残り時間だけ待ってから遷移
          setTimeout(() => {
            setShowEndVideo(false);
            setTimeout(() => {
              console.log('🚀 Navigating to results page...');
              router.push(`/results?sessionId=${sessionId}`);
            }, 500);
          }, remainingTime);
        } else {
          // end動画が表示されていない場合は即座に遷移
          console.log('🚀 Navigating to results page immediately...');
          router.push(`/results?sessionId=${sessionId}`);
        }
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

  // スコアが更新されるたびに履歴に記録
  useEffect(() => {
    if (isRunning && sessionStartTimeRef.current) {
      const timestamp = Date.now() - sessionStartTimeRef.current;
      const expressionScore = faceDetections?.score || 0;

      setScoreHistory(prev => {
        const newHistory = [...prev, {
          timestamp,
          audioScore: ((audioScore / 70) * 100),
          expressionScore
        }];
        scoreHistoryRef.current = newHistory; // Refも更新
        console.log('📊 Score history updated, length:', newHistory.length);
        return newHistory;
      });
    }
  }, [audioScore, faceDetections?.score, isRunning]);


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

    // start動画を表示
    setShowStartVideo(true);

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

    // セッション開始時刻を記録
    sessionStartTimeRef.current = Date.now();

    // スコア履歴をリセット
    setScoreHistory([]);
    scoreHistoryRef.current = [];
    console.log('📊 Score history reset');

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
    console.log('🛑 Group ID:', groupId);
    console.log('🛑 Is Master:', isMaster);
    setIsRunning(false);

    // スコア履歴をlocalStorageに保存（Refから最新の値を取得）
    if (groupId) {
      const scoreHistoryKey = `scoreHistory_${sessionId}_${groupId}`;
      const historyToSave = scoreHistoryRef.current;
      console.log('📊 Saving score history from handleSessionEnd, length:', historyToSave.length);
      console.log('📊 Score history sample:', historyToSave.slice(0, 3));
      localStorage.setItem(scoreHistoryKey, JSON.stringify(historyToSave));
      console.log('✅ Score history saved to localStorage:', scoreHistoryKey);
    }

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

    // end動画を表示（タイムスタンプを記録）
    endVideoStartTimeRef.current = Date.now();
    console.log('🎬 Setting showEndVideo to true');
    console.log('🎬 Group ID:', groupId);
    console.log('🎬 Is Master:', isMaster);
    setShowEndVideo(true);
    console.log('🎬 showEndVideo state updated');
  };

  // start動画終了後のコールバック
  const handleStartVideoComplete = () => {
    console.log('Start video completed, starting camera and audio');
    setShowStartVideo(false);
    handleStart();
  };

  // end動画終了後のコールバック（動画はsession_resultsまで表示し続ける）
  const handleEndVideoComplete = () => {
    console.log('End video completed, waiting for session_results');
    // 動画を非表示にせず、session_resultsイベントを待つ
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const faceIcon = getFaceIcon(faceDetections?.score);

  return (
    <div className="min-h-screen p-4">
      <CirclesBackground  />
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* ヘッダー */}
          {isRunning && (
             <div className="mt-6 mb-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <p className="text-green-800 font-semibold">音声と表情をリアルタイムで分析中...</p>
                </div>
              </div>
          )}


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

      {/* Start動画 */}
      {showStartVideo && (
        <VideoTransition
          type="start"
          onComplete={handleStartVideoComplete}
        />
      )}

      {/* End動画 */}
      {showEndVideo && (
        <VideoTransition
          type="end"
          onComplete={handleEndVideoComplete}
        />
      )}
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
