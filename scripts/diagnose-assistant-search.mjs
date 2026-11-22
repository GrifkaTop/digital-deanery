import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";

const container = process.argv[2] ?? "mgimo-vibecode-app-1";
const questions = await readFile(process.argv[3] ?? "docs/assistant-search-diagnostics/questions.jsonl", "utf8");
const require = createRequire(import.meta.url);
const { outputFiles } = await build({
  stdin: {
    contents: await readFile("scripts/diagnose-assistant-search-runner.cjs", "utf8"),
    resolveDir: process.cwd(),
    sourcefile: "diagnose-assistant-search-runner.cjs",
  },
  bundle: true, platform: "node", format: "cjs", external: ["pg", "@node-rs/argon2", "pdfkit"], write: false,
  define: { EVAL_QUESTIONS: JSON.stringify(questions) },
  plugins: [{
    name: "assistant-search-diagnostics",
    setup(build) {
      build.onResolve({ filter: /^(server-only|next\/(headers|server))$/ }, ({ path }) => ({ path, namespace: "diagnostics" }));
      build.onLoad({ filter: /.*/, namespace: "diagnostics" }, ({ path }) => ({
        contents: path === "next/server" ? "export const NextResponse = Response;"
          : path === "next/headers" ? "export const cookies = () => { throw Error('No Next.js request context'); };" : "",
      }));
      const instrument = (source, before, after) => {
        if (source.split(before).length !== 2) throw new Error("Expected exactly one diagnostic anchor: " + before);
        return source.replace(before, after);
      };
      build.onLoad({ filter: /\/src\/server\/auth\/service\.ts$/ }, async ({ path }) => {
        let contents = await readFile(path, "utf8");
        contents = instrument(contents, "export async function requireActor(): Promise<Actor> {",
          "async function actorFromCookies(): Promise<Actor> {");
        contents = instrument(contents, "export async function checkCsrf(request:Request) {",
          "async function csrfFromCookies(request:Request) {");
        contents += "\nexport async function requireActor() { return globalThis.searchEvaluation.actor; }\n";
        contents += "export async function checkCsrf() {}\n";
        return { contents, loader: "ts" };
      });
      build.onLoad({ filter: /\/src\/server\/assistant\/(http|qwen)\.ts$/ }, async ({ path }) => {
        let contents = await readFile(path, "utf8");
        const patch = (before, after) => { contents = instrument(contents, before, after); };
        if (path.endsWith("/qwen.ts")) {
          patch("  return {\n    classify:", "  return globalThis.searchEvaluation.wrapModel({\n    classify:");
          patch("candidates }, signal),\n  };", "candidates }, signal),\n  });");
        } else {
          patch("getScholarshipPayments, searchDocumentFiles }", "getScholarshipPayments as readPayments, searchDocumentFiles as readFiles }");
          patch("const rateWindowMs", `const searchDocumentFiles = (question, today) => globalThis.searchEvaluation.search(readFiles, question, today);
const getScholarshipPayments = (scope, today) => globalThis.searchEvaluation.payments(readPayments, scope, today);
const rateWindowMs`);
          patch("    let usedModel = Boolean(modelClassification);",
            "    globalThis.searchEvaluation.trace.modelClassification = modelClassification ?? null;\n    let usedModel = Boolean(modelClassification);");
          patch('    if (classification.kind !== "topics")', '    globalThis.searchEvaluation.trace.classification = classification;\n    if (classification.kind !== "topics")');
          patch("        let cards = candidates.slice", "        globalThis.searchEvaluation.setCandidates(candidates);\n        let cards = candidates.slice");
          patch("          cards = selection?.length", "          globalThis.searchEvaluation.trace.selection = { valid: selection !== undefined, unchanged: sameCandidates };\n          cards = selection?.length");
          patch("    if (scheduleQuery) {\n      const current", "    if (scheduleQuery) {\n      globalThis.searchEvaluation.trace.classification = scheduleQuery;\n      const current");
          patch("      const { mode, discipline } = modelClassification;", "      globalThis.searchEvaluation.trace.classification = modelClassification;\n      const { mode, discipline } = modelClassification;");
          patch('    if (!schedule && !catalogEventOnly && (conflictingSchedule || unresolvedQuickRequest)) {',
            '    if (!schedule && !catalogEventOnly && (conflictingSchedule || unresolvedQuickRequest)) {\n      globalThis.searchEvaluation.trace.classification = { kind: "clarify", reason: conflictingSchedule ? "conflictingSchedule" : "unresolvedQuickRequest" };');
        }
        return { contents, loader: "ts" };
      });
    },
  }],
  tsconfig: require.resolve("../tsconfig.json"),
});
const child = spawn("docker", ["exec", "-e", "PGOPTIONS=-c default_transaction_read_only=on",
  "-i", container, "node", "-"], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.on("error", (error) => { console.error(error.code); });
child.stdin.end(outputFiles[0].contents);
const code = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", resolve);
});
process.exitCode = code ?? 1;
