// POST /functions/v1/admin-users
// Body: { "action": "invite", "profileId": "<uuid>" }
//
// Sends a Supabase Auth invite email to an existing employee profile. The
// login is linked to the profile automatically when the invite is accepted
// (see private.link_profile_on_confirm). Administrators only.
//
// Role changes do NOT happen here: they go through the admin_set_role()
// database function, which checks permissions and is audited.
import { adminClient, getCaller } from "../_shared/auth.ts";
import { corsHeaders, fail, json } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "Method not allowed");

  try {
    const caller = await getCaller(req);
    if (!caller) return fail(req, 401, "Please sign in again");
    if (caller.role !== "admin" && caller.role !== "company_admin") return fail(req, 403, "Not allowed");

    let body: { action?: unknown; profileId?: unknown };
    try {
      body = await req.json();
    } catch {
      return fail(req, 400, "Invalid request");
    }
    if (body.action !== "invite" || typeof body.profileId !== "string" || !UUID.test(body.profileId)) {
      return fail(req, 400, "Invalid request");
    }

    // Read the profile AS the admin, so RLS still applies to this lookup.
    const { data: profile, error: profileError } = await caller.userClient
      .from("profiles")
      .select("id, email, user_id, active")
      .eq("id", body.profileId)
      .maybeSingle();
    if (profileError || !profile) return fail(req, 404, "Employee not found", profileError);
    if (!profile.active) return fail(req, 409, "Employee is deactivated");
    if (profile.user_id) return fail(req, 409, "Employee already has a login");
    if (!profile.email) return fail(req, 422, "Employee has no email address");

    const redirectTo = Deno.env.get("INVITE_REDIRECT_URL") ?? undefined;
    const { error: inviteError } = await adminClient().auth.admin.inviteUserByEmail(profile.email, { redirectTo });
    if (inviteError) return fail(req, 502, "Could not send the invite", inviteError);

    await adminClient().from("audit_logs").insert({
      user_id: caller.userId,
      action: "invite_user",
      entity_type: "profiles",
      entity_id: profile.id,
      metadata: {},
    });

    return json(req, 200, { ok: true });
  } catch (err) {
    return fail(req, 500, "Something went wrong", err);
  }
});
