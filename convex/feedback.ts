import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const LIST_LIMIT = 100;

export const projectBySubmitHash = internalQuery({
  args: { hash: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_submit_hash", (q) => q.eq("submitTokenHash", args.hash))
      .unique();
    return project === null ? null : project._id;
  },
});

export const projectByAdminHash = internalQuery({
  args: { hash: v.string() },
  returns: v.union(v.id("projects"), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_admin_hash", (q) => q.eq("adminKeyHash", args.hash))
      .unique();
    return project === null ? null : project._id;
  },
});

export const insert = internalMutation({
  args: {
    projectId: v.id("projects"),
    category: v.string(),
    message: v.string(),
    pageContext: v.union(v.string(), v.null()),
    metadata: v.union(v.string(), v.null()),
    submitter: v.union(v.string(), v.null()),
  },
  returns: v.id("feedback"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("feedback", {
      projectId: args.projectId,
      category: args.category,
      message: args.message,
      pageContext: args.pageContext,
      metadata: args.metadata,
      submitter: args.submitter,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listByProject = internalQuery({
  args: { projectId: v.id("projects"), status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("feedback")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(LIST_LIMIT);
    if (args.status === undefined) return rows;
    return rows.filter((r) => r.status === args.status);
  },
});

export const setStatus = internalMutation({
  args: {
    projectId: v.id("projects"),
    id: v.id("feedback"),
    status: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    // Never touch a row that is missing or belongs to another project.
    if (row === null || row.projectId !== args.projectId) {
      return false;
    }
    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
    return true;
  },
});

export const remove = internalMutation({
  args: { projectId: v.id("projects"), id: v.id("feedback") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    // Never delete a row that is missing or belongs to another project.
    if (row === null || row.projectId !== args.projectId) {
      return false;
    }
    await ctx.db.delete(args.id);
    return true;
  },
});
