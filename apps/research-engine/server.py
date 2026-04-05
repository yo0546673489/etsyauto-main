# apps/new-store/server.py
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import asyncio
import random
import uuid
import json

from config import INTERNAL_API_KEY, WINDOWS_SERVER_PORT
from db.database import init_db
from utils.websocket_manager import WebSocketManager
from research.niche_finder import NicheFinder
from research.sub_niche_validator import SubNicheValidator
from research.product_selector import ProductSelector
from content.title_generator import TitleGenerator
from content.tags_generator import TagsGenerator
from content.description_generator import DescriptionGenerator
from images.image_downloader import ImageDownloader
from images.photoroom_processor import PhotoroomProcessor

app = FastAPI(title="Profix New Store Engine")
ws_manager = WebSocketManager()

# CORS — רק שרת Linux מורשה
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://76.13.137.252", "http://185.241.4.225", "https://profix-ai.com", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══ Security Middleware ═══
def verify_api_key(x_internal_key: str = Header(...)):
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")
    return True

# ═══ Models ═══
class StartResearchRequest(BaseModel):
    price_min: int = 50
    price_max: int = 150
    category: Optional[str] = None  # אופציונלי — אם None, רנדומלי

class JobStatus(BaseModel):
    job_id: str
    status: str  # pending | running | done | error
    progress: int  # 0-100
    current_step: str
    products_ready: int

# ═══ Jobs in memory (+ DB כגיבוי) ═══
active_jobs = {}

# ═══ Endpoints ═══

@app.post("/research/start")
async def start_research(
    request: StartResearchRequest,
    authorized: bool = Depends(verify_api_key)
):
    """מתחיל מחקר חדש ומחזיר job_id"""
    job_id = str(uuid.uuid4())

    active_jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "current_step": "מאתחל...",
        "products_ready": 0,
        "params": request.dict()
    }

    # מריץ ברקע — לא חוסם
    asyncio.create_task(run_full_pipeline(job_id, request))

    return {"job_id": job_id, "status": "pending"}


@app.get("/research/{job_id}/status")
async def get_status(
    job_id: str,
    authorized: bool = Depends(verify_api_key)
):
    """Polling endpoint — מחזיר סטטוס נוכחי"""
    if job_id not in active_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return active_jobs[job_id]


@app.get("/products")
async def get_products(
    limit: int = 30,
    job_id: str = None,
    from_: int = 0,
    authorized: bool = Depends(verify_api_key)
):
    """מחזיר מוצרים מוכנים מה-DB"""
    import json as _json
    from db.database import SessionLocal
    from db.models import ReadyProduct
    db = SessionLocal()
    query = db.query(ReadyProduct).order_by(ReadyProduct.created_at.asc())
    if job_id:
        query = query.filter(ReadyProduct.job_id == job_id)
    if from_:
        query = query.offset(from_)
    products = query.limit(limit).all()
    db.close()
    return [
        {
            "id": p.id,
            "title": p.title,
            "tags": _json.loads(p.tags) if isinstance(p.tags, str) else p.tags,
            "description": p.description,
            "images": _json.loads(p.images) if isinstance(p.images, str) else p.images,
            "price": p.price,
            "niche": p.niche,
            "created_at": str(p.created_at),
        }
        for p in products
    ]


@app.websocket("/research/{job_id}/ws")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    """WebSocket — עדכונים real-time"""
    # בדיקת API key דרך query param (WebSocket לא תומך ב-headers)
    api_key = websocket.query_params.get("key")
    if api_key != INTERNAL_API_KEY:
        await websocket.close(code=4003)
        return

    await ws_manager.connect(websocket, job_id)
    try:
        while True:
            # שומר חיבור חי
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, job_id)


@app.get("/health")
async def health_check():
    return {"status": "ok", "active_jobs": len(active_jobs)}


# ═══ Pipeline ═══

