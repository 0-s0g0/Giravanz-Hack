from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class SessionConfig(BaseModel):
    """�÷��-�"""
    num_groups: int
    duration_minutes: int

class GroupCreate(BaseModel):
    """����\"""
    session_id: str
    group_id: str
    group_name: str

class AudioData(BaseModel):
    """�����"""
    session_id: str
    group_id: str
    audio_base64: str
    timestamp: float

class VideoFrame(BaseModel):
    """�;����"""
    session_id: str
    group_id: str
    frame_base64: str
    timestamp: float

class AnalysisResult(BaseModel):
    """�P�"""
    group_id: str
    group_name: str
    audio_score: float  # ��nۊ
L���� (0-100)
    expression_score: float  # hŹ�� (0-100)
    total_score: float  # ���� (0-100)
    audio_details: Dict  # ���ns0
    expression_details: Dict  # h��ns0
    best_moment_timestamp: Optional[float]  # ٹ�j��n��๿��

class SessionResult(BaseModel):
    """�÷��P�"""
    session_id: str
    results: List[AnalysisResult]
    winner_group_id: str
    created_at: datetime
