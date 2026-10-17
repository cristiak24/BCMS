import express, { type Router } from 'express';
import type { AddressInfo } from 'net';

/**
 * Mounts routers on a throwaway Express app on a free local port, for tests
 * that go through the real HTTP layer. Call `close()` in `after`.
 */
export async function serve(mounts: Record<string, Router>) {
    const app = express();
    app.use(express.json());
    for (const [path, router] of Object.entries(mounts)) app.use(path, router);
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function call(method: string, path: string, init: { auth?: string; body?: unknown; headers?: Record<string, string> } = {}) {
        const response = await fetch(`${base}${path}`, {
            method,
            headers: {
                'content-type': 'application/json',
                ...(init.auth ? { authorization: init.auth } : {}),
                ...init.headers,
            },
            body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const text = await response.text();
        let body: any = text;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        return { status: response.status, body, headers: response.headers };
    }

    return {
        call,
        close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
}
