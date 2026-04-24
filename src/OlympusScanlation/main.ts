/// <reference path="../manga-provider.d.ts" />

interface SerieItemList {
  id: number;
  name: string;
  slug: string;
  cover: string;
  type: "comic" | "novel";
}

interface ResponseChapterItem {
  name: string;
  id: number;
  team: { id: number; name: "Olympus" };
  published_at: string;
}

interface ResponseChapterList {
  data: ResponseChapterItem[];
  meta: {
    current_page: number;
    last_page: number;
  };
}

class Provider {
  private webUrl = "https://olympusbiblioteca.com";
  private baseUrl = "https://dashboard.olympusbiblioteca.com";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: true,
    };
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await fetch(`${this.webUrl}/api/series/list`);

    if (!res.ok) return [];

    const data: { data: SerieItemList[] } = await res.json();

    const series = data.data.filter(
      (item) =>
        item.name.toLowerCase().includes(opts.query.toLowerCase()) &&
        item.type === "comic",
    );

    return series.map((item) => ({
      id: item.slug,
      title: item.name,
      image: item.cover,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const request = (page: number) =>
      fetch(
        `${this.baseUrl}/api/series/${mangaId}/chapters?type=comic&page=${page}&direction=desc`,
      );

    const res = await request(1);
    if (!res.ok) return [];

    const dataFirstPage: ResponseChapterList = await res.json();

    const listChapters: ResponseChapterItem[] = dataFirstPage.data;
    const countPages = dataFirstPage.meta.last_page;

    for (let i = 2; i <= countPages; i++) {
      const resPage = await request(i);
      if (!resPage.ok) break;

      const jsonPage: ResponseChapterList = await resPage.json();
      listChapters.push(...jsonPage.data);
    }

    return listChapters.map((item) => ({
      id: `${item.id}/comic-${mangaId}`,
      url: `${this.webUrl}/capitulo/${item.id}/comic-${mangaId}`,
      title: `Capítulo ${item.name}`,
      chapter: item.name,
      index: parseInt(item.name) ?? 0,
      scanlator: item.team.name,
      updatedAt: item.published_at,
    }));
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await fetch(`${this.webUrl}/capitulo/${chapterId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const regexSrc = /<img[^>]*src="([^"]*)"[^>]*>/gi;
    const listPages = [...html.matchAll(regexSrc)].map((match) => match[1]); // ?

    return listPages
      .filter(
        (item) =>
          item.startsWith(`${this.baseUrl}/storage/comics/`) &&
          item.includes(chapterId.split("/")[0]),
      )
      .map((match, index) => ({
        url: match.trim(),
        index: index + 1,
        headers: { Referer: `${this.webUrl}/capitulo/${chapterId}` },
      }));
  }
}
