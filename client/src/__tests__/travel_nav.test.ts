import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";

// The route table builds icons with JSX; the test runner compiles JSX to React.createElement.
(globalThis as { React?: unknown }).React = React;
const { isTravelPathAllowed, travelNavCategories } = await import("../pages/travel/routes");

const hrefs = (role: Parameters<typeof travelNavCategories>[0]) => travelNavCategories(role).flatMap((g) => g.items.map((i) => i.href));

test("CEO and Admin menus list each page once", () => {
  for (const role of ["ADMIN", "COMPANY_ADMIN"] as const) {
    const list = hrefs(role);
    assert.equal(new Set(list).size, list.length, `${role} menu has a repeated page`);
    for (const gone of ["/travel/bi", "/travel/bi/employees", "/travel/reports", "/travel/employees"]) {
      assert.ok(!list.includes(gone), `${role} menu should not list ${gone}`);
      assert.ok(isTravelPathAllowed(role, gone), `${role} can still open ${gone} from a link`);
    }
    assert.ok(list.includes("/travel/people") && list.includes("/travel/import") && list.includes("/travel/bi/projects"));
  }
});

test("other roles keep their menus", () => {
  assert.deepEqual(hrefs("EMPLOYEE"), ["/travel/home", "/travel/requests", "/travel/my", "/travel/documents"]);
  assert.ok(hrefs("APPROVER").includes("/travel/bi"));
  assert.ok(hrefs("TRAVEL_DESK").includes("/travel/employees"));
  assert.ok(!isTravelPathAllowed("EMPLOYEE", "/travel/people"));
});

test("a project page opened from a project name is for oversight roles only", () => {
  for (const role of ["ADMIN", "COMPANY_ADMIN", "TRAVEL_DESK", "APPROVER"] as const) {
    assert.ok(isTravelPathAllowed(role, "/travel/bi/projects/p/kakinada-port"), `${role} can open a project page`);
  }
  assert.ok(!isTravelPathAllowed("EMPLOYEE", "/travel/bi/projects/p/kakinada-port"));
  assert.ok(!isTravelPathAllowed("ADMIN", "/travel/bi/projects/p/n-a"), "a blank-like name has no page");
});

