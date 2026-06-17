import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const event = await request.json();
  if (event.type === "checkout.session.completed") {
    console.log("paid", event.data.object.id);
  }
  return Response.json({ received: true });
}
