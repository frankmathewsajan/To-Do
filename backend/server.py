from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Response, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import base64
import secrets
import smtplib
from email.message import EmailMessage
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALG = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', '60'))
AES_KEY = base64.b64decode(os.environ['AES_KEY_B64'])
DEV_MODE = os.environ.get('DEV_MODE', 'false').lower() == 'true'
SMTP_HOST = os.environ.get('SMTP_HOST', '')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587') or '587')
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASSWORD = os.environ.get('SMTP_PASSWORD', '')
SMTP_FROM = os.environ.get('SMTP_FROM', 'noreply@todoapp.local')

# ----- DB -----
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
users_col = db['users']
todos_col = db['todos']
otps_col = db['otps']

# ----- App -----
app = FastAPI(title="Modern Todo API")
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

AUTH_COOKIE_NAME = "access_token"

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

def clear_auth_cookie(response: Response):
    response.delete_cookie(AUTH_COOKIE_NAME, path="/")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ----- Helpers -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_jwt(payload: dict, minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    data = payload.copy()
    data['exp'] = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    data['iat'] = datetime.now(timezone.utc)
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALG)

def decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def aes_encrypt(plaintext: str) -> str:
    if plaintext is None or plaintext == "":
        return ""
    aesgcm = AESGCM(AES_KEY)
    nonce = secrets.token_bytes(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ct).decode()

def aes_decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        raw = base64.b64decode(ciphertext)
        nonce, ct = raw[:12], raw[12:]
        aesgcm = AESGCM(AES_KEY)
        return aesgcm.decrypt(nonce, ct, None).decode()
    except Exception as e:
        logger.warning(f"Decryption failed: {e}")
        return ""

async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    access_token: Optional[str] = Cookie(default=None),
):
    token = None
    if creds and creds.credentials:
        token = creds.credentials
    elif access_token:
        token = access_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    payload = decode_jwt(token)
    if payload.get("scope") != "access":
        raise HTTPException(status_code=401, detail="Invalid token scope")
    user = await users_col.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def send_otp_email(to_email: str, otp: str):
    """Send OTP via SMTP if configured, else log. Always log in DEV_MODE."""
    body = f"Your Todo App verification code is: {otp}\n\nThis code expires in 10 minutes.\nIf you didn't request this, please ignore."
    if DEV_MODE:
        logger.info(f"[DEV_MODE] OTP for {to_email}: {otp}")
    if SMTP_HOST and SMTP_USER:
        try:
            msg = EmailMessage()
            msg['Subject'] = 'Your Todo App Verification Code'
            msg['From'] = SMTP_FROM
            msg['To'] = to_email
            msg.set_content(body)
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
                s.starttls()
                s.login(SMTP_USER, SMTP_PASSWORD)
                s.send_message(msg)
        except Exception as e:
            logger.error(f"SMTP send failed: {e}")

# ----- Models -----
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1, max_length=100)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class MFAVerifyIn(BaseModel):
    mfa_token: str
    otp: str

class MFAEnableIn(BaseModel):
    enabled: bool

class TodoIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = ""
    due_date: Optional[str] = None  # ISO string
    priority: Literal["low", "medium", "high"] = "medium"
    category: Optional[str] = "General"
    tags: List[str] = Field(default_factory=list)

class TodoUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high"]] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    completed: Optional[bool] = None

class TodoOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str
    due_date: Optional[str] = None
    priority: str
    category: str
    tags: List[str]
    completed: bool
    created_at: str
    updated_at: str

class GoogleSessionIn(BaseModel):
    session_id: str

# ----- Routes -----
@api_router.get("/")
async def root():
    return {"message": "Modern Todo API", "version": "1.0"}

@api_router.post("/auth/signup")
async def signup(body: SignupIn, response: Response):
    existing = await users_col.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "mfa_enabled": False,
        "google_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await users_col.insert_one(user)
    token = create_jwt({"sub": user_id, "email": user["email"], "scope": "access"})
    set_auth_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": user["email"], "name": user["name"], "mfa_enabled": False},
    }

