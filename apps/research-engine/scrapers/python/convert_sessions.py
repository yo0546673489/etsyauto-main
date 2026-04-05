"""
ממיר cookies קיימים מ-C:/Windows/Temp לPlaywright storage_state format.
"""
import json
import os
import time
from urllib.parse import unquote

def parse_cookie_string(cookie_str: str, domain: str, secure: bool = True) -> list:
    """ממיר cookie string לרשימת Playwright cookie objects"""
    cookies = []
    for part in cookie_str.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, _, value = part.partition("=")
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        cookies.append({
            "name": name,
            "value": value,
            "domain": domain,
            "path": "/",
            "expires": int(time.time()) + 86400 * 30,  # 30 ימים מעכשיו
            "httpOnly": False,
            "secure": secure,
            "sameSite": "Lax"
        })
    return cookies

os.makedirs("sessions", exist_ok=True)

# ════════════════════════════════
# 1. ALURA SESSION
# ════════════════════════════════
try:
    with open("C:/Windows/Temp/alura_auth.json", "r", encoding="utf-8") as f:
        alura_data = json.load(f)

    alura_cookie_str = alura_data.get("cookies", "")
    alura_token = alura_data.get("token", "")

    alura_cookies = parse_cookie_string(alura_cookie_str, ".alura.io")

    # localStorage — שומר את הtoken
    alura_state = {
        "cookies": alura_cookies,
        "origins": [
            {
                "origin": "https://www.alura.io",
                "localStorage": [
                    {"name": "auth_token", "value": alura_token},
                    {"name": "firebase:authUser:AIzaSyCn9hBb7...:alura-io", "value": json.dumps({
                        "stsTokenManager": {
                            "accessToken": alura_token.replace("Bearer ", ""),
                            "expirationTime": (int(time.time()) + 3600) * 1000
                        }
                    })}
                ]
            }
        ]
    }

    with open("sessions/alura_session.json", "w", encoding="utf-8") as f:
        json.dump(alura_state, f, ensure_ascii=False, indent=2)
    print("OK Alura session created")

except Exception as e:
    print(f"FAIL Alura: {e}")


# ════════════════════════════════
# 2. eRank SESSION
# ════════════════════════════════
try:
    with open("C:/Windows/Temp/erank_auth.json", "r", encoding="utf-8") as f:
        erank_data = json.load(f)

    erank_cookie_str = erank_data.get("cookies", "")
    erank_xsrf = erank_data.get("xsrf", "")

    erank_cookies = parse_cookie_string(erank_cookie_str, "erank.com", secure=False)

    erank_state = {
        "cookies": erank_cookies,
        "origins": [
            {
                "origin": "https://erank.com",
                "localStorage": [
                    {"name": "XSRF-TOKEN", "value": erank_xsrf}
                ]
            }
        ]
    }

    with open("sessions/erank_session.json", "w", encoding="utf-8") as f:
        json.dump(erank_state, f, ensure_ascii=False, indent=2)
    print("OK eRank session created")

except Exception as e:
    print(f"FAIL eRank: {e}")


# ════════════════════════════════
# 3. ETSY SESSION (אם יש)
# ════════════════════════════════
try:
    etsy_cookies_file = "C:/Windows/Temp/etsy_session.json"
    if os.path.exists(etsy_cookies_file):
        with open(etsy_cookies_file, "r") as f:
            data = json.load(f)
        import shutil
        shutil.copy(etsy_cookies_file, "sessions/etsy_session.json")
        print("OK Etsy session copied")
    else:
        # יוצר session ריק — Etsy ייפתח בלי login
        empty_state = {"cookies": [], "origins": []}
        with open("sessions/etsy_session.json", "w") as f:
            json.dump(empty_state, f)
        print("WARN Etsy session: empty (will scrape without login)")
except Exception as e:
    print(f"FAIL Etsy: {e}")

print("\nקבצי session:")
for f in os.listdir("sessions"):
    path = f"sessions/{f}"
    print(f"  {path} ({os.path.getsize(path):,} bytes)")
