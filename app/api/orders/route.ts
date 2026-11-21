import { createOrder } from "@/lib/orders/create";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const r = await createOrder(body, new URL(req.url).origin);
  if (!r.ok) return Response.json({ error: r.error, fieldErrors: r.fieldErrors }, { status: r.status });
  return Response.json({ orderId: r.orderId, snapToken: r.snapToken }, { status: 201 });
}
