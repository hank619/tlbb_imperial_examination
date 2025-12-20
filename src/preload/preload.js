const { contextBridge, ipcRenderer } = require('electron');

/**
 * 暴露安全的 API 给渲染进程
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 开始区域选择
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

