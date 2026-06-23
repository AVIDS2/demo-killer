import stripe
from fastapi import APIRouter, Request

router = APIRouter()
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")


@router.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    event = await request.json()
    if event.get("type") == "checkout.session.completed":
        print("paid", event["data"]["object"]["id"])
    return {"received": True}
