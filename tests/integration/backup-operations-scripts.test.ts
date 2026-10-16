import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((d) => rmSync(d, { recursive: true, force: true })),
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "qnexus-ops-"));
  directories.push(root);
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "logs"));
  return root;
}
function executable(path: string, body: string) {
  writeFileSync(path, "#!/bin/bash\n" + body);
  chmodSync(path, 0o755);
}
test("launchd backup builds the operator before running it and propagates failure", () => {
  const root = fixture();
  cpSync(
    "scripts/run-backup-launchd.sh",
    join(root, "scripts/run-backup-launchd.sh"),
  );
  writeFileSync(join(root, ".env"), "BACKUP_ADMIN_USER_ID=fixture\n");
  executable(
    join(root, "bin/docker"),
    `echo "$*" >> '${root}/calls'\nexit 27\n`,
  );
  const result = spawnSync(
    "bash",
    [join(root, "scripts/run-backup-launchd.sh"), "weekly"],
    { env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}` } },
  );
  expect(result.status).toBe(27);
  expect(readFileSync(join(root, "calls"), "utf8")).toContain(
    "run --build --rm backup weekly fixture",
  );
});
function pullFixture(sshCode = 0, rsyncCode = 0) {
  const root = fixture();
  const output = join(root, "output");
  mkdirSync(output);
  const hash = execFileSync("shasum", ["-a", "256"], { input: "fixture" })
    .toString()
    .split(" ")[0];
  executable(
    join(root, "bin/ssh"),
    `if [[ "$*" == *shasum* ]]; then echo '${hash}  backup.bin'; fi\nexit ${sshCode}\n`,
  );
  executable(
    join(root, "bin/rsync"),
    `echo called >> '${root}/rsync-calls'\nprintf fixture > '${output}/backup.bin'\nexit ${rsyncCode}\n`,
  );
  return {
    root,
    output,
    run: (args: string[] = []) =>
      spawnSync("bash", [resolve("scripts/pull-backups.sh"), ...args], {
        env: {
          ...process.env,
          Q_NEXUS_LOCAL_BACKUPS: output,
          PATH: `${root}/bin:${process.env.PATH}`,
        },
        encoding: "utf8",
      }),
  };
}
test("offsite sync fails visibly and leaves the task pending while offline", () => {
  const f = pullFixture(255);
  expect(f.run().status).not.toBe(0);
  expect(existsSync(join(f.output, "last-success"))).toBe(false);
});
test("rsync failure leaves success marker unchanged", () => {
  const f = pullFixture(0, 23);
  expect(f.run().status).not.toBe(0);
  expect(existsSync(join(f.output, "last-success"))).toBe(false);
});
test("only checksum-verified sync marks success and scheduled retries skip completed slots", () => {
  const f = pullFixture();
  expect(f.run().status).toBe(0);
  expect(existsSync(join(f.output, "last-success"))).toBe(true);
  expect(f.run(["--if-due"]).status).toBe(0);
  expect(
    readFileSync(join(f.root, "rsync-calls"), "utf8").trim().split("\n"),
  ).toHaveLength(1);
});
test("checksum mismatch fails without marking success", () => {
  const f = pullFixture();
  executable(
    join(f.root, "bin/rsync"),
    `printf corrupted > '${f.output}/backup.bin'\n`,
  );
  expect(f.run().status).not.toBe(0);
  expect(existsSync(join(f.output, "last-success"))).toBe(false);
});

test("an interrupted previous sync does not block future retries", () => {
  const f = pullFixture();
  mkdirSync(join(f.output, ".sync-lock"));
  writeFileSync(join(f.output, ".sync-lock", "pid"), "99999999\n");
  expect(f.run().status).toBe(0);
});
