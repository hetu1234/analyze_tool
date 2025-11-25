/**
 * Electron应用模块对比工具
 * 
 * 功能说明：
 * 1. 比较两个Electron应用分析结果中的node_modules依赖包
 * 2. 找出两个应用共同使用的模块
 * 3. 对比相同模块在不同应用中的大小差异
 * 4. 生成详细的对比报告
 * 
 * 使用方法：
 * node compare-modules.js <文件1路径> <文件2路径> [输出目录]
 * 
 * 参数说明：
 * - 文件1路径: 第一个应用的分析结果JSON文件（必填）
 * - 文件2路径: 第二个应用的分析结果JSON文件（必填）
 * - 输出目录: 对比结果的输出目录（可选，默认为当前目录）
 * 
 * 示例：
 * node compare-modules.js ringcentral/ringcentral-2025-11-14T03-08-45-777Z.json slack/slack-2025-11-14T03-09-36-995Z.json
 * node compare-modules.js app1/result.json app2/result.json ./output
 * 
 * 输出：
 * - module-comparison-[时间戳].json - 包含以下信息：
 *   1. comparisonInfo: 对比概览信息
 *      - 共同模块数量
 *      - 大小不同/相同的模块数量
 *      - 两个应用共同模块的总大小对比
 *   2. commonModules: 共同模块列表（分别列出在两个应用中的信息）
 *   3. sizeDifferences: 大小差异详情（按差异大小排序）
 * 
 * 注意事项：
 * - 输入文件必须是由analyze-electron-size-deepseek.js生成的JSON文件
 * - 只对比node_modules下的模块
 * - 支持scoped包（如@ringcentral/xxx）
 * 
 * @author Victor Wang
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

class ModuleComparator {
  constructor(file1Path, file2Path) {
    this.file1Path = file1Path;
    this.file2Path = file2Path;
    this.file1Name = path.basename(file1Path, '.json').split('-')[0]; // 提取文件名（如ringcentral）
    this.file2Name = path.basename(file2Path, '.json').split('-')[0]; // 提取文件名（如slack）
  }

  // 解析字节大小（从格式化的字符串转换为数字）
  parseSizeToBytes(sizeStr) {
    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^([\d.]+)\s*([A-Z]+)$/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    return value * (units[unit] || 1);
  }

  // 提取node_modules模块
  extractNodeModules(data) {
    const modules = [];
    
    if (data.TotalItems) {
      for (const item of data.TotalItems) {
        if (item.path && item.path.startsWith('out/node_modules/')) {
          // 提取模块名称（最后一个/后面的名称）
          const pathParts = item.path.split('/');
          let moduleName = pathParts[pathParts.length - 1];
          
          // 处理scoped包（如@ringcentral/xxx）
          // if (moduleName.startsWith('@') && pathParts.length > 2) {
          //   moduleName = pathParts[pathParts.length - 1];
          // }
          
          modules.push({
            name: moduleName,
            fullPath: item.path,
            size: item.size,
            sizeBytes: this.parseSizeToBytes(item.size),
            type: item.type
          });
        }
      }
    }
    
    return modules;
  }

  // 比较两个文件
  compare() {
    console.log('正在读取文件...');
    
    // 读取两个JSON文件
    const data1 = JSON.parse(fs.readFileSync(this.file1Path, 'utf8'));
    const data2 = JSON.parse(fs.readFileSync(this.file2Path, 'utf8'));

    console.log(`已读取: ${this.file1Name} 和 ${this.file2Name}`);

    // 提取node_modules
    const modules1 = this.extractNodeModules(data1);
    const modules2 = this.extractNodeModules(data2);

    console.log(`${this.file1Name} 中找到 ${modules1.length} 个node_modules模块`);
    console.log(`${this.file2Name} 中找到 ${modules2.length} 个node_modules模块`);

    // 创建模块名称映射
    const modules1Map = new Map();
    modules1.forEach(m => modules1Map.set(m.name, m));

    const modules2Map = new Map();
    modules2.forEach(m => modules2Map.set(m.name, m));

    // 找出共同模块
    const commonModuleNames = [];
    for (const name of modules1Map.keys()) {
      if (modules2Map.has(name)) {
        commonModuleNames.push(name);
      }
    }

    console.log(`找到 ${commonModuleNames.length} 个共同模块`);

    // 构建输出数据
    const commonModulesInFile1 = [];
    const commonModulesInFile2 = [];
    const sizeDifferences = [];

    for (const name of commonModuleNames) {
      const module1 = modules1Map.get(name);
      const module2 = modules2Map.get(name);

      commonModulesInFile1.push({
        name: module1.name,
        path: module1.fullPath,
        size: module1.size,
        sizeBytes: module1.sizeBytes
      });

      commonModulesInFile2.push({
        name: module2.name,
        path: module2.fullPath,
        size: module2.size,
        sizeBytes: module2.sizeBytes
      });

      // 检查大小是否不同
      if (module1.sizeBytes !== module2.sizeBytes) {
        const diff = module1.sizeBytes - module2.sizeBytes;
        const diffPercent = module2.sizeBytes > 0 
          ? ((diff / module2.sizeBytes) * 100).toFixed(2) 
          : 'N/A';

        sizeDifferences.push({
          name: name,
          [`${this.file1Name}Size`]: module1.size,
          [`${this.file1Name}SizeBytes`]: module1.sizeBytes,
          [`${this.file2Name}Size`]: module2.size,
          [`${this.file2Name}SizeBytes`]: module2.sizeBytes,
          difference: this.formatSize(Math.abs(diff)),
          differenceBytes: diff,
          differencePercent: diffPercent + '%',
          larger: diff > 0 ? this.file1Name : this.file2Name
        });
      }
    }

    // 按大小差异排序（绝对值）
    sizeDifferences.sort((a, b) => Math.abs(b.differenceBytes) - Math.abs(a.differenceBytes));

    // 对共同模块按大小排序
    commonModulesInFile1.sort((a, b) => b.sizeBytes - a.sizeBytes);
    commonModulesInFile2.sort((a, b) => b.sizeBytes - a.sizeBytes);

    // 计算共同模块的总大小
    const totalSizeInFile1 = commonModulesInFile1.reduce((sum, m) => sum + m.sizeBytes, 0);
    const totalSizeInFile2 = commonModulesInFile2.reduce((sum, m) => sum + m.sizeBytes, 0);

    const result = {
      comparisonInfo: {
        file1: this.file1Name,
        file2: this.file2Name,
        comparisonTime: new Date().toISOString(),
        totalCommonModules: commonModuleNames.length,
        modulesWithDifferentSizes: sizeDifferences.length,
        modulesWithSameSizes: commonModuleNames.length - sizeDifferences.length,
        [`${this.file1Name}TotalSize`]: this.formatSize(totalSizeInFile1),
        [`${this.file1Name}TotalSizeBytes`]: totalSizeInFile1,
        [`${this.file2Name}TotalSize`]: this.formatSize(totalSizeInFile2),
        [`${this.file2Name}TotalSizeBytes`]: totalSizeInFile2,
        totalSizeDifference: this.formatSize(Math.abs(totalSizeInFile1 - totalSizeInFile2)),
        totalSizeDifferenceBytes: totalSizeInFile1 - totalSizeInFile2
      },
      commonModules: {
        [this.file1Name]: commonModulesInFile1,
        [this.file2Name]: commonModulesInFile2
      },
      sizeDifferences: sizeDifferences
    };

    return result;
  }

  // 格式化大小
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

  // 生成输出文件
  generateOutput(outputDir = '.') {
    const result = this.compare();
    
    // 创建输出目录
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const outputPath = path.join(outputDir, `module-comparison-${timestamp}.json`);
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
    
    console.log(`\n比较完成！`);
    console.log(`共同模块数量: ${result.comparisonInfo.totalCommonModules}`);
    console.log(`大小不同的模块: ${result.comparisonInfo.modulesWithDifferentSizes}`);
    console.log(`大小相同的模块: ${result.comparisonInfo.modulesWithSameSizes}`);
    console.log(`\n共同模块总大小:`);
    console.log(`  ${this.file1Name}: ${result.comparisonInfo[`${this.file1Name}TotalSize`]}`);
    console.log(`  ${this.file2Name}: ${result.comparisonInfo[`${this.file2Name}TotalSize`]}`);
    console.log(`  差异: ${result.comparisonInfo.totalSizeDifference}`);
    console.log(`\n结果已保存到: ${outputPath}`);
    
    return outputPath;
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('使用方法: node compare-modules.js <file1.json> <file2.json> [outputDir]');
    console.log('示例: node compare-modules.js ringcentral/ringcentral-2025-11-14T03-08-45-777Z.json slack/slack-2025-11-14T03-09-36-995Z.json');
    process.exit(1);
  }

  const file1Path = args[0];
  const file2Path = args[1];
  const outputDir = args[2] || '.';

  // 检查文件是否存在
  if (!fs.existsSync(file1Path)) {
    console.error(`错误: 文件不存在: ${file1Path}`);
    process.exit(1);
  }

  if (!fs.existsSync(file2Path)) {
    console.error(`错误: 文件不存在: ${file2Path}`);
    process.exit(1);
  }

  const comparator = new ModuleComparator(file1Path, file2Path);
  comparator.generateOutput(outputDir);
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = ModuleComparator;

