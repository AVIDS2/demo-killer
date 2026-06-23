from fastapi import APIRouter, Request
from app.lib.db import session

router = APIRouter()


@router.delete("/api/admin/users")
async def delete_user(request: Request):
    body = await request.json()
    user_id = body.get("userId")
    session.query(User).filter(User.id == user_id).delete()
    session.commit()
    return {"ok": True}
