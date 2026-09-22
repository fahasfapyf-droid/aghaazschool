import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "aghaaz-sync",
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    },
  );
}
