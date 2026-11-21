import { Suspense } from "react";
import { OrderStatus } from "./order-status";

export default function OrderPage({ params }: PageProps<"/pesanan/[orderId]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-paper" />}>
      <Resolve params={params} />
    </Suspense>
  );
}

// The ?transaction_status= query from the Snap finish redirect is ignored on purpose (AC-05):
// the state shown always comes from the server.
async function Resolve({ params }: { params: PageProps<"/pesanan/[orderId]">["params"] }) {
  const { orderId } = await params;
  return <OrderStatus orderId={orderId} />;
}
