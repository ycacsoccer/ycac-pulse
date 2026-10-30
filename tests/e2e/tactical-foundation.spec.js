const { test, expect } = require("@playwright/test");
const { fitsViewport, watchErrors } = require("./mocks");

test("standalone tactical foundation explains all four clips without linking to the app", async ({ page, request }) => {
  const errors = watchErrors(page);
  await page.goto("/tactical-foundation.html");
  await expect(page.locator("h1")).toContainText("Our Tactical");
  await expect(page.locator("h1")).toContainText("Foundation");
  await expect(page.locator(".hero")).toContainText("Coach Sun");
  await expect(page.locator(".team-key")).toContainText("two tactical foundation clips, we’re the purple team");
  await expect(page.locator(".team-key")).toContainText("tactical build-up clip, our side looks blue");
  await expect(page.locator("#defence-title")).toContainText("Defensive shape");
  await expect(page.locator("#attack-title")).toContainText("Attacking");
  await expect(page.locator(".clip-card").first().locator(".clip-notes > ul > li")).toHaveCount(4);
  const focus = page.locator(".defence-focus");
  await expect(focus.locator("li")).toHaveCount(4);
  await expect(focus.locator("li").nth(0)).toContainText("two forwards defend well");
  await expect(focus.locator("li").nth(1)).toContainText("passing lanes to the opposition’s central holding midfielders");
  await expect(focus.locator("li").nth(2)).toContainText("Don’t both press at once");
  await expect(focus.locator("li").nth(3)).toContainText("tactical plan");
  await expect(page.locator(".clips .clip-card").last().locator("li")).toHaveCount(4);
  await expect(page.locator(".warmup-jump")).toHaveAttribute("href", "#warmups");
  await expect(page.locator("#warmup-defence-title")).toContainText("Press &");
  await expect(page.locator(".warmup-grid .clip-card").first()).toContainText("pressing and blocking");
  const variations = page.locator(".warmup-variation");
  await expect(variations).toHaveCount(2);
  await expect(variations.first()).toContainText("Top · Red");
  await expect(variations.first()).toContainText("one-two to set up a cross");
  await expect(variations.first()).toContainText("timing of both runs is important");
  await expect(variations.last()).toContainText("Bottom · Purple");
  await expect(variations.last()).toContainText("three attackers outside the box");
  await expect(page.locator(".foundation")).toContainText("defending together and building up together");
  await expect(page.locator('a[href$=".html"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

  const videos = page.locator("video");
  await expect(videos).toHaveCount(4);
  for (const [index, file, minDuration, maxDuration] of [
    [0, "defensive-shape", 23, 24],
    [1, "attacking-buildup", 10, 11],
    [2, "defensive-warmup", 6, 7],
    [3, "attacking-warmup", 13, 14],
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

test("prominent language buttons translate the whole page and remember the choice", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/tactical-foundation.html");
  const picker = page.locator(".language-picker");
  await expect(picker).toBeVisible();
  await expect(picker.locator(".language-prompt")).toContainText("Choose language");
  for (const name of ["English", "日本語", "简体中文"]) {
    const button = picker.getByRole("button", { name });
    await expect(button).toBeVisible();
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await expect(picker.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  const video = page.locator("video").first();
  await expect.poll(() => video.evaluate((element) => element.readyState)).toBeGreaterThanOrEqual(1);
  await video.evaluate(async (element) => { window.originalTacticalVideo = element; element.muted = true; await element.play(); });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0.1);
  const before = await video.evaluate((element) => element.currentTime);
  await picker.getByRole("button", { name: "日本語" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page).toHaveTitle("YC&AC Pulse | チームの戦術の土台");
  await expect(page.locator("#page-title")).toContainText("戦術の土台");
  await expect(page.locator(".team-key")).toContainText("紫のチーム");
  await expect(page.locator("#defence-title")).toContainText("守備の形");
  await expect(page.locator("#attack-title")).toContainText("ビルドアップ");
  await expect(page.locator(".clip-card").first().locator("li").first()).toContainText("コンパクト");
  await expect(page.locator(".defence-focus h3")).toContainText("２トップとボランチ");
  await expect(page.locator(".defence-focus li").nth(1)).toContainText("パスコースをまず消し");
  await expect(page.locator(".defence-focus li").nth(2)).toContainText("２人同時に出ない");
  await expect(page.locator("#warmup-defence-title")).toContainText("プレス");
  await expect(page.locator(".warmup-grid .clip-card").first()).toContainText("プレスとブロック");
  await expect(page.locator(".warmup-variation").first().locator("h3")).toHaveText("上側 · 赤");
  await expect(page.locator(".warmup-variation").last().locator("h3")).toHaveText("下側 · 紫");
  await expect(page.locator(".warmup-variation").first()).toContainText("ワンツー");
  await expect(page.locator(".warmup-variation").first()).toContainText("タイミング");
  await expect(page.locator(".warmup-variation").last()).toContainText("３人のアタッカー");
  await expect(page.locator(".foundation-copy")).toContainText("全員で守ること");
  await expect(video).toHaveAttribute("aria-label", "守備の形と動きの動画");
  await expect(picker.getByRole("button", { name: "日本語" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/lang=ja/);
  expect(await video.evaluate((element) => element === window.originalTacticalVideo && element.currentTime >= 0.1)).toBe(true);
  expect(await video.evaluate((element) => element.currentTime)).toBeGreaterThanOrEqual(before);
  await video.evaluate((element) => element.pause());

  await picker.getByRole("button", { name: "简体中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page).toHaveTitle("YC&AC Pulse | 我们的战术基础");
  await expect(page.locator("#page-title")).toContainText("战术基础");
  await expect(page.locator(".team-key")).toContainText("紫色的一方");
  await expect(page.locator("#defence-title")).toContainText("防守阵型");
  await expect(page.locator("#attack-title")).toContainText("组织与推进");
  await expect(page.locator(".defence-focus h3")).toContainText("前锋与双后腰");
  await expect(page.locator(".defence-focus li").nth(1)).toContainText("先封住对方中路后腰的接球路线");
  await expect(page.locator(".defence-focus li").nth(2)).toContainText("不能两人同时上抢");
  await expect(page.locator("#warmup-defence-title")).toContainText("压迫");
  await expect(page.locator(".warmup-grid .clip-card").first()).toContainText("压迫和封堵");
  await expect(page.locator(".warmup-variation").first().locator("h3")).toHaveText("上半部分 · 红色");
  await expect(page.locator(".warmup-variation").last().locator("h3")).toHaveText("下半部分 · 紫色");
  await expect(page.locator(".warmup-variation").first()).toContainText("二过一");
  await expect(page.locator(".warmup-variation").first()).toContainText("启动时机");
  await expect(page.locator(".warmup-variation").last()).toContainText("三名进攻球员");
  await expect(page.locator(".foundation-copy")).toContainText("一起防守、一起组织进攻");
  await expect(picker.getByRole("button", { name: "简体中文" })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/lang=zh/);
  expect(await page.evaluate(() => localStorage.getItem("ycac-lang"))).toBe("zh");
  await page.reload();
  await expect(page.locator("#page-title")).toContainText("战术基础");
  await page.goto("/tactical-foundation.html"); // saved preference without a query string
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.goto("/tactical-foundation.html?lang=ja"); // a shared URL overrides the saved choice
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await picker.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#page-title")).toContainText("Our Tactical");
  await expect(picker.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

for (const width of [320, 390, 1440]) {
  test(`standalone tactics page fits a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/tactical-foundation.html");
    await expect(page.locator("video")).toHaveCount(4);
    for (const name of ["English", "日本語", "简体中文"]) {
      await page.locator(".language-picker").getByRole("button", { name }).click();
      expect(await fitsViewport(page), `${name} at ${width}px`).toBe(true);
    }
  });
}
