import { redirect } from "next/navigation";

import { getDatabase } from "@/db/database";
import { createDiskFileStorage } from "@/modules/file-storage";
import { resolveDataDirectory } from "@/modules/file-storage/configuration";
import {
  createTemplateService,
  type AdminTemplate,
  type ManagedTemplateCategory,
  type TemplateVersionView,
} from "@/modules/template-service";

import { requirePortalSession } from "../../authorization";
import { PortalShell } from "../../portal-shell";
import { DirectionButtons } from "../direction-buttons";
import {
  archiveCategoryAction,
  archiveTemplateAction,
  createCategoryAction,
  moveCategoryAction,
  publishVersionAction,
  renameCategoryAction,
  scanVersionAction,
  uploadTemplateAction,
} from "./actions";
import styles from "../manage.module.css";

const versionStatusNames = {
  draft: "草稿",
  active: "有效",
  superseded: "历史",
} as const;

const quarantineNames = {
  pending: "待扫描",
  passed: "已通过",
  failed: "未通过",
  quarantined: "已隔离",
} as const;

export default async function TemplateManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePortalSession("/manage/templates");
  const service = createTemplateService(getDatabase(), {
    storage: createDiskFileStorage(resolveDataDirectory()),
    scanner: { scan: async () => ({ safe: true }) },
  });
  const loaded = await Promise.all([
    service.listCategoriesForAdmin(session.member.id),
    service.listTemplatesForAdmin(session.member.id),
  ]).catch(() => null);
  if (!loaded) redirect("/manage");
  const [categories, templates] = loaded;

  const templatesByCategory = new Map<string, AdminTemplate[]>();
  for (const template of templates) {
    const list = templatesByCategory.get(template.categoryId) ?? [];
    list.push(template);
    templatesByCategory.set(template.categoryId, list);
  }

  return (
    <PortalShell currentPath="/manage/templates">
      <main id="main-content" tabIndex={-1} className={styles.layout}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>品集｜Q Nexus · 门户管理</p>
            <h1>模板管理</h1>
            <p>
              维护用途分类，上传模板并完成扫描后发布；文件只存储与下载，不在页面中预览。
            </p>
          </div>
        </header>

        {params.notice ? (
          <p className={styles.notice} role="status">
            {params.notice}
          </p>
        ) : null}
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}

        <CategorySection categories={categories} />
        <NewTemplateForm categories={categories} />
        {categories.map((category) => (
          <TemplateCategorySection
            key={category.id}
            category={category}
            templates={templatesByCategory.get(category.id) ?? []}
          />
        ))}
      </main>
    </PortalShell>
  );
}

