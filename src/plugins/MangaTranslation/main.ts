/// <reference path="../../plugin.d.ts" />
/// <reference path="../../system.d.ts" />
/// <reference path="../../app.d.ts" />
/// <reference path="../../core.d.ts" />

function init() {
  // This hook is triggered before Seanime formats the library data of an anime
  // The event contains the variables that Seanime will use, and you can modify them
  $app.onMangaChapterContainerRequested((e) => {
    console.log(e.provider);
    console.log(e.mediaId);
    console.log(e.titles);
    console.log(e.year);
    console.log(e.chapterContainer);

    // Prevent default behavior if needed
    // e.preventDefault();

    e.next();
  });
}
