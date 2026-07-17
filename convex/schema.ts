import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    slug: v.string(),
    submitTokenHash: v.string(),
    adminKeyHash: v.string(),
    // null while single-tenant; becomes the tenancy boundary when public.
    owner: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_submit_hash", ["submitTokenHash"])
    .index("by_admin_hash", ["adminKeyHash"]),

  feedback: defineTable({
    projectId: v.id("projects"),
    category: v.string(),
    message: v.string(),
    pageContext: v.union(v.string(), v.null()),
    // JSON stringified freeform blob from the host app.
    metadata: v.union(v.string(), v.null()),
    submitter: v.union(v.string(), v.null()),
    status: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_project", ["projectId", "createdAt"]),
});
