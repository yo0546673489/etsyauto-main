"""
שולף cookies מ-Chrome ומייצר Playwright session files.
עובד עם Chrome 80+ (DPAPI encryption).
"""
import os
import sys
import json
import time
import shutil
import sqlite3
import struct
import tempfile

sys.path.insert(0, ".")

CHROME_PROFILE = r"C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Profile 1"
SESSIONS_DIR = "sessions"

# Domains שאנחנו צריכים
TARGETS = {
    "alura": {
        "domains": [".alura.io", "alura.io", "www.alura.io", "app.alura.io"],
        "output": "sessions/alura_session.json",
        "check_url": "https://app.alura.io"
    },
    "erank": {
        "domains": [".erank.com", "erank.com", "members.erank.com", ".members.erank.com"],
        "output": "sessions/erank_session.json",
        "check_url": "https://members.erank.com"
    },
    "etsy": {
        "domains": [".etsy.com", "etsy.com", "www.etsy.com"],
        "output": "sessions/etsy_session.json",
        "check_url": "https://www.etsy.com"
    }
}


def decrypt_chrome_cookie(encrypted_value: bytes, key: bytes) -> str:
    """מפענח cookie של Chrome עם AES-GCM (Chrome 80+)"""
    try:
        from Cryptodome.Cipher import AES
        # Chrome v80+ prefix: b'v10'
        if encrypted_value[:3] == b'v10':
            nonce = encrypted_value[3:3+12]
            ciphertext = encrypted_value[3+12:-16]
            tag = encrypted_value[-16:]
            cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
            return cipher.decrypt_and_verify(ciphertext, tag).decode('utf-8')
    except ImportError:
        pass
    except Exception:
        pass

    # Fallback: DPAPI (old Chrome / Windows)
    try:
        import ctypes
        import ctypes.wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", ctypes.wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        p = ctypes.create_string_buffer(encrypted_value, len(encrypted_value))
        blobin = DATA_BLOB(ctypes.sizeof(p), p)
        blobout = DATA_BLOB()
        retval = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blobin), None, None, None, None, 0, ctypes.byref(blobout))
        if retval:
            result = ctypes.string_at(blobout.pbData, blobout.cbData)
            ctypes.windll.kernel32.LocalFree(blobout.pbData)
            return result.decode('utf-8')
    except Exception:
        pass

    return ""


def get_chrome_encryption_key() -> bytes:
    """שולף את מפתח ה-AES מ-Local State"""
    import base64
    local_state_path = os.path.join(
        r"C:\Users\Administrator\AppData\Local\Google\Chrome\User Data",
        "Local State"
    )
    with open(local_state_path, "r", encoding="utf-8") as f:
        local_state = json.load(f)

    encrypted_key = base64.b64decode(
        local_state["os_crypt"]["encrypted_key"]
    )
    # הסרת prefix "DPAPI"
    encrypted_key = encrypted_key[5:]

    # פענוח עם DPAPI
    import ctypes
    import ctypes.wintypes

    class DATA_BLOB(ctypes.Structure):
        _fields_ = [("cbData", ctypes.wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    p = ctypes.create_string_buffer(encrypted_key, len(encrypted_key))
    blobin = DATA_BLOB(ctypes.sizeof(p), p)
    blobout = DATA_BLOB()
    ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blobin), None, None, None, None, 0, ctypes.byref(blobout))
    result = ctypes.string_at(blobout.pbData, blobout.cbData)
    ctypes.windll.kernel32.LocalFree(blobout.pbData)
    return result


def read_chrome_cookies(profile_path: str, domains: list, key: bytes) -> list:
    """קורא cookies מ-SQLite של Chrome"""
    cookies_path = os.path.join(profile_path, "Network", "Cookies")
    if not os.path.exists(cookies_path):
        cookies_path = os.path.join(profile_path, "Cookies")

    # Chrome נועל את הDB — נעתיק קודם
    tmp = tempfile.mktemp(suffix=".db")
    shutil.copy2(cookies_path, tmp)

    results = []
    try:
        conn = sqlite3.connect(tmp)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        placeholders = ",".join("?" * len(domains))
        cur.execute(
            f"SELECT name, encrypted_value, host_key, path, expires_utc, "
            f"is_httponly, is_secure, samesite FROM cookies "
            f"WHERE host_key IN ({placeholders})",
            domains
        )

        samesite_map = {-1: "Unspecified", 0: "No restriction", 1: "Lax", 2: "Strict"}

        for row in cur.fetchall():
            try:
                value = decrypt_chrome_cookie(bytes(row["encrypted_value"]), key)
            except Exception:
                value = ""

            if not value:
                continue

            results.append({
                "name": row["name"],
                "value": value,
                "domain": row["host_key"],
                "path": row["path"],
                "expires": int(time.time()) + 86400 * 30,
                "httpOnly": bool(row["is_httponly"]),
                "secure": bool(row["is_secure"]),
                "sameSite": samesite_map.get(row["samesite"], "Lax")
            })

        conn.close()
    finally:
        os.unlink(tmp)

    return results


def main():
    os.makedirs(SESSIONS_DIR, exist_ok=True)

    print("Extracting Chrome encryption key...")
    key = get_chrome_encryption_key()
    print(f"Key extracted ({len(key)} bytes)")

    for tool, config in TARGETS.items():
        print(f"\nProcessing {tool}...")
        try:
            cookies = read_chrome_cookies(CHROME_PROFILE, config["domains"], key)
            print(f"  Found {len(cookies)} cookies")

            state = {
                "cookies": cookies,
                "origins": [
                    {
                        "origin": config["check_url"],
                        "localStorage": []
                    }
                ]
            }

            with open(config["output"], "w", encoding="utf-8") as f:
                json.dump(state, f, ensure_ascii=False, indent=2)

            print(f"  Saved to {config['output']}")

        except Exception as e:
            print(f"  ERROR: {e}")

    print("\nDone! Session files:")
    for f in os.listdir(SESSIONS_DIR):
        p = f"{SESSIONS_DIR}/{f}"
        print(f"  {p} ({os.path.getsize(p):,} bytes)")


if __name__ == "__main__":
    main()
