const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露安全的 API 给渲染进程
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 开始设置区域（只设置坐标，不识别）
  startSetRegion: () => ipcRenderer.send('start-set-region'),
  
  // 使用已保存的区域进行识别
  recognizeWithSavedRegion: () => ipcRenderer.send('recognize-with-saved-region'),
  
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
  
  // 获取题库
  getQuestions: () => ipcRenderer.invoke('get-questions'),
  
  // 监听事件
  onTriggerSelection: (callback) => {
    ipcRenderer.on('trigger-selection', callback);
  },
  
  // 监听快捷键触发识别
  onTriggerRecognize: (callback) => {
    ipcRenderer.on('trigger-recognize', callback);
  },
  
  // 导航到模块
  navigateToModule: (module) => ipcRenderer.send('navigate-to-module', module),
  
  // 监听区域保存完成
  onRegionSaved: (callback) => {
    ipcRenderer.on('region-saved', (event, bounds) => callback(bounds));
  },
  
  // 监听区域数据加载
  onRegionLoaded: (callback) => {
    ipcRenderer.on('region-loaded', (event, bounds) => callback(bounds));
  },
  
  onProcessImage: (callback) => {
    ipcRenderer.on('process-image', (event, data) => callback(data));
  },
  
  onShowAnswer: (callback) => {
    ipcRenderer.on('show-answer', (event, answer) => callback(answer));
  },
  
  onOCRError: (callback) => {
    ipcRenderer.on('ocr-error', (event, error) => callback(error));
  }
});

