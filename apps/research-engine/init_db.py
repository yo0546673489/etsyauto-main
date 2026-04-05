import sys
sys.path.insert(0, ".")
from db.database import init_db
init_db()
print("DB tables created successfully")
