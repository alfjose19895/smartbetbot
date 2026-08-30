import { NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export async function GET() {
  const identity = await getVerifiedIdentity();
  if (!identity) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({ user: identity });
}
