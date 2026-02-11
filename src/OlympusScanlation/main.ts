class Provider {
  private api = "https://dashboard.olympusbiblioteca.com/api";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  async search(opts: { query: string }): Promise<SearchResult[]> {
    const res = await fetch(
      `${this.api}/search?name=${opts.query.replaceAll(" ", "+")}`,
    );
    const data = await res.json();

    if (!data?.data) return [];

    const series = data.data.filter((item: any) => item.type === "comic");

    return series.map((item: any) => ({
      id: item.slug,
      title: item.name,
      synonyms: [],
      year: 1,
      image: item.cover,
    }));
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const res = await fetch(
      `${this.api}/series/${mangaId}/chapters?type=comic`,
    );
    const dataFirstPage = await res.json();

    if (!dataFirstPage?.data) return [];

    const countPages = dataFirstPage.meta.last_page;
    const chapters: Array<any> = dataFirstPage.data ?? [];

    for (let i = 2; i <= countPages; i++) {
      const resPage = await fetch(
        `${this.api}/series/${mangaId}/chapters?type=comic&page=${i}`,
      );
      const dataPage = await resPage.json();
      chapters.push(...dataPage.data);
    }

    return chapters.map((item: any) => ({
      id: `${mangaId}_$_${item.id}`,
      url: `${this.api}/series/${mangaId}/chapters/${item.id}?type=comic`,
      title: `Chapter ${item.name}`,
      chapter: item.name,
      index: parseInt(item.name) ?? 0,
      language: "es",
      updatedAt: item.published_at,
    }));
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const [mangaId, chapter] = chapterId.split("_$_");
    const res = await fetch(
      `${this.api}/series/${mangaId}/chapters/${chapter}?type=comic`,
    );
    const data = await res.json();
    const images = data.chapter?.pages;

    if (!images?.length) return [];

    const referer = `https://${this.api.split(".")[1]}.com`;

    return images.map((img: any[], i: number) => ({
      url: img,
      index: i,
      headers: {
        Referer: referer,
      },
    }));
  }
}
