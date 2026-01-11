const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露安全的 API 给渲染进程
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ========== 科举答题相关 ==========
  
  // 开始设置区域（只设置坐标，不识别）
  startSetRegion: () => ipcRenderer.send('start-set-region'),
  
  // 使用已保存的区域进行识别
  recognizeWithSavedRegion: () => ipcRenderer.send('recognize-with-saved-region'),
  
  // 获取科举题库
  getQuestions: () => ipcRenderer.invoke('get-questions'),
  
  // 监听快捷键触发识别（科举）
  onTriggerRecognize: (callback) => {
    ipcRenderer.on('trigger-recognize', callback);
  },
  
  // 监听科举区域保存完成
  onRegionSaved: (callback) => {
    ipcRenderer.on('region-saved', (event, bounds) => callback(bounds));
  },
  
  // 监听科举区域数据加载
  onRegionLoaded: (callback) => {
    ipcRenderer.on('region-loaded', (event, bounds) => callback(bounds));
  },
  
  // 监听科举图像处理
  onProcessImage: (callback) => {
    ipcRenderer.on('process-image', (event, data) => callback(data));
  },
  
  // 监听科举 OCR 错误
  onOCRError: (callback) => {
    ipcRenderer.on('ocr-error', (event, error) => callback(error));
  },
  
  // ========== 迷宫相关 ==========
  
  // 开始设置迷宫区域（只设置坐标，不识别）
  startSetMazeRegion: () => ipcRenderer.send('start-set-maze-region'),
  
  // 使用已保存的迷宫区域进行识别
  recognizeWithSavedMazeRegion: () => ipcRenderer.send('recognize-with-saved-maze-region'),
  
  // 获取迷宫题库
  getMazeQuestions: () => ipcRenderer.invoke('get-maze-questions'),
  
  // 监听快捷键触发迷宫识别
  onTriggerMazeRecognize: (callback) => {
    ipcRenderer.on('trigger-maze-recognize', callback);
  },
  
  // 监听迷宫区域保存完成
  onMazeRegionSaved: (callback) => {
    ipcRenderer.on('maze-region-saved', (event, bounds) => callback(bounds));
  },
  
  // 监听迷宫区域数据加载
  onMazeRegionLoaded: (callback) => {
    ipcRenderer.on('maze-region-loaded', (event, bounds) => callback(bounds));
  },
  
  // 监听迷宫图像处理
  onProcessMazeImage: (callback) => {
    ipcRenderer.on('process-maze-image', (event, data) => callback(data));
  },
  
  // 监听迷宫 OCR 错误
  onMazeOCRError: (callback) => {
    ipcRenderer.on('maze-ocr-error', (event, error) => callback(error));
  },
  
  // ========== 通用接口 ==========
  
  // 开始区域选择（旧接口，保留兼容）
  startSelection: () => ipcRenderer.send('start-selection'),
  
  // 取消选择
  cancelSelection: () => ipcRenderer.send('cancel-selection'),
  
  // 选择完成
  selectionComplete: (bounds) => ipcRenderer.send('selection-complete', bounds),
  
  // 显示答案
  showAnswer: (data) => ipcRenderer.send('show-answer', data),
  
  // 关闭答案窗口
  closeAnswer: () => ipcRenderer.send('close-answer'),
  
  // 导航到模块
  navigateToModule: (module) => ipcRenderer.send('navigate-to-module', module),
  
  // 监听事件
  onTriggerSelection: (callback) => {
    ipcRenderer.on('trigger-selection', callback);
  },
  
  onShowAnswer: (callback) => {
    ipcRenderer.on('show-answer', (event, answer) => callback(answer));
  }
});

