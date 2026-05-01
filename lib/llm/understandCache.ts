import type { UnderstoodQuery } from "./types.ts";

export class UnderstandCache<V> {
  private map = new Map<string, V>();
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error("UnderstandCache capacity must be > 0");
    this.capacity = capacity;
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}

export const understandCache = new UnderstandCache<UnderstoodQuery>(100);

export function normalizeCacheKey(
  mode: "genre" | "artist" | "song",
  input: string | { title: string; artist: string },
): string {
  if (mode === "song") {
    const s = input as { title: string; artist: string };
    return `song:${norm(s.title)}|${norm(s.artist)}`;
  }
  return `${mode}:${norm(input as string)}`;
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
