import { NextResponse } from "next/server";
import { getVerifiedIdentity } from "@/features/auth/lib/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const identity = await getVerifiedIdentity();
  if (!identity) {
    return NextResponse.json(
      { user: null },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  }

  return NextResponse.json(
    { user: identity },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
