# 盛り上がり分析アプリ

## 概要
グループの盛り上がり度を音声と表情からリアルタイム分析

## 📁 プロジェクト構成
```
realtime-group-analyzer/
├── frontend/          # Next.js (TypeScript + Tailwind)
├── backend/           # FastAPI (Python)
│   └── app/
│       └── analyzers/ # ★分析ロジック実装箇所★
│           ├── audio_analyzer.py      # 音量測定(下平くん)
│           └── expression_analyzer.py # 表情分析(ぞのくん)
└── docker-compose.yml
```

## 起動方法

### Docker使用（できれば）
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

## アクセス
- フロントエンド: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
