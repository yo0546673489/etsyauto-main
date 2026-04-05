# apps/new-store/config.py

import os

# ═══ שרתים ═══
LINUX_SERVER_URL = "http://76.13.137.252"        # שרת האתר
WINDOWS_SERVER_PORT = 8001                        # הפורט שלנו
INTERNAL_API_KEY = os.environ["INTERNAL_API_KEY"] # מפתח סודי

# ═══ Sessions (כל הכלים נכנסים ישירות עם session שמור) ═══
ALURA_SESSION_PATH = "sessions/alura_session.json"
ERANK_SESSION_PATH = "sessions/erank_session.json"
ETSY_SESSION_PATH  = "sessions/etsy_session.json"

# ═══ APIs ═══
GEMINI_API_KEY    = os.environ["GEMINI_API_KEY"]
PHOTOROOM_API_KEY = os.environ["PHOTOROOM_API_KEY"]  # Live key
ETSY_API_KEY      = os.environ["ETSY_API_KEY"]       # ShopPilot key

# ═══ Database ═══
DATABASE_URL = os.environ["DATABASE_URL"]  # PostgreSQL

# ═══ Etsy API ═══
ETSY_BASE_URL = "https://api.etsy.com/v3/application"
ETSY_MAX_REQUESTS_PER_JOB = 200  # לא לעבור זה לעולם

# ═══ Gemini ═══
GEMINI_MODEL = "gemini-2.5-flash-lite"  # חינמי — 1000/יום
GEMINI_MAX_REQUESTS_PER_JOB = 150       # שמור בטוח

# ═══ Photoroom ═══
PHOTOROOM_BASE_URL = "https://image-api.photoroom.com/v2"
IMAGES_PER_PRODUCT = 5

# ═══ עיכובים (אנטי-חסימה) ═══
DELAY_BETWEEN_ALURA_REQUESTS = (8, 15)   # שניות — רנדומלי
DELAY_BETWEEN_ERANK_REQUESTS  = (5, 12)
DELAY_BETWEEN_ETSY_SCRAPES    = (3, 7)
DELAY_BETWEEN_PRODUCTS        = (30, 60) # בין מוצר למוצר

# ═══ מספרי מוצרים ═══
PRODUCTS_PER_STORE = 30

# ═══ Playwright — נתיב ל-headless shell שעובד על Windows Server ═══
CHROMIUM_EXECUTABLE = (
    r"C:\Users\Administrator\AppData\Local\ms-playwright"
    r"\chromium_headless_shell-1169\chrome-win\headless_shell.exe"
)