async def run_full_pipeline(job_id: str, params: StartResearchRequest):
    """
    ה-pipeline המלא — רץ ברקע.
    כל מוצר שמוכן נשלח ב-WebSocket מיד.
    כל שלב נשמר ב-DB — אם נפל, ממשיכים מאיפה שעצרנו.
    """

    async def update(step: str, progress: int):
        """עדכון סטטוס + שליחה ב-WebSocket"""
        active_jobs[job_id]["current_step"] = step
        active_jobs[job_id]["progress"] = progress
        active_jobs[job_id]["status"] = "running"

        await ws_manager.send(job_id, {
            "type": "progress",
            "step": step,
            "progress": progress
        })

    async def send_product(product: dict):
        """שולח מוצר מוכן ב-WebSocket + שומר ב-DB"""
        active_jobs[job_id]["products_ready"] += 1

        await ws_manager.send(job_id, {
            "type": "product_ready",
            "product": product,
            "products_ready": active_jobs[job_id]["products_ready"]
        })

        # שמירה ל-DB
        try:
            from db.database import SessionLocal
            from db.models import ReadyProduct
            import json as _json
            db = SessionLocal()
            db_product = ReadyProduct(
                id=product["id"],
                job_id=job_id,
                title=product["title"],
                tags=_json.dumps(product["tags"], ensure_ascii=False),
                description=product["description"],
                images=_json.dumps(product["images"], ensure_ascii=False),
                price=product["price"],
                niche=product["source_niche"],
                sent_to_ui=False,
                uploaded=False,
            )
            db.add(db_product)
            db.commit()
            db.close()
        except Exception as db_err:
            print(f"DB save error: {db_err}")

    try:
        # ══ שלב 1: מחקר נישה ══
        await update("מחפש נישות פוטנציאליות...", 5)

        niche_finder = NicheFinder()
        niches = await niche_finder.find_niches(
            price_min=params.price_min,
            price_max=params.price_max,
            category=params.category  # None = רנדומלי
        )

        await update(f"נמצאו {len(niches)} נישות — מאמת...", 15)

        # ══ שלב 2: ולידציה תת-נישה ══
        validator = SubNicheValidator()
        best_sub_niche = await validator.validate_and_select(niches)

        await update(f"✅ נישה נבחרה: {best_sub_niche['name']}", 25)
        await ws_manager.send(job_id, {
            "type": "niche_selected",
            "niche": best_sub_niche
        })

        # ══ שלב 3: בחירת מוצרים + ניתוח תמונות ══
        await update("מנתח מוצרים מצליחים...", 30)

        selector = ProductSelector()
        products_data = await selector.select_products(best_sub_niche)

        await update(f"נבחרו {len(products_data)} מוצרים — מכין תוכן...", 35)

        # ══ שלב 4: מוצר אחרי מוצר ══
        title_gen = TitleGenerator()
        tags_gen  = TagsGenerator()
        desc_gen  = DescriptionGenerator()
        img_dl    = ImageDownloader()
        photoroom = PhotoroomProcessor()

        for i, product_data in enumerate(products_data):
            progress = 35 + int((i / 30) * 60)
            await update(f"מכין מוצר {i+1} מתוך 30...", progress)

            # תוכן
            title       = await title_gen.generate(product_data, best_sub_niche)
            tags        = await tags_gen.generate(product_data, best_sub_niche)
            description = await desc_gen.generate(product_data, best_sub_niche)

            # תמונות
            raw_images   = await img_dl.download(product_data["source_url"], title=product_data.get("title", ""))
            final_images = await photoroom.process(
                images=raw_images,
                style_prompt=best_sub_niche["visual_style"],  # מהניתוח
                count=5
            )

            # מוצר מוכן — שולח מיד!
            product = {
                "id": f"{job_id}_{i}",
                "title": title,
                "tags": tags,
                "description": description,
                "images": final_images,
                "price": product_data.get("suggested_price", params.price_min),
                "source_niche": best_sub_niche["name"]
            }

            await send_product(product)

            # השהייה קצרה בין מוצרים
            await asyncio.sleep(2)

        # ══ סיום ══
        active_jobs[job_id]["status"] = "done"
        active_jobs[job_id]["progress"] = 100

        await ws_manager.send(job_id, {
            "type": "done",
            "total_products": 30,
            "niche": best_sub_niche["name"]
        })

    except Exception as e:
        active_jobs[job_id]["status"] = "error"
        active_jobs[job_id]["current_step"] = f"שגיאה: {str(e)}"

        await ws_manager.send(job_id, {
            "type": "error",
            "message": str(e)
        })


if __name__ == "__main__":
    import uvicorn
    init_db()
    uvicorn.run(app, host="0.0.0.0", port=WINDOWS_SERVER_PORT)
