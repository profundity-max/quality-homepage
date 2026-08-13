import { emitKeypressEvents } from "node:readline";

import { migrate } from "../src/db/migrate";
import { withRuntimeDatabase } from "../src/db/runtime-database";
import { bootstrapFirstAdministrator } from "../src/modules/identity/index";

const options = readOptions(process.argv.slice(2));

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail("The first administrator command requires an interactive TTY.");
}

const password = await readHidden("Password: ");
const confirmation = await readHidden("Confirm password: ");
if (password !== confirmation) {
  fail("Passwords do not match.");
}

await withRuntimeDatabase(process.env, async (database) => {
  await migrate(database);
  await bootstrapFirstAdministrator({
    database,
    username: options.username,
    displayName: options.displayName,
    password,
  });
  process.stdout.write("First administrator created.\n");
});

function readOptions(args: string[]): {
  username: string;
  displayName: string | null;
} {
  if (
    args.some(
      (argument) =>
        argument === "--password" || argument.startsWith("--password="),
    )
  ) {
    fail("Password arguments are not allowed.");
  }
  let username: string | undefined;
  let displayName: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--username") {
      username = args[index + 1];
      index += 1;
    } else if (argument === "--display-name") {
      displayName = args[index + 1] ?? null;
      index += 1;
    } else {
      fail(`Unknown argument: ${argument ?? ""}`);
    }
  }
  if (!username) {
    fail("--username is required.");
  }
  return { username, displayName };
}

async function readHidden(prompt: string): Promise<string> {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(prompt);

  return new Promise((resolve, reject) => {
    let value = "";
    const onKeypress = (
      character: string,
      key: { ctrl?: boolean; name?: string },
    ) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled."));
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
      } else if (key.name === "backspace") {
        value = value.slice(0, -1);
      } else if (character && !key.ctrl) {
        value += character;
      }
    };
    const cleanup = () => {
      process.stdin.off("keypress", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("keypress", onKeypress);
  });
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
