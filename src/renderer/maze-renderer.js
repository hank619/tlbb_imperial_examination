/**
 * 迷宫页面渲染进程
 */

// Tesseract.js Worker
let tesseractWorker = null;

// 迷宫题库数据
let mazeQuestionsDB = [];

// Fuse.js 实例（模糊搜索）
let fuseInstance = null;

// 是否已设置区域
let hasRegionSet = false;

/**
 * 初始化 Tesseract Worker
 */
async function initTesseract() {
  try {
    updateStatus('⏳', '正在初始化 OCR 引擎...');
    
    // 使用全局的 Tesseract（通过 CDN 加载）
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
 * 加载迷宫题库
 */
async function loadMazeQuestions() {
  try {
    const questions = await window.electronAPI.getMazeQuestions();
    mazeQuestionsDB = questions;
    
    if (questions.length > 0) {
      // 初始化 Fuse.js 模糊搜索（使用全局的 Fuse，通过 CDN 加载）
      fuseInstance = new Fuse(questions, {
        keys: ['q'],
        threshold: 0.4,  // 匹配阈值，越小越严格
        includeScore: true,
        minMatchCharLength: 3
      });
      
      console.log(`迷宫题库加载完成，共 ${questions.length} 题`);
    } else {
      console.log('迷宫题库为空或不存在');
    }
  } catch (error) {
    console.error('加载迷宫题库失败:', error);
  }
}

/**
 * 更新状态显示
 */
function updateStatus(icon, text) {
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  
  if (statusIcon) statusIcon.textContent = icon;
  if (statusText) {
    statusText.textContent = text;
    statusText.className = text.includes('识别中') ? 'status-text processing' : 'status-text';
  }
}

/**
 * 显示答案
 */
function showAnswer(result) {
  const answerPlaceholder = document.getElementById('answerPlaceholder');
  const answerContent = document.getElementById('answerContent');
  const answerQuestion = document.getElementById('answerQuestion');
  const answerResult = document.getElementById('answerResult');
  
  // 隐藏占位符，显示答案内容
  answerPlaceholder.classList.add('hidden');
  answerContent.classList.remove('hidden');
  
  // 设置问题文本（包含迷宫类型）
  if (result.maze) {
    answerQuestion.innerHTML = `<span class="maze-tag">${result.maze}</span>${result.q}`;
  } else {
    answerQuestion.textContent = result.q;
  }
  
  // 设置答案
  if (result.notFound) {
    // 未找到匹配
    answerResult.innerHTML = result.a;
    answerResult.classList.add('not-found');
    answerContent.classList.add('not-found');
  } else if (result.options && result.options.length > 0) {
    // 迷宫选项列表
    answerResult.classList.remove('not-found');
    answerContent.classList.remove('not-found');
    
    // 渲染选项列表
    let optionsHtml = '<div class="options-list">';
    for (const opt of result.options) {
      const recommendClass = opt.recommend ? 'recommend' : 'not-recommend';
      const recommendIcon = opt.recommend ? '✅' : '❌';
      optionsHtml += `
        <div class="option-item ${recommendClass}">
          <div class="option-header">
            <span class="option-icon">${recommendIcon}</span>
            <span class="option-text">${opt.text}</span>
          </div>
          <div class="option-subtitle">${opt.subtitle}</div>
        </div>
      `;
    }
    optionsHtml += '</div>';
    answerResult.innerHTML = optionsHtml;
  } else {
    // 兼容旧格式 {q, a}
    answerResult.textContent = result.a;
    answerResult.classList.remove('not-found');
    answerContent.classList.remove('not-found');
  }
}

/**
 * 清除答案显示
 */
function clearAnswer() {
  const answerPlaceholder = document.getElementById('answerPlaceholder');
  const answerContent = document.getElementById('answerContent');
  
  answerPlaceholder.classList.remove('hidden');
  answerContent.classList.add('hidden');
  answerContent.classList.remove('not-found');
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
 * 在迷宫题库中查找答案
 */
function findAnswer(questionText) {
  if (!questionText || mazeQuestionsDB.length === 0) {
    return null;
  }
  
  // 清理识别的文本
  const cleanedText = questionText
    .replace(/\s+/g, '')  // 移除空白字符
    .replace(/[""'']/g, '"')  // 统一引号
    .trim();
  
  console.log('清理后的问题:', cleanedText);
  
  // 方法1: 精确匹配
  for (const item of mazeQuestionsDB) {
    const cleanedQuestion = item.q.replace(/\s+/g, '');
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
    for (const item of mazeQuestionsDB) {
      let matchCount = 0;
      for (const keyword of keywords) {
        if (item.q.includes(keyword)) {
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
 * 处理迷宫图像识别流程
 */
async function processImage(data) {
  const { imageData } = data;
  
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
      showAnswer(result);
    } else {
      updateStatus('⚠️', '未找到匹配');
      showAnswer({
        q: text,
        a: '未找到匹配答案',
        notFound: true
      });
    }
    
    // 3秒后恢复状态文字
    setTimeout(() => {
      updateStatus('📷', '准备就绪');
    }, 3000);
    
  } catch (error) {
    console.error('处理失败:', error);
    updateStatus('❌', '处理失败');
  }
}

/**
 * 更新区域状态显示
 */
function updateRegionStatus(isSet) {
  hasRegionSet = isSet;
  const regionStatus = document.getElementById('regionStatus');
  const recognizeBtn = document.getElementById('recognizeBtn');
  
  if (isSet) {
    regionStatus.textContent = '✅ 区域已设置';
    regionStatus.classList.add('set');
    recognizeBtn.disabled = false;
  } else {
    regionStatus.textContent = '未设置区域';
    regionStatus.classList.remove('set');
    recognizeBtn.disabled = true;
  }
}

/**
 * 触发迷宫识别
 */
function triggerRecognize() {
  if (!hasRegionSet) {
    updateStatus('⚠️', '请先设置识别区域');
    return;
  }
  window.electronAPI.recognizeWithSavedMazeRegion();
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 绑定返回首页按钮事件
  const backHomeBtn = document.getElementById('backHomeBtn');
  if (backHomeBtn) {
    backHomeBtn.addEventListener('click', () => {
      window.electronAPI.navigateToModule('home');
    });
  }
  
  // 绑定设置区域按钮事件
  const setRegionBtn = document.getElementById('setRegionBtn');
  setRegionBtn.addEventListener('click', () => {
    window.electronAPI.startSetMazeRegion();
  });
  
  // 绑定识别按钮事件
  const recognizeBtn = document.getElementById('recognizeBtn');
  recognizeBtn.addEventListener('click', () => {
    triggerRecognize();
  });
  
  // 监听快捷键触发迷宫识别
  window.electronAPI.onTriggerMazeRecognize(() => {
    triggerRecognize();
  });
  
  // 监听迷宫区域保存完成
  window.electronAPI.onMazeRegionSaved((bounds) => {
    updateRegionStatus(true);
    updateStatus('✅', '区域设置完成');
    setTimeout(() => {
      updateStatus('📷', '准备就绪');
    }, 2000);
  });
  
  // 监听迷宫区域数据加载（从本地文件加载）
  window.electronAPI.onMazeRegionLoaded((bounds) => {
    if (bounds) {
      updateRegionStatus(true);
      updateStatus('📷', '准备就绪');
    }
  });
  
  // 监听迷宫图像处理请求
  window.electronAPI.onProcessMazeImage(processImage);
  
  // 监听迷宫 OCR 错误
  window.electronAPI.onMazeOCRError((error) => {
    updateStatus('❌', `错误: ${error}`);
  });
  
  // 初始化
  await loadMazeQuestions();
  await initTesseract();
});
