/* eslint-disable */
// ----------------------------
// Domain constants
// ----------------------------
export const ANGLE_BUCKETS = [
    { key: "frontal", label: "Frontal" },
    { key: "l3q", label: "Left 3/4" },
    { key: "r3q", label: "Right 3/4" },
    { key: "lprofile", label: "Left Profile" },
    { key: "rprofile", label: "Right Profile" },
    { key: "up", label: "Up" },
    { key: "down", label: "Down" },
];

export const STATUS = {
    VERIFIED: "Verified",
    NEEDS_REVIEW: "Needs Review",
    NOISE: "Noise",
};

export const ASSET_KIND = {
    PERSON: "person",
    LANDSCAPE: "landscape",
    ARCHITECTURE: "architecture",
    FILM: "film",
    PRODUCT: "product",
    DOCUMENT: "document",
};

export const ASSET_KIND_LABEL = {
    [ASSET_KIND.PERSON]: "People",
    [ASSET_KIND.LANDSCAPE]: "Landscape",
    [ASSET_KIND.ARCHITECTURE]: "Architecture",
    [ASSET_KIND.FILM]: "Film",
    [ASSET_KIND.PRODUCT]: "Product",
    [ASSET_KIND.DOCUMENT]: "Document",
};

// ----------------------------
// Helpers
// ----------------------------
export function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

export function randInt(a: number, b: number) {
    return Math.floor(a + Math.random() * (b - a + 1));
}

export function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function hashColor(str: string) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    const a = 30 + (h % 60);
    const b = 30 + ((h >>> 8) % 60);
    const c = 30 + ((h >>> 16) % 60);
    return `hsl(${a}, ${b}%, ${c}%)`;
}

// ----------------------------
// Logic
// ----------------------------

export function autoPickReferences(faces: any[], strictness = 0.55) {
    const out: Record<string, string> = {};
    const byBucket: Record<string, any[]> = {};

    for (const f of faces) {
        if (f.excluded) continue;
        (byBucket[f.bucket] ||= []).push(f);
    }

    for (const b of ANGLE_BUCKETS) {
        const arr = (byBucket[b.key] || []).slice();
        arr.sort((a, c) => {
            const pa = Math.abs(a.yaw) + Math.abs(a.pitch) * 0.6;
            const pc = Math.abs(c.yaw) + Math.abs(c.pitch) * 0.6;
            const sa = a.quality - strictness * (pa / 120);
            const sc = c.quality - strictness * (pc / 120);
            return sc - sa;
        });
        if (arr.length) out[b.key] = arr[0].id;
    }

    return out;
}

export function deriveCoverageFromRefs(refs: Record<string, string>) {
    const cov: Record<string, boolean> = {};
    for (const b of ANGLE_BUCKETS) cov[b.key] = !!refs?.[b.key];
    return cov;
}

// ----------------------------
// Mock data generators
// ----------------------------
export function makeMockPeople() {
    const base = [
        { id: "p001", name: "Person 001", tags: ["clientA"] },
        { id: "p002", name: "Person 002", tags: ["campaign"] },
        { id: "p003", name: "Person 003", tags: [] },
        { id: "p004", name: "Person 004", tags: ["vip"] },
        { id: "p005", name: "Person 005", tags: [] },
        { id: "p006", name: "Person 006", tags: ["test"] },
        { id: "p007", name: "Person 007", tags: [] },
    ];

    return base.map((p, i) => {
        const confidence = clamp(0.72 + Math.random() * 0.26 - (i === 5 ? 0.18 : 0), 0.55, 0.98);
        const faces = randInt(8, 220);
        const assets = clamp(Math.round(faces / randInt(2, 5)), 2, 120);

        const coverage: Record<string, boolean> = {};
        for (const b of ANGLE_BUCKETS) {
            const missChance = i === 5 ? 0.45 : 0.18;
            coverage[b.key] = Math.random() > missChance;
        }
        coverage.frontal = Math.random() > (i === 5 ? 0.25 : 0.05);

        const status = confidence >= 0.9 ? STATUS.VERIFIED : STATUS.NEEDS_REVIEW;

        return {
            ...p,
            confidence,
            faces,
            assets,
            status,
            coverage,
            createdAt: Date.now() - randInt(1, 15) * 86400_000,
            coverSeed: `${p.id}_cover`,
        };
    });
}

export function makeMockAssets(people: any[]) {
    const sources = ["Batch 2026-01-16", "Camera Roll", "Client Upload", "WeChat Export", "Project X"];
    const kinds = Object.values(ASSET_KIND);

    const assets = [];
    for (let i = 1; i <= 48; i++) {
        const id = `a${String(i).padStart(3, "0")}`;
        const src = pick(sources);
        const kind = pick(kinds);

        const hasMulti = kind === ASSET_KIND.PERSON && Math.random() < 0.25;
        const includedPeople =
            kind === ASSET_KIND.PERSON
                ? hasMulti
                    ? [pick(people).id, pick(people).id].filter((v, idx, arr) => arr.indexOf(v) === idx)
                    : [pick(people).id]
                : [];

        assets.push({
            id,
            kind,
            filename:
                kind === ASSET_KIND.DOCUMENT
                    ? `DOC_${randInt(1000, 9999)}.png`
                    : `IMG_${randInt(1000, 9999)}.jpg`,
            source: src,
            createdAt: Date.now() - randInt(0, 20) * 86400_000,
            people: includedPeople,
            faces: kind === ASSET_KIND.PERSON ? randInt(1, 3) : 0,
            tags: kind === ASSET_KIND.PERSON ? ["portrait"] : [pick(["travel", "cinema", "design", "reference"])],
        });
    }
    return assets;
}

export function makeMockFaces(personId: string, assetIds: string[]) {
    const faces = [];
    const baseAngles = [
        { yaw: 0, pitch: 0, label: "Frontal", bucket: "frontal" },
        { yaw: -28, pitch: 0, label: "Left 3/4", bucket: "l3q" },
        { yaw: 28, pitch: 0, label: "Right 3/4", bucket: "r3q" },
        { yaw: -60, pitch: 0, label: "Left Profile", bucket: "lprofile" },
        { yaw: 60, pitch: 0, label: "Right Profile", bucket: "rprofile" },
        { yaw: 0, pitch: 18, label: "Up", bucket: "up" },
        { yaw: 0, pitch: -18, label: "Down", bucket: "down" },
    ];

    const n = randInt(18, 65);
    for (let i = 0; i < n; i++) {
        const base = pick(baseAngles);
        const yaw = clamp(base.yaw + randInt(-10, 10), -75, 75);
        const pitch = clamp(base.pitch + randInt(-10, 10), -35, 35);
        const quality = clamp(0.55 + Math.random() * 0.45 - (Math.abs(yaw) > 55 ? 0.08 : 0), 0.35, 0.98);
        faces.push({
            id: `${personId}_f${String(i + 1).padStart(3, "0")}`,
            personId,
            assetId: pick(assetIds),
            yaw,
            pitch,
            roll: randInt(-8, 8),
            quality,
            angleLabel: base.label,
            bucket: base.bucket,
            excluded: Math.random() < 0.05,
            pinned: false,
        });
    }

    return faces;
}
