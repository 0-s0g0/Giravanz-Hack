from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import socketio

# FastAPIアプリケーション
app = FastAPI(title="Giravanz Hack API")

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Socket.IOサーバー作成
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    cors_credentials=True,
    logger=True,
    engineio_logger=True
)

# Socket.IOをFastAPIにマウント
socket_app = socketio.ASGIApp(sio, app)

# セッション管理（本番環境ではRedisなどを使用）
sessions = {}
session_data = {}  # セッションごとの分析データを保存

@app.get("/")
async def root():
    return {"message": "Giravanz Hack API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Socket.IOイベントハンドラーを登録
from app.api.websocket import register_socketio_handlers
register_socketio_handlers(sio, sessions, session_data)
