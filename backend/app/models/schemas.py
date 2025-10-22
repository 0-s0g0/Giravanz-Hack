from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

class SessionConfig(BaseModel):
    """»Ã·çó-š"""
    num_groups: int
    duration_minutes: int

class GroupCreate(BaseModel):
    """°ëü×\"""
    session_id: str
    group_id: str
    group_name: str

class AudioData(BaseModel):
    """óğÇü¿"""
    session_id: str
    group_id: str
    audio_base64: str
    timestamp: float

class VideoFrame(BaseModel):
    """Õ;Õìüà"""
    session_id: str
    group_id: str
    frame_base64: str
    timestamp: float

class AnalysisResult(BaseModel):
    """Pœ"""
    group_id: str
    group_name: str
    audio_score: float  # óğnÛŠ
LŠ¹³¢ (0-100)
    expression_score: float  # hÅ¹³¢ (0-100)
    total_score: float  # Ï¹³¢ (0-100)
    audio_details: Dict  # óğns0
    expression_details: Dict  # hÅns0
    best_moment_timestamp: Optional[float]  # Ù¹Èj¬“n¿¤à¹¿ó×

class SessionResult(BaseModel):
    """»Ã·çóPœ"""
    session_id: str
    results: List[AnalysisResult]
    winner_group_id: str
    created_at: datetime
