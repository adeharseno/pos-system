import { acceptInvitationToken } from "@/modules/auth/application/employee-service";
import { invitationRedirect } from "@/modules/auth/employee-validation";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
 const params = new URL(request.url).searchParams;
 let status = "ready";
 try { await acceptInvitationToken(params.get("token_hash"), params.get("type") ?? "invite"); }
 catch { status = "invalid"; }
 const target = new URL("/auth/activate", invitationRedirect(process.env.APP_SITE_URL));
 target.searchParams.set("status", status);
 const response = NextResponse.redirect(target, 303);
 response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
 return response;
}
