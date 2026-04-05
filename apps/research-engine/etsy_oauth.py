"""
Etsy OAuth PKCE flow - local callback server.
Run this script, click the URL, authorize, and token is saved automatically.
"""
import asyncio
import hashlib
import base64
import os
import json
import secrets
import httpx
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlencode, urlparse, parse_qs
import threading
import webbrowser

CLIENT_ID = "2cervnvhc9e9kkrhyenwu09u"
REDIRECT_URI = "http://localhost:8888/callback"
SCOPES = "listings_r listings_w transactions_r shops_r"
TOKEN_FILE = "sessions/etsy_token.json"

# PKCE
code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
digest = hashlib.sha256(code_verifier.encode()).digest()
code_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode()
state = secrets.token_hex(8)

auth_code = None
server_done = threading.Event()


class CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if "code" in params:
            auth_code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization successful! You can close this window.</h1>")
        else:
            error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(f"<h1>Error: {error}</h1>".encode())

        server_done.set()

    def log_message(self, format, *args):
        pass  # suppress logs


async def exchange_token(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.etsy.com/v3/public/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": CLIENT_ID,
                "redirect_uri": REDIRECT_URI,
                "code": code,
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        resp.raise_for_status()
        return resp.json()


def main():
    # Build auth URL
    params = {
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "client_id": CLIENT_ID,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    auth_url = "https://www.etsy.com/oauth/connect?" + urlencode(params)

    print("=" * 60)
    print("ETSY OAUTH FLOW")
    print("=" * 60)
    print(f"\nRedirect URI to register in Etsy Developer Console:")
    print(f"  {REDIRECT_URI}")
    print(f"\nOpening browser for authorization...")
    print(f"\nURL: {auth_url}")
    print("=" * 60)

    # Start local server
    server = HTTPServer(("localhost", 8888), CallbackHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()

    # Open browser
    webbrowser.open(auth_url)

    print("\nWaiting for authorization... (Click 'Allow' in the browser)")
    server_done.wait(timeout=120)
    server.shutdown()

    if not auth_code:
        print("\nERROR: No authorization code received (timeout or error)")
        return

    print(f"\nAuthorization code received!")
    print("Exchanging for access token...")

    token_data = asyncio.run(exchange_token(auth_code))

    os.makedirs("sessions", exist_ok=True)
    with open(TOKEN_FILE, "w") as f:
        json.dump(token_data, f, indent=2)

    print(f"\nSUCCESS! Token saved to: {TOKEN_FILE}")
    print(f"Access token: {token_data.get('access_token', '')[:20]}...")
    print(f"Expires in: {token_data.get('expires_in')} seconds")


if __name__ == "__main__":
    main()
