from openai import OpenAI
from fastapi import APIRouter, Request

router = APIRouter()
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))


@router.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    message = body.get("message", "")
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": message}],
    )
    return {"text": completion.choices[0].message.content}
