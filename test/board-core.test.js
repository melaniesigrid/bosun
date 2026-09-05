import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COLUMN_IDS, applyMove, countsOf, toColumns } from "../src/lib/board-core.js";

const task = (id, status, sort_order, over = {}) => ({
  id,
  title: `Task ${id}`,
  status,
  sort_order,
  created_at: over.created_at ?? "2026-01-01T00:00:00Z",
  ...over,
});

const ids = (list) => list.map((t) => t.id);

describe("toColumns", () => {
  it("gives every status a column, even an empty one", () => {
    const columns = toColumns([]);
    assert.deepEqual(Object.keys(columns), COLUMN_IDS);
    assert.deepEqual(countsOf(columns), {
      pending: 0, in_progress: 0, blocked: 0, need_help: 0, done: 0,
    });
  });

  it("sorts each column by sort_order", () => {
    const columns = toColumns([
      task("c", "pending", 2),
      task("a", "pending", 0),
      task("b", "pending", 1),
    ]);
    assert.deepEqual(ids(columns.pending), ["a", "b", "c"]);
  });

  it("falls back to created_at when sort_order ties", () => {
    const columns = toColumns([
      task("later", "pending", 0, { created_at: "2026-02-01T00:00:00Z" }),
      task("earlier", "pending", 0, { created_at: "2026-01-01T00:00:00Z" }),
    ]);
    assert.deepEqual(ids(columns.pending), ["earlier", "later"]);
  });

  it("shows a task with an unknown status rather than losing it", () => {
    // Otherwise the card is invisible and cannot be dragged back into view.
    const columns = toColumns([task("odd", "archived", 0)]);
    assert.deepEqual(ids(columns.pending), ["odd"]);
  });
});

describe("applyMove within a column", () => {
  const columns = toColumns([
    task("a", "pending", 0),
    task("b", "pending", 1),
    task("c", "pending", 2),
  ]);

  it("reorders the cards", () => {
    const { columns: next } = applyMove(columns, {
      from: "pending", to: "pending", fromIndex: 2, toIndex: 0,
    });
    assert.deepEqual(ids(next.pending), ["c", "a", "b"]);
  });

  it("writes back only the rows whose position actually moved", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "pending", fromIndex: 0, toIndex: 1,
    });
    // a and b swap; c keeps index 2 and needs no write.
    assert.deepEqual(changed.map((c) => c.id).sort(), ["a", "b"]);
  });

  it("renumbers densely from zero", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "pending", fromIndex: 2, toIndex: 0,
    });
    const order = Object.fromEntries(changed.map((c) => [c.id, c.sort_order]));
    assert.equal(order.c, 0);
    assert.equal(order.a, 1);
    assert.equal(order.b, 2);
  });

  it("leaves the status alone", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "pending", fromIndex: 0, toIndex: 2,
    });
    assert.ok(changed.every((c) => c.status === "pending"));
  });
});

describe("applyMove across columns", () => {
  const columns = toColumns([
    task("a", "pending", 0),
    task("b", "pending", 1),
    task("x", "done", 0),
  ]);

  it("moves the card and rewrites its status", () => {
    const { columns: next, changed } = applyMove(columns, {
      from: "pending", to: "done", fromIndex: 0, toIndex: 0,
    });
    assert.deepEqual(ids(next.pending), ["b"]);
    assert.deepEqual(ids(next.done), ["a", "x"]);
    assert.equal(changed.find((c) => c.id === "a").status, "done");
  });

  it("records the status change even when the index is unchanged", () => {
    // a is at index 0 in pending and lands at index 0 in done. Nothing about
    // its position moved, but it is a different column now.
    const { changed } = applyMove(columns, {
      from: "pending", to: "done", fromIndex: 0, toIndex: 0,
    });
    const a = changed.find((c) => c.id === "a");
    assert.ok(a, "the dragged card must always be written back");
    assert.equal(a.status, "done");
    assert.equal(a.sort_order, 0);
  });

  it("renumbers both the column it left and the one it joined", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "done", fromIndex: 0, toIndex: 0,
    });
    const byId = Object.fromEntries(changed.map((c) => [c.id, c]));
    assert.equal(byId.b.sort_order, 0, "b moved up in pending");
    assert.equal(byId.x.sort_order, 1, "x moved down in done");
  });

  it("does not touch a column the drag never involved", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "done", fromIndex: 0, toIndex: 0,
    });
    assert.ok(!changed.some((c) => c.status === "blocked"));
  });
});

describe("applyMove refuses nonsense", () => {
  const columns = toColumns([task("a", "pending", 0)]);

  it("ignores an unknown column", () => {
    const { changed } = applyMove(columns, {
      from: "pending", to: "nowhere", fromIndex: 0, toIndex: 0,
    });
    assert.deepEqual(changed, []);
  });

  it("ignores a drag from an empty position", () => {
    const { columns: next, changed } = applyMove(columns, {
      from: "done", to: "pending", fromIndex: 0, toIndex: 0,
    });
    assert.deepEqual(changed, []);
    assert.deepEqual(ids(next.pending), ["a"], "nothing should have moved");
  });
});