@api_router.post("/auth/login")
async def login(body: LoginIn, response: Response):
    user = await users_col.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("mfa_enabled"):
        # Generate OTP
        otp = f"{secrets.randbelow(1000000):06d}"
        mfa_token = secrets.token_urlsafe(24)
        await otps_col.insert_one({
            "mfa_token": mfa_token,
            "user_id": user["id"],
            "otp_hash": hash_password(otp),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
        })
        send_otp_email(user["email"], otp)
        return {"requires_mfa": True, "mfa_token": mfa_token}

    token = create_jwt({"sub": user["id"], "email": user["email"], "scope": "access"})
    set_auth_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "requires_mfa": False,
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "mfa_enabled": user.get("mfa_enabled", False)},
    }

@api_router.post("/auth/mfa/verify")
async def verify_mfa(body: MFAVerifyIn, response: Response):
    rec = await otps_col.find_one({"mfa_token": body.mfa_token})
    if not rec:
        raise HTTPException(status_code=401, detail="Invalid MFA token")
    if datetime.fromisoformat(rec["expires_at"]) < datetime.now(timezone.utc):
        await otps_col.delete_one({"mfa_token": body.mfa_token})
        raise HTTPException(status_code=401, detail="OTP expired")
    if rec["attempts"] >= 5:
        await otps_col.delete_one({"mfa_token": body.mfa_token})
        raise HTTPException(status_code=401, detail="Too many attempts")
    if not verify_password(body.otp, rec["otp_hash"]):
        await otps_col.update_one({"mfa_token": body.mfa_token}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid OTP")

    user = await users_col.find_one({"id": rec["user_id"]})
    await otps_col.delete_one({"mfa_token": body.mfa_token})
    token = create_jwt({"sub": user["id"], "email": user["email"], "scope": "access"})
    set_auth_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "mfa_enabled": True},
    }

@api_router.post("/auth/mfa/resend")
async def resend_mfa(mfa_token: str):
    rec = await otps_col.find_one({"mfa_token": mfa_token})
    if not rec:
        raise HTTPException(status_code=404, detail="Session not found")
    user = await users_col.find_one({"id": rec["user_id"]})
    otp = f"{secrets.randbelow(1000000):06d}"
    await otps_col.update_one(
        {"mfa_token": mfa_token},
        {"$set": {
            "otp_hash": hash_password(otp),
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
            "attempts": 0,
        }}
    )
    send_otp_email(user["email"], otp)
    return {"ok": True}

@api_router.get("/auth/dev/last-otp")
async def dev_last_otp(email: str):
    """DEV ONLY: Returns the last OTP for the given email. For testing in dev mode."""
    if not DEV_MODE:
        raise HTTPException(status_code=403, detail="Not available")
    user = await users_col.find_one({"email": email.lower()})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Can't return the OTP because we only store its hash. Instead, return MFA token info.
    rec = await otps_col.find_one({"user_id": user["id"]}, sort=[("expires_at", -1)])
    if not rec:
        raise HTTPException(status_code=404, detail="No OTP pending")
    return {"mfa_token": rec["mfa_token"], "note": "Check backend logs for the actual OTP code in DEV_MODE"}

@api_router.get("/auth/me")
async def me(user = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "mfa_enabled": user.get("mfa_enabled", False),
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}

@api_router.post("/auth/mfa/toggle")
async def toggle_mfa(body: MFAEnableIn, user = Depends(get_current_user)):
    await users_col.update_one({"id": user["id"]}, {"$set": {"mfa_enabled": body.enabled}})
    return {"mfa_enabled": body.enabled}

