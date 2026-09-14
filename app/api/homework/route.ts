import { NextResponse } from "next/server";

export async function GET() { return NextResponse.json([]); }
export async function POST() { return NextResponse.json({ error: "Homework storage is not yet configured." }, { status: 501 }); }
