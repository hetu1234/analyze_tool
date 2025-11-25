====================================
Electron应用大小分析工具使用说明
====================================

一、环境准备
------------
1. 确保已安装Node.js (建议v14或以上版本)

2. 安装依赖包：
   npm install @electron/asar

二、工具说明
------------
本工具包含两个主要脚本：

1. analyze-electron-size-deepseek.js
   - 分析单个Electron应用的大小和结构
   - 自动解压app.asar文件
   - 生成详细的大小统计报告

2. compare-modules.js
   - 比较两个应用的node_modules依赖
   - 找出共同模块和大小差异
   - 生成对比报告

三、使用方法
------------

【步骤1】分析Electron应用
-------------------------
命令格式：
node analyze-electron-size-deepseek.js <应用路径> [应用名称]

参数说明：
- 应用路径: Electron应用的安装目录（必填）
- 应用名称: 用于生成输出文件夹名（可选，默认为'electron-analysis'）

示例：
# Windows系统 - 分析RingCentral应用
node analyze-electron-size-deepseek.js "C:\Program Files\RingCentral" ringcentral

# Windows系统 - 分析Skype应用
node analyze-electron-size-deepseek.js "C:\Program Files\Skype\resources\app" skype

# macOS系统 - 分析Slack应用
node analyze-electron-size-deepseek.js "/Applications/Slack.app/Contents" slack

输出结果：
- 在当前目录创建以应用名称命名的文件夹（如：ringcentral/）
- 生成两个JSON文件：
  1. [应用名]-[时间戳].json - 详细列表报告
  2. [应用名]-categorized-[时间戳].json - 分类统计报告（推荐查看此文件）

【步骤2】比较两个应用的模块（可选）
---------------------------------
命令格式：
node compare-modules.js <文件1> <文件2> [输出目录]

参数说明：
- 文件1: 第一个应用的分析结果JSON文件（必填）
- 文件2: 第二个应用的分析结果JSON文件（必填）
- 输出目录: 对比结果的保存目录（可选，默认为当前目录）

示例：
# 比较RingCentral和Slack的共同模块
node compare-modules.js ringcentral/ringcentral-2025-11-14T03-08-45-777Z.json slack/slack-2025-11-14T03-09-36-995Z.json

# 指定输出目录
node compare-modules.js ringcentral/result.json slack/result.json ./comparison-results

输出结果：
- module-comparison-[时间戳].json - 包含共同模块列表和大小差异对比

四、输出文件说明
--------------

【详细列表报告】([应用名]-[时间戳].json)
- analysisInfo: 分析基本信息（路径、总大小、分析时间）
- TotalItems: 所有文件和模块的详细列表（按大小排序）

【分类统计报告】([应用名]-categorized-[时间戳].json) ⭐推荐
- analysisInfo: 分析基本信息
- summary: 各分类的汇总统计（大小、数量、占比）
- details: 各分类的详细列表
  
  分类说明：
  * code: 应用代码（out/dist目录）
  * framework: 框架文件（根目录的dll、exe等）
  * locals: 本地化文件（locales目录）
  * resource: 资源文件（resources/assets目录）
  * zoom: resources/win目录
  * ringcentralDepends: RingCentral相关依赖（@ringcentral域及特定模块）
  * otherDepends: 其他第三方依赖

【对比报告】(module-comparison-[时间戳].json)
- comparisonInfo: 对比概览（共同模块数、总大小对比等）
- commonModules: 两个应用的共同模块列表
- sizeDifferences: 大小差异详情（按差异排序）

五、常见问题
-----------
Q: 提示找不到asar命令？
A: 请先运行 npm install @electron/asar 安装依赖

Q: 提示路径不存在？
A: 确保提供的是正确的Electron应用安装目录，Windows路径需要用引号包裹

Q: 分析很慢？
A: 这是正常的，工具需要计算所有文件的大小，大型应用可能需要几分钟

Q: 如何只看主要的大文件？
A: 查看 [应用名]-categorized-[时间戳].json 中的 summary 部分

六、版本信息
-----------
工具版本: v1.0.0
作者: Victor Wang
更新日期: 2025-11-25