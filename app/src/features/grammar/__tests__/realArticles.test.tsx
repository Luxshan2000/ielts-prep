/**
 * Renders every article in the shipped reference and fails on anything the reader must
 * never see.
 *
 * ArticleBody has twice been written against the block template instead of the articles that
 * actually ship, and both times the damage was invisible from the code: a block type with no
 * case in the switch renders nothing at all, so the page simply gets shorter. Before this
 * test, 91 blocks across 62 of the 99 articles rendered as literally nothing, 21 form tables
 * printed their internal row weights as a column, and 288 authoring asterisks were on screen.
 *
 * So the pack itself is the fixture. If an author adds a block type, this fails until the
 * renderer knows about it.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleBody, type Block } from "../components/theory/ArticleBody";

/** The pack lives beside the app rather than inside it, so walk up to the repo root. */
function findPack(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, "content/core-en/data/theory.jsonl");
    if (existsSync(candidate)) return candidate;
    dir = dirname(dir);
  }
  throw new Error("theory.jsonl not found above " + process.cwd());
}

const PACK = findPack();

interface Article {
  id: string;
  title: string;
  article_json: { body?: Block[] };
}

const articles: Article[] = readFileSync(PACK, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Article);

/** Every block in the pack, tagged with the article it came from. */
const blocks: { article: string; block: Block }[] = articles.flatMap((a) =>
  (a.article_json.body ?? []).map((block) => ({ article: a.id, block })),
);

// Authoring bookkeeping — ids, anchors, taxonomy buckets. These are deliberately not on the
// page, so they are not evidence of a dropped block.
const BOOKKEEPING = new Set([
  "anchor",
  "anchor_id",
  "code",
  "id",
  "goto",
  "kind",
  "point_id",
  "role",
  "style",
  "type",
  "weight",
  "variation_ref",
  "full_treatment_article",
]);

/** The long strings in a block that a reader is meant to end up seeing. */
function contentStrings(value: unknown, key = ""): string[] {
  if (typeof value === "string") {
    return !BOOKKEEPING.has(key) && value.trim().length >= 12 ? [value] : [];
  }
  if (Array.isArray(value)) return value.flatMap((v) => contentStrings(v, key));
  if (value != null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => contentStrings(v, k));
  }
  return [];
}

/** What the reader sees, with emphasis resolved — the same string in every assertion below. */
function renderedText(block: Block): string {
  const { container } = render(<ArticleBody body={[block]} />);
  const text = container.textContent ?? "";
  cleanup();
  return text;
}

describe("the shipped reference, rendered", () => {
  it("ships 99 articles and no block type the renderer has never seen", () => {
    expect(articles.length).toBe(99);
    const unrendered = blocks.filter(({ block }) => {
      const wanted = contentStrings(block);
      if (wanted.length === 0) return false;
      const text = renderedText(block);
      // Emphasis is stripped on the way out, so compare without the asterisks.
      return !wanted.some((s) => text.includes(s.replace(/\*/g, "").slice(0, 40)));
    });
    expect(
      unrendered.map(({ article, block }) => `${article}:${String(block.type)}`),
    ).toEqual([]);
  });

  it("never prints [object Object] or a stray undefined", () => {
    const bad = blocks
      .map(({ article, block }) => ({ article, type: String(block.type), text: renderedText(block) }))
      .filter((b) => b.text.includes("[object Object]") || /\bundefined\b/.test(b.text));
    expect(bad.map((b) => `${b.article}:${b.type}`)).toEqual([]);
  });

  it("never shows the authoring syntax — no asterisks, no article ids", () => {
    const bad = blocks
      .map(({ article, block }) => ({ article, type: String(block.type), text: renderedText(block) }))
      .filter((b) => b.text.includes("*") || b.text.includes("[th_"));
    expect(bad.map((b) => `${b.article}:${b.type} — ${b.text.slice(0, 80)}`)).toEqual([]);
  });

  it("never shows an internal row weight or exception bucket", () => {
    // A form table row carries weight "high"/"medium"/"low" and an exception carries a kind
    // of "A"/"B"/"C". Both once appeared as visible table text.
    const bad = blocks
      .filter(({ block }) => block.type === "paradigm" || block.type === "exceptions")
      .map(({ article, block }) => ({ article, type: String(block.type), text: renderedText(block) }))
      .filter((b) => /(^|[^a-z])(high|medium|low)([^a-z]|$)/.test(b.text.toLowerCase()));
    expect(bad.map((b) => `${b.article}:${b.type}`)).toEqual([]);
  });

  it("keeps every column of a form table", () => {
    for (const { article, block } of blocks.filter((b) => b.block.type === "paradigm")) {
      const headers = (block.headers as string[]) ?? [];
      const { container } = render(<ArticleBody body={[block]} />);
      const firstBody = container.querySelector("tbody tr");
      expect(firstBody?.querySelectorAll("td").length, `${article} row width`).toBe(headers.length);
      cleanup();
    }
  });

  it("shows both halves of every decision tree", () => {
    for (const { article, block } of blocks.filter((b) => b.block.type === "decision_tree")) {
      const text = renderedText(block);
      for (const step of (block.steps as Block[]) ?? []) {
        for (const branch of (step.branches as Block[]) ?? []) {
          expect(text, `${article} branch`).toContain(String(branch.answer).replace(/\*/g, ""));
        }
      }
    }
  });
});
