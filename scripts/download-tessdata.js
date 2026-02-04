/**
 * 下载 Tesseract.js 离线资源文件
 * 
 * 运行方式: yarn download-tessdata
 * 
 * 内容:
 * - 从 node_modules 复制: tesseract.min.js, worker.min.js, fuse.min.js
 * - 从网络下载: 中文语言包, WASM 核心文件
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Tesseract.js 版本（用于下载 core）
const CORE_VERSION = '5.1.0';

// 下载目标目录
const TESSDATA_DIR = path.join(__dirname, '../assets/tessdata');
const LANG_DIR = path.join(TESSDATA_DIR, 'lang');
const CORE_DIR = path.join(TESSDATA_DIR, 'core');

// 从 node_modules 复制的文件（无需网络）
const COPY_FILES = [
  { src: 'tesseract.js/dist/tesseract.min.js', dest: 'tesseract.min.js', name: 'Tesseract 主脚本' },
  { src: 'tesseract.js/dist/worker.min.js', dest: 'worker.min.js', name: 'Worker 脚本' },
  { src: 'fuse.js/dist/fuse.min.js', dest: 'fuse.min.js', name: 'Fuse 搜索库' }
];

// 需要下载的文件列表
const FILES = [
  // 语言包
  {
    url: 'https://tessdata.projectnaptha.com/4.0.0/chi_sim.traineddata.gz',
    dest: path.join(LANG_DIR, 'chi_sim.traineddata.gz'),
    name: '中文简体语言包'
  },
  // WASM 核心文件
  {
    url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core.wasm.js`,
    dest: path.join(CORE_DIR, 'tesseract-core.wasm.js'),
    name: 'WASM 核心 (基础版)'
  },
  {
    url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-simd.wasm.js`,
    dest: path.join(CORE_DIR, 'tesseract-core-simd.wasm.js'),
    name: 'WASM 核心 (SIMD版)'
  },
  {
    url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-lstm.wasm.js`,
    dest: path.join(CORE_DIR, 'tesseract-core-lstm.wasm.js'),
    name: 'WASM 核心 (LSTM版)'
  },
  {
    url: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${CORE_VERSION}/tesseract-core-simd-lstm.wasm.js`,
    dest: path.join(CORE_DIR, 'tesseract-core-simd-lstm.wasm.js'),
    name: 'WASM 核心 (SIMD+LSTM版)'
  }
];

/**
 * 创建目录（如果不存在）
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 创建目录: ${dir}`);
  }
}

/**
 * 下载文件
 */
function downloadFile(url, dest, name) {
  return new Promise((resolve, reject) => {
    console.log(`⏳ 正在下载: ${name}`);
    console.log(`   URL: ${url}`);
    
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    
    const request = protocol.get(url, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        console.log(`   重定向到: ${redirectUrl}`);
        file.close();
        fs.unlinkSync(dest);
        downloadFile(redirectUrl, dest, name).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const percent = Math.round((downloadedSize / totalSize) * 100);
          process.stdout.write(`\r   进度: ${percent}% (${formatSize(downloadedSize)} / ${formatSize(totalSize)})`);
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`\n✅ 下载完成: ${name} (${formatSize(downloadedSize)})`);
        resolve();
      });
    });
    
    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) {
        fs.unlinkSync(dest);
      }
      reject(err);
    });
    
    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('下载超时'));
    });
  });
}

/**
 * 格式化文件大小
 */
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 从 node_modules 复制文件
 */
function copyFromNodeModules() {
  const nodeModules = path.join(__dirname, '../node_modules');
  
  for (const file of COPY_FILES) {
    const src = path.join(nodeModules, file.src);
    const dest = path.join(TESSDATA_DIR, file.dest);
    
    try {
      if (fs.existsSync(src)) {
        if (fs.existsSync(dest)) {
          console.log(`⏭️  跳过 (已存在): ${file.name}`);
        } else {
          fs.copyFileSync(src, dest);
          const stats = fs.statSync(dest);
          console.log(`✅ 已复制: ${file.name} (${formatSize(stats.size)})`);
        }
      } else {
        console.error(`❌ 源文件不存在: ${src}`);
        console.error(`   请先运行 yarn install`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`❌ 复制失败: ${file.name}`, error.message);
      process.exit(1);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('========================================');
  console.log('  Tesseract.js 离线资源下载工具');
  console.log('========================================\n');
  
  // 创建目录
  ensureDir(TESSDATA_DIR);
  ensureDir(LANG_DIR);
  ensureDir(CORE_DIR);
  
  // 从 node_modules 复制主脚本和 Worker（无需网络）
  console.log('📦 从 node_modules 复制...\n');
  copyFromNodeModules();
  console.log('');
  
  // 下载语言包和 WASM 核心
  let successCount = 0;
  let failCount = 0;
  
  for (const file of FILES) {
    try {
      // 检查文件是否已存在
      if (fs.existsSync(file.dest)) {
        const stats = fs.statSync(file.dest);
        console.log(`⏭️  跳过 (已存在): ${file.name} (${formatSize(stats.size)})`);
        successCount++;
        continue;
      }
      
      await downloadFile(file.url, file.dest, file.name);
      successCount++;
    } catch (error) {
      console.error(`❌ 下载失败: ${file.name}`);
      console.error(`   错误: ${error.message}`);
      failCount++;
    }
    console.log('');
  }
  
  // 输出结果
  console.log('========================================');
  console.log(`  下载完成: ${successCount} 成功, ${failCount} 失败`);
  console.log('========================================\n');
  
  if (failCount > 0) {
    console.log('⚠️  部分文件下载失败，请检查网络后重试');
    process.exit(1);
  } else {
    console.log('✅ 所有离线资源下载完成！');
    console.log(`   资源目录: ${TESSDATA_DIR}`);
  }
}

main().catch((error) => {
  console.error('下载过程出错:', error);
  process.exit(1);
});
