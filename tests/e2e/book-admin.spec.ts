import { expect, test } from "@playwright/test";

async function login(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("administrator creates a book without cover; member sees placeholder (BOOK-04)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/books");

  await page.getByLabel("新建书目 书名").fill("e2e 品质管理基础");
  await page.getByLabel("新建书目 作者").fill("张三");
  await page.getByLabel("新建书目 推荐理由").fill("新人入门推荐");
  await page.getByLabel("新建书目 适合人群").fill("品质部新人");
  await page.getByLabel("新建书目 分类").selectOption({ label: "品质专业" });
  await page.getByLabel("新建书目 标签").fill("入门, 品质");
  await page.getByRole("button", { name: "创建书目" }).click();
  await expect(page.getByRole("status")).toContainText("书目已创建");

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/books");
  const category = page.getByRole("region", { name: "品质专业" });
  const bookCard = category.locator("li", {
    hasText: "e2e 品质管理基础",
  });
  await expect(bookCard).toBeVisible();
  await expect(bookCard.getByText("张三")).toBeVisible();
  await expect(bookCard.getByText("新人入门推荐")).toBeVisible();
  await expect(bookCard.getByText("无封面")).toBeVisible();
});

test("administrator updates a book and uploads a cover (BOOK-04)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/books");

  // 更新 seed 书目 demo-book
  await page
    .getByLabel("编辑 演示：品质管理基础 推荐理由")
    .fill("更新后的推荐理由");
  await page.getByLabel("编辑 演示：品质管理基础 封面").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake-png"),
  });
  await page
    .getByRole("article", { name: "书目 演示：品质管理基础" })
    .getByRole("button", { name: "更新书目" })
    .click();
  await expect(page.getByRole("status")).toContainText("书目已更新");

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/books");
  await expect(page.getByText("更新后的推荐理由")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "演示：品质管理基础 封面" }),
  ).toBeVisible();
});

test("category create and rename reflect on reader side; access control", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/books");

  await page.getByLabel("新书目分类名称").fill("临时书分类");
  await page.getByRole("button", { name: "创建分类" }).click();
  await expect(page.getByRole("status")).toContainText("分类已创建");
  await expect(page.getByLabel("重命名书目分类 临时书分类")).toBeVisible();

  const renameInput = page.getByLabel("重命名书目分类 临时书分类");
  await renameInput.fill("临时书分类改名");
  await renameInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("分类已改名");
  await expect(page.getByLabel("重命名书目分类 临时书分类改名")).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/books");
  await expect(
    page.getByRole("region", { name: "临时书分类改名" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/books");
  await expect(page.getByRole("heading", { name: "书单管理" })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/manage/books");
  await expect(page).not.toHaveURL(/\/manage\/books$/);
});
