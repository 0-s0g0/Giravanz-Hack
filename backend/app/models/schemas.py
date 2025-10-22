from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class SessionConfig(BaseModel):
    """セッション設定"""
    num_groups: int
    duration_minutes: int

class GroupCreate(BaseModel):
    """グループ作成"""
    session_id: str
    group_id: str
    group_name: str

class AudioData(BaseModel):
    """音声データ"""
    session_id: str
    group_id: str
    audio_base64: str
    timestamp: float

class VideoFrame(BaseModel):
    """動画フレーム"""
    session_id: str
    group_id: str
    frame_base64: str
    timestamp: float

class AnalysisResult(BaseModel):
    """分析結果"""
    group_id: str
    group_name: str
    audio_score: float  # 音声スコア (0-100)
    expression_score: float  # 表情スコア (0-100)
    total_score: float  # 総合スコア (0-100)
    audio_details: Dict  # 音声詳細情報
    expression_details: Dict  # 表情詳細情報
    best_moment_timestamp: Optional[float]  # 最も盛り上がったタイムスタンプ

class SessionResult(BaseModel):
    """セッション分析結果"""
    session_id: str
    results: List[AnalysisResult]
    winner_group_id: str
    created_at: datetime
