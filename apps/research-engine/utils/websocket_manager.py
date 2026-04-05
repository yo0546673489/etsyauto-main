# apps/new-store/utils/websocket_manager.py

from fastapi import WebSocket
from typing import Dict, List
import json

class WebSocketManager:
    """
    מנהל WebSocket connections לפי job_id.
    אם המשתמש מתנתק ומתחבר מחדש — אוטומטי.
    """

    def __init__(self):
        self.connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, job_id: str):
        await websocket.accept()
        if job_id not in self.connections:
            self.connections[job_id] = []
        self.connections[job_id].append(websocket)

    def disconnect(self, websocket: WebSocket, job_id: str):
        if job_id in self.connections:
            self.connections[job_id].remove(websocket)

    async def send(self, job_id: str, data: dict):
        """שולח לכל המחוברים ל-job זה"""
        if job_id not in self.connections:
            return

        message = json.dumps(data, ensure_ascii=False)
        dead = []

        for ws in self.connections[job_id]:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        # מנקה חיבורים מתים
        for ws in dead:
            self.connections[job_id].remove(ws)
