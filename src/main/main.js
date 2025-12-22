const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');

// 存储窗口引用
let mainWindow = null;
let selectionWindow = null;
let answerWindow = null;

/**
 * 创建主窗口
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 300,
    resizable: true,
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  
  // 开发模式下打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

/**
 * 创建区域选择窗口（全屏透明覆盖层）
 */
function createSelectionWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  const { x, y } = primaryDisplay.bounds;

  selectionWindow = new BrowserWindow({
    x: x,
    y: y,
    width: width,
    height: height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    // macOS 上设置为 true 可以覆盖菜单栏
    enableLargerThanScreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  selectionWindow.loadFile(path.join(__dirname, '../renderer/selection.html'));
  selectionWindow.setIgnoreMouseEvents(false);
  
  // macOS 上设置窗口层级，确保覆盖菜单栏
  if (process.platform === 'darwin') {
    selectionWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  selectionWindow.on('closed', () => {
    selectionWindow = null;
  });
}

/**
 * 创建答案显示窗口
 */
function createAnswerWindow(answer, x, y) {
  // 关闭之前的答案窗口
  if (answerWindow) {
    answerWindow.close();
    answerWindow = null;
  }

  answerWindow = new BrowserWindow({
    width: 350,
    height: 200,
    x: x || 100,
    y: y || 100,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  answerWindow.loadFile(path.join(__dirname, '../renderer/answer.html'));
  
  // 等待页面加载完成后发送答案数据
  answerWindow.webContents.on('did-finish-load', () => {
    answerWindow.webContents.send('show-answer', answer);
  });

  // 5秒后自动关闭
  setTimeout(() => {
    if (answerWindow && !answerWindow.isDestroyed()) {
      answerWindow.close();
      answerWindow = null;
    }
  }, 8000);
}

/**
 * 截取屏幕指定区域
 */
async function captureScreen(bounds) {
  try {
    // 获取屏幕缩放因子（Retina 屏幕通常为 2）
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor;
    
    // 使用 screenshot-desktop 截取全屏
    const imgBuffer = await screenshot({ format: 'png' });
    
    // 计算物理像素坐标（CSS 逻辑像素 * 缩放因子 = 物理像素）
    const physicalBounds = {
      left: Math.round(bounds.x * scaleFactor),
      top: Math.round(bounds.y * scaleFactor),
      width: Math.round(bounds.width * scaleFactor),
      height: Math.round(bounds.height * scaleFactor)
    };
    
    // 使用 sharp 裁剪指定区域
    const sharp = require('sharp');
    const croppedBuffer = await sharp(imgBuffer)
      .extract(physicalBounds)
      .png()
      .toBuffer();
    
    // DEBUG: 保存截图到根目录方便调试（需要时取消注释）
    // const debugDir = path.join(__dirname, '../../debug');
    // if (!fs.existsSync(debugDir)) {
    //   fs.mkdirSync(debugDir, { recursive: true });
    // }
    // const timestamp = Date.now();
    // fs.writeFileSync(path.join(debugDir, `screenshot_${timestamp}.png`), croppedBuffer);
    // fs.writeFileSync(path.join(debugDir, `fullscreen_${timestamp}.png`), imgBuffer);
    // console.log(`截图已保存到: ${debugDir}/screenshot_${timestamp}.png`);
    // console.log(`屏幕缩放因子: ${scaleFactor}`);
    // console.log(`逻辑像素: x=${bounds.x}, y=${bounds.y}, width=${bounds.width}, height=${bounds.height}`);
    // console.log(`物理像素: left=${physicalBounds.left}, top=${physicalBounds.top}, width=${physicalBounds.width}, height=${physicalBounds.height}`);
    
    return croppedBuffer;
  } catch (error) {
    console.error('截图失败:', error);
    throw error;
  }
}

// IPC 事件处理

// 开始区域选择
ipcMain.on('start-selection', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
  setTimeout(() => {
    createSelectionWindow();
  }, 200);
});

// 取消区域选择
ipcMain.on('cancel-selection', () => {
  if (selectionWindow) {
    selectionWindow.close();
    selectionWindow = null;
  }
  if (mainWindow) {
    mainWindow.show();
  }
});

// 区域选择完成
ipcMain.on('selection-complete', async (event, bounds) => {
  // 获取选择窗口的实际位置，用于计算绝对屏幕坐标
  let windowBounds = { x: 0, y: 0 };
  if (selectionWindow) {
    windowBounds = selectionWindow.getBounds();
  }
  
  // 将窗口内的相对坐标转换为屏幕绝对坐标
  const absoluteBounds = {
    x: bounds.x + windowBounds.x,
    y: bounds.y + windowBounds.y,
    width: bounds.width,
    height: bounds.height
  };
  
  // DEBUG: 调试日志（需要时取消注释）
  // console.log('选择区域（窗口相对）:', bounds);
  // console.log('窗口位置:', windowBounds);
  // console.log('选择区域（屏幕绝对）:', absoluteBounds);
  
  // 关闭选择窗口
  if (selectionWindow) {
    selectionWindow.close();
    selectionWindow = null;
  }
  
  try {
    // 截取屏幕（使用绝对坐标）
    const imageBuffer = await captureScreen(absoluteBounds);
    
    // 发送给渲染进程进行 OCR 识别
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('process-image', {
        imageData: imageBuffer.toString('base64'),
        bounds: bounds
      });
    }
  } catch (error) {
    console.error('处理图像失败:', error);
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('ocr-error', error.message);
    }
  }
});

// 显示答案
ipcMain.on('show-answer', (event, data) => {
  createAnswerWindow(data.answer, data.x, data.y);
});

// 关闭答案窗口
ipcMain.on('close-answer', () => {
  if (answerWindow) {
    answerWindow.close();
    answerWindow = null;
  }
});

// 获取题库数据
ipcMain.handle('get-questions', async () => {
  try {
    // 优先从资源目录读取，打包后使用
    let questionsPath = path.join(process.resourcesPath, 'questions', 'qna.json');
    
    // 开发模式下从项目目录读取
    if (!fs.existsSync(questionsPath)) {
      questionsPath = path.join(__dirname, '../../questions/qna.json');
    }
    
    if (fs.existsSync(questionsPath)) {
      const data = fs.readFileSync(questionsPath, 'utf-8');
      return JSON.parse(data);
    }
    
    return [];
  } catch (error) {
    console.error('读取题库失败:', error);
    return [];
  }
});

// 应用就绪时创建窗口
app.whenReady().then(() => {
  createMainWindow();

  // 注册全局快捷键 Ctrl+Shift+S 开始截图
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow) {
      mainWindow.webContents.send('trigger-selection');
    }
  });

  // 注册 ESC 取消选择
  globalShortcut.register('Escape', () => {
    if (selectionWindow) {
      selectionWindow.close();
      selectionWindow = null;
      if (mainWindow) {
        mainWindow.show();
      }
    }
    if (answerWindow) {
      answerWindow.close();
      answerWindow = null;
    }
  });
});

// macOS 特殊处理
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出前注销快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

