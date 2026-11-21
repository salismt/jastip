import { settle } from "@/lib/orders/settle";

// Midtrans HTTP notification (webhook). Set this URL in the Midtrans dashboard:
// https://jastip.salis.id/api/midtrans/notification
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ result: "bad_request" }, { status: 400 });
  const r = await settle(body as Record<string, unknown>);
  return Response.json({ result: r.result }, { status: r.status });
}
