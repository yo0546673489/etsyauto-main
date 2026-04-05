"""
קורא Chrome Cookies DB בזמן Chrome פעיל — דרך Windows backup semantics.
"""
import sys, os, json, time, struct, tempfile, shutil, ctypes, ctypes.wintypes, base64
sys.path.insert(0, ".")

CHROME_PROFILE = r"C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Profile 1"
COOKIES_PATH = os.path.join(CHROME_PROFILE, "Network", "Cookies")
LOCAL_STATE = r"C:\Users\Administrator\AppData\Local\Google\Chrome\User Data\Local State"
OUTPUT_DIR = "sessions"

# ====== Windows API constants ======
GENERIC_READ = 0x80000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
FILE_SHARE_DELETE = 0x00000004
OPEN_EXISTING = 3
FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


def open_locked_file(path):
    """פותח קובץ נעול ע"י Chrome עם backup semantics"""
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.CreateFileW(
        path,
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS,
        None
    )
    if handle == INVALID_HANDLE_VALUE:
        err = kernel32.GetLastError()
        raise OSError(f"CreateFileW failed, error={err}")
    return handle


def read_via_handle(handle, size):
    """קורא bytes דרך Windows HANDLE"""
    buf = ctypes.create_string_buffer(size)
    bytes_read = ctypes.wintypes.DWORD(0)
    ctypes.windll.kernel32.ReadFile(handle, buf, size, ctypes.byref(bytes_read), None)
    return buf.raw[:bytes_read.value]


def copy_locked_db(src_path, dst_path):
    """מעתיק SQLite DB נעול לקובץ זמני"""
    kernel32 = ctypes.windll.kernel32

    handle = open_locked_file(src_path)
    try:
        # קורא את הכל
        size = os.path.getsize(src_path)
        # ReadFile בחתיכות
        all_data = b""
        chunk_size = 65536
        while len(all_data) < size:
            remaining = min(chunk_size, size - len(all_data))
            buf = ctypes.create_string_buffer(remaining)
            bytes_read = ctypes.wintypes.DWORD(0)
            ok = kernel32.ReadFile(handle, buf, remaining, ctypes.byref(bytes_read), None)
            if not ok or bytes_read.value == 0:
                break
            all_data += buf.raw[:bytes_read.value]

        with open(dst_path, "wb") as f:
            f.write(all_data)
    finally:
        kernel32.CloseHandle(handle)

    return len(all_data)


def get_chrome_key():
    """מפתח AES-256 של Chrome (DPAPI-encrypted)"""
    with open(LOCAL_STATE, "r", encoding="utf-8") as f:
        ls = json.load(f)
    enc_key = base64.b64decode(ls["os_crypt"]["encrypted_key"])[5:]  # skip "DPAPI"

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


def decrypt_value(enc: bytes, key: bytes) -> str:
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
    import sqlite3
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    ph = ",".join("?" * len(domains))
    cur.execute(
        f"SELECT name, encrypted_value, host_key, path, expires_utc, "
        f"is_httponly, is_secure, samesite FROM cookies WHERE host_key IN ({ph})",
        domains
    )
    out = []
    sm = {-1: "Unspecified", 0: "Lax", 1: "Strict", 2: "None"}
    for row in cur.fetchall():
        v = decrypt_value(bytes(row[1]), key)
        if not v:
            continue
        out.append({
            "name": row[0], "value": v, "domain": row[2],
            "path": row[3],
            "expires": int(time.time()) + 86400 * 30,
            "httpOnly": bool(row[4]), "secure": bool(row[5]),
            "sameSite": sm.get(row[6], "Lax")
        })
    conn.close()
    return out


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("Copying locked Chrome Cookies DB...")
    tmp = tempfile.mktemp(suffix=".db")
    try:
        size = copy_locked_db(COOKIES_PATH, tmp)
        print(f"Copied {size:,} bytes")
    except Exception as e:
        print(f"ERROR copying: {e}")
        return

    print("Getting Chrome encryption key...")
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
            "domains": [".alura.io", "alura.io", "app.alura.io", "www.alura.io"],
            "out": "sessions/alura_session.json",
            "origin": "https://app.alura.io"
        }
    }

    for name, cfg in targets.items():
        print(f"\n{name}...")
        cookies = get_cookies(tmp, key, cfg["domains"])
        print(f"  {len(cookies)} cookies found")
        state = {
            "cookies": cookies,
            "origins": [{"origin": cfg["origin"], "localStorage": []}]
        }
        with open(cfg["out"], "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        print(f"  Saved: {cfg['out']} ({os.path.getsize(cfg['out']):,} bytes)")

    os.unlink(tmp)
    print("\nDone!")


main()
