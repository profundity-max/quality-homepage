import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createAccountAdministrationModule } from "@/modules/account-administration";
import {
  bootstrapFirstAdministrator,
  createIdentityModule,
} from "@/modules/identity";

describe("account administration", () => {
  let database: PGlite | undefined;

  afterEach(async () => {
    await database?.close();
  });

  test("an administrator creates a normalized member who must change the temporary password", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: "品质管理员",
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });

    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "  New.Editor  ",
      displayName: " 新编辑 ",
      role: "editor",
      temporaryPassword: "temporary member password",
    });

    await expect(
      accounts.listMembers(administrator.member.id),
    ).resolves.toEqual([
      expect.objectContaining({
        username: "admin",
        role: "administrator",
        enabled: true,
      }),
      expect.objectContaining({
        username: "New.Editor",
        displayName: "新编辑",
        role: "editor",
        enabled: true,
        locked: false,
      }),
    ]);
    const member = await identity.authenticate({
      username: "new.editor",
      password: "temporary member password",
    });
    expect(member).toMatchObject({
      kind: "authenticated",
      mustChangePassword: true,
    });
  });

  test("a reader cannot list or create accounts through forged module calls", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "reader",
      displayName: null,
      role: "reader",
      temporaryPassword: "temporary reader password",
    });
    const reader = await identity.authenticate({
      username: "reader",
      password: "temporary reader password",
    });
    expect(reader.kind).toBe("authenticated");
    if (reader.kind !== "authenticated") return;

    await expect(accounts.listMembers(reader.member.id)).rejects.toThrow(
      /administrator/i,
    );
    await expect(
      accounts.createMember({
        requestingUserId: reader.member.id,
        username: "forged-admin",
        displayName: null,
        role: "administrator",
        temporaryPassword: "forged administrator password",
      }),
    ).rejects.toThrow(/administrator/i);
  });

  test("a temporary administrator cannot forge management calls before first password change", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "temporary-admin",
      displayName: null,
      role: "administrator",
      temporaryPassword: "temporary administrator password",
    });
    const temporaryAdministrator = await identity.authenticate({
      username: "temporary-admin",
      password: "temporary administrator password",
    });
    expect(temporaryAdministrator.kind).toBe("authenticated");
    if (temporaryAdministrator.kind !== "authenticated") return;

    await expect(
      accounts.listMembers(temporaryAdministrator.member.id),
    ).rejects.toThrow(/administrator/i);
    await expect(
      accounts.createMember({
        requestingUserId: temporaryAdministrator.member.id,
        username: "forged-reader",
        displayName: null,
        role: "reader",
        temporaryPassword: "forged temporary password",
      }),
    ).rejects.toThrow(/administrator/i);
  });

  test("normalized usernames stay unique", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "Admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });

    await expect(
      accounts.createMember({
        requestingUserId: administrator.member.id,
        username: " ADMIN ",
        displayName: null,
        role: "reader",
        temporaryPassword: "temporary duplicate password",
      }),
    ).rejects.toThrow(/username/i);
  });

  test("password reset revokes every old session and requires another first change", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "member",
      displayName: null,
      role: "reader",
      temporaryPassword: "temporary member password",
    });
    const created = await accounts.listMembers(administrator.member.id);
    const memberId = created.find(({ username }) => username === "member")!.id;
    const first = await identity.authenticate({
      username: "member",
      password: "temporary member password",
    });
    const second = await identity.authenticate({
      username: "member",
      password: "temporary member password",
    });
    expect(first.kind).toBe("authenticated");
    expect(second.kind).toBe("authenticated");
    if (first.kind !== "authenticated" || second.kind !== "authenticated")
      return;

    await expect(
      accounts.resetPassword({
        requestingUserId: administrator.member.id,
        userId: memberId,
        temporaryPassword: "replacement member password",
      }),
    ).resolves.toBeUndefined();

    await expect(
      identity.resolveSession(first.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.resolveSession(second.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.authenticate({
        username: "member",
        password: "temporary member password",
      }),
    ).resolves.toMatchObject({ kind: "invalid-credentials" });
    await expect(
      identity.authenticate({
        username: "member",
        password: "replacement member password",
      }),
    ).resolves.toMatchObject({
      kind: "authenticated",
      mustChangePassword: true,
    });
  });

  test("an administrator sees and unlocks an active account lock", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({
      database,
      now: () => new Date("2026-08-14T01:00:00.000Z"),
    });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({
      database,
      now: () => new Date("2026-08-14T01:00:00.000Z"),
    });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "locked-reader",
      displayName: null,
      role: "reader",
      temporaryPassword: "temporary reader password",
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await identity.authenticate({
        username: "locked-reader",
        password: `wrong password ${attempt}`,
      });
    }
    const members = await accounts.listMembers(administrator.member.id);
    const locked = members.find(
      ({ username }) => username === "locked-reader",
    )!;
    expect(locked).toMatchObject({ locked: true });
    expect(locked.lockedUntil).toEqual(new Date("2026-08-14T01:15:00.000Z"));

    await accounts.unlockMember({
      requestingUserId: administrator.member.id,
      userId: locked.id,
    });

    await expect(
      identity.authenticate({
        username: "locked-reader",
        password: "temporary reader password",
      }),
    ).resolves.toMatchObject({ kind: "authenticated" });
  });

  test("protects the current and final active administrator inside the module", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });

    await expect(
      accounts.disableMember({
        requestingUserId: administrator.member.id,
        userId: administrator.member.id,
      }),
    ).rejects.toThrow(/current account/i);
    await expect(
      accounts.changeRole({
        requestingUserId: administrator.member.id,
        userId: administrator.member.id,
        role: "reader",
      }),
    ).rejects.toThrow(/final active administrator/i);
    await expect(
      identity.assertAdministrator(administrator.member.id),
    ).resolves.toBeUndefined();
  });

  test("role and disablement changes take effect immediately when another administrator remains", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "second-admin",
      displayName: null,
      role: "administrator",
      temporaryPassword: "second administrator password",
    });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "editor",
      displayName: null,
      role: "editor",
      temporaryPassword: "temporary editor password",
    });
    const members = await accounts.listMembers(administrator.member.id);
    const secondAdmin = members.find(
      ({ username }) => username === "second-admin",
    )!;
    const editor = members.find(({ username }) => username === "editor")!;
    const editorLogin = await identity.authenticate({
      username: "editor",
      password: "temporary editor password",
    });
    expect(editorLogin.kind).toBe("authenticated");
    if (editorLogin.kind !== "authenticated") return;

    await accounts.changeRole({
      requestingUserId: administrator.member.id,
      userId: secondAdmin.id,
      role: "reader",
    });
    await expect(identity.assertAdministrator(secondAdmin.id)).rejects.toThrow(
      /administrator/i,
    );
    await accounts.disableMember({
      requestingUserId: administrator.member.id,
      userId: editor.id,
    });
    await expect(
      identity.resolveSession(editorLogin.session.token),
    ).resolves.toBeNull();
    await expect(
      identity.authenticate({
        username: "editor",
        password: "temporary editor password",
      }),
    ).resolves.toEqual({ kind: "disabled" });
  });

  test("every account mutation records actor and subject without password material", async () => {
    database = new PGlite();
    await migrate(database);
    await bootstrapFirstAdministrator({
      database,
      username: "admin",
      displayName: null,
      password: "correct horse battery staple",
    });
    const identity = createIdentityModule({ database });
    const administrator = await identity.authenticate({
      username: "admin",
      password: "correct horse battery staple",
    });
    expect(administrator.kind).toBe("authenticated");
    if (administrator.kind !== "authenticated") return;
    await completeFirstPasswordChange(identity, administrator);
    const accounts = createAccountAdministrationModule({ database });
    await accounts.createMember({
      requestingUserId: administrator.member.id,
      username: "audited-member",
      displayName: null,
      role: "reader",
      temporaryPassword: "initial audited password",
    });
    const member = (await accounts.listMembers(administrator.member.id)).find(
      ({ username }) => username === "audited-member",
    )!;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await identity.authenticate({
        username: "audited-member",
        password: `wrong audited password ${attempt}`,
      });
    }
    await accounts.unlockMember({
      requestingUserId: administrator.member.id,
      userId: member.id,
    });
    await accounts.resetPassword({
      requestingUserId: administrator.member.id,
      userId: member.id,
      temporaryPassword: "replacement audited password",
    });
    await accounts.changeRole({
      requestingUserId: administrator.member.id,
      userId: member.id,
      role: "editor",
    });
    await accounts.disableMember({
      requestingUserId: administrator.member.id,
      userId: member.id,
    });

    const audits = await database.query<{
      actor_user_id: string;
      subject_user_id: string;
      event_type: string;
      metadata: Record<string, unknown>;
    }>(
      `select actor_user_id, subject_user_id, event_type, metadata
       from identity_audit_events
       where event_type like 'account-%' or event_type = 'password-reset'
       order by occurred_at, event_type`,
    );
    expect(audits.rows.map(({ event_type }) => event_type).sort()).toEqual([
      "account-creation",
      "account-disablement",
      "account-role-change",
      "account-unlock",
      "password-reset",
    ]);
    expect(
      audits.rows.every(
        ({ actor_user_id, subject_user_id }) =>
          actor_user_id === administrator.member.id &&
          subject_user_id === member.id,
      ),
    ).toBe(true);
    expect(JSON.stringify(audits.rows)).not.toMatch(
      /initial audited password|replacement audited password|wrong audited password/,
    );
  });
});

async function completeFirstPasswordChange(
  identity: ReturnType<typeof createIdentityModule>,
  administrator: Extract<
    Awaited<
      ReturnType<ReturnType<typeof createIdentityModule>["authenticate"]>
    >,
    { kind: "authenticated" }
  >,
) {
  await identity.changePassword({
    sessionId: administrator.session.id,
    currentPassword: "correct horse battery staple",
    newPassword: "lasting administrator password",
    confirmation: "lasting administrator password",
  });
}
