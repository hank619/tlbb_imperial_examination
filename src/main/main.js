const { app, BrowserWindow, ipcMain, screen, desktopCapturer, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const screenshot = require('screenshot-desktop');

// 存储窗口引用
let mainWindow = null;
let selectionWindow = null;
let answerWindow = null;

// 存储已设置的区域坐标
let savedRegionBounds = null;

// 当前是否为设置区域模式（区分设置区域和直接识别）
let isSettingRegionMode = false;

// 获取区域数据保存路径
function getRegionDataPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'region-data.json');
}

// 加载区域数据
function loadRegionData() {
  try {
    const dataPath = getRegionDataPath();
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf-8');
      savedRegionBounds = JSON.parse(data);
      console.log('区域数据加载成功:', savedRegionBounds);
      return savedRegionBounds;
    }
  } catch (error) {
    console.error('加载区域数据失败:', error);
  }
  return null;
}

// 保存区域数据
function saveRegionData(bounds) {
  try {
    const dataPath = getRegionDataPath();
    fs.writeFileSync(dataPath, JSON.stringify(bounds, null, 2), 'utf-8');
    console.log('区域数据保存成功:', bounds);
  } catch (error) {
    console.error('保存区域数据失败:', error);
  }
}

/**
 * 创建主窗口
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 400,
    resizable: true,
    frame: true,
    transparent: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js')
    }
  });

  // 默认加载首页
  navigateToPage('home');
  
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
 * 导航到指定页面
 */
function navigateToPage(page) {
  if (!mainWindow) return;
  
  let htmlFile = '';
  switch (page) {
    case 'home':
      htmlFile = 'home.html';
      break;
    case 'examination':
      htmlFile = 'examination.html';
      break;
    case 'maze':
      htmlFile = 'maze.html';
      break;
    default:
      htmlFile = 'home.html';
  }
  
  mainWindow.loadFile(path.join(__dirname, '../renderer', htmlFile));
  
  // 如果是科举页面，加载区域数据并通知渲染进程
  if (page === 'examination' && savedRegionBounds) {
    mainWindow.webContents.on('did-finish-load', function onLoad() {
      mainWindow.webContents.send('region-loaded', savedRegionBounds);
      // 只执行一次，然后移除监听器
      mainWindow.webContents.removeListener('did-finish-load', onLoad);
    });
  }
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

// 开始设置区域（仅设置，不识别）
ipcMain.on('start-set-region', () => {
  isSettingRegionMode = true;
  if (mainWindow) {
    mainWindow.hide();
  }
  setTimeout(() => {
    createSelectionWindow();
  }, 200);
});

// 开始区域选择（旧接口，保留兼容）
ipcMain.on('start-selection', () => {
  isSettingRegionMode = false;
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
  
  // 关闭选择窗口
  if (selectionWindow) {
    selectionWindow.close();
    selectionWindow = null;
  }
  
  // 如果是设置区域模式，只保存坐标不进行识别
  if (isSettingRegionMode) {
    savedRegionBounds = absoluteBounds;
    saveRegionData(absoluteBounds); // 保存到本地文件
    isSettingRegionMode = false;
    
    if (mainWindow) {
      mainWindow.show();
      mainWindow.webContents.send('region-saved', absoluteBounds);
    }
    return;
  }
  
  // 否则进行截图识别
  try {
    const imageBuffer = await captureScreen(absoluteBounds);
    
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

// 使用已保存的区域进行识别
ipcMain.on('recognize-with-saved-region', async () => {
  if (!savedRegionBounds) {
    if (mainWindow) {
      mainWindow.webContents.send('ocr-error', '请先设置识别区域');
    }
    return;
  }
  
  try {
    const imageBuffer = await captureScreen(savedRegionBounds);
    
    if (mainWindow) {
      mainWindow.webContents.send('process-image', {
        imageData: imageBuffer.toString('base64'),
        bounds: savedRegionBounds
      });
    }
  } catch (error) {
    console.error('处理图像失败:', error);
    if (mainWindow) {
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

// 导航到模块
ipcMain.on('navigate-to-module', (event, module) => {
  navigateToPage(module);
});

// 应用就绪时创建窗口
app.whenReady().then(() => {
  // 加载区域数据
  loadRegionData();
  
  createMainWindow();
  
  // 等待窗口创建完成后再注册快捷键
  setTimeout(() => {
    // 注册全局快捷键 F12 触发识别
    const ret = globalShortcut.register('F12', () => {
      if (savedRegionBounds && mainWindow && !mainWindow.isDestroyed()) {
        // 检查当前是否在科举页面
        const url = mainWindow.webContents.getURL();
        if (url.includes('examination.html')) {
          // 触发识别（通过 IPC 事件）
          mainWindow.webContents.send('trigger-recognize');
        }
      }
    });
    
    if (ret) {
      console.log('F12 快捷键已注册');
    } else {
      console.log('F12 快捷键注册失败');
    }
  }, 1000);
});

// 应用退出时注销快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
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

