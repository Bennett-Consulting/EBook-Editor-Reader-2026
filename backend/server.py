from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

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
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    rows = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**row) for row in rows]


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
async def ai_suggest(req: AISuggestRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured")

    if not req.context or not req.context.strip():
        raise HTTPException(status_code=400, detail="context is required")

    session_id = req.session_id or str(uuid.uuid4())

    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=_system_prompt(req.mode),
        ).with_model("openai", "gpt-4o-mini")

        prompt_text = (
            f"Mode: {req.mode}\n\n"
            f"---\n{req.context}\n---\n\n"
            "Output only the resulting text."
        )
        user_message = UserMessage(text=prompt_text)
        response = await chat.send_message(user_message)
        suggestion = (response or "").strip()
        return AISuggestResponse(suggestion=suggestion, session_id=session_id)
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
