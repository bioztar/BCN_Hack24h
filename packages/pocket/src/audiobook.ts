/** Late TTS URLs by line id: `{type:"audio"}` can arrive before or after its line is played. */
export class AudioBook {
  private urls = new Map<string, string>();
  private waiters = new Map<string, Array<(url: string | null) => void>>();

  set(id: string, url: string): void {
    this.urls.set(id, url);
    const ws = this.waiters.get(id);
    this.waiters.delete(id);
    ws?.forEach((w) => w(url));
  }

  get(id: string): string | null {
    return this.urls.get(id) ?? null;
  }

  /** Resolves with the URL as soon as it arrives, or null after `ms`. */
  wait(id: string, ms: number): Promise<string | null> {
    const have = this.get(id);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      const done = (url: string | null) => {
        clearTimeout(timer);
        resolve(url);
      };
      const timer = setTimeout(() => {
        const ws = this.waiters.get(id)?.filter((w) => w !== done);
        if (ws?.length) this.waiters.set(id, ws);
        else this.waiters.delete(id);
        resolve(null);
      }, ms);
      this.waiters.set(id, [...(this.waiters.get(id) ?? []), done]);
    });
  }

  clear(): void {
    this.urls.clear();
    for (const ws of this.waiters.values()) ws.forEach((w) => w(null));
    this.waiters.clear();
  }
}
