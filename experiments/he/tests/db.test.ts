import assert from "node:assert/strict";
import { test } from "node:test";
import { mysqlUrl } from "../db";

test("MySQL URL comes from HE_MYSQL_URL and errors never echo it", () => {
  assert.equal(mysqlUrl({ HE_MYSQL_URL: "mysql://he:secret@127.0.0.1:3306/he" }), "mysql://he:secret@127.0.0.1:3306/he");
  assert.throws(() => mysqlUrl({}), /not set/);
  assert.throws(() => mysqlUrl({ HE_MYSQL_URL: "he:secret@localhost" }), error => !String(error).includes("secret"));
});
