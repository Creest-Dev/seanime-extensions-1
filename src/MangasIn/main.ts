/// <reference path="../manga-provider.d.ts" />

interface WorkerResponse {
  success: boolean;
  data: {
    id: string;
    slug: string;
    name: string;
    number: string;
    updated_at: string;
  }[];
}

class Provider {
  private baseUrl = "https://m440.in";
  private workerUrl = "https://curly-haze-60fa.branrgx.workers.dev";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.baseUrl}/search/?q=${encodeURIComponent(opts.query)}`,
      { headers: { Referer: `${this.baseUrl}/` } },
    );

    if (!res.ok) return [];

    const json = await res.json();

    return json.map((item: any) => ({
      id: item.data,
      title: item.value,
      image: `${this.baseUrl}/uploads/manga/${item.data}/cover/cover_250x350.jpg`,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await fetch(`${this.baseUrl}/manga/${mangaId}`, {
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const match = html.match(/const\s+UsaPoncho\s*=\s*"((?:[^"\\]|\\.)*)"/s);
    const raw = match ? match[1] : "";
    if (!raw) return [];

    let data = raw;
    const tries = 4;
    for (let i = 1; typeof data === "string"; i++) {
      if (i > tries) break;

      if (i === 1) {
        data = JSON.parse(`"${data}"`);
      } else {
        data = JSON.parse(data);
      }
    }

    const worker = await fetch(`${this.workerUrl}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });

    if (!worker.ok) return [];

    const workerData: WorkerResponse = await worker.json();

    return workerData.data.map((item) => ({
      id: `${mangaId}/${item.slug}`,
      title: item.name,
      chapter: item.number,
      url: `${this.baseUrl}/manga/${mangaId}/${item.slug}`,
      index: parseInt(item.number) ?? 0,
    }));
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.baseUrl}/manga/${chapterId}`, {
      headers: { Referer: `${this.baseUrl}/` },
    });

    if (!res.ok) return [];

    const html = await res.text();
    const divMatch = html.match(
      /<div[^>]*id=["']all["'][^>]*>([\s\S]*?)<\/div>/i,
    );

    if (!divMatch) return [];

    const innerHTML = divMatch[1];

    const imgMatches = [
      ...innerHTML.matchAll(/<img[^>]+src=["']([^"']+)["']/gi),
    ];

    return imgMatches.map((url, index) => ({
      url: url[1],
      index,
      headers: { Referer: `${this.baseUrl}/manga/${chapterId}` },
    }));
  }
}
