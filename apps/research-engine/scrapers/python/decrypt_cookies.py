"""
Decrypts Chrome cookies from the raw DB copy.
"""
import sys, os, json, time, base64, ctypes, ctypes.wintypes, sqlite3
sys.path.insert(0, ".")

COOKIES_DB = "sessions/cookies_raw.db"
LOCAL_STATE = r"C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Local State"


def get_chrome_key():
    with open(LOCAL_STATE, "r", encoding="utf-8") as f:
        ls = json.load(f)
    enc_key = base64.b64decode(ls["os_crypt"]["encrypted_key"])[5:]

    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", ctypes.wintypes.DWORD),
                    ("pbData", ctypes.POINTER(ctypes.c_char))]

    p = ctypes.create_string_buffer(enc_key, len(enc_key))
    bi = BLOB(len(enc_key), p)
    bo = BLOB()
    ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(bi), None, None, None, None, 0, ctypes.byref(bo))
    key = ctypes.string_at(bo.pbData, bo.cbData)
    ctypes.windll.kernel32.LocalFree(bo.pbData)
    return key


def decrypt_value(enc, key):
    if not enc:
        return ""
    try:
        from Cryptodome.Cipher import AES
        if enc[:3] == b"v10":
            nonce, ct, tag = enc[3:15], enc[15:-16], enc[-16:]
            c = AES.new(key, AES.MODE_GCM, nonce=nonce)
            return c.decrypt_and_verify(ct, tag).decode("utf-8", errors="replace")
    except Exception:
        pass
    return ""


def get_cookies(db_path, key, domains):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    ph = ",".join("?" * len(domains))
    cur.execute(
        f"SELECT name, encrypted_value, host_key, path, expires_utc, "
        f"is_httponly, is_secure, samesite FROM cookies WHERE host_key IN ({ph})",
        domains
    )
    sm = {-1: "Unspecified", 0: "Lax", 1: "Strict", 2: "None"}
    result = []
    for row in cur.fetchall():
        v = decrypt_value(bytes(row[1]), key)
        if not v:
            continue
        result.append({
            "name": row[0], "value": v, "domain": row[2],
            "path": row[3],
            "expires": int(time.time()) + 86400 * 30,
            "httpOnly": bool(row[4]), "secure": bool(row[5]),
            "sameSite": sm.get(row[6], "Lax")
        })
    conn.close()
    return result


def main():
    os.makedirs("sessions", exist_ok=True)
    key = get_chrome_key()
    print(f"Key: {len(key)} bytes")

    targets = {
        "erank": {
            "domains": [".erank.com", "erank.com", "members.erank.com"],
            "out": "sessions/erank_session.json",
            "origin": "https://members.erank.com"
        },
        "etsy": {
            "domains": [".etsy.com", "etsy.com", "www.etsy.com"],
            "out": "sessions/etsy_session.json",
            "origin": "https://www.etsy.com"
        },
        "alura": {
            "domains": [".alura.io", "alura.io", "app.alura.io"],
            "out": "sessions/alura_session.json",
            "origin": "https://app.alura.io"
        },
    }

    for name, cfg in targets.items():
        cookies = get_cookies(COOKIES_DB, key, cfg["domains"])
        print(f"{name}: {len(cookies)} cookies")
        for c in cookies[:5]:
            print(f"  {c['name']}={c['value'][:40]}...")
        state = {
            "cookies": cookies,
            "origins": [{"origin": cfg["origin"], "localStorage": []}]
        }
        with open(cfg["out"], "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        print(f"  Saved: {cfg['out']} ({os.path.getsize(cfg['out']):,} bytes)")


main()
