import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

type Ctx = { params: Promise<{ path?: string[] }> };

async function proxy(req: NextRequest, ctx: Ctx) {
    const { path } = await ctx.params; // ✅ IMPORTANT: params is a Promise in recent Next
    const parts = Array.isArray(path) ? path : [];

    const upstream = new URL(`${API_BASE.replace(/\/+$/, "")}/${parts.join("/")}`);

    // copy query string
    const url = new URL(req.url);
    url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

    // clone headers (remove hop-by-hop headers)
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.delete("connection");

    if (!headers.get("x-request-id")) {
        const rid =
            (globalThis.crypto as any)?.randomUUID?.()?.replaceAll("-", "").toUpperCase() ??
            Math.random().toString(16).slice(2).toUpperCase();
        headers.set("x-request-id", rid);
    }

    let body: ArrayBuffer | undefined = undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
        body = await req.arrayBuffer();
    }

    const res = await fetch(upstream.toString(), {
        method: req.method,
        headers,
        body: body ? (body as any) : undefined,
    });

    const outHeaders = new Headers(res.headers);
    outHeaders.set("access-control-expose-headers", "x-request-id");

    return new Response(res.body, { status: res.status, headers: outHeaders });
}

export async function GET(req: NextRequest, ctx: Ctx) {
    return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: Ctx) {
    return proxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
    return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
    return proxy(req, ctx);
}
