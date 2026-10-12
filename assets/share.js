// Share buttons on the deal cards (index.html and the archive pages under
// deals/). Shares the deal's own Amazon link — the same affiliate-tagged URL
// the Buy Now button uses — via the native share sheet where the browser has
// one, otherwise copies it to the clipboard.
const SHARE_LABEL = "Share with a friend";

function flashLabel(btn, text) {
  btn.textContent = text;
  setTimeout(() => {
    btn.textContent = SHARE_LABEL;
  }, 2000);
}

async function copyLink(btn, url) {
  try {
    await navigator.clipboard.writeText(url);
    flashLabel(btn, "Link copied ✓");
  } catch (err) {
    console.error("[dealbots] couldn't copy share link", err);
    flashLabel(btn, "Couldn't copy link");
  }
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest(".share-btn");
  if (!btn) return;

  const { url, title } = btn.dataset;

  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
    } catch (err) {
      // AbortError = the user closed the share sheet; anything else means
      // sharing isn't usable here, so fall back to copying.
      if (err.name !== "AbortError") await copyLink(btn, url);
    }
    return;
  }

  await copyLink(btn, url);
});
