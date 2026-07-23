import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const secureInvitesConfigured = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);
  return NextResponse.json(
    {
      status:
        supabaseConfigured && secureInvitesConfigured ? "ok" : "degraded",
      services: {
        supabase: supabaseConfigured,
        secureInvitations: secureInvitesConfigured,
        reportCopilot: aiConfigured ? "openai" : "local",
      },
      checkedAt: new Date().toISOString(),
    },
    {
      status: supabaseConfigured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
