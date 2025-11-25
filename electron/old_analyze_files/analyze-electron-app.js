#!/usr/bin/env node
/**
 * analyze-electron-app.js
 *
 * Usage:
 *   npm install @electron/asar
 *   node analyze-electron-app.js "path/to/electron/app" [--top=100] [--min-size=100]
 *
 * Features:
 *   - Automatically unpack app.asar if it exists
 *   - Analyze each module under app.asar.unpacked/node_modules and unpacked app.asar
 *   - Record modules larger than given min-size (default 100 KB)
 *   - Limit analysis to top N largest modules (default 100)
 *   - Identify unused files and list them by size
 *   - Generate HTML report with filename based on target folder name
 *   - Auto delete temporary unpack directory
 *   - Print all file extensions found in entire resources directory
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const asar = require("@electron/asar");

// ---------- CONFIG ----------
const UNUSED_EXTENSIONS = new Set([
  ".apache", ".apache2", ".c", ".cc", ".cpp", ".cs", ".vcxproj", ".sln", ".xcodeproj",
  ".def", ".env", ".gyp", ".gypi", ".groovy", ".idl", ".iobj", ".ilk", ".lib", ".map",
  ".ipdb", ".log", ".mts", ".cts", ".njs", ".patch", ".a", ".dff", ".ftl",".lock",
  ".recipe", ".sh", ".bat", ".spec", ".tlog", ".ts", ".lastbuildstate",".markdown",
  ".tsbuildinfo", ".typed", ".pdb", ".exp", ".md", ".msi",".makefile",".modulemap",".fingerprint",
  ".obj", ".ninja", ".nix", ".data", ".csv", ".ts", ".txt",".m",".hh",".hpp",".yaml",".yml",
  ".swiftdoc",".swiftsourceinfo",".swiftinterface",".swiftmodule",
  ".DS_Store",".Thumbs.db",".thumbs.db",".__pycache__"

]);

const UNUSED_DIR_PATTERNS = [
  /^\./,
  /^test$/i, /^tests$/i, /^__tests__$/i,
  /^spec$/i,
  /^example$/i, /^examples$/i,
  /^doc$/i, /^docs$/i,
  /^bench$/i,
  /^coverage$/i,
  /^demo$/i,
  /^local$/i,
  /^packages$/i,
  /^.swc$/i,
  /^.bin$/i,
  /^powered-test$/i,
  /^coverage$/i,
  /^demo$/i,
  /^es6$/i,
  /^amd$/i,
];

// ---------- HELPERS ----------
function getDirInfoRecursive(dirPath) {
  let totalSize = 0;
  let fileExtensions = new Set();
  let unusedFiles = [];
  let unusedDirs = [];

  function recurse(currentPath) {
    const items = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(currentPath, item.name);
      if (item.isDirectory()) {
        if (UNUSED_DIR_PATTERNS.some((p) => p.test(item.name))) {
          unusedDirs.push(fullPath);
          continue;
        }
        recurse(fullPath);
      } else {
        try {
          const stats = fs.statSync(fullPath);
          totalSize += stats.size;
          const ext = path.extname(item.name).toLowerCase();
          if (ext) fileExtensions.add(ext);
          if (UNUSED_EXTENSIONS.has(ext)) {
            unusedFiles.push({
              path: fullPath,
              sizeBytes: stats.size,
              sizeKB: (stats.size / 1024).toFixed(1),
              ext
            });
          }
        } catch {
          console.warn(`⚠️ Failed to read: ${fullPath}`);
        }
      }
    }
  }
  recurse(dirPath);
  return { totalSize, fileExtensions, unusedFiles, unusedDirs };
}

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

function collectAllExtensions(baseDir) {
  const extensions = new Set();
  function walk(dir) {
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (UNUSED_DIR_PATTERNS.some((p) => p.test(item.name))) continue;
        walk(full);
      } else {
        const ext = path.extname(item.name).toLowerCase();
        if (ext) extensions.add(ext);
      }
    }
  }
  walk(baseDir);
  return extensions;
}

// ---------- ARG PARSER ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { top: 100, minSizeKB: 100, target: null };
  for (const arg of args) {
    if (arg.startsWith("--top=")) {
      opts.top = parseInt(arg.split("=")[1], 10) || 100;
    } else if (arg.startsWith("--min-size=")) {
      opts.minSizeKB = parseInt(arg.split("=")[1], 10) || 100;
    } else if (!opts.target) {
      opts.target = arg;
    }
  }
  return opts;
}

// ---------- MAIN ----------
async function main() {
  const { target: TARGET_PATH, top: TOP_N, minSizeKB: MIN_SIZE_KB } = parseArgs();
  if (!TARGET_PATH) {
    console.error("❌ Please specify the path to the Electron app folder.");
    console.log("Example: node analyze-electron-app.js \"C:/Program Files/MyApp\" --top=200 --min-size=200");
    process.exit(1);
  }

  console.log(`Analyzing Electron app at: ${TARGET_PATH}`);
  console.log(`> Minimum module size: ${MIN_SIZE_KB} KB`);
  console.log(`> Max modules to analyze: ${TOP_N}`);

  const OUT_DIR = path.join(process.cwd(), "out");
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

  const asarPath = path.join(TARGET_PATH, "resources", "app.asar");
  const unpackedRealDir = path.join(TARGET_PATH, "resources", "app.asar.unpacked");
  // const winDir = path.join(TARGET_PATH, "resources", "win");
  const winBinDir = path.join(TARGET_PATH, "resources", "win", "bin");
  const unpackedTempDir = path.join(os.tmpdir(), "asar_unpack_" + Date.now());
  const moduleBasePaths = [];

  if (fs.existsSync(asarPath)) {
    console.log("Found app.asar, unpacking to temp directory...");
    await asar.extractAll(asarPath, unpackedTempDir);
    moduleBasePaths.push(unpackedTempDir);
  }
  if (fs.existsSync(unpackedRealDir)) {
    moduleBasePaths.push(unpackedRealDir);
  }
  // winBinDir不添加到moduleBasePaths中，单独处理
  if (moduleBasePaths.length === 0) {
    console.error("❌ No valid module directories found.");
    process.exit(1);
  }

  console.log("Analyzing module paths:");
  moduleBasePaths.forEach((p) => console.log(" - " + p));

  let moduleInfo = [];
  let allExtensions = new Set();
  let unusedSummary = {};
  let allModules = [];
  let allUnusedDirs = [];
  let moduleMap = new Map(); // 用于跟踪重复模块
  let duplicateModules = []; // 存储重复模块信息
  let winBinUnusedFiles = []; // 存储win\bin目录的未使用文件

  // Collect all modules
  for (const basePath of moduleBasePaths) {
    const modules = listModules(basePath);
    for (const mod of modules) {
      const { totalSize, fileExtensions, unusedFiles, unusedDirs } = getDirInfoRecursive(mod);
      const moduleName = path.basename(mod);
      
      // 检查是否已存在同名模块
      if (moduleMap.has(moduleName)) {
        // 发现重复模块，记录信息
        const existingModule = moduleMap.get(moduleName);
        duplicateModules.push({
          name: moduleName,
          paths: [existingModule.path, mod],
          sizes: [existingModule.size, totalSize]
        });
        // 更新现有记录，添加新路径
        existingModule.paths.push(mod);
        existingModule.sizes.push(totalSize);
      } else {
        // 新模块，添加到映射中
        moduleMap.set(moduleName, {
          path: mod,
          paths: [mod],
          size: totalSize,
          sizes: [totalSize]
        });
        allModules.push({ basePath, mod, totalSize, fileExtensions, unusedFiles });
      }
      
      fileExtensions.forEach((e) => allExtensions.add(e));
      allUnusedDirs.push(...unusedDirs);
    }
  }

  // 单独分析win\bin目录的未使用文件
  if (fs.existsSync(winBinDir)) {
    console.log("Found win\\bin directory, analyzing unused files...");
    const { unusedFiles: binUnusedFiles } = getDirInfoRecursive(winBinDir);
    winBinUnusedFiles = binUnusedFiles;
    console.log("win\\bin directory unused files length:", binUnusedFiles.length);
    
    // 将win\bin的未使用文件类型统计合并到总统计中
    for (const file of binUnusedFiles) {
      if (!unusedSummary[file.ext]) unusedSummary[file.ext] = { count: 0, totalBytes: 0 };
      unusedSummary[file.ext].count += 1;
      unusedSummary[file.ext].totalBytes += file.sizeBytes;
    }
  }

  // Sort and trim
  allModules.sort((a, b) => b.totalSize - a.totalSize);
  if (allModules.length > TOP_N) {
    console.log(`⚠️ Too many modules (${allModules.length}), analyzing top ${TOP_N} only...`);
    allModules = allModules.slice(0, TOP_N);
  }

  console.log(`\n=== Module Summary (Top ${TOP_N}, >${MIN_SIZE_KB}KB) ===`);
  allModules.forEach((m) => {
    if (m.totalSize > MIN_SIZE_KB * 1024) {
      console.log(`${path.relative(m.basePath, m.mod).padEnd(60)} ${(m.totalSize / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  // Filter and analyze details
  for (const m of allModules) {
    if (m.totalSize > MIN_SIZE_KB * 1024) {
      m.unusedFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
      moduleInfo.push({
        module: path.relative(m.basePath, m.mod),
        sizeMB: (m.totalSize / 1024 / 1024).toFixed(2),
        unusedFiles: m.unusedFiles,
      });
      for (const f of m.unusedFiles) {
        if (!unusedSummary[f.ext]) unusedSummary[f.ext] = { count: 0, totalBytes: 0 };
        unusedSummary[f.ext].count += 1;
        unusedSummary[f.ext].totalBytes += f.sizeBytes;
      }
    }
  }

  // ===== Generate HTML filename based on target folder name =====
  const targetFolderName = path.basename(TARGET_PATH);
  const htmlFilename = `analysis_${targetFolderName}.html`;
  const OUT = (filename) => path.join(OUT_DIR, filename);

  // ===== Generate summary data for HTML =====
  const summaryRows = Object.entries(unusedSummary)
    .sort((a, b) => b[1].totalBytes - a[1].totalBytes)
    .map(([ext, info]) => ({
      Extension: ext,
      Count: info.count,
      TotalSizeKB: (info.totalBytes / 1024).toFixed(1),
      TotalSizeMB: (info.totalBytes / 1024 / 1024).toFixed(2),
    }));

  // ===== Generate file extensions data =====
  // 未使用的文件后缀
  const unusedExtensions = [...UNUSED_EXTENSIONS].sort();
  
  // 使用的文件后缀（所有后缀减去未使用的）
  const usedExtensions = [...allExtensions].filter(ext => !UNUSED_EXTENSIONS.has(ext)).sort();

  // ===== Sort duplicate modules by total size =====
  duplicateModules.sort((a, b) => {
    const totalSizeA = a.sizes.reduce((sum, size) => sum + size, 0);
    const totalSizeB = b.sizes.reduce((sum, size) => sum + size, 0);
    return totalSizeB - totalSizeA; // 降序排列
  });

  // ===== Calculate total folder size (recursive) =====
  function calculateTotalFolderSize(folderPath) {
    let totalSize = 0;
    
    function calculateSize(currentPath) {
      try {
        const items = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(currentPath, item.name);
          try {
            if (item.isDirectory()) {
              calculateSize(fullPath); // 递归计算子目录
            } else {
              const stats = fs.statSync(fullPath);
              totalSize += stats.size;
            }
          } catch {
            // 忽略无法访问的文件或目录
          }
        }
      } catch {
        // 忽略无法访问的目录
      }
    }
    
    calculateSize(folderPath);
    return totalSize;
  }

  // ===== Calculate target folder direct contents =====
  function calculateTargetFolderContents(targetPath) {
    let items = [];
    let resourcesItems = [];
    
    try {
      const dirItems = fs.readdirSync(targetPath, { withFileTypes: true });
      for (const item of dirItems) {
        const fullPath = path.join(targetPath, item.name);
        try {
          let itemSize = 0;
          if (item.isDirectory()) {
            // 递归计算文件夹大小
            itemSize = calculateTotalFolderSize(fullPath);
            
            // 如果是resources目录，单独处理其内容
            if (item.name === 'resources') {
              const resourcesContents = fs.readdirSync(fullPath, { withFileTypes: true });
              for (const resourceItem of resourcesContents) {
                const resourceFullPath = path.join(fullPath, resourceItem.name);
                try {
                  let resourceItemSize = 0;
                  if (resourceItem.isDirectory()) {
                    resourceItemSize = calculateTotalFolderSize(resourceFullPath);
                  } else {
                    const stats = fs.statSync(resourceFullPath);
                    resourceItemSize = stats.size;
                  }
                  
                  resourcesItems.push({
                    name: resourceItem.name,
                    type: resourceItem.isDirectory() ? 'Directory' : 'File',
                    size: resourceItemSize,
                    sizeMB: (resourceItemSize / 1024 / 1024).toFixed(2),
                    sizeGB: (resourceItemSize / 1024 / 1024 / 1024).toFixed(2)
                  });
                } catch {
                  // 忽略无法访问的文件或目录
                }
              }
              // 按大小降序排序resources内容
              resourcesItems.sort((a, b) => b.size - a.size);
            }
          } else {
            // 文件大小
            const stats = fs.statSync(fullPath);
            itemSize = stats.size;
          }
          
          items.push({
            name: item.name,
            type: item.isDirectory() ? 'Directory' : 'File',
            size: itemSize,
            sizeMB: (itemSize / 1024 / 1024).toFixed(2),
            sizeGB: (itemSize / 1024 / 1024 / 1024).toFixed(2)
          });
        } catch {
          // 忽略无法访问的文件或目录
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
    
    // 按大小降序排序
    items.sort((a, b) => b.size - a.size);
    return { items, resourcesItems };
  }

  // 计算整个目标文件夹的总大小
  const totalFolderSize = calculateTotalFolderSize(TARGET_PATH);
  const totalFolderSizeMB = (totalFolderSize / 1024 / 1024).toFixed(2);
  const totalFolderSizeGB = (totalFolderSize / 1024 / 1024 / 1024).toFixed(2);

  // 计算目标文件夹的直接内容（包括resources和其他同级目录/文件）
  const folderContents = calculateTargetFolderContents(TARGET_PATH);
  const targetFolderItems = folderContents.items;
  const resourcesItems = folderContents.resourcesItems;

  // ===== HTML =====
  let htmlRows = "";
  moduleInfo.forEach((mod) => {
    const fileCount = mod.unusedFiles.length || 1;
    if (mod.unusedFiles.length === 0) {
      htmlRows += `<tr><td>${mod.module}</td><td>${mod.sizeMB}</td><td></td><td></td></tr>`;
    } else {
      mod.unusedFiles.forEach((file, idx) => {
        htmlRows += "<tr>";
        if (idx === 0)
          htmlRows += `<td rowspan="${fileCount}">${mod.module}</td><td rowspan="${fileCount}">${mod.sizeMB}</td>`;
        htmlRows += `<td>${file.path}</td><td>${file.sizeKB}</td>`;
        htmlRows += "</tr>";
      });
    }
  });

  const html = `
  <html><head><meta charset="UTF-8">
  <title>Electron App Analysis Report</title>
  <style>
    body{font-family:Arial;margin:20px}
    table{border-collapse:collapse;width:100%;margin-bottom:40px}
    th,td{border:1px solid #ddd;padding:8px}
    th{background:#f2f2f2;text-align:left}
    tr:nth-child(even){background:#f9f9f9}
    .folder-info{background:#e8f4fd;padding:15px;border-radius:5px;margin-bottom:20px;border-left:4px solid #2196F3}
    .size-large{font-size:18px;font-weight:bold;color:#1976D2}
  </style></head>
  <body>
    <h1>Electron App Analysis Report</h1>
    <div class="folder-info">
      <h2 style="margin-top:0;color:#1976D2">📁 Target Folder Information</h2>
      <p><strong>Folder Path:</strong> ${TARGET_PATH}</p>
      <p><strong>Total Size:</strong> <span class="size-large">${totalFolderSizeMB} MB</span> (${totalFolderSizeGB} GB)</p>
    </div>
    <h2>📋 Target Folder Contents</h2>
    <table>
      <tr><th>Name</th><th>Type</th><th>Size (MB)</th><th>Size (GB)</th></tr>
      ${targetFolderItems.length === 0 ? 
        '<tr><td colspan="4">No items found in target folder.</td></tr>' :
        targetFolderItems.map(item => 
          `<tr><td>${item.name}</td><td>${item.type}</td><td>${item.sizeMB}</td><td>${item.sizeGB}</td></tr>`
        ).join("")
      }
    </table>
    <h2>📁 Resources Directory Contents</h2>
    <table>
      <tr><th>Name</th><th>Type</th><th>Size (MB)</th><th>Size (GB)</th></tr>
      ${resourcesItems.length === 0 ? 
        '<tr><td colspan="4">No items found in resources directory.</td></tr>' :
        resourcesItems.map(item => 
          `<tr><td>${item.name}</td><td>${item.type}</td><td>${item.sizeMB}</td><td>${item.sizeGB}</td></tr>`
        ).join("")
      }
    </table>
    <h2>🔧 Win\\Bin Directory Unused Files</h2>
    <table>
      <tr><th>File Path</th><th>Size (KB)</th><th>Extension</th></tr>
      ${winBinUnusedFiles.length === 0 ? 
        '<tr><td colspan="3">No unused files found in win\\bin directory.</td></tr>' :
        winBinUnusedFiles.map(file => 
          `<tr><td>${file.path}</td><td>${file.sizeKB}</td><td>${file.ext}</td></tr>`
        ).join("")
      }
    </table>
    <h2>Module Summary (>${MIN_SIZE_KB}KB, Top ${TOP_N})</h2>
    <table><tr><th>Module</th><th>Size (MB)</th></tr>
      ${allModules
        .filter((m) => m.totalSize > MIN_SIZE_KB * 1024)
        .map((m) => `<tr><td>${path.relative(m.basePath, m.mod)}</td><td>${(m.totalSize / 1024 / 1024).toFixed(2)}</td></tr>`)
        .join("")}
    </table>
    <h2>Detailed Unused Files</h2>
    <table><tr><th>Module</th><th>Size (MB)</th><th>Unused File</th><th>Size (KB)</th></tr>
    ${htmlRows}</table>
    <h2>Summary of Unused File Types</h2>
    <table>
      <tr><th>Extension</th><th>Count</th><th>Total Size (KB)</th><th>Total Size (MB)</th></tr>
      ${summaryRows.map(s => `<tr><td>${s.Extension}</td><td>${s.Count}</td><td>${s.TotalSizeKB}</td><td>${s.TotalSizeMB}</td></tr>`).join("")}
    </table>
    <h2>Unused Directories Found</h2>
    <table>
      <tr><th>Directory Path</th></tr>
      ${allUnusedDirs.length === 0 ? 
        '<tr><td>No unused directories found.</td></tr>' :
        allUnusedDirs.map(dir => `<tr><td>${dir}</td></tr>`).join("")
      }
    </table>
    <h2>Duplicate Modules Found</h2>
    <table>
      <tr><th>Module Name</th><th>Paths</th><th>Sizes (MB)</th></tr>
      ${duplicateModules.length === 0 ? 
        '<tr><td colspan="3">No duplicate modules found.</td></tr>' :
        duplicateModules.map(dup => {
          const pathsHtml = dup.paths.map(p => `<div>${p}</div>`).join("");
          const sizesHtml = dup.sizes.map(s => `<div>${(s / 1024 / 1024).toFixed(2)}</div>`).join("");
          return `<tr><td>${dup.name}</td><td>${pathsHtml}</td><td>${sizesHtml}</td></tr>`;
        }).join("")
      }
    </table>
    <h2>Used File Extensions</h2>
    <p>File extensions found in modules (excluding unused extensions):</p>
    <div style="font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
      ${usedExtensions.join(", ")}
    </div>
    <h2>Unused File Extensions</h2>
    <p>File extensions considered as unused (configured in UNUSED_EXTENSIONS):</p>
    <div style="font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 5px;">
      ${unusedExtensions.join(", ")}
    </div>
  </body></html>`;
  fs.writeFileSync(OUT(htmlFilename), html, "utf-8");
  console.log(`✅ HTML report generated: ${OUT(htmlFilename)}`);

  // Clean temp
  if (fs.existsSync(unpackedTempDir)) {
    fs.rmSync(unpackedTempDir, { recursive: true, force: true });
    console.log(`Temporary unpack directory deleted: ${unpackedTempDir}`);
  }

  // Print extensions
  const resourcesPath = path.join(TARGET_PATH, "resources");
  console.log("\n=== All File Extensions in Resources Folder ===");
  const resourceExts = collectAllExtensions(resourcesPath);
  console.log([...resourceExts].sort().join(", "));

  // Print unused directories
  console.log("\n=== Unused Directories Found ===");
  if (allUnusedDirs.length === 0) {
    console.log("No unused directories found.");
  } else {
    console.log(`Found ${allUnusedDirs.length} unused directories:`);
    allUnusedDirs.forEach(dir => console.log(`  - ${dir}`));
  }

  // Print duplicate modules
  console.log("\n=== Duplicate Modules Found ===");
  if (duplicateModules.length === 0) {
    console.log("No duplicate modules found.");
  } else {
    console.log(`Found ${duplicateModules.length} duplicate modules:`);
    duplicateModules.forEach(dup => {
      console.log(`\n  Module: ${dup.name}`);
      dup.paths.forEach((path, index) => {
        console.log(`    Path ${index + 1}: ${path} (${(dup.sizes[index] / 1024 / 1024).toFixed(2)} MB)`);
      });
    });
  }

  console.log("\nAnalysis complete ✅");
}

main().catch((err) => console.error("Error during analysis:", err));
