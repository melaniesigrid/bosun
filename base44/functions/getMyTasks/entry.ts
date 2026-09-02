import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Query tasks scoped to this user at the database level — no in-memory filtering needed
    const [byId, byEmail] = await Promise.all([
      base44.entities.Task.filter({ assignee_id: user.id }, '-created_date', 200),
      user.email
        ? base44.entities.Task.filter({ assignee_email: user.email }, '-created_date', 200)
        : Promise.resolve([]),
    ]);
    // Deduplicate in case both fields match the same record
    const seen = new Set();
    const myTasks = [...byId, ...byEmail].filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });

    return Response.json({ tasks: myTasks });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});