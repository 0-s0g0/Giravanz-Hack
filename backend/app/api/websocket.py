import base64
import numpy as np
import cv2
from datetime import datetime
import logging
from app.analyzers.audio_analyzer import AudioAnalyzer
from app.analyzers.expression_analyzer import ExpressionAnalyzer

logger = logging.getLogger(__name__)

def register_socketio_handlers(sio, sessions, session_data):
    """Socket.IO event handlers"""

    # アナライザーのインスタンスを作成
    # セッションごとにハイスコアを管理する場合は、セッション作成時に初期化
    audio_analyzers = {}  # session_id -> AudioAnalyzer
    expression_analyzer = ExpressionAnalyzer()

    # セッション終了フラグ（重複実行を防ぐ）
    session_ended = set()  # 終了済みのsession_idを記録

    @sio.event
    async def connect(sid, environ):
        """Client connected"""
        logger.info(f"Client connected: {sid}")
        await sio.emit('connected', {'sid': sid}, room=sid)

    @sio.event
    async def disconnect(sid):
        """Client disconnected"""
        logger.info(f"Client disconnected: {sid}")

    @sio.event
    async def create_session(sid, data):
        """Create new session"""
        session_id = data.get('session_id')
        num_groups = data.get('num_groups')
        duration_minutes = data.get('duration_minutes')

        # セッションが既に存在する場合は作成しない
        if session_id not in sessions:
            sessions[session_id] = {
                'num_groups': num_groups,
                'duration_minutes': duration_minutes,
                'groups': {},
                'created_at': datetime.now().isoformat()
            }

            session_data[session_id] = {
                'audio_data': {},
                'video_frames': {},
                'analysis_results': {}
            }

            # セッションごとにAudioAnalyzerを作成
            audio_analyzers[session_id] = AudioAnalyzer()

            logger.info(f"Session created: {session_id}")
        else:
            logger.info(f"Session already exists: {session_id}")

        await sio.emit('session_created', {'session_id': session_id}, room=sid)

    @sio.event
    async def join_group(sid, data):
        """Join a group"""
        session_id = data.get('session_id')
        group_id = data.get('group_id')
        group_name = data.get('group_name')

        if session_id not in sessions:
            await sio.emit('error', {'message': 'Session not found'}, room=sid)
            return

        sessions[session_id]['groups'][group_id] = {
            'group_name': group_name,
            'members': [],
            'ready': False
        }

        await sio.enter_room(sid, f"{session_id}_{group_id}")

        if group_id not in session_data[session_id]['audio_data']:
            session_data[session_id]['audio_data'][group_id] = []
        if group_id not in session_data[session_id]['video_frames']:
            session_data[session_id]['video_frames'][group_id] = []
        if group_id not in session_data[session_id]['analysis_results']:
            session_data[session_id]['analysis_results'][group_id] = {
                'audio_volumes': [],
                'audio_scores': [],
                'audio_details': [],
                'expression_scores': [],
                'timestamps': []
            }

        logger.info(f"Client {sid} joined group {group_id} in session {session_id}")

        # グループ参加を通知（このセッションの全クライアントに）
        await sio.emit('group_joined', {
            'group_id': group_id,
            'group_name': group_name
        }, room=f"session_{session_id}")

        await sio.emit('joined_group', {
            'session_id': session_id,
            'group_id': group_id,
            'group_name': group_name
        }, room=sid)

    @sio.event
    async def monitor_session(sid, data):
        """Monitor session for group status updates"""
        session_id = data.get('session_id')
        if session_id:
            await sio.enter_room(sid, f"session_{session_id}")
            logger.info(f"Client {sid} entered room: session_{session_id} for monitoring")

    @sio.event
    async def group_ready(sid, data):
        """Mark group as ready"""
        session_id = data.get('session_id')
        group_id = data.get('group_id')

        if session_id not in sessions:
            await sio.emit('error', {'message': 'Session not found'}, room=sid)
            return

        if group_id not in sessions[session_id]['groups']:
            await sio.emit('error', {'message': 'Group not found'}, room=sid)
            return

        sessions[session_id]['groups'][group_id]['ready'] = True
        logger.info(f"Group {group_id} in session {session_id} is ready")

        # 全グループの準備状態をマスターに通知
        ready_status = {
            gid: ginfo['ready']
            for gid, ginfo in sessions[session_id]['groups'].items()
        }

        await sio.emit('groups_ready_status', {
            'ready_status': ready_status
        }, room=f"session_{session_id}")

    @sio.event
    async def start_session(sid, data):
        """Master starts the session for all groups"""
        session_id = data.get('session_id')

        if session_id not in sessions:
            await sio.emit('error', {'message': 'Session not found'}, room=sid)
            return

        logger.info(f"Session {session_id} starting by master")

        # 全グループに開始を通知
        await sio.emit('session_started', {
            'session_id': session_id,
            'start_time': datetime.now().isoformat()
        }, room=f"session_{session_id}")

    @sio.event
    async def audio_stream(sid, data):
        """Receive audio stream"""
        try:
            session_id = data.get('session_id')
            group_id = data.get('group_id')
            audio_base64 = data.get('audio_data')
            timestamp = data.get('timestamp')

            if not all([session_id, group_id, audio_base64]):
                return

            # セッションまたはグループが存在しない場合は初期化
            if session_id not in session_data:
                logger.warning(f"Session {session_id} not found in audio_stream")
                return

            if group_id not in session_data[session_id]['audio_data']:
                session_data[session_id]['audio_data'][group_id] = []
                session_data[session_id]['analysis_results'][group_id] = {
                    'audio_volumes': [],
                    'audio_scores': [],
                    'audio_details': [],
                    'expression_scores': [],
                    'timestamps': []
                }
                logger.warning(f"Group {group_id} was not initialized, created now")

            audio_bytes = base64.b64decode(audio_base64)

            # バイト配列をnumpy配列に変換（周波数データとして）
            frequency_data = np.frombuffer(audio_bytes, dtype=np.uint8)

            session_data[session_id]['audio_data'][group_id].append({
                'data': audio_bytes,
                'timestamp': timestamp
            })

            # AudioAnalyzerを使用して詳細な分析を実行
            if session_id not in audio_analyzers:
                audio_analyzers[session_id] = AudioAnalyzer()

            analyzer = audio_analyzers[session_id]
            # 周波数データから直接分析
            analysis_result = analyzer.analyze_frequency_data(frequency_data)

            if analysis_result:
                # 最終スコアを保存
                final_score = analysis_result['final_score']
                session_data[session_id]['analysis_results'][group_id]['audio_scores'].append(final_score)

                # 詳細情報を保存
                session_data[session_id]['analysis_results'][group_id]['audio_details'].append({
                    'db_value': analysis_result['db_value'],
                    'initial_score': analysis_result['initial_score'],
                    'high_freq_percentage': analysis_result['high_freq_percentage'],
                    'final_score': final_score,
                    'is_new_high': analysis_result['is_new_high']
                })

                # 後方互換性のため、従来のvolume値も保存
                volume = min(final_score, 100)
                session_data[session_id]['analysis_results'][group_id]['audio_volumes'].append(volume)

                logger.debug(
                    f"Audio stream from group {group_id}: "
                    f"score={final_score:.2f}, "
                    f"dB={analysis_result['db_value']:.2f}, "
                    f"high_freq%={analysis_result['high_freq_percentage']:.2f}"
                )

                # リアルタイムスコアをクライアントに送信
                await sio.emit('audio_analysis_update', {
                    'group_id': group_id,
                    'current_score': round(final_score, 2),
                    'db_value': round(analysis_result['db_value'], 2),
                    'high_freq_percentage': round(analysis_result['high_freq_percentage'], 2),
                    'is_new_high': analysis_result['is_new_high'],
                    'high_score': round(analysis_result['high_score'], 2),
                    'timestamp': timestamp
                }, room=f"{session_id}_{group_id}")
            else:
                # 分析失敗時はデフォルト値
                session_data[session_id]['analysis_results'][group_id]['audio_scores'].append(0)
                session_data[session_id]['analysis_results'][group_id]['audio_volumes'].append(0)
                logger.warning(f"Audio analysis failed for group {group_id}")

            session_data[session_id]['analysis_results'][group_id]['timestamps'].append(timestamp)

            # ログ出力（データは短縮）
            logger.debug(
                f"Audio stream from group {group_id} received. "
                f"Base64 length: {len(audio_base64)}, "
                f"Bytes size: {len(audio_bytes)}."
            )

        except Exception as e:
            logger.error(f"Error processing audio: {e}", exc_info=True)

    @sio.event
    async def video_frame(sid, data):
        """Receive video frame"""
        try:
            session_id = data.get('session_id')
            group_id = data.get('group_id')
            frame_base64 = data.get('frame_data')
            timestamp = data.get('timestamp')

            if not all([session_id, group_id, frame_base64]):
                return

            # セッションまたはグループが存在しない場合は初期化
            if session_id not in session_data:
                logger.warning(f"Session {session_id} not found in video_frame")
                return

            if group_id not in session_data[session_id]['video_frames']:
                session_data[session_id]['video_frames'][group_id] = []
                session_data[session_id]['analysis_results'][group_id] = {
                    'audio_volumes': [],
                    'audio_scores': [],
                    'audio_details': [],
                    'expression_scores': [],
                    'timestamps': []
                }
                logger.warning(f"Group {group_id} was not initialized in video_frame, created now")

            frame_bytes = base64.b64decode(frame_base64)
            nparr = np.frombuffer(frame_bytes, np.uint8)

            # 画像をデコード（JPEG/PNGバイト列 → numpy配列）
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if frame is None:
                logger.warning(f"Failed to decode image for group {group_id}")
                return

            if len(session_data[session_id]['video_frames'][group_id]) >= 10:
                session_data[session_id]['video_frames'][group_id].pop(0)

            session_data[session_id]['video_frames'][group_id].append({
                'data': frame,
                'timestamp': timestamp
            })

            # 顔検出付きで分析
            detection_result = expression_analyzer.analyze_frame_with_detection(frame)

            if detection_result is not None:
                expression_score = detection_result['score']
                session_data[session_id]['analysis_results'][group_id]['expression_scores'].append(expression_score)

                # 顔検出データをクライアントに送信
                logger.info(
                    f"Face detection for group {group_id}: "
                    f"face_count={detection_result['face_count']}, "
                    f"score={expression_score:.2f}"
                )
                await sio.emit('face_detection', {
                    'group_id': group_id,
                    'faces': detection_result['faces'],
                    'face_count': detection_result['face_count'],
                    'score': expression_score,
                    'image_width': detection_result['image_width'],
                    'image_height': detection_result['image_height']
                }, room=f"{session_id}_{group_id}")
            else:
                logger.debug(f"No face detected for group {group_id}")

            # ログ出力（データは短縮）
            logger.debug(
                f"Video frame from group {group_id} received. "
            )

        except Exception as e:
            logger.error(f"Error processing video: {e}", exc_info=True)

    @sio.event
    async def session_end(sid, data):
        """End session and analyze"""
        try:
            session_id = data.get('session_id')

            logger.info(f"session_end called by {sid} for session {session_id}")

            if session_id not in sessions:
                logger.error(f"Session {session_id} not found")
                await sio.emit('error', {'message': 'Session not found'}, room=sid)
                return

            # 既に終了処理が行われている場合はスキップ
            if session_id in session_ended:
                logger.info(f"Session {session_id} already ended, skipping duplicate request")
                return

            # 終了フラグを設定
            session_ended.add(session_id)
            logger.info(f"Processing session end for {session_id}")

            results = []
            for group_id, group_info in sessions[session_id]['groups'].items():
                analysis_data = session_data[session_id]['analysis_results'].get(group_id, {})

                # 新しいaudio_scoresを使用（なければ従来のaudio_volumesにフォールバック）
                audio_scores = analysis_data.get('audio_scores', [])
                if not audio_scores:
                    audio_scores = analysis_data.get('audio_volumes', [])

                # 音声スコアの平均を計算（float()でPythonネイティブ型に変換）
                avg_audio_score = float(np.mean(audio_scores)) if audio_scores else 0.0
                max_audio_score = float(np.max(audio_scores)) if audio_scores else 0.0

                # 詳細情報を取得
                audio_details_list = analysis_data.get('audio_details', [])
                avg_db = float(np.mean([d['db_value'] for d in audio_details_list])) if audio_details_list else 0.0
                avg_high_freq = float(np.mean([d['high_freq_percentage'] for d in audio_details_list])) if audio_details_list else 0.0

                # 音声スコアはaudioscore.pyのアルゴリズムを使用（0-100点）
                audio_score = float(min(100, avg_audio_score))

                expression_scores = analysis_data.get('expression_scores', [])
                expression_score = float(np.mean(expression_scores)) if expression_scores else 0.0

                total_score = float((audio_score * 0.6) + (expression_score * 0.4))

                timestamps = analysis_data.get('timestamps', [])
                best_moment = None
                if timestamps and audio_scores:
                    best_idx = int(np.argmax(audio_scores))  # int()で変換
                    best_moment = int(timestamps[best_idx]) if best_idx < len(timestamps) else None

                results.append({
                    'group_id': group_id,
                    'group_name': group_info['group_name'],
                    'audio_score': round(audio_score, 2),
                    'expression_score': round(expression_score, 2),
                    'total_score': round(total_score, 2),
                    'audio_details': {
                        'avg_score': round(avg_audio_score, 2),
                        'max_score': round(max_audio_score, 2),
                        'avg_db': round(avg_db, 2),
                        'avg_high_freq_percentage': round(avg_high_freq, 2),
                        'sample_count': len(audio_scores)
                    },
                    'expression_details': {
                        'avg_score': round(float(np.mean(expression_scores)), 2) if expression_scores else 0.0,
                        'max_score': round(float(np.max(expression_scores)), 2) if expression_scores else 0.0
                    },
                    'best_moment_timestamp': best_moment
                })

            results.sort(key=lambda x: x['total_score'], reverse=True)
            winner_group_id = results[0]['group_id'] if results else None

            final_result = {
                'session_id': session_id,
                'results': results,
                'winner_group_id': winner_group_id,
                'created_at': datetime.now().isoformat()
            }

            logger.info(f"Session {session_id} ended, winner: {winner_group_id}")
            logger.info(f"Sending session_results to room: session_{session_id}")
            logger.info(f"Results: {len(results)} groups analyzed")

            # 全グループに結果を送信（セッション全体のルームに送信）
            await sio.emit('session_results', final_result, room=f"session_{session_id}")

            # 個別のクライアントにも送信（念のため）
            await sio.emit('session_results', final_result, room=sid)

            logger.info(f"session_results emitted successfully for session {session_id}")

        except Exception as e:
            logger.error(f"Error ending session: {e}", exc_info=True)
            # エラー時は終了フラグを解除
            if session_id in session_ended:
                session_ended.remove(session_id)
            await sio.emit('error', {'message': str(e)}, room=sid)
