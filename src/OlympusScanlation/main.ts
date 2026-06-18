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
  team: { id: number; name: "Olympus" } | null;
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
  private webUrl = "{{webUrl}}";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: true,
    };
  }

  private formatUrl(
    url: string,
    defaultProtocol: "http" | "https" = "https",
    subdomain?: string,
  ) {
    if (url.endsWith("/")) url = url.slice(0, -1);
    if (!url.startsWith("http")) url = `${defaultProtocol}://` + url;
    if (!url.startsWith("https")) url = `${defaultProtocol}://` + url;
    if (subdomain) url = url.replace("://", `://${subdomain}.`);
    return url;
  }

  private getApiUrl() {
    let url = this.webUrl || "https://dashboard.olympusbiblioteca.com";
    return this.formatUrl(url, "https", "dashboard");
  }

  private getWebUrl() {
    let url = this.webUrl || "https://olympusbiblioteca.com";
    return this.formatUrl(url, "https");
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const url = this.getWebUrl();
    const res = await fetch(`${url}/api/series/list`);

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
    const url = this.getApiUrl();
    const webUrl = this.getWebUrl();
    const request = (page: number) =>
      fetch(
        `${url}/api/series/${mangaId}/chapters?type=comic&page=${page}&direction=desc`,
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

    return listChapters
      .map((item) => ({
        id: `${item.id}/comic-${mangaId}`,
        url: `${webUrl}/capitulo/${item.id}/comic-${mangaId}`,
        title: `Capítulo ${item.name}`,
        chapter: item.name,
        index: parseInt(item.name) ?? 0,
        scanlator: item.team?.name ?? "Olympus",
        updatedAt: item.published_at,
      }))
      .reverse();
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const apiUrl = this.getApiUrl();
    const webUrl = this.getWebUrl();
    const res = await fetch(`${webUrl}/capitulo/${chapterId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const pages: string[] = [];

    $("div.flex.flex-col.rounded-xl.overflow-hidden.shadow-xl")
      .children("div")
      .each((i, e) => {
        const img = e.find("img");
        if (!img) return;

        const url = img.attr("src");
        if (!url) return;

        pages.push(url.trim());
      });

    return pages.map((e, i) => ({
      url: e.trim(),
      index: i + 1,
      headers: { Referer: `${webUrl}/capitulo/${chapterId}` },
    }));
  }
}
