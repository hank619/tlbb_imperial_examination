/**
 * 主窗口渲染进程
 */

// Tesseract.js Worker
let tesseractWorker = null;

// 题库数据
let questionsDB = [];

// Fuse.js 实例（模糊搜索）
let fuseInstance = null;

/**
 * 初始化 Tesseract Worker
 */
async function initTesseract() {
  try {
    updateStatus('⏳', '正在初始化 OCR 引擎...');
    
    // 动态导入 Tesseract.js
    const Tesseract = require('tesseract.js');
    
    tesseractWorker = await Tesseract.createWorker('chi_sim', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const progress = Math.round(m.progress * 100);
          updateStatus('🔍', `识别中... ${progress}%`);
        }
      }
    });
    
    console.log('Tesseract 初始化完成');
    updateStatus('📷', '准备就绪');
  } catch (error) {
    console.error('Tesseract 初始化失败:', error);
    updateStatus('❌', 'OCR 引擎初始化失败');
  }
}

/**
 * 加载题库
 */
async function loadQuestions() {
  try {
    const questions = await window.electronAPI.getQuestions();
    questionsDB = questions;
    
    if (questions.length > 0) {
      // 初始化 Fuse.js 模糊搜索
      const Fuse = require('fuse.js');
      fuseInstance = new Fuse(questions, {
        keys: ['question'],
        threshold: 0.4,  // 匹配阈值，越小越严格
        includeScore: true,
        minMatchCharLength: 3
      });
      
      console.log(`题库加载完成，共 ${questions.length} 题`);
    } else {
      console.log('题库为空');
    }
  } catch (error) {
    console.error('加载题库失败:', error);
  }
}

/**
 * 更新状态显示
 */
function updateStatus(icon, text) {
  const statusIcon = document.querySelector('.status-icon');
  const statusText = document.getElementById('statusText');
  
  if (statusIcon) statusIcon.textContent = icon;
  if (statusText) {
    statusText.textContent = text;
    statusText.className = text.includes('识别中') ? 'status-text processing' : 'status-text';
  }
}

/**
 * OCR 识别图像
 */
async function recognizeImage(imageBase64) {
  if (!tesseractWorker) {
    console.error('Tesseract 未初始化');
    return null;
  }
  
  try {
    updateStatus('🔍', '正在识别文字...');
    
    // 将 base64 转为可识别的格式
    const imageData = `data:image/png;base64,${imageBase64}`;
    
    const result = await tesseractWorker.recognize(imageData);
    const text = result.data.text.trim();
    
    console.log('识别结果:', text);
    return text;
  } catch (error) {
    console.error('OCR 识别失败:', error);
    return null;
  }
}

/**
 * 在题库中查找答案
 */
function findAnswer(questionText) {
  if (!questionText || questionsDB.length === 0) {
    return null;
  }
  
  // 清理识别的文本
  const cleanedText = questionText
    .replace(/\s+/g, '')  // 移除空白字符
    .replace(/[""'']/g, '"')  // 统一引号
    .trim();
  
  console.log('清理后的问题:', cleanedText);
  
  // 方法1: 精确匹配
  for (const item of questionsDB) {
    const cleanedQuestion = item.question.replace(/\s+/g, '');
    if (cleanedQuestion.includes(cleanedText) || cleanedText.includes(cleanedQuestion)) {
      console.log('精确匹配成功:', item);
      return item;
    }
  }
  
  // 方法2: 模糊匹配
  if (fuseInstance) {
    const results = fuseInstance.search(cleanedText);
    if (results.length > 0 && results[0].score < 0.5) {
      console.log('模糊匹配结果:', results[0]);
      return results[0].item;
    }
  }
  
  // 方法3: 关键词匹配
  const keywords = cleanedText.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  if (keywords.length >= 2) {
    for (const item of questionsDB) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (item.question.includes(keyword)) {
          matchCount++;
        }
      }
      // 如果超过一半的关键词匹配
      if (matchCount >= keywords.length * 0.5) {
        console.log('关键词匹配成功:', item);
        return item;
      }
    }
  }
  
  return null;
}

/**
 * 处理图像识别流程
 */
async function processImage(data) {
  const { imageData, bounds } = data;
  
  try {
    // OCR 识别
    const text = await recognizeImage(imageData);
    
    if (!text) {
      updateStatus('❌', '未能识别到文字');
      return;
    }
    
    updateStatus('🔎', '正在匹配答案...');
    
    // 查找答案
    const result = findAnswer(text);
    
    if (result) {
      updateStatus('✅', '找到答案！');
      
      // 显示答案窗口
      window.electronAPI.showAnswer({
        answer: result,
        x: bounds.x + bounds.width + 20,
        y: bounds.y
      });
    } else {
      updateStatus('⚠️', '未找到匹配的答案');
      
      // 显示识别到的文字
      window.electronAPI.showAnswer({
        answer: {
          question: text,
          answer: '未找到匹配答案',
          notFound: true
        },
        x: bounds.x + bounds.width + 20,
        y: bounds.y
      });
    }
    
    // 3秒后恢复状态
    setTimeout(() => {
      updateStatus('📷', '准备就绪');
    }, 3000);
    
  } catch (error) {
    console.error('处理失败:', error);
    updateStatus('❌', '处理失败');
  }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 绑定按钮事件
  const captureBtn = document.getElementById('captureBtn');
  captureBtn.addEventListener('click', () => {
    window.electronAPI.startSelection();
  });
  
  // 监听快捷键触发
  window.electronAPI.onTriggerSelection(() => {
    window.electronAPI.startSelection();
  });
  
  // 监听图像处理请求
  window.electronAPI.onProcessImage(processImage);
  
  // 监听 OCR 错误
  window.electronAPI.onOCRError((error) => {
    updateStatus('❌', `错误: ${error}`);
  });
  
  // 初始化
  await loadQuestions();
  await initTesseract();
});

