/**
 * 下载 Tesseract.js 离线资源文件
 * 
 * 运行方式: npm run download-tessdata
 * 
 * 下载内容:
 * - 中文简体语言包 (chi_sim.traineddata.gz)
 * - WASM 核心文件 (4个)
 * - Worker 脚本
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Tesseract.js 版本
const TESSERACT_VERSION = '5.1.1';
const CORE_VERSION = '5.1.0';

// 下载目标目录
const TESSDATA_DIR = path.join(__dirname, '../assets/tessdata');
const LANG_DIR = path.join(TESSDATA_DIR, 'lang');
const CORE_DIR = path.join(TESSDATA_DIR, 'core');

// 需要下载的文件列表
const FILES = [
  // Worker 脚本
  {
    url: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    dest: path.join(TESSDATA_DIR, 'worker.min.js'),
    name: 'Worker 脚本'
  },
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
  
  console.log('');
  
  // 下载所有文件
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
