import { resolve } from "node:path";

/**
 * 受控数据目录（ADR-0002：文件独立于数据库保存）。
 * 由环境变量 `Q_NEXUS_DATA_DIR` 配置；未配置时退回进程工作目录下的
 * `.data/uploads`（仅供本地开发/测试，生产必须显式配置）。
 */
export function resolveDataDirectory(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = environment.Q_NEXUS_DATA_DIR;
  if (configured) {
    return resolve(configured, "uploads");
  }
  return resolve(process.cwd(), ".data", "uploads");
}
