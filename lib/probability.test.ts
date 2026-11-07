import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProbability } from "./probability";

describe("formatProbability", () => {
  it("shows 1 in N as a whole number, with commas", () => {
    assert.equal(formatProbability(1, "odds"), "1 in 1");
    assert.equal(formatProbability(0.75, "odds"), "1 in 1");
    assert.equal(formatProbability(0.6411505507359839, "odds"), "1 in 2");
    assert.equal(formatProbability(0.5, "odds"), "1 in 2");
    assert.equal(formatProbability(0.4, "odds"), "1 in 3");
    assert.equal(formatProbability(0.1234, "odds"), "1 in 8");
    assert.equal(formatProbability(0.1, "odds"), "1 in 10");
    assert.equal(formatProbability(0.1003, "odds"), "1 in 10");
    assert.equal(formatProbability(0.0064, "odds"), "1 in 156");
    assert.equal(formatProbability(0.001, "odds"), "1 in 1,000");
    assert.equal(formatProbability(0.000123, "odds"), "1 in 8,130");
  });

  it("shows a percentage with two decimals", () => {
    assert.equal(formatProbability(0.1234, "percent"), "12.34%");
    assert.equal(formatProbability(0.0064, "percent"), "0.64%");
    assert.equal(formatProbability(0.001, "percent"), "0.10%");
    assert.equal(formatProbability(1, "percent"), "100.00%");
  });

  it("shows <0.01% where two decimals would round to zero", () => {
    assert.equal(formatProbability(0.00004, "percent"), "<0.01%");
    assert.equal(formatProbability(0.00005, "percent"), "0.01%");
  });

  it("shows nothing with no share", () => {
    assert.equal(formatProbability(null, "odds"), null);
    assert.equal(formatProbability(undefined, "percent"), null);
    assert.equal(formatProbability(0, "odds"), null);
  });
});
