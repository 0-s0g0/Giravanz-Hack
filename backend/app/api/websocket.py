import base64
import numpy as np
from datetime import datetime
import logging
from app.analyzers.audio_analyzer import analyze_audio_volume
from app.analyzers.expression_analyzer import ExpressionAnalyzer

logger = logging.getLogger(__name__)

def register_socketio_handlers(sio, sessions, session_data):
    """Socket.IO event handlers"""

    expression_analyzer = ExpressionAnalyzer()

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
            logger.info(f"Client {sid} monitoring session {session_id}")

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
                    'expression_scores': [],
                    'timestamps': []
                }
                logger.warning(f"Group {group_id} was not initialized, created now")

            audio_bytes = base64.b64decode(audio_base64)

            session_data[session_id]['audio_data'][group_id].append({
                'data': audio_bytes,
                'timestamp': timestamp
            })

            volume = analyze_audio_volume(audio_bytes) * 100
            session_data[session_id]['analysis_results'][group_id]['audio_volumes'].append(volume)
            session_data[session_id]['analysis_results'][group_id]['timestamps'].append(timestamp)

            logger.debug(f"Audio stream from group {group_id}, volume: {volume}")

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
                    'expression_scores': [],
                    'timestamps': []
                }
                logger.warning(f"Group {group_id} was not initialized in video_frame, created now")

            frame_bytes = base64.b64decode(frame_base64)
            nparr = np.frombuffer(frame_bytes, np.uint8)

            if len(session_data[session_id]['video_frames'][group_id]) >= 10:
                session_data[session_id]['video_frames'][group_id].pop(0)

            session_data[session_id]['video_frames'][group_id].append({
                'data': nparr,
                'timestamp': timestamp
            })

            # 顔検出付きで分析
            detection_result = expression_analyzer.analyze_frame_with_detection(nparr)

            if detection_result is not None:
                expression_score = detection_result['score']
                session_data[session_id]['analysis_results'][group_id]['expression_scores'].append(expression_score)

                # 顔検出データをクライアントに送信
                await sio.emit('face_detection', {
                    'group_id': group_id,
                    'faces': detection_result['faces'],
                    'face_count': detection_result['face_count'],
                    'score': expression_score,
                    'image_width': detection_result['image_width'],
                    'image_height': detection_result['image_height']
                }, room=f"{session_id}_{group_id}")

            logger.debug(f"Video frame from group {group_id}")

        except Exception as e:
            logger.error(f"Error processing video: {e}", exc_info=True)

    @sio.event
    async def session_end(sid, data):
        """End session and analyze"""
        try:
            session_id = data.get('session_id')

            if session_id not in sessions:
                await sio.emit('error', {'message': 'Session not found'}, room=sid)
                return

            results = []
            for group_id, group_info in sessions[session_id]['groups'].items():
                analysis_data = session_data[session_id]['analysis_results'].get(group_id, {})

                audio_volumes = analysis_data.get('audio_volumes', [])
                avg_volume = np.mean(audio_volumes) if audio_volumes else 0
                active_count = len([v for v in audio_volumes if v > 30])
                activity_ratio = (active_count / len(audio_volumes)) if audio_volumes else 0
                audio_score = min(100, avg_volume * 0.6 + activity_ratio * 100 * 0.4)

                expression_scores = analysis_data.get('expression_scores', [])
                expression_score = np.mean(expression_scores) if expression_scores else 0

                total_score = (audio_score * 0.6) + (expression_score * 0.4)

                timestamps = analysis_data.get('timestamps', [])
                best_moment = None
                if timestamps and audio_volumes:
                    best_idx = np.argmax(audio_volumes)
                    best_moment = timestamps[best_idx]

                results.append({
                    'group_id': group_id,
                    'group_name': group_info['group_name'],
                    'audio_score': round(audio_score, 2),
                    'expression_score': round(expression_score, 2),
                    'total_score': round(total_score, 2),
                    'audio_details': {
                        'avg_volume': round(avg_volume, 2),
                        'max_volume': round(np.max(audio_volumes), 2) if audio_volumes else 0,
                        'activity_count': active_count
                    },
                    'expression_details': {
                        'avg_score': round(np.mean(expression_scores), 2) if expression_scores else 0,
                        'max_score': round(np.max(expression_scores), 2) if expression_scores else 0
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

            # 全グループに結果を送信（セッション全体のルームに送信）
            await sio.emit('session_results', final_result, room=f"session_{session_id}")

            logger.info(f"Session {session_id} ended, winner: {winner_group_id}")

        except Exception as e:
            logger.error(f"Error ending session: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
