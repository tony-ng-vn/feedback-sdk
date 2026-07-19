import { mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { makeToken, randomSecret, sha256Hex, TOKEN_PREFIXES } from "./keys";

const created = v.object({
  projectId: v.id("projects"),
  submitToken: v.string(),
  adminKey: v.string(),
});

// Shared by the public mutation and the HTTP provisioning endpoint. Returns
// null (rather than throwing) on a duplicate slug so callers can tell "already
// exists" apart from other failures without string-matching an error message.
async function provisionProject(ctx: MutationCtx, rawSlug: string) {
  const slug = rawSlug.trim();
  if (slug === "") {
    throw new Error("Slug is required");
  }
  const existing = await ctx.db
    .query("projects")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing !== null) {
    return null;
  }
  const submitToken = makeToken(TOKEN_PREFIXES.submit, slug, randomSecret());
  const adminKey = makeToken(TOKEN_PREFIXES.admin, slug, randomSecret());
  const projectId = await ctx.db.insert("projects", {
    slug,
    submitTokenHash: await sha256Hex(submitToken),
    adminKeyHash: await sha256Hex(adminKey),
    owner: null,
    createdAt: Date.now(),
  });
  return { projectId, submitToken, adminKey };
}

export const create = mutation({
  args: { slug: v.string() },
  returns: created,
  handler: async (ctx, args) => {
    const result = await provisionProject(ctx, args.slug);
    if (result === null) {
      throw new Error("Project already exists");
    }
    return result;
  },
});

// Used by the HTTP /projects endpoint (convex/http.ts), which needs the
// duplicate-slug case as data, not an exception, to return a 409.
export const createInternal = internalMutation({
  args: { slug: v.string() },
  returns: v.union(created, v.null()),
  handler: async (ctx, args) => provisionProject(ctx, args.slug),
});
