import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let outArg, tsDir, filesOut;
const typeDirs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--typescript") tsDir = resolve(args[++i]);
  else if (a === "--types") typeDirs.push(resolve(args[++i]));
  else if (a === "--files") filesOut = resolve(args[++i]);
  else if (outArg === undefined) outArg = a;
  else throw new Error("build.mjs: unknown argument " + a);
}
const out = resolve(outArg ?? join(here, "site"));
const ts = (await import(tsDir ? pathToFileURL(join(tsDir, "lib", "typescript.js")).href : "typescript")).default;

const configPath = join(here, "tsconfig.json");
const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, here);
if (typeDirs.length > 0) {
  const roots = new Set();
  const paths = {};
  const types = [];
  for (const d of typeDirs) {
    const name = JSON.parse(readFileSync(join(d, "package.json"), "utf8")).name;
    if (name.startsWith("@types/")) { roots.add(dirname(d)); types.push(basename(d)); }
    else paths[name] = [d];
  }
  config.options.typeRoots = [...roots];
  config.options.types = types;
  config.options.paths = paths;
}
const program = ts.createProgram(config.fileNames, config.options);
if (filesOut) mkdirSync(dirname(filesOut), { recursive: true });
if (filesOut) writeFileSync(filesOut, JSON.stringify(program.getSourceFiles().map((f) => f.fileName), null, 1) + "\n");
const diagnostics = [...ts.getPreEmitDiagnostics(program)];
const emitted = program.emit();
diagnostics.push(...emitted.diagnostics);
if (diagnostics.length > 0) {
  console.error(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => here, getNewLine: () => "\n" }));
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const names = [];
const put = (name, from) => {
  const p = join(out, ...name.split("/"));
  mkdirSync(dirname(p), { recursive: true });
  copyFileSync(from, p);
  names.push(name);
};
for (const n of readdirSync(join(here, "static")).sort()) put(n, join(here, "static", n));
const shipped = JSON.parse(readFileSync(join(here, "shipped.json"), "utf8"));
for (const m of shipped) put("dist/" + m, join(here, ".build", ...m.split("/")));
const { workerScript, WORKER_FILE } = await import(pathToFileURL(join(here, ".build", "impl", "release", "offline.js")).href);
const worker = workerScript(names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(out, ...name.split("/")))) })), false);
writeFileSync(join(out, WORKER_FILE), worker.text);
console.log((names.length + 1) + " files written to " + out);
