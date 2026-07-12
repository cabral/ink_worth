// ============================================================================
// INK worth — reservation edge function
// ============================================================================
// A thin, trusted wrapper around the atomic Postgres functions. The browser
// never talks to the database directly for writes: it POSTs here, and this
// function (running with the service_role key, which stays server-side) calls
// reserve_seats() / join_waiting_list(). Capacity enforcement and row locking
// happen inside those SQL functions, so this layer only has to validate input,
// handle CORS, and relay the JSON result.
//
// Deploy with:
//   supabase functions deploy reserve --no-verify-jwt
// (--no-verify-jwt because visitors are anonymous; we still require the anon
//  apikey header, which the Supabase gateway checks before we run.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ReservationInput {
  action?: "reserve" | "waitlist";
  event_id?: string;
  name?: string;
  email?: string;
  seats?: number | string;
  notes?: string;
}

const MAX_SEATS_PER_REQUEST = 20; // sanity bound; per-event capacity still rules.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed" }, 405);
  }

  let input: ReservationInput;
  try {
    input = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }

  const action = input.action === "waitlist" ? "waitlist" : "reserve";
  const slug = typeof input.event_id === "string" ? input.event_id.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const seats = Number(input.seats);

  if (!slug) {
    return json({ ok: false, reason: "missing_event" }, 400);
  }
  if (!name) {
    return json({ ok: false, reason: "invalid_name" }, 400);
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS_PER_REQUEST) {
    return json({ ok: false, reason: "invalid_seats" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const rpc = action === "waitlist" ? "join_waiting_list" : "reserve_seats";
  const { data, error } = await supabase.rpc(rpc, {
    p_slug: slug,
    p_name: name,
    p_email: email,
    p_seats: seats,
    p_notes: notes,
  });

  if (error) {
    console.error(`${rpc} failed`, error);
    return json({ ok: false, reason: "database_error" }, 500);
  }

  // data is the jsonb the SQL function returned. A logical rejection (e.g.
  // not enough seats) is a 200 with ok:false so the frontend can show the
  // friendly message; only transport/serverfaults use non-2xx codes.
  const result = data as { ok?: boolean };
  return json(result, result?.ok === false ? 200 : 200);
});
