const clientChannelTag = '__client_channel__'
const clientChannelCallTag = '__client_channel_call__'
const clientChannelCallbackTag = '__client_channel_callback__'
const ClientChannelScript = `
  class ClientChannel {
    constructor() {
      this.identifierMap = new Map()
      this.call = this.call.bind(this)
      this.callback = this.callback.bind(this)
      this.listence = this.listence.bind(this)
      this.generateIdentifier = this.generateIdentifier.bind(this)
    }

    call(funcName, ...params) {
      console.log('call ', funcName, ...params)
      return new Promise((resolve, reject) => {
        // 构建唯一 identifier
        const identifier = this.generateIdentifier(46)
        // 发送执行请求
        window.postMessage(funcName, identifier, ...params)
        // 监听返回
        this.listence(identifier, (state, ...params) => {
          if (state === 'resolve') {
            resolve(...params)
          }
          if (state === 'reject') {
            reject(...params)
          }
        })
      })
    }

    // 监听
    listence(identifier, callback) {
      console.log('listence', identifier)
      if (!this.identifierMap.get(identifier)) {
        this.identifierMap.set(identifier, new Map())
      }
      // 获取 callbackMap
      const callbackMap = this.identifierMap.get(identifier)
      const callbackIdentifier = this.generateIdentifier(46)
      // 添加回调
      callbackMap.set(callbackIdentifier, callback)
      // 返回注销器
      return () => { callbackMap.delete(callbackIdentifier) }
    }

    // 回调
    callback(identifier, state, params) {
      console.log('callback', identifier, state, params)

      // 拿到所有回调
      const callbackMap = this.identifierMap.get(identifier)

      // 如果没有回调就直接返回
      if (!callbackMap || !callbackMap.size) {
        return
      }

      // 依次执行回调
      callbackMap.forEach((callback, key) => {
        callback(state, params)
      })

      // 清空回调
      callbackMap.delete(identifier)
    }

    // 构造一个随机 generateIdentifier
    generateIdentifier(len) {
      len = len || 32;
      var $chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';    /****默认去掉了容易混淆的字符oOLl,9gq,Vv,Uu,I1****/
      var maxPos = $chars.length;
      var pwd = '';
      for (let i = 0; i < len; i++) {
        pwd += $chars.charAt(Math.floor(Math.random() * maxPos));
      }
      return pwd;
    }
  }
`
// 本方法运行在浏览器端
function initChannel(clientChannelTag, clientChannelCallTag, clientChannelCallbackTag) {
  if (!window) {
    return
  }

  window.addEventListener('load', function () {
    if (window[clientChannelTag]) {
      return console.log('Channel is already initialized!')
    }

    console.log('Channel initialized!')
    window[clientChannelTag] = new ClientChannel()
    window[clientChannelCallTag] = window[clientChannelTag].call
    window[clientChannelCallbackTag] = window[clientChannelTag].callback
  })
}

// 客户端挂载方法 Function
function clientCall(funcName, clientChannelCallTag) {

  if (!window) {
    return console.error('window not defined')
  }

  // 客户端注入方法
  window[funcName] = function (...params) {
    // 使用 channel 的 call 来调用服务端方法
    console.info(`Calling ${funcName}...`)
    return window[clientChannelCallTag](funcName, ...params)
  }

  return console.info(`${funcName} mount completed`)
}

// 服务端挂载方法 Function
export default function mountFunction(webContents, funcName, handler) {

  webContents.insertJS(clientChannelScript)
  webContents.insertJS(`(${String(clientCall)})('${funcName}','${clientChannelCallTag}')`)
  webContents.insertJS(`(${String(initChannel)})('${clientChannelTag}','${clientChannelCallTag}','${clientChannelCallbackTag}')`)

  // 服务端挂载方法 Function
  webContents.on(funcName, (identifier, ...params) => {
    // 如果是一个 Promise
    if (handler && handler instanceof Promise) {
      // 执行方法
      const promise = handler(...params)
      promise.then(res => {
        const script = `window['${clientChannelCallbackTag}']('${identifier}', 'resolve', ${JSON.stringify(res)})`
        webContents.executeJavaScript(script).then(console.log, console.log)
      })
      promise.catch(err => {
        const script = `window['${clientChannelCallbackTag}']('${identifier}', 'reject', ${JSON.stringify(err)})`
        webContents.executeJavaScript(script).then(console.log, console.log)
      })

    } else {
      try {
        // 执行方法
        const res = handler(...params) || void 0
        const script = `window['${this.clientChannelCallbackTag}']('${identifier}', 'resolve', ${JSON.stringify(res)})`
        webContents.executeJavaScript(script).then(console.log, console.log)
      } catch (err) {
        const script = `window['${this.clientChannelCallbackTag}']('${identifier}', 'reject', ${JSON.stringify(err)})`
        webContents.executeJavaScript(script).then(console.log, console.log)
      }
    }
  })
}
