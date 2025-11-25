#!/usr/bin/env node
/**
 * check-duplicate-modules.js
 *
 * Usage:
 *   node check-duplicate-modules.js "path/to/electron/app"
 *
 * Function:
 *   - Compare modules in app.asar and app.asar.unpacked
 *   - Find same module names
 *   - For each duplicated module, list:
 *       - Files existing in both
 *       - Files only in app.asar
 *       - Files only in app.asar.unpacked
 *   - Generate detailed HTML report in out/ folder
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const asar = require("@electron/asar");

// ---------- HELPERS ----------
function listModules(basePath) {
  const nodeModulesPath = path.join(basePath, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) return [];
  const modules = [];
  const items = fs.readdirSync(nodeModulesPath);
  for (const item of items) {
    const modulePath = path.join(nodeModulesPath, item);
    if (item.startsWith("@")) {
      const scopedPkgs = fs.readdirSync(modulePath);
      for (const scopedPkg of scopedPkgs) {
        const fullScopedPath = path.join(modulePath, scopedPkg);
        if (fs.statSync(fullScopedPath).isDirectory()) modules.push(fullScopedPath);
      }
    } else if (fs.statSync(modulePath).isDirectory()) {
      modules.push(modulePath);
    }
  }
  return modules;
}

function getAllFilesRelative(dirPath) {
  const files = [];
  function walk(current, base) {
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) walk(full, base);
      else files.push(path.relative(base, full).replace(/\\/g, "/"));
    }
  }
  walk(dirPath, dirPath);
  return files;
}

// ---------- MAIN ----------
async function main() {
  const TARGET_PATH = process.argv[2];
  if (!TARGET_PATH) {
    console.error("❌ Please specify the path to the Electron app folder.");
    process.exit(1);
  }

  const OUT_DIR = path.join(process.cwd(), "out");
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  const asarPath = path.join(TARGET_PATH, "resources", "app.asar");
  const unpackedDir = path.join(TARGET_PATH, "resources", "app.asar.unpacked");
  const tempDir = path.join(os.tmpdir(), "asar_unpack_" + Date.now());
  let asarModules = [];

  if (!fs.existsSync(asarPath) && !fs.existsSync(unpackedDir)) {
    console.error("❌ Neither app.asar nor app.asar.unpacked exists.");
    process.exit(1);
  }

  if (fs.existsSync(asarPath)) {
    console.log("Found app.asar, unpacking temporarily...");
    await asar.extractAll(asarPath, tempDir);
    asarModules = listModules(tempDir);
  }

  const unpackedModules = fs.existsSync(unpackedDir) ? listModules(unpackedDir) : [];

  function moduleKey(fullPath, basePath) {
    return path.relative(path.join(basePath, "node_modules"), fullPath).replace(/\\/g, "/");
  }

  const asarMap = new Map(asarModules.map((m) => [moduleKey(m, tempDir), m]));
  const unpackedMap = new Map(unpackedModules.map((m) => [moduleKey(m, unpackedDir), m]));

  const duplicates = [];
  for (const [modName, unpackedPath] of unpackedMap.entries()) {
    if (asarMap.has(modName)) {
      const asarPathFull = asarMap.get(modName);
      const filesInAsar = getAllFilesRelative(asarPathFull);
      const filesInUnpacked = getAllFilesRelative(unpackedPath);

      const asarSet = new Set(filesInAsar);
      const unpackedSet = new Set(filesInUnpacked);

      const inBoth = [...filesInAsar.filter(f => unpackedSet.has(f))].sort();
      const onlyInAsar = [...filesInAsar.filter(f => !unpackedSet.has(f))].sort();
      const onlyInUnpacked = [...filesInUnpacked.filter(f => !asarSet.has(f))].sort();

      duplicates.push({
        module: modName,
        asarPath: asarPathFull,
        unpackedPath,
        inBoth,
        onlyInAsar,
        onlyInUnpacked
      });
    }
  }

  console.log("\n=== Duplicate Modules Between app.asar and app.asar.unpacked ===");
  if (duplicates.length === 0) console.log("No duplicates found.");
  else {
    duplicates.forEach(d => {
      console.log(`Module: ${d.module}`);
      console.log(` - in asar: ${d.asarPath}`);
      console.log(` - in unpacked: ${d.unpackedPath}`);
      console.log(` - Files in both: ${d.inBoth.length}`);
      console.log(` - Only in asar: ${d.onlyInAsar.length}`);
      console.log(` - Only in unpacked: ${d.onlyInUnpacked.length}`);
      console.log("");
    });
  }

  // ===== Generate HTML report =====
  const htmlPath = path.join(OUT_DIR, "duplicate_modules_report.html");
  const htmlRows = duplicates.map(d => `
    <tr>
      <td>${d.module}</td>
      <td>${d.asarPath}</td>
      <td>${d.unpackedPath}</td>
      <td>
        ${d.inBoth.length ? "<ul>" + d.inBoth.map(f => `<li>${f}</li>`).join("") + "</ul>" : ""}
      </td>
      <td>
        ${d.onlyInAsar.length ? "<ul>" + d.onlyInAsar.map(f => `<li>${f}</li>`).join("") + "</ul>" : ""}
      </td>
      <td>
        ${d.onlyInUnpacked.length ? "<ul>" + d.onlyInUnpacked.map(f => `<li>${f}</li>`).join("") + "</ul>" : ""}
      </td>
    </tr>
  `).join("");

  const htmlContent = `
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Duplicate Modules File Comparison</title>
    <style>
      body { font-family: Arial; margin: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 8px; vertical-align: top; }
      th { background: #f2f2f2; }
      ul { margin: 0; padding-left: 20px; max-height: 150px; overflow-y: auto; }
      tr:nth-child(even) { background-color: #fafafa; }
    </style>
  </head>
  <body>
    <h1>Duplicate Modules File Comparison</h1>
    <table>
      <tr>
        <th>Module</th>
        <th>ASAR Path</th>
        <th>Unpacked Path</th>
        <th>Files in Both</th>
        <th>Only in ASAR</th>
        <th>Only in Unpacked</th>
      </tr>
      ${htmlRows}
    </table>
  </body>
  </html>
  `;

  fs.writeFileSync(htmlPath, htmlContent, "utf-8");
  console.log(`\n✅ HTML report generated: ${htmlPath}`);

  // ===== Clean temp dir =====
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Temporary unpack directory deleted: ${tempDir}`);
  }

  console.log("✅ Analysis complete.");
}

main().catch(err => console.error("Error:", err));
