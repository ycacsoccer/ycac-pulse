const { test, expect } = require("@playwright/test");
const { fitsViewport, watchErrors } = require("./mocks");

test("standalone tactical foundation explains both clips without linking to the app", async ({ page, request }) => {
  const errors = watchErrors(page);
  await page.goto("/tactical-foundation.html");
  await expect(page.locator("h1")).toContainText("Our Tactical");
  await expect(page.locator("h1")).toContainText("Foundation");
  await expect(page.locator(".hero")).toContainText("Coach Sun");
  await expect(page.locator(".team-key")).toContainText("purple team in both clips");
  await expect(page.locator(".team-key")).toContainText("looks blue in the build-up clip");
  await expect(page.locator("#defence-title")).toContainText("Defensive shape");
  await expect(page.locator("#attack-title")).toContainText("Attacking");
  await expect(page.locator(".clip-card").first().locator("li")).toHaveCount(4);
  await expect(page.locator(".clip-card").last().locator("li")).toHaveCount(4);
  await expect(page.locator(".foundation")).toContainText("defending together and building up together");
  await expect(page.locator('a[href$=".html"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

  const videos = page.locator("video");
  await expect(videos).toHaveCount(2);
  for (const [index, file, minDuration, maxDuration] of [
    [0, "defensive-shape", 23, 24],
    [1, "attacking-buildup", 10, 11],
  ]) {
    const video = videos.nth(index);
    await expect(video).toHaveAttribute("controls", "");
    await expect(video).toHaveAttribute("playsinline", "");
    await expect(video).not.toHaveAttribute("autoplay", "");
    await expect(video).toHaveAttribute("poster", `media/tactical-foundation/${file}.jpg`);
    await expect(video.locator("source")).toHaveAttribute("src", `media/tactical-foundation/${file}.mp4`);
    await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(1);
    const metadata = await video.evaluate((element) => ({ duration: element.duration, width: element.videoWidth, height: element.videoHeight }));
    expect(metadata.duration).toBeGreaterThanOrEqual(minDuration);
    expect(metadata.duration).toBeLessThan(maxDuration);
    expect(metadata.height).toBeGreaterThan(metadata.width); // preserve each portrait recording
    const range = await request.get(`/media/tactical-foundation/${file}.mp4`, { headers: { Range: "bytes=0-31" } });
    expect(range.status()).toBe(206);
    expect(range.headers()["content-type"]).toContain("video/mp4");
    expect(range.headers()["content-range"]).toMatch(/^bytes 0-31\/\d+$/);
    expect((await range.body()).length).toBe(32);
    const poster = await request.get(`/media/tactical-foundation/${file}.jpg`);
    expect(poster.status()).toBe(200);
    expect(poster.headers()["content-type"]).toContain("image/jpeg");
    await video.evaluate(async (element) => { element.muted = true; await element.play(); });
    await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
    await video.evaluate((element) => element.pause());
  }
  const suffix = await request.get("/media/tactical-foundation/defensive-shape.mp4", { headers: { Range: "bytes=-16" } });
  expect(suffix.status()).toBe(206);
  expect((await suffix.body()).length).toBe(16);
  const invalid = await request.get("/media/tactical-foundation/defensive-shape.mp4", { headers: { Range: "bytes=9999999-" } });
  expect(invalid.status()).toBe(416);
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 1440]) {
  test(`standalone tactics page fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tactical-foundation.html");
    await expect(page.locator("video")).toHaveCount(2);
    expect(await fitsViewport(page)).toBe(true);
  });
}
