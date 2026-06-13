"""
Ebook Reader & Editor — Backend API

Standalone backend using direct OpenAI API calls and SQLite.
No external platform dependencies (Emergent, MongoDB, etc.).
"""
from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import uuid
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- Database (SQLite — local, zero-config) ---
DB_PATH = ROOT_DIR / "ebook.db"


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS status_checks (
                id TEXT PRIMARY KEY,
                client_name TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )
        """)


init_db()


@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# --- OpenAI config ---
# No global server-side keys stored. Keys must be passed dynamically in the request Authorization headers.

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class StatusCheckCreate(BaseModel):
    client_name: str


class AISuggestRequest(BaseModel):
    context: str
    mode: str = "continue"  # 'continue' | 'improve' | 'shorten' | 'expand'
    session_id: Optional[str] = None


class AISuggestResponse(BaseModel):
    suggestion: str
    session_id: str


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Ebook Reader & Editor API"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.dict())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO status_checks (id, client_name, timestamp) VALUES (?, ?, ?)",
            (status_obj.id, status_obj.client_name, status_obj.timestamp.isoformat()),
        )
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, client_name, timestamp FROM status_checks ORDER BY timestamp DESC LIMIT 1000"
        ).fetchall()
    return [StatusCheck(id=r["id"], client_name=r["client_name"], timestamp=r["timestamp"]) for r in rows]


def _system_prompt(mode: str) -> str:
    base = (
        "You are an expert co-writing assistant inside an ebook editor. "
        "You help authors continue, improve and refine their prose. "
        "Match the author's tone, voice and tense. "
        "Return only the new text, no preamble, no markdown fences, no quotes."
    )
    if mode == "continue":
        return base + " The user wants you to continue writing from where they left off. Add 1–3 sentences that flow naturally."
    if mode == "improve":
        return base + " The user wants you to rewrite the given passage to improve clarity, flow and vividness. Keep the same meaning and length."
    if mode == "shorten":
        return base + " Rewrite the passage more concisely while keeping the meaning."
    if mode == "expand":
        return base + " Expand the passage with more sensory detail and depth (about 2x length)."
    return base


@api_router.post("/ai/suggest", response_model=AISuggestResponse)
async def ai_suggest(req: AISuggestRequest, authorization: Optional[str] = Header(None)):
    api_key = None
    if authorization and authorization.lower().startswith("bearer "):
        api_key = authorization[7:].strip()

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing or invalid Authorization header. Please pass 'Bearer YOUR_OPENAI_API_KEY'."
        )

    if not req.context or not req.context.strip():
        raise HTTPException(status_code=400, detail="context is required")

    session_id = req.session_id or str(uuid.uuid4())

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": _system_prompt(req.mode)},
                        {
                            "role": "user",
                            "content": (
                                f"Mode: {req.mode}\n\n"
                                f"---\n{req.context}\n---\n\n"
                                "Output only the resulting text."
                            ),
                        },
                    ],
                    "max_tokens": 1000,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            suggestion = data["choices"][0]["message"]["content"].strip()

        return AISuggestResponse(suggestion=suggestion, session_id=session_id)
    except httpx.HTTPStatusError as e:
        logging.exception("OpenAI API error")
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {e.response.status_code}")
    except Exception as e:
        logging.exception("AI suggest failed")
        raise HTTPException(status_code=500, detail=f"AI error: {e}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
