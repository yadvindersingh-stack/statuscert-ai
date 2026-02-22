import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: false, error: "Portal not configured" }, { status: 501 });
}
