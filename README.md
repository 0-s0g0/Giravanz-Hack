# リアルタイムグループ盛り上がり分析アプリ

## 🎯 概要
グループの盛り上がり度を音声と表情からリアルタイム分析

## 📁 プロジェクト構成
```
realtime-group-analyzer/
├── frontend/          # Next.js (TypeScript + Tailwind)
├── backend/           # FastAPI (Python)
│   └── app/
│       └── analyzers/ # ★分析ロジック実装箇所★
│           ├── audio_analyzer.py      # 音量測定
│           └── expression_analyzer.py # 表情分析
└── docker-compose.yml
```

## 🚀 起動方法

### Docker使用（推奨）
```bash
docker-compose up --build
```

### 個別起動
```bash
# Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm run dev
```

## 🔗 アクセス
- フロントエンド: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## 📝 分析ロジック実装ガイド

### `backend/app/analyzers/audio_analyzer.py`
```python
def analyze_audio_volume(audio_data: bytes) -> float:
    # 音量レベルを 0.0 ~ 1.0 で返す
    pass
```

### `backend/app/analyzers/expression_analyzer.py`
```python
def analyze_expression(image_data: bytes) -> float:
    # 表情スコアを 0.0 ~ 1.0 で返す
    pass
```

## 🌐 無料デプロイ先
- **Frontend**: Vercel
- **Backend**: Render.com / Railway.app / Fly.io

## 📦 主要技術
- Next.js 14 (App Router)
- FastAPI
- WebRTC
- WebSocket
- Docker
# Giravanz-Hack
