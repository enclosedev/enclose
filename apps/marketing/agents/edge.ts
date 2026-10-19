// Vercel Routing Middleware: the entry scripts/agents.ts bundles into
// .vercel/output/functions/_middleware.func, with the pages' Markdown put in for DOCUMENTS.
import { respond, type Documents } from './middleware'

declare const DOCUMENTS: Documents

export default function middleware(request: Request): Response {
  return respond(request, DOCUMENTS)
}