@api_router.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    """Exchange Emergent session_id for auth token."""
    async with httpx.AsyncClient() as http:
        try:
            resp = await http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": body.session_id},
                timeout=15.0,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OAuth provider error: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = resp.json()
    email = (data.get("email") or "").lower()
    name = data.get("name") or email.split("@")[0]
    google_id = data.get("id") or data.get("sub")
    if not email:
        raise HTTPException(status_code=400, detail="No email in session data")

    user = await users_col.find_one({"email": email})
    if not user:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "email": email,
            "name": name,
            "password_hash": None,
            "mfa_enabled": False,
            "google_id": google_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await users_col.insert_one(user)
    elif not user.get("google_id"):
        await users_col.update_one({"id": user["id"]}, {"$set": {"google_id": google_id}})

    token = create_jwt({"sub": user["id"], "email": user["email"], "scope": "access"})
    set_auth_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"], "name": user["name"], "mfa_enabled": user.get("mfa_enabled", False)},
    }

# ----- Todos -----
def todo_to_out(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "user_id": doc["user_id"],
        "title": aes_decrypt(doc["title_enc"]),
        "description": aes_decrypt(doc.get("description_enc", "")),
        "due_date": doc.get("due_date"),
        "priority": doc.get("priority", "medium"),
        "category": doc.get("category", "General"),
        "tags": doc.get("tags", []),
        "completed": doc.get("completed", False),
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
    }

@api_router.get("/todos")
async def list_todos(user = Depends(get_current_user)):
    cursor = todos_col.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    docs = await cursor.to_list(length=1000)
    return [todo_to_out(d) for d in docs]

@api_router.post("/todos")
async def create_todo(body: TodoIn, user = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title_enc": aes_encrypt(body.title),
        "description_enc": aes_encrypt(body.description or ""),
        "due_date": body.due_date,
        "priority": body.priority,
        "category": body.category or "General",
        "tags": body.tags,
        "completed": False,
        "created_at": now,
        "updated_at": now,
    }
    await todos_col.insert_one(doc)
    return todo_to_out(doc)

@api_router.patch("/todos/{todo_id}")
async def update_todo(todo_id: str, body: TodoUpdateIn, user = Depends(get_current_user)):
    doc = await todos_col.find_one({"id": todo_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Todo not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        updates["title_enc"] = aes_encrypt(body.title)
    if body.description is not None:
        updates["description_enc"] = aes_encrypt(body.description)
    for f in ["due_date", "priority", "category", "tags", "completed"]:
        v = getattr(body, f)
        if v is not None:
            updates[f] = v
    await todos_col.update_one({"id": todo_id}, {"$set": updates})
    doc = await todos_col.find_one({"id": todo_id}, {"_id": 0})
    return todo_to_out(doc)

@api_router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: str, user = Depends(get_current_user)):
    res = await todos_col.delete_one({"id": todo_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Todo not found")
    return {"ok": True}

@api_router.get("/todos/stats")
async def todos_stats(user = Depends(get_current_user)):
    total = await todos_col.count_documents({"user_id": user["id"]})
    completed = await todos_col.count_documents({"user_id": user["id"], "completed": True})
    now_iso = datetime.now(timezone.utc).isoformat()
    overdue = await todos_col.count_documents({
        "user_id": user["id"],
        "completed": False,
        "due_date": {"$ne": None, "$lt": now_iso},
    })
    return {"total": total, "completed": completed, "active": total - completed, "overdue": overdue}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    await users_col.create_index("email", unique=True)
    await users_col.create_index("id", unique=True)
    await todos_col.create_index([("user_id", 1), ("created_at", -1)])
    # Seed demo user
    demo = await users_col.find_one({"email": "demo@todoapp.com"})
    if not demo:
        await users_col.insert_one({
            "id": str(uuid.uuid4()),
            "email": "demo@todoapp.com",
            "name": "Demo User",
            "password_hash": hash_password("Demo@1234"),
            "mfa_enabled": False,
            "google_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded demo user: demo@todoapp.com / Demo@1234")

@app.on_event("shutdown")
async def shutdown():
    client.close()
