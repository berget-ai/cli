import { describe, expect, it } from "vitest";
import { runSetup } from "../setup";
import { CancelledError, CommandFailedError, PrerequisiteError } from "../errors";
import { FakePrompter, CANCEL, select, confirm, multiselect } from "./fake-prompter";
import { FakeFileStore } from "./fake-file-store";
import { FakeCommandRunner } from "./fake-command-runner";
import { FakeAuthService } from "./fake-auth-service";
import { FakeApiKeyService } from "./fake-api-key-service";
import type { AuthServicePort, ApiKeyServicePort } from "../ports/auth-services";

const makeDeps = (
  overrides: Partial<Parameters<typeof runSetup>[0]> = {}
): Parameters<typeof runSetup>[0] => {
  return {
    prompter: overrides.prompter ?? new FakePrompter([]),
    files: overrides.files ?? new FakeFileStore(),
    commands:
      overrides.commands ??
      new FakeCommandRunner()
        .handle("opencode --version", "mocked")
        .handle("pi --version", "mocked"),
    authService: (overrides.authService as AuthServicePort) ?? new FakeAuthService(false),
    apiKeyService:
      (overrides.apiKeyService as ApiKeyServicePort) ?? new FakeApiKeyService("sk_ber_test"),
    homeDir: "/home/user",
    cwd: "/home/user/project",
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([k]) =>
          k !== "prompter" &&
          k !== "files" &&
          k !== "commands" &&
          k !== "authService" &&
          k !== "apiKeyService"
      )
    ),
  };
};

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64urlEncode(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64urlEncode(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe("runSetup", () => {
  describe("happy path", () => {
    it("sets up opencode project without existing config", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Create"), // Config write
          multiselect([]), // No agents selected
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/project/opencode.json")).toBe(true);
      const config = JSON.parse(written.get("/home/user/project/opencode.json")!);
      expect(config.plugin).toContain("@bergetai/opencode-auth@1.0.16");
    });

    it("sets up opencode globally without existing config", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("global"),
          confirm(true, "Create"), // Config write
          multiselect([]), // No agents selected
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/.config/opencode/opencode.json")).toBe(true);
    });

    it("sets up pi project with fresh install", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"), // Agent selection
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner()
          .handle("pi --version", "mocked") // For checkInstalled
          .handle("pi install", ""), // For actual install
      });

      await runSetup(deps);

      const commands = deps.commands as FakeCommandRunner;
      expect(commands.calls.length).toBeGreaterThan(0);
      const installCall = commands.calls.find(c => c.command === "pi");
      expect(installCall?.args).toContain("npm:@bergetai/pi-provider");
    });

    it("skips agent selection for pi project", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("__skip__"), // Skip agent selection
        ]),
        commands: new FakeCommandRunner()
          .handle("pi --version", "mocked") // For checkInstalled
          .handle("pi install", ""), // For actual install
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      // Should not create any agent files
      for (const path of written.keys()) {
        expect(path).not.toContain("SYSTEM.md");
      }
    });
  });

  describe("prerequisites", () => {
    it("throws PrerequisiteError when opencode is not installed", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([select("opencode"), select("project")]),
        commands: new FakeCommandRunner(),
      });

      // Simulate opencode not being installed
      await expect(runSetup(deps)).rejects.toBeInstanceOf(PrerequisiteError);
    });
  });

  describe("cancellation", () => {
    it("throws CancelledError when user cancels at tool selection", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([select(CANCEL)]),
      });

      await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError);
    });

    it("throws CancelledError when user cancels at write confirmation", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(false, "Create"),
        ]),
      });

      await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError);
    });

    it("throws CancelledError when user cancels at agent write confirmation (opencode)", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Create"),
          multiselect(["backend", "frontend"]),
          confirm(false, "agent"),
        ]),
      });

      await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError);
    });

    it("throws CancelledError when user cancels at agent write confirmation (pi)", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(false, /Create|Overwrite/),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      await expect(runSetup(deps)).rejects.toBeInstanceOf(CancelledError);
    });
  });

  describe("file operations", () => {
    it("preserves existing configuration keys when updating", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Write"),
          multiselect([]),
        ]),
      });

      const files = deps.files as FakeFileStore;
      files.seed(
        "/home/user/project/opencode.json",
        JSON.stringify({
          customField: "should-preserve",
          plugin: ["other-plugin"],
        })
      );

      await runSetup(deps);

      const written = files.getWrittenFiles();
      const config = JSON.parse(written.get("/home/user/project/opencode.json")!);
      expect(config.customField).toBe("should-preserve");
      expect(config.plugin).toContain("other-plugin");
      expect(config.plugin).toContain("@bergetai/opencode-auth@1.0.16");
    });

    it("preserves jsonc comments when updating", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Write"),
          multiselect([]),
        ]),
      });

      const files = deps.files as FakeFileStore;
      files.seed(
        "/home/user/project/opencode.jsonc",
        `{
  // This is my custom config
  "customField": "should-preserve",
  /* block comment explaining plugin */
  "plugin": ["other-plugin"]
}`
      );

      await runSetup(deps);

      const written = files.getWrittenFiles();
      const content = written.get("/home/user/project/opencode.jsonc")!;
      expect(content).toContain("// This is my custom config");
      expect(content).toContain("/* block comment explaining plugin */");
      expect(content).toContain('"customField": "should-preserve"');
      expect(content).toContain("@bergetai/opencode-auth@1.0.16");
    });

    it("shows no changes needed when config is already up to date", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([select("opencode"), select("project"), multiselect([])]),
      });

      const files = deps.files as FakeFileStore;
      // Already has the exact same plugin version
      files.seed(
        "/home/user/project/opencode.json",
        JSON.stringify(
          {
            $schema: "https://opencode.ai/config.json",
            plugin: ["@bergetai/opencode-auth@1.0.16"],
          },
          null,
          2
        ) + "\n"
      );

      await runSetup(deps);

      // Check that no write happened — content should be unchanged
      const written = files.getWrittenFiles();
      const content = written.get("/home/user/project/opencode.json")!;
      const config = JSON.parse(content);
      expect(config.plugin).toEqual(["@bergetai/opencode-auth@1.0.16"]);
      expect(content).toContain("$schema");
    });

    it("preserves existing Pi settings when setting defaultProvider", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      const files = deps.files as FakeFileStore;
      files.seed(
        "/home/user/project/.pi/settings.json",
        JSON.stringify({
          existingKey: "should-preserve",
          anotherSetting: true,
        })
      );

      await runSetup(deps);

      const written = files.getWrittenFiles();
      const settings = JSON.parse(written.get("/home/user/project/.pi/settings.json")!);
      expect(settings.existingKey).toBe("should-preserve");
      expect(settings.anotherSetting).toBe(true);
      expect(settings.defaultProvider).toBe("berget");
    });

    it("creates parent directories when writing files", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("global"),
          confirm(true, "Create"),
          multiselect([]),
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/.config/opencode/opencode.json")).toBe(true);
    });
  });

  describe("command execution", () => {
    it("passes arguments as array (no shell injection)", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      await runSetup(deps);

      const commands = deps.commands as FakeCommandRunner;
      const installCall = commands.calls.find(c => c.command === "pi");
      expect(installCall?.args).toContain("npm:@bergetai/pi-provider");
      expect(installCall?.args).toContain("-l");
    });
  });

  describe("error handling", () => {
    it("throws CommandFailedError when pi install fails", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([select("pi"), select("project")]),
        commands: new FakeCommandRunner()
          .handle("pi --version", "mocked")
          .handle("pi install", new Error("npm error")),
      });

      await expect(runSetup(deps)).rejects.toBeInstanceOf(CommandFailedError);
    });
  });

  describe("auth integration", () => {
    it("already authenticated shows simplified message", async () => {
      const files = new FakeFileStore();
      files.seed(
        "/home/user/.local/share/opencode/auth.json",
        JSON.stringify({ berget: { type: "oauth" } })
      );

      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          select("keep"), // New: keep existing auth
          confirm(true, "Create"), // Config write
          multiselect([]),
        ]),
        files,
      });

      await runSetup(deps);

      const prompter = deps.prompter as FakePrompter;
      const notes = prompter.calls.filter(c => c.method === "note");
      const lastNote = notes[notes.length - 1];
      expect(JSON.stringify(lastNote)).toContain("Run: opencode");
      expect(JSON.stringify(lastNote)).not.toContain("/connect");
    });

    it("login failure shows manual auth instructions", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
        authService: new FakeAuthService(false),
        files: new FakeFileStore(), // No pre-seeded auth → auth flow runs
      });

      await runSetup(deps);

      const prompter = deps.prompter as FakePrompter;
      const notes = prompter.calls.filter(c => c.method === "note");
      const lastNote = notes[notes.length - 1];
      expect(JSON.stringify(lastNote)).toContain("/login");
    });

    it("creates api key for pi when no seat", async () => {
      const files = new FakeFileStore();

      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          confirm(true), // API key creation prompt
          select("fullstack"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
        authService: new FakeAuthService(true, false), // succeed, no seat
        files,
      });

      await runSetup(deps);

      const written = files.getWrittenFiles();
      expect(written.has("/home/user/.pi/agent/auth.json")).toBe(true);
      const parsed = JSON.parse(written.get("/home/user/.pi/agent/auth.json")!);
      expect(parsed.berget.type).toBe("api_key");
    });

    it("uses subscription when berget_code_seat present", async () => {
      const files = new FakeFileStore();
      const farFuture = Math.floor(Date.now() / 1000) + 3600 * 24 * 365; // 1 year from now in seconds
      files.seed(
        "/home/user/.berget/auth.json",
        JSON.stringify({
          access_token: makeJwt({ realm_access: { roles: ["berget_code_seat"] }, exp: farFuture }),
          refresh_token: "ref",
          expires_at: farFuture * 1000,
        })
      );

      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          select("subscription"),
          confirm(true, "Create"),
          multiselect([]),
        ]),
        files,
      });

      await runSetup(deps);

      const written = files.getWrittenFiles();
      const parsed = JSON.parse(written.get("/home/user/.local/share/opencode/auth.json")!);
      expect(parsed.berget.type).toBe("oauth");
    });
  });

  describe("agent configuration", () => {
    it("sets up multiple agents for opencode project", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Create"),
          multiselect(["backend", "frontend"]),
          confirm(true, "agent"),
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/project/.opencode/agents/backend.md")).toBe(true);
      expect(written.has("/home/user/project/.opencode/agents/frontend.md")).toBe(true);
    });

    it("sets up no agents for opencode when none selected", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Create"),
          multiselect([]),
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      for (const path of written.keys()) {
        expect(path).not.toMatch(/agents\/\w+\.md$/);
      }
    });

    it("sets up agent globally for opencode", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("global"),
          confirm(true, "Create"),
          multiselect(["fullstack"]),
          confirm(true, "agent"),
        ]),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/.config/opencode/agents/fullstack.md")).toBe(true);
    });

    it("sets up agent for pi project", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/project/.pi/SYSTEM.md")).toBe(true);
    });

    it("sets up agent for pi globally", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("global"),
          select("backend"),
          confirm(true, "Create"),
        ]),
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const written = files.getWrittenFiles();
      expect(written.has("/home/user/.pi/agent/SYSTEM.md")).toBe(true);
    });

    it("skips writing identical opencode agent files", async () => {
      const deps = makeDeps({
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          confirm(true, "Create"),
          multiselect(["backend", "frontend"]),
          confirm(true, "agent"),
        ]),
      });

      // First run writes the files
      await runSetup(deps);

      const files = deps.files as FakeFileStore;
      const firstBackend = files
        .getWrittenFiles()
        .get("/home/user/project/.opencode/agents/backend.md");
      const firstFrontend = files
        .getWrittenFiles()
        .get("/home/user/project/.opencode/agents/frontend.md");

      // Second run with exact same content should not prompt for overwrite
      const deps2 = makeDeps({
        files,
        prompter: new FakePrompter([
          select("opencode"),
          select("project"),
          multiselect(["backend", "frontend"]),
        ]),
      });

      await runSetup(deps2);

      // Content should be unchanged
      expect(files.getWrittenFiles().get("/home/user/project/.opencode/agents/backend.md")).toBe(
        firstBackend
      );
      expect(files.getWrittenFiles().get("/home/user/project/.opencode/agents/frontend.md")).toBe(
        firstFrontend
      );
    });

    it("overwrites pi SYSTEM.md when content differs", async () => {
      const files = new FakeFileStore();
      files.seed("/home/user/project/.pi/SYSTEM.md", "old agent content");

      const deps = makeDeps({
        prompter: new FakePrompter([
          select("pi"),
          select("project"),
          select("fullstack"),
          confirm(true, "Overwrite"),
        ]),
        files,
        commands: new FakeCommandRunner().handle("pi --version", "mocked").handle("pi install", ""),
      });

      await runSetup(deps);

      const written = files.getWrittenFiles();
      const content = written.get("/home/user/project/.pi/SYSTEM.md");
      expect(content).not.toBe("old agent content");
      // Pi doesn't use front matter, so check for system prompt content
      expect(content).toContain("Fullstack Agent");
    });
  });
});
