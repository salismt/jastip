// PROTOTYPE_MODE=1 swaps Postgres and Midtrans for in-memory fakes and turns on /api/prototype/*.
// Never set it on Vercel.
export const prototypeMode = () => process.env.PROTOTYPE_MODE === "1";
export const isProduction = () => process.env.MIDTRANS_IS_PRODUCTION === "true";
