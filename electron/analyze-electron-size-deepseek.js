/**
 * Electron应用大小分析工具
 * 
 * 功能说明：
 * 1. 分析Electron应用的目录结构和文件大小
 * 2. 自动解压app.asar文件，分析其中的代码和依赖模块
 * 3. 统计各类资源的大小（代码、框架文件、本地化文件、资源文件、依赖包等）
 * 4. 生成两份JSON报告：
 *    - 详细列表报告：包含所有文件和模块的大小信息
 *    - 分类统计报告：按类别汇总，包含summary和details
 * 
 * 分类说明：
 * - code: out/dist目录下的应用代码
 * - framework: 根目录下的框架文件（dll、exe等）
 * - locals: locales本地化文件
 * - resource: resources/assets资源文件
 * - zoom: resources/win目录（特定应用相关）
 * - ringcentralDepends: @ringcentral域的依赖包（含rcv-desktop-sdk和dvc-deps）
 * - otherDepends: 其他第三方依赖包
 * 
 * 使用方法：
 * node analyze-electron-size-deepseek.js <electron应用路径> [应用名称]
 * 
 * 参数说明：
 * - electron应用路径: Electron应用的安装目录（必填）
 * - 应用名称: 用于生成输出文件夹和文件名（可选，默认为'electron-analysis'）
 * 
 * 示例：
 * node analyze-electron-size-deepseek.js "C:\Program Files\RingCentral" ringcentral
 * node analyze-electron-size-deepseek.js "/Applications/Slack.app/Contents" slack
 * 
 * 输出：
 * - 在当前目录下创建以应用名称命名的文件夹
 * - 生成两个JSON文件：
 *   1. [应用名称]-[时间戳].json - 详细列表
 *   2. [应用名称]-categorized-[时间戳].json - 分类统计
 * 
 * 依赖：
 * - @electron/asar: 用于解压app.asar文件
 * 
 * @author Victor Wang
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ElectronAppAnalyzer {
  constructor(basePath, appName = 'electron-analysis') {
    this.basePath = basePath;
    this.appName = appName; // 应用名称，用于生成文件名
    
    // 定义输出目录（在当前工作目录下）
    this.outputDir = path.join(process.cwd(), this.appName);
    
    // 定义解压路径常量（在输出目录下，避免权限问题）
    this.outPath = path.join(this.outputDir, 'out');
    this.outPathRelative = 'out'; // 用于显示的相对路径（相对于输出目录）
    
    this.results = {
      totalSize: 0,
      items: [], // 用于存储所有要排序的项目
    //   distFiles: [],
    //   nodeModules: []
    };
    
    // 创建输出目录
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`已创建输出目录: ${this.outputDir}`);
    }
    
    this.cleanOutDirectory(); // 清理out目录（删除旧的解压文件）
  }

  // 格式化文件大小
  formatSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    } else if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
      return (bytes / 1024).toFixed(2) + ' KB';
    } else {
      return bytes + ' B';
    }
  }

  // 获取文件或文件夹大小
  getSize(itemPath) {
    try {
      const stats = fs.statSync(itemPath);
      if (stats.isFile()) {
        return stats.size;
      } else if (stats.isDirectory()) {
        let totalSize = 0;
        const items = fs.readdirSync(itemPath);
        for (const item of items) {
          totalSize += this.getSize(path.join(itemPath, item));
        }
        return totalSize;
      }
      return 0;
    } catch (error) {
      console.warn(`无法获取大小: ${itemPath}`, error.message);
      return 0;
    }
  }

  // 计算目录下文件数量
  countFiles(dirPath) {
    let count = 0;
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stats = fs.statSync(fullPath);
        if (stats.isFile()) {
          count++;
        } else if (stats.isDirectory()) {
          count += this.countFiles(fullPath);
        }
      }
    } catch (error) {
      console.warn(`无法统计文件数量: ${dirPath}`, error.message);
    }
    return count;
  }

  // 清理out目录（删除已存在的out目录）
  cleanOutDirectory() {
    try {
      if (fs.existsSync(this.outPath)) {
        fs.rmSync(this.outPath, { recursive: true, force: true });
        console.log('已删除旧的out目录');
      }
      return true;
    } catch (error) {
      console.error('删除out目录失败:', error.message);
      return false;
    }
  }

  // 创建out目录
  createOutDirectory() {
    try {
      if (!fs.existsSync(this.outPath)) {
        fs.mkdirSync(this.outPath, { recursive: true });
        console.log('已创建新的out目录');
      }
      return true;
    } catch (error) {
      console.error('创建out目录失败:', error.message);
      return false;
    }
  }

  // 解压app.asar
  extractAppAsar() {
    const asarPath = path.join(this.basePath, 'resources', 'app.asar');
    
    if (!fs.existsSync(asarPath)) {
      console.log('app.asar 文件不存在，跳过解压');
      return false;
    }

    try {
      // 创建out目录
      if (!this.createOutDirectory()) {
        return false;
      }
      
      // 使用asar解压
      console.log('正在解压app.asar...');
      execSync(`npx asar extract "${asarPath}" "${this.outPath}"`, { 
        stdio: 'pipe',
        encoding: 'utf8'
      });
      console.log('app.asar 解压成功');
      return true;
    } catch (error) {
      console.error('解压app.asar失败:', error.message);
      return false;
    }
  }

  // 分析主目录下的文件（仅当前目录，不包括子目录）
  analyzeRootFiles() {
    try {
      const items = fs.readdirSync(this.basePath);
      for (const item of items) {
        const fullPath = path.join(this.basePath, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile()) {
            const sizeBytes = stats.size;
            this.results.items.push({
              path: item,
              size: this.formatSize(sizeBytes),
              type: 'file',
              _sizeBytes: sizeBytes // 用于排序的内部字段，不输出
            });
          }
        } catch (error) {
          console.warn(`无法访问文件: ${fullPath}`, error.message);
        }
      }
    } catch (error) {
      console.warn('无法分析根目录文件', error.message);
    }
  }

  // 分析locales目录
  analyzeLocales() {
    const localesPath = path.join(this.basePath, 'locales');
    if (fs.existsSync(localesPath)) {
      const sizeBytes = this.getSize(localesPath);
      
      this.results.items.push({
        path: 'locales',
        size: this.formatSize(sizeBytes),
        type: 'module',
        _sizeBytes: sizeBytes,
        // children: this.getDirectoryStructure(localesPath, 'locales')
      });
    }
  }

  // 分析resources/assets
  analyzeResourcesAssets() {
    const assetsPath = path.join(this.basePath, 'resources', 'assets');
    if (fs.existsSync(assetsPath)) {
      // const sizeBytes = this.getSize(assetsPath);
      
      // this.results.items.push({
      //   path: 'resources/assets',
      //   size: this.formatSize(sizeBytes),
      //   type: 'module',
      //   _sizeBytes: sizeBytes,
      //   // children: this.getDirectoryStructure(assetsPath, 'resources/assets')
      // });

      // 统计assets下的直接子文件夹
      try {
        const items = fs.readdirSync(assetsPath);
        for (const item of items) {
          const fullPath = path.join(assetsPath, item);
          const stats = fs.statSync(fullPath);
          
          if (stats.isDirectory()) {
            const folderSizeBytes = this.getSize(fullPath);
            this.results.items.push({
              path: `resources/assets/${item}`,
              size: this.formatSize(folderSizeBytes),
              type: 'module',
              _sizeBytes: folderSizeBytes
            });
          }
        }
      } catch (error) {
        console.warn(`无法读取assets子文件夹: ${assetsPath}`, error.message);
      }
    }
  }

  // 分析resources下的其他模块
  analyzeResourcesOtherModules() {
    const resourcesPath = path.join(this.basePath, 'resources');
    if (!fs.existsSync(resourcesPath)) return;

    const excludeItems = ['app.asar', 'app.asar.unpacked', 'assets', 'out'];
    
    // 用于统计resources下的文件
    let totalFilesSize = 0;
    let fileCount = 0;
    
    try {
      const items = fs.readdirSync(resourcesPath);
      for (const item of items) {
        if (!excludeItems.includes(item)) {
          const fullPath = path.join(resourcesPath, item);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              // 目录作为单独的模块记录
              const sizeBytes = this.getSize(fullPath);
              
              this.results.items.push({
                path: `resources/${item}`,
                size: this.formatSize(sizeBytes),
                type: 'module',
                _sizeBytes: sizeBytes,
                // children: this.getDirectoryStructure(fullPath, `resources/${item}`)
              });
            } else if (stats.isFile()) {
              // 文件累计大小
              totalFilesSize += stats.size;
              fileCount++;
            }
          } catch (error) {
            console.warn(`无法分析resources模块: ${fullPath}`, error.message);
          }
        }
      }
      
      // 如果有文件，将所有文件作为一个条目记录
      if (fileCount > 0) {
        this.results.items.push({
          path: 'resources/files',
          size: this.formatSize(totalFilesSize),
          type: 'files',
          _sizeBytes: totalFilesSize,
          count: fileCount
        });
      }
    } catch (error) {
      console.warn('无法分析resources模块', error.message);
    }
  }

  // 分析out/dist目录
  analyzeOutDist() {
    const distPath = path.join(this.outPath, 'dist');
    if (!fs.existsSync(distPath)) return;

    try {
      const items = fs.readdirSync(distPath);
      for (const item of items) {
        const fullPath = path.join(distPath, item);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile()) {
            const sizeBytes = stats.size;
            this.results.items.push({
              path: `${this.outPathRelative}/dist/${item}`,
              size: this.formatSize(sizeBytes),
              type: 'file',
              _sizeBytes: sizeBytes
            });
          } else if (stats.isDirectory()) {
            const sizeBytes = this.getSize(fullPath);
            this.results.items.push({
              path: `${this.outPathRelative}/dist/${item}`,
              size: this.formatSize(sizeBytes),
              type: 'module',
              _sizeBytes: sizeBytes,
              children: this.getDirectoryStructure(fullPath, `${this.outPathRelative}/dist/${item}`)
            });
          }
        } catch (error) {
          console.warn(`无法分析dist文件: ${fullPath}`, error.message);
        }
      }
    } catch (error) {
      console.warn('无法分析out/dist', error.message);
    }
  }

  // 分析node_modules
  analyzeNodeModules() {
    const nodeModulesPath = path.join(this.outPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) return;

    try {
      const items = fs.readdirSync(nodeModulesPath);
      for (const item of items) {
        const fullPath = path.join(nodeModulesPath, item);
        
        if (item.startsWith('@ringcentral')) {
          // 处理@开头的scoped包
          this.analyzeScopedPackages(fullPath, item);
        } else {
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              const sizeBytes = this.getSize(fullPath);
              this.results.items.push({
                path: `${this.outPathRelative}/node_modules/${item}`,
                size: this.formatSize(sizeBytes),
                type: 'module',
                _sizeBytes: sizeBytes,
                // children: this.getDirectoryStructure(fullPath, `${this.outPathRelative}/node_modules/${item}`)
              });
            }
          } catch (error) {
            console.warn(`无法分析node模块: ${fullPath}`, error.message);
          }
        }
      }
    } catch (error) {
      console.warn('无法分析node_modules', error.message);
    }
  }

  // 分析scoped包 (@开头的包)
  analyzeScopedPackages(scopedPath, scopeName) {
    try {
      const packages = fs.readdirSync(scopedPath);
      for (const pkg of packages) {
        const fullPath = path.join(scopedPath, pkg);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isDirectory()) {
            const sizeBytes = this.getSize(fullPath);
            this.results.items.push({
              path: `${this.outPathRelative}/node_modules/${scopeName}/${pkg}`,
              size: this.formatSize(sizeBytes),
              type: 'module',
              _sizeBytes: sizeBytes,
            //   children: this.getDirectoryStructure(fullPath, `${this.outPathRelative}/node_modules/${scopeName}/${pkg}`)
            });
          }
        } catch (error) {
          console.warn(`无法分析scoped包: ${fullPath}`, error.message);
        }
      }
    } catch (error) {
      console.warn(`无法分析scoped包目录: ${scopedPath}`, error.message);
    }
  }

  // 获取目录结构（用于嵌套显示）
  getDirectoryStructure(dirPath, basePath = '') {
    const structure = [];
    
    try {
      const items = fs.readdirSync(dirPath);
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        try {
          const stats = fs.statSync(fullPath);
          const relativePath = basePath ? `${basePath}/${item}` : item;
          
          if (stats.isFile()) {
            structure.push({
              path: relativePath,
              size: this.formatSize(stats.size),
              type: 'file',
              _sizeBytes: stats.size
            });
          } else if (stats.isDirectory()) {
            const sizeBytes = this.getSize(fullPath);
            structure.push({
              path: relativePath,
              size: this.formatSize(sizeBytes),
              type: 'module',
              _sizeBytes: sizeBytes,
              children: this.getDirectoryStructure(fullPath, relativePath)
            });
          }
        } catch (error) {
          console.warn(`无法访问目录项: ${fullPath}`, error.message);
        }
      }
    } catch (error) {
      console.warn(`无法读取目录结构: ${dirPath}`, error.message);
    }
    
    return structure;
  }

  // 清理输出对象，移除内部排序字段
  cleanOutputObject(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.cleanOutputObject(item));
    } else if (obj && typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key !== '_sizeBytes') {
          cleaned[key] = this.cleanOutputObject(value);
        }
      }
      return cleaned;
    }
    return obj;
  }

  // 排序所有结果
  sortResults() {
    // 主项目按大小排序
    this.results.items.sort((a, b) => b._sizeBytes - a._sizeBytes);
    // this.results.distFiles.sort((a, b) => b._sizeBytes - a._sizeBytes);
    // this.results.nodeModules.sort((a, b) => b._sizeBytes - a._sizeBytes);
    
    // 递归排序嵌套结构
    const sortNested = (items) => {
      if (!items || !Array.isArray(items)) return;
      
      items.sort((a, b) => b._sizeBytes - a._sizeBytes);
      items.forEach(item => {
        if (item.children) {
          sortNested(item.children);
        }
      });
    };
    
    this.results.items.forEach(item => sortNested(item.children));
    // this.results.distFiles.forEach(item => sortNested(item.children));
    // this.results.nodeModules.forEach(item => sortNested(item.children));
  }

  // 计算总大小
  calculateTotalSize() {
    this.results.totalSize = this.getSize(this.basePath);
  }

  // 生成输出文件
  generateOutput() {
    const output = {
      analysisInfo: {
        basePath: this.basePath,
        totalSize: this.formatSize(this.results.totalSize),
        analysisTime: new Date().toISOString()
      },
      TotalItems: this.cleanOutputObject(this.results.items),
    //   distAnalysis: {
    //     files: this.cleanOutputObject(this.results.distFiles)
    //   },
    //   nodeModulesAnalysis: {
    //     modules: this.cleanOutputObject(this.results.nodeModules)
    //   }
    };

    return JSON.stringify(output, null, 2);
  }

  // 生成分类统计输出文件
  generateCategorizedOutput() {
    // 统计信息（不含items）
    const categoryStats = {
      code: { name: 'code', size: '', sizeBytes: 0, count: 0, percent: '' },
      framework: { name: 'framework', size: '', sizeBytes: 0, count: 0, percent: '' },
      locals: { name: 'locals', size: '', sizeBytes: 0, count: 0, percent: '' },
      resource: { name: 'resource', size: '', sizeBytes: 0, count: 0, percent: '' },
      zoom: { name: 'zoom', size: '', sizeBytes: 0, count: 0, percent: '' },
      ringcentralDepends: { name: 'ringcentralDepends', size: '', sizeBytes: 0, count: 0, percent: '' },
      otherDepends: { name: 'otherDepends', size: '', sizeBytes: 0, count: 0, percent: '' }
    };

    // 详细items（用于details）
    const categoryItems = {
      code: [],
      framework: [],
      locals: [],
      resource: [],
      zoom: [],
      ringcentralDepends: [],
      otherDepends: []
    };

    // 分类所有项目
    for (const item of this.results.items) {
      const itemCopy = { ...item };
      
      if (item.path.startsWith(`${this.outPathRelative}/dist`)) {
        // 1. resources/out/dist -> code
        categoryItems.code.push(itemCopy);
        categoryStats.code.sizeBytes += item._sizeBytes || 0;
        categoryStats.code.count++;
      } else if (item.type === 'file' && !item.path.includes('/')) {
        // 2. basePath下的文件（不包括文件夹）-> framework
        categoryItems.framework.push(itemCopy);
        categoryStats.framework.sizeBytes += item._sizeBytes || 0;
        categoryStats.framework.count++;
      } else if (item.path === 'locales') {
        // 3. locales -> locals
        categoryItems.locals.push(itemCopy);
        categoryStats.locals.sizeBytes += item._sizeBytes || 0;
        categoryStats.locals.count++;
      } else if (item.path.startsWith('resources/assets')) {
        // 4. resources/assets 及其子文件夹 -> resource
        categoryItems.resource.push(itemCopy);
        categoryStats.resource.sizeBytes += item._sizeBytes || 0;
        categoryStats.resource.count++;
      } else if (item.path === 'resources/win') {
        // 5. resources/win -> zoom
        categoryItems.zoom.push(itemCopy);
        categoryStats.zoom.sizeBytes += item._sizeBytes || 0;
        categoryStats.zoom.count++;
      } else if (item.path.startsWith(`${this.outPathRelative}/node_modules/@ringcentral`)) {
        // 6. resources/out/node_modules/@ringcentral -> ringcentralDepends
        categoryItems.ringcentralDepends.push(itemCopy);
        categoryStats.ringcentralDepends.sizeBytes += item._sizeBytes || 0;
        categoryStats.ringcentralDepends.count++;
      } else if (item.path.startsWith(`${this.outPathRelative}/node_modules/`)) {
        // 7. resources/out/node_modules/下除了@ringcentral外 -> otherDepends
        // 特殊处理：ringcentral应用的rcv-desktop-sdk和dvc-deps模块
        const moduleName = item.path.replace(`${this.outPathRelative}/node_modules/`, '').split('/')[0];
        const isRingcentralSpecialModule = this.appName === 'ringcentral' && 
          (moduleName === 'rcv-desktop-sdk' || moduleName === 'dvc-deps');
        
        if (isRingcentralSpecialModule) {
          // ringcentral应用的rcv-desktop-sdk和dvc-deps放到ringcentralDepends中
          categoryItems.ringcentralDepends.push(itemCopy);
          categoryStats.ringcentralDepends.sizeBytes += item._sizeBytes || 0;
          categoryStats.ringcentralDepends.count++;
        } else {
          // 其他所有模块放到otherDepends中
          categoryItems.otherDepends.push(itemCopy);
          categoryStats.otherDepends.sizeBytes += item._sizeBytes || 0;
          categoryStats.otherDepends.count++;
        }
      }
    }

    // 格式化每个分类的总大小，并计算百分比
    const totalSizeBytes = this.results.totalSize;
    for (const stat of Object.values(categoryStats)) {
      stat.size = this.formatSize(stat.sizeBytes);
      stat.percent = totalSizeBytes > 0 
        ? ((stat.sizeBytes / totalSizeBytes) * 100).toFixed(2) + '%'
        : '0.00%';
    }

    // 对每个分类的items按大小排序
    for (const items of Object.values(categoryItems)) {
      items.sort((a, b) => (b._sizeBytes || 0) - (a._sizeBytes || 0));
    }

    // 将分类转换为数组并按大小排序（大的在前）
    const sortedStats = Object.values(categoryStats).sort((a, b) => b.sizeBytes - a.sizeBytes);

    // 构建 summary 数组（按大小排序）
    const summary = sortedStats.map(stat => ({
      name: stat.name,
      size: stat.size,
      count: stat.count,
      percent: stat.percent
    }));

    // 构建 details 数组（按大小排序）
    const details = sortedStats.map(stat => ({
      name: stat.name,
      size: stat.size,
      count: stat.count,
      percent: stat.percent,
      items: this.cleanOutputObject(categoryItems[stat.name])
    }));

    const output = {
      analysisInfo: {
        basePath: this.basePath,
        totalSize: this.formatSize(this.results.totalSize),
        analysisTime: new Date().toISOString()
      },
      summary: summary,
      details: details
    };

    return JSON.stringify(output, null, 2);
  }

  // 保存到文件
  saveToFile(data, filename) {
    try {
      fs.writeFileSync(filename, data);
      console.log(`分析结果已保存到: ${filename}`);
      return true;
    } catch (error) {
      console.error(`保存文件失败: ${filename}`, error.message);
      return false;
    }
  }

  // 主分析函数
  async analyze() {
    console.log('开始分析Electron应用...');
    
    // 计算总大小
    this.calculateTotalSize();
    console.log(`应用总大小: ${this.formatSize(this.results.totalSize)}`);
    
    // 执行所有分析步骤
    this.analyzeRootFiles();
    this.analyzeLocales();
    this.analyzeResourcesAssets();
    this.analyzeResourcesOtherModules();
    
    // 解压并分析asar
    if (this.extractAppAsar()) {
      this.analyzeOutDist();
      this.analyzeNodeModules();
    }
    
    // 排序结果
    this.sortResults();
    
    // 生成第一个输出文件（详细列表）
    const output1 = this.generateOutput();
    
    // 生成第二个输出文件（分类统计）
    const output2 = this.generateCategorizedOutput();
    
    // 保存到文件（outputDir已在构造函数中创建）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename1 = path.join(this.outputDir, `${this.appName}-${timestamp}.json`);
    const filename2 = path.join(this.outputDir, `${this.appName}-categorized-${timestamp}.json`);
    
    this.saveToFile(output1, filename1);
    this.saveToFile(output2, filename2);
    
    console.log('分析完成！');
    return {
      detailed: JSON.parse(output1),
      categorized: JSON.parse(output2)
    };
  }
}

// 使用示例
async function main() {
  const electronAppPath = process.argv[2];
  const appName = process.argv[3] || 'electron-analysis'; // 可选的应用名称参数
  
  if (!electronAppPath) {
    console.log('请指定Electron应用路径:');
    console.log('用法: node analyze-electron-size-deepseek.js /path/to/electron/app [appName]');
    console.log('示例: node analyze-electron-size-deepseek.js /path/to/app myapp');
    process.exit(1);
  }
  
  if (!fs.existsSync(electronAppPath)) {
    console.log(`指定的路径不存在: ${electronAppPath}`);
    process.exit(1);
  }
  
  console.log(`应用名称: ${appName}`);
  const analyzer = new ElectronAppAnalyzer(electronAppPath, appName);
  const results = await analyzer.analyze();
  
  return results;
}

// 如果直接运行此文件
if (require.main === module) {
  main().catch(console.error);
}

module.exports = ElectronAppAnalyzer;