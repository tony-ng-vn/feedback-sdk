import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { makeToken, randomSecret, sha256Hex, TOKEN_PREFIXES } from "./keys";

export const create = mutation({
  args: { slug: v.string() },
  returns: v.object({
    projectId: v.id("projects"),
    submitToken: v.string(),
    adminKey: v.string(),
  }),
  handler: async (ctx, args) => {
    const slug = args.slug.trim();
    if (slug === "") {
      throw new Error("Slug is required");
    }
    const existing = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing !== null) {
      throw new Error("Project already exists");
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
  },
});