function CategorySection({
  categories,
}: {
  categories: ManagedTemplateCategory[];
}) {
  return (
    <section className={styles.panel} aria-labelledby="category-heading">
      <h2 id="category-heading">用途分类（TPL-04）</h2>
      <form action={createCategoryAction} className={styles.createForm}>
        <label>
          新分类名称
          <input name="name" required aria-label="新分类名称" />
        </label>
        <button type="submit">创建分类</button>
      </form>
      <ul>
        {categories.map((category) => (
          <li key={category.id} className={styles.columnRow}>
            <span className={styles.columnName}>
              {category.name}
              {category.archivedAt ? (
                <span className={styles.columnBadge}>已归档</span>
              ) : null}
              <span className={styles.columnMeta}>
                {category.templateCount} 个模板
              </span>
            </span>
            <form action={renameCategoryAction} className={styles.renameForm}>
              <input type="hidden" name="stableId" value={category.stableId} />
              <input
                name="name"
                defaultValue={category.name}
                aria-label={`重命名分类 ${category.name}`}
                className={styles.renameInput}
              />
              <button type="submit">改名</button>
            </form>
            {!category.archivedAt ? (
              <>
                <DirectionButtons
                  action={moveCategoryAction}
                  idName="stableId"
                  idValue={category.stableId}
                  labelPrefix={`移动分类 ${category.name}`}
                />
                <form action={archiveCategoryAction}>
                  <input
                    type="hidden"
                    name="stableId"
                    value={category.stableId}
                  />
                  <button className={styles.textButton} type="submit">
                    归档
                  </button>
                </form>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewTemplateForm({
  categories,
}: {
  categories: ManagedTemplateCategory[];
}) {
  const activeCategories = categories.filter(
    (category) => !category.archivedAt,
  );
  return (
    <section className={styles.panel} aria-labelledby="new-template-heading">
      <h2 id="new-template-heading">新建模板</h2>
      <form action={uploadTemplateAction} className={styles.createForm}>
        <label>
          名称
          <input name="name" required aria-label="新建模板名称" />
        </label>
        <label>
          用途说明
          <input name="purpose" aria-label="新建模板用途说明" />
        </label>
        <label>
          适用场景
          <input name="usageScenario" aria-label="新建模板适用场景" />
        </label>
        <label>
          用途分类
          <select name="categoryId" required aria-label="新建模板用途分类">
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          版本号
          <input name="versionLabel" required aria-label="新建模板版本号" />
        </label>
        <label>
          版本说明
          <input name="changeNote" aria-label="新建模板版本说明" />
        </label>
        <label>
          适用软件
          <input name="software" aria-label="新建模板适用软件" />
        </label>
        <label>
          文件
          <input name="file" type="file" required aria-label="新建模板文件" />
        </label>
        <button type="submit">上传模板</button>
      </form>
    </section>
  );
}

function TemplateCategorySection({
  category,
  templates,
}: {
  category: ManagedTemplateCategory;
  templates: AdminTemplate[];
}) {
  return (
    <section
      className={styles.panel}
      aria-labelledby={`templates-${category.stableId}`}
    >
      <h2 id={`templates-${category.stableId}`}>{category.name}</h2>
      {templates.length === 0 ? <p>该分类暂无模板。</p> : null}
      {templates.map((template) => (
        <article
          key={template.id}
          className={styles.memberCard}
          aria-label={`模板 ${template.name}`}
        >
          <div className={styles.memberSummary}>
            <div>
              <h3>{template.name}</h3>
              <p>
                {template.purpose || "无用途说明"} ·{" "}
                {template.usageScenario || "无适用场景"}
              </p>
            </div>
            <span className={styles.columnBadge}>
              {statusName(template.status)}
            </span>
          </div>

          <h4>版本</h4>
          <ul>
            {template.versions.map((version) => (
              <VersionRow
                key={version.id}
                version={version}
                templateName={template.name}
              />
            ))}
          </ul>

          <h4>上传新版本</h4>
          <form action={uploadTemplateAction} className={styles.createForm}>
            <input
              type="hidden"
              name="templateStableId"
              value={template.stableId}
            />
            <input
              type="hidden"
              name="categoryId"
              value={template.categoryId}
            />
            <label>
              版本号
              <input
                name="versionLabel"
                required
                aria-label={`上传新版本号 ${template.name}`}
              />
            </label>
            <label>
              版本说明
              <input
                name="changeNote"
                aria-label={`上传新版本说明 ${template.name}`}
              />
            </label>
            <label>
              适用软件
              <input
                name="software"
                aria-label={`上传新版本软件 ${template.name}`}
              />
            </label>
            <label>
              文件
              <input
                name="file"
                type="file"
                required
                aria-label={`上传新版本文件 ${template.name}`}
              />
            </label>
            <button type="submit">上传新版本</button>
          </form>

          {template.status !== "archived" ? (
            <form action={archiveTemplateAction} className={styles.createForm}>
              <input type="hidden" name="stableId" value={template.stableId} />
              <label>
                归档原因
                <input
                  name="reason"
                  required
                  aria-label={`归档模板 ${template.name} 的原因`}
                  placeholder="例如：模板下线或迁移"
                />
              </label>
              <button type="submit">归档模板</button>
            </form>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function VersionRow({
  version,
  templateName,
}: {
  version: TemplateVersionView;
  templateName: string;
}) {
  return (
    <li className={styles.columnNode}>
      <div className={styles.columnRow}>
        <span className={styles.columnName}>
          v{version.versionLabel} · {version.fileName}
        </span>
        <span className={styles.columnMeta}>
          {versionStatusNames[version.status]} ·{" "}
          {quarantineNames[version.quarantineState]} ·{" "}
          {(version.byteSize / 1024).toFixed(1)} KB
          {version.software ? ` · ${version.software}` : ""}
        </span>
        {version.quarantineState !== "passed" ? (
          <form action={scanVersionAction}>
            <input type="hidden" name="versionId" value={version.id} />
            <button
              className={styles.textButton}
              type="submit"
              aria-label={`扫描版本 ${templateName} v${version.versionLabel}`}
            >
              扫描
            </button>
          </form>
        ) : null}
        {version.status === "draft" && version.quarantineState === "passed" ? (
          <form action={publishVersionAction}>
            <input type="hidden" name="versionId" value={version.id} />
            <button
              className={styles.textButton}
              type="submit"
              aria-label={`发布版本 ${templateName} v${version.versionLabel}`}
            >
              发布
            </button>
          </form>
        ) : null}
      </div>
      {version.changeNote ? (
        <p className={styles.columnMeta}>{version.changeNote}</p>
      ) : null}
      {version.quarantineReason ? (
        <p className={styles.columnMeta}>
          隔离原因：{version.quarantineReason}
        </p>
      ) : null}
    </li>
  );
}

function statusName(status: AdminTemplate["status"]): string {
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return "草稿";
}
