import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ schoolName: "Aghaaz School", currency: "PKR", timezone: "Asia/Karachi" });
}
