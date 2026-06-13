/// <reference path="../manga-provider.d.ts" />
interface ListChaptersResponse {
  total_chapters: number;
  total_pages: number;
  current_page: number;
  chapters_to_display: {
    id: string;
    name: string;
    name_extend: string;
    number: string;
    link: string;
    date: string;
  }[];
}

class Provider {
  private useProxyBypass = "{{useProxyBypassMangasNoSekai}}";
  private proxyBypassUrl = "{{proxyBypassUrlMangasNoSekai}}";
  private baseUrl = "https://mangasnosekai.com";
  private cookies = "";
  private userAgent = "";

  getSettings(): Settings {
    return {
      supportsMultiLanguage: false,
      supportsMultiScanlator: false,
    };
  }

  private stringToBool(str: string): boolean {
    return str.toLowerCase() === "true";
  }

  async search(opts: QueryOptions): Promise<SearchResult[]> {
    const res = await this.safeFetch(
      `${this.baseUrl}/?s=${opts.query.trim().replaceAll(" ", "+")}&post_type=wp-manga`,
    );

    if (!res.ok) return [];

    const searchHtml = await res.text();

    const links = [
      ...searchHtml.matchAll(
        /class="tab-thumb[^"]*"[^>]*>[\s\S]*?<a\s+href="([^"]+)"/g,
      ),
    ].map((m) => m[1]);
    const urls = [...new Set(links)];

    const series: SearchResult[] = [];

    for (const url of urls) {
      const serieRes = await this.safeFetch(`${url}`);
      if (serieRes.ok) {
        const html = await serieRes.text();
        const $ = LoadDoc(html);

        const id =
          $('.wp-manga-action-button-new[data-action="bookmark"]')
            .attr("data-post")
            ?.trim() ?? "";
        const title = $(".thumble-container .col-12 .titleMangaSingle")
          .text()
          ?.trim();
        const image = $(".thumble-container img").attr("data-src")?.trim();
        let synonyms: string[] = [];

        $("#section-sinopsis.tab-pane")
          .find(".col-md-6.mb-3")
          .each((i, e) => {
            const iText = e.text()?.trim() ?? "";
            if (iText.includes("Otros nombres:")) {
              const rText = iText.split("Otros nombres:")[1].trim();
              synonyms = rText.split(",");
            }
          });

        series.push({
          id,
          title,
          synonyms,
          image: new URL(
            `${image}&headers=${JSON.stringify({
              Referer: `${this.baseUrl}`,
              "User-Agent": this.userAgent,
              Cookie: this.cookies,
            })}`,
          ).href,
        });
      }
    }

    return series;
  }

  async findChapters(mangaId: string): Promise<ChapterDetails[]> {
    const getPage = async (page: number = 1) => {
      const formData = new FormData();
      formData.append("action", "muslitos_anti_hack");
      formData.append("mangaid", mangaId);
      formData.append("secret", "mihonsuckmydick");
      formData.append("page", page.toString());

      const res = await this.safeFetch(
        `${this.baseUrl}/wp-json/muslitos/v1/getcaps7`,
        {
          method: "POST",
          body: formData,
        },
      );

      if (!res.ok) {
        return {
          total_chapters: 0,
          total_pages: 1,
          current_page: 1,
          chapters_to_display: [],
        };
      }

      return res.json();
    };

    const resPage: ListChaptersResponse = await getPage(1);
    const listChapters = resPage.chapters_to_display;
    const countPages = resPage.total_pages;

    for (let i = 2; i <= countPages; i++) {
      const resPage: ListChaptersResponse = await getPage(i);
      listChapters.push(...resPage.chapters_to_display);
    }

    return listChapters.map((i) => ({
      id: i.link.split(this.baseUrl)[1],
      url: i.link,
      title: `${i.name}${i.name_extend ? " - " + i.name_extend : ""}`,
      chapter: i.number,
      index: parseInt(i.number),
    }));
  }

  async findChapterPages(chapterId: string): Promise<ChapterPage[]> {
    const res = await this.safeFetch(`${this.baseUrl}${chapterId}`);

    if (!res.ok) return [];

    const html = await res.text();

    const $ = LoadDoc(html);

    const pages: string[] = [];

    $(".reading-content")
      .children(".page-break")
      .each((i, e) => {
        const url = e.find("img").attr("data-src")?.trim() ?? "";
        if (url) pages.push(url);
      });

    return pages.map((url, index) => ({
      index,
      url: new URL(url).href,
      headers: {
        Referer: `${this.baseUrl}${chapterId}`,
        "User-Agent": this.userAgent,
        Cookie: this.cookies,
      },
    }));
  }

  private async getValidSessionHeaders(): Promise<void> {
    try {
      const res = await fetch(`${this.proxyBypassUrl}/v1`, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "request.get",
          url: `${this.baseUrl}/wp-content/uploads/2024/02/cropped-favimuslos-32x32.png`,
          maxTimeout: 60000,
        }),
      });
      const data = await res.json();

      if (data.solution?.cookies) {
        this.cookies = data.solution.cookies
          .map((c: any) => `${c.name}=${c.value}`)
          .join("; ");
      }

      if (data.solution?.userAgent) {
        this.userAgent = data.solution.userAgent;
      }

      return;
    } catch (e) {
      console.error(e);
      return;
    }
  }

  private async safeFetch(
    input: string | URL | Request,
    init: RequestInit | undefined = { headers: {} },
  ): Promise<Response> {
    if (this.stringToBool(this.useProxyBypass)) {
      await this.getValidSessionHeaders();
      this.useProxyBypass = "false";
    }
    const fetchOptions = {
      ...init,
      headers: {
        ...init?.headers,
        "User-Agent": this.userAgent,
        Cookie: this.cookies,
      },
    };

    return fetch(input, fetchOptions);
  }
}
