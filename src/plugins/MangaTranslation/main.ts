/// <reference path="../../plugin.d.ts" />
/// <reference path="../../system.d.ts" />
/// <reference path="../../app.d.ts" />
/// <reference path="../../core.d.ts" />

function init() {
  $ui.register((ctx) => {
    const tray = ctx.newTray({
      tooltipText: "My plugin",
      iconUrl: "https://seanime.rahim.app/logo_2.png",
      withContent: true,
      isDrawer: false, // Choose whether the tray contents are displayed in a drawer
    });
  });

  // This hook is triggered before Seanime formats the library data of an anime
  // The event contains the variables that Seanime will use, and you can modify them
  $app.onMangaChapterContainerRequested((e) => {
    console.log("provider", e.provider);
    console.log("media", e.mediaId);
    console.log("title", e.titles);
    console.log("year", e.year);
    console.log("container", e.chapterContainer);

    // Prevent default behavior if needed
    // e.preventDefault();

    e.next();
  });
}
