const pluginPath = LiteLoader.plugins["momotalk_theme"].path.plugin

const enableLog = false
const enableError = true
const log = (...args) => {
    if (enableLog) {
        console.log('[momotalk-theme]', ...args)
        momotalk_theme.logToMain(...args)
    }
}

const error = (...args) => {
    if (enableError) {
        console.error('[momotalk-theme]', ...args)
        momotalk_theme.errorToMain(...args)
    }
}

const debounce = (fn, time = 100) => {
    let timer = null
    return (...args) => {
        timer && clearTimeout(timer)
        timer = setTimeout(() => {
            fn.apply(this, args)
        }, time)
    }
}

const waitForEle = (selector, callback, interval = 1000) => {
    const timer = setInterval(() => {
        if (document.querySelector(selector)) {
            log(`waitForEle ${selector} EXIST`)
            if (typeof callback === 'function') {
                callback()
            }
            clearInterval(timer)
        }
    }, interval)
}

class IPC {
    // 获取全部设置
    static async getSetting() {
        try {
            return await momotalk_theme.getSetting()
        } catch (err) {
            error(err.toString())
            error(`getSetting error`)
            return null
        }
    }

    // 告知main更新设置
    static setSetting(k, v) {
        try {
            momotalk_theme.setSetting(k.toString(), v.toString())
        } catch (err) {
            error(err.toString())
            error(`setSetting error`)
        }
    }

    // 选择图片
    static chooseImage() {
        momotalk_theme.chooseImage()
    }

    static debounceSetSetting = debounce((k, v) => {
        this.setSetting(k, v)
    }, 100)

    // 监听设置更新
    static updateSetting() {
        momotalk_theme.updateSetting((event, k, v) => {
            // channel.postMessage({ 'k': k, 'v': v })
            document.body.style.setProperty(k, v)
            // log('updateSetting', k, v)
        })
    }

    // 监听全部设置更新（切换主题）
    static updateAllSetting() {
        momotalk_theme.updateAllSetting(async (event, theme) => {
            log('theme change', theme, 'updateAllCSS start')
            await updateAllCSS()
        })
    }
}

// 更新html body中全部自定义CSS变量
const updateAllCSS = async () => {
    const setting = await IPC.getSetting()
    for (const k in setting) {
        const v = setting[k]['value']
        if (v) {
            // log(`updateAllCSS: ${k}----${v}`)
            document.body.style.setProperty(k, v)
        }
    }
    log('updateAllCSS OK')
}

// 调节会话列表宽度
const adjustContactWidth = () => {
    log('run adjustContactWidth')

    try {
        const layoutAside = document.querySelector('.two-col-layout__aside')
        const layoutMain = document.querySelector('.two-col-layout__main')
        const oldResizeHandler = document.querySelector('.two-col-layout__aside .resize-handler')

        const overrideWidth = () => {
            // 移除默认事件
            const resizeHandler = oldResizeHandler.cloneNode(true)
            oldResizeHandler.parentNode.replaceChild(resizeHandler, oldResizeHandler)

            // 调大默认长度, 重写事件
            layoutAside.style.setProperty('--min-width-aside', '40px')
            layoutAside.style.setProperty('--max-width-aside', '50vw')
            layoutAside.style.setProperty('--drag-width-aside', '300px')
            layoutAside.style.setProperty('--default-width-aside', '300px')
            layoutAside.style.width = '300px'
            layoutAside.style.flexBasis = '300px'

            let isResizing = false
            let startX = 0
            let startWidth = 0

            resizeHandler.addEventListener('mousedown', (event) => {
                isResizing = true
                startX = event.clientX
                startWidth = parseFloat(getComputedStyle(layoutAside).width)
            })

            document.addEventListener('mousemove', (event) => {
                if (!isResizing) {
                    return
                }
                const width = startWidth + event.clientX - startX
                layoutAside.style.flexBasis = width + 'px'
                layoutAside.style.width = width + 'px'
                layoutAside.style.setProperty('--drag-width-aside', `${width}px`)
            })

            document.addEventListener('mouseup', () => {
                if (!isResizing) {
                    return
                }
                isResizing = false
            })
        }

        if (oldResizeHandler && layoutAside && layoutMain) {
            // 等待QQ赋予aside属性
            let count = 0
            const timer = setInterval(() => {
                const computedStyle = window.getComputedStyle(layoutAside)
                if (computedStyle.getPropertyValue('--min-width-aside') || computedStyle.getPropertyValue('--max-width-aside') || computedStyle.getPropertyValue('--drag-width-aside') || computedStyle.getPropertyValue('--default-width-aside')) {
                    // QQ已完成自定义宽度赋值，覆盖掉
                    overrideWidth()
                    clearInterval(timer)
                }
                count++
                if (count > 20) {
                    clearInterval(timer)
                }
            }, 1000)
        }
    } catch (err) {
        error(err.toString())
        error('adjustContactWidth error')
    }
}

// 仿momotalk, 同一个人的消息连起来
const concatBubble = (floatAvatar = true) => {
    const msgList = document.querySelector('#ml-root .ml-list')

    // 记录消息数据（用户名、高度、是否断开等）
    let usernameArr
    let heightArr
    let breakingArr

    if (!msgList) {
        return
    }
    // 在比对过程中记录username和offsetHeight
    const compareTwoMsg = (lower, lowerIndex, upper, upperIndex) => {
        return new Promise((resolve) => {
            try {
                // 检查lower是否包含timeStamp, gray-message
                let isLowerTimestamp = false
                if (lower.querySelector('.gray-tip-message,.message__timestamp')) {
                    resolve()
                    breakingArr[lowerIndex] = true
                    isLowerTimestamp = true
                }
                // 检查upper和lower是否包含撤回, 检测message-container
                if (!lower.querySelector('.message-container')) {
                    resolve()
                    breakingArr[lowerIndex] = true
                    return
                }
                if (!upper.querySelector('.message-container')) {
                    resolve()
                    breakingArr[upperIndex] = true
                    return
                }

                const avatarLower = lower.querySelector('span.avatar-span')
                const avatarUpper = upper.querySelector('span.avatar-span')
                const usernameNodeLower = lower.querySelector('div.user-name')
                const usernameLower = avatarLower.getAttribute('aria-label')
                const usernameUpper = avatarUpper.getAttribute('aria-label')
                const contentLower = lower.querySelector('div.msg-content-container')
                if (!isLowerTimestamp && usernameUpper === usernameLower) {
                    const bubbleLower = lower.querySelector('div.msg-content-container')
                    // 修改顺序
                    
                    // 强制覆盖lower message的margin-bottom
                    lower.style.setProperty('margin-bottom', '5px', 'important')
                    // 隐藏lower头像
                    avatarUpper.style.display = 'none'
                    // lower的username 不显示
                    if (usernameNodeLower) {
                        usernameNodeLower.style.marginBottom = '0'
                        usernameNodeLower.style.display = 'none'
                    }
                    // 更新upper的border-radius
                    if (contentUpper && contentUpper.classList) {
                        if (contentUpper.classList.contains('container--others')) {
                            bubbleUpper.style.borderTopLeftRadius = '8px'
                        } else {
                            bubbleUpper.style.borderTopRightRadius = '8px'
                        }
                    }
                }

                if (floatAvatar) {
                    // 记录用户名和高度数据
                    usernameArr[lowerIndex] = usernameLower ? usernameLower : null
                    usernameArr[upperIndex] = usernameUpper ? usernameUpper : null
                    if (!heightArr[lowerIndex]) {
                        const lowerContainer = lower.querySelector('.message-container')
                        heightArr[lowerIndex] = lowerContainer ? lowerContainer.offsetHeight : 0
                    }
                    if (!heightArr[upperIndex]) {
                        const upperContainer = upper.querySelector('.message-container')
                        heightArr[upperIndex] = upperContainer ? upperContainer.offsetHeight : 0
                    }
                }
                resolve()
            } catch (error) {
                resolve()
            }
        })
    }

    const observer = new MutationObserver(async () => {
        try {
            // 合并消息
            // let concatStart = performance.now()
            let currMsgNodeList = Array.from(msgList.querySelectorAll("div.message"))
            let tasks = []

            usernameArr = new Array(currMsgNodeList.length)
            heightArr = new Array(currMsgNodeList.length).fill(0)
            breakingArr = new Array(currMsgNodeList.length).fill(false)

            for (let i = 0; i < currMsgNodeList.length - 1; i++) {
                tasks.push(compareTwoMsg(currMsgNodeList[i], i, currMsgNodeList[i + 1], i + 1))
            }
            await Promise.allSettled(tasks).then(() => {
                // log(`concatBubble time ${performance.now() - concatStart} ms`)

                if (floatAvatar) {
                    try {
                        // 跨消息头像浮动
                        // const avatarStart = performance.now()
                        // log(usernameArr.toString())
                        // log(heightArr.toString())
                        // log(breakingArr.toString())
                        let start = 0
                        let end = 0
                        for (let i = 1; i < currMsgNodeList.length; i++) {
                            if (usernameArr[i - 1] && usernameArr[i - 1] === usernameArr[i] && !breakingArr[i - 1]) {
                                end = i
                            } else {
                                // 计算start~end区块总高度
                                let totalHeight = 0
                                for (let j = start; j <= end; j++) {
                                    totalHeight += heightArr[j]
                                }
                                // log(usernameArr.slice(start, end + 1).toString())
                                // log(heightArr.slice(start, end + 1).toString())
                                // log(breakingArr.slice(start, end + 1).toString())
                                // log(start, end, totalHeight)
                                // 扩增start的avatar-span高度
                                const avatar = currMsgNodeList[start].querySelector('span.avatar-span')
                                if (totalHeight > 0 && avatar) {
                                    if (!currMsgNodeList[start].querySelector('.message-container--self')) {
                                        avatar.style.height = totalHeight + (end - start) * 3 + 'px'
                                    }
                                }
                                start = i
                                end = i
                            }
                        }
                        // log(`floatAvatar time ${performance.now() - avatarStart} ms`)
                    } catch (errs) {
                    }
                }
            }).catch()
        } catch (err) {
            error(err.toString())
            error('concatBubble error')
        }
    })
    const config = { childList: true }
    observer.observe(msgList, config)
}

// BroadcastChannel，renderer不同页面间通信，用于实时同步设置
const channel = new BroadcastChannel('momotalk_renderer')

// 聊天窗口创建
const onMessageCreate = async () => {
    log('onMessageCreate start')
    // 插入主题CSS
    if (!document.head?.querySelector('.momotalk-css')) {
        const link = document.createElement("link")
        link.type = 'text/css'
        link.rel = 'stylesheet'
        link.classList.add('momotalk-css')
        link.href = `local:///${pluginPath.replaceAll('\\', '/')}/src/style/momotalk.css`
        document.head.appendChild(link)
        log('insert momotalk css, OK')
    }

    // 更新CSS
    waitForEle('main', updateAllCSS)
    // 调节宽度
    waitForEle('.two-col-layout__aside .resize-handler', adjustContactWidth)
    // 拼接气泡
    waitForEle('#ml-root .ml-list', concatBubble)

    // 监听设置更新
    IPC.updateSetting()
    IPC.updateAllSetting()

    channel.onmessage = (event) => {
        if (['#/main/message', '#/main/contact/profile', '#/chat'].includes(location.hash)) {
            try {
                const k = event.data['k']
                const v = event.data['v']
                document.body.style.setProperty(k, v)
                // log('set body style', k, v)
            } catch (err) {
                error(err)
                error('channel.onmessage error')
            }
        }
    }
    log('onMessageCreate, OK')
}

try {
    if (location.pathname === '/renderer/index.html') {
        if (location.hash === "#/blank") {
            navigation.addEventListener("navigatesuccess", () => {
                if (!location.hash.includes('#/setting')) {
                    onMessageCreate()
                }
            }, { once: true })
        } else if (!location.hash.includes('#/setting')) {
            onMessageCreate()
        }
    }

} catch (err) {
    error(err.toString())
    error('main, ERROR')
}

////////////////////////////////////////////////////////////////////////////////////////////////////

// 设置组件：颜色选择
class ColorPickerItem {
    nodeHTML = `
    <setting-item data-direction="row" class="momotalk-color-picker">
        <div class="col-info">
            <div class="info-title">主标题</div>
            <div class="info-description">功能描述</div>
        </div>
        <div class="col-color">
            <input type="color" value="#FFFFFF" class="color-picker">
        </div>
        <div class="col-opacity">
            <input type="range" value="100" min="0" max="100" step="1" class="opacity-picker">
        </div>
        <div class="col-reset">
            <button class="reset-btn" type="button">重置</button>
        </div>
    </setting-item>
    `

    constructor(itemKey, itemValue, defaultValue, title, description) {
        this.itemKey = itemKey
        // value为hex color, 6位or8位, 必须以#开头
        this.itemValue = itemValue
        this.defaultValue = defaultValue
        this.title = title
        this.description = description
    }

    getItem() {
        let nodeEle = document.createElement('div')
        nodeEle.innerHTML = this.nodeHTML.trim()
        nodeEle = nodeEle.querySelector('setting-item')

        const title = nodeEle.querySelector('.info-title')
        const description = nodeEle.querySelector('.info-description')
        const opacityPicker = nodeEle.querySelector('input.opacity-picker')
        const colorPicker = nodeEle.querySelector('input.color-picker')
        const resetBtn = nodeEle.querySelector('button.reset-btn')

        if (!(opacityPicker && colorPicker && title && description && resetBtn)) {
            error('ColorPickerItem getItem querySelector error')
            return undefined
        }
        // 设定文字
        title.innerHTML = this.title
        description.innerHTML = this.description
        // 设定colorPicker初始值
        const hexColor = this.itemValue.slice(0, 7)
        const hexColorDefault = this.defaultValue.slice(0, 7)
        colorPicker.setAttribute('value', hexColor)
        colorPicker.setAttribute('defaultValue', hexColorDefault)
        // 设定opacityPicker初始值
        let opacity = this.itemValue.slice(7, 9)
        if (!opacity) {
            opacity = 'ff'
        }
        let opacityDefault = this.defaultValue.slice(7, 9)
        if (!opacityDefault) {
            opacityDefault = 'ff'
        }
        opacityPicker.setAttribute('value', `${parseInt(opacity, 16) / 255 * 100}`)
        opacityPicker.setAttribute('defaultValue', `${parseInt(opacityDefault, 16) / 255 * 100}`)
        opacityPicker.style.setProperty('--opacity-0', `${hexColor}00`)
        opacityPicker.style.setProperty('--opacity-100', `${hexColor}ff`)

        // 监听颜色修改
        colorPicker.addEventListener('input', (event) => {
            const hexColor = event.target.value.toLowerCase()
            const numOpacity = opacityPicker.value
            const hexOpacity = Math.round(numOpacity / 100 * 255).toString(16).padStart(2, '0').toLowerCase()

            // 设定透明度bar的透明色和不透明色
            opacityPicker.style.setProperty('--opacity-0', `${hexColor}00`)
            opacityPicker.style.setProperty('--opacity-100', `${hexColor}ff`)
            // 修改message页面的body style
            const colorWithOpacity = hexColor + hexOpacity
            channel.postMessage({ 'k': this.itemKey, 'v': colorWithOpacity })
            // 保存设置
            IPC.debounceSetSetting(this.itemKey, colorWithOpacity)
            // log(`colorPicker set body style, ${this.itemKey} : ${colorWithOpacity}`)
        })

        // 监听透明度修改
        opacityPicker.addEventListener('input', (event) => {
            const numOpacity = event.target.value
            const hexOpacity = Math.round(numOpacity / 100 * 255).toString(16).padStart(2, '0').toLowerCase()

            // 设定透明度bar的透明色和不透明色
            const hexColor = colorPicker.value.toLowerCase()
            opacityPicker.style.setProperty('--opacity-0', `${hexColor}00`)
            opacityPicker.style.setProperty('--opacity-100', `${hexColor}ff`)
            // 修改message页面的body style
            const colorWithOpacity = hexColor + hexOpacity
            channel.postMessage({ 'k': this.itemKey, 'v': colorWithOpacity })
            // 保存设置
            IPC.debounceSetSetting(this.itemKey, colorWithOpacity)
            // log(`colorPicker set body style, ${this.itemKey} : ${colorWithOpacity}`)
        })

        // 监听重置
        resetBtn.onclick = () => {
            opacityPicker.value = opacityPicker.getAttribute('defaultValue')
            colorPicker.value = colorPicker.getAttribute('defaultValue')
            const event = new Event('input', { bubbles: true });
            opacityPicker.dispatchEvent(event);
            colorPicker.dispatchEvent(event);
        }

        return nodeEle
    }
}

// 设置组件：文字输入框
class TextItem {
    nodeHTML = `
    <setting-item data-direction="row" class="momotalk-text-input">
        <div class="col-info">
            <div class="info-title">主标题</div>
            <div class="info-description">功能描述</div>
        </div>
        <div class="col-text">
            <input type="text" value="" class="text-input">
        </div>
        <div class="col-reset">
            <button class="reset-btn" type="button">重置</button>
        </div>
    </setting-item>
    `

    constructor(itemKey, itemValue, defaultValue, title, description) {
        this.itemKey = itemKey
        this.itemValue = itemValue
        this.defaultValue = defaultValue
        this.title = title
        this.description = description
    }

    getItem() {
        let nodeEle = document.createElement('div')
        nodeEle.innerHTML = this.nodeHTML.trim()
        nodeEle = nodeEle.querySelector('setting-item')

        const title = nodeEle.querySelector('.info-title')
        const description = nodeEle.querySelector('.info-description')
        const textInput = nodeEle.querySelector('input.text-input')
        const resetBtn = nodeEle.querySelector('button.reset-btn')

        if (!(textInput && title && description && resetBtn)) {
            error('TextItem getItem querySelector error')
            return undefined
        }
        title.innerHTML = this.title
        description.innerHTML = this.description
        textInput.setAttribute('value', this.itemValue)
        textInput.setAttribute('defaultValue', this.defaultValue)

        // 监听输入
        textInput.addEventListener('input', (event) => {
            const newValue = event.target.value
            // 修改message页面的body style
            channel.postMessage({ 'k': this.itemKey, 'v': newValue })
            // 保存设置
            IPC.debounceSetSetting(this.itemKey, newValue)
            // log(`textInput set body style, ${this.itemKey} : ${newValue}`)
        })

        // 监听重置
        resetBtn.onclick = () => {
            textInput.value = textInput.getAttribute('defaultValue')
            const event = new Event('input', { bubbles: true });
            textInput.dispatchEvent(event);
        }
        return nodeEle
    }
}

// 设置组件：图片选择按钮
class ImageBtnItem {
    nodeHTML = `
    <setting-item data-direction="row" class="momotalk-button">
        <div class="col-info">
            <div class="info-title">主标题</div>
            <div class="info-description">功能描述</div>
        </div>
        <div class="col-button">
            <button class="image-btn" type="button">选择图片</button>
        </div>
    </setting-item>
    `

    constructor(itemKey, title, description, callback) {
        this.itemKey = itemKey
        this.title = title
        this.description = description
        this.callback = callback
    }

    getItem() {
        let nodeEle = document.createElement('div')
        nodeEle.innerHTML = this.nodeHTML.trim()
        nodeEle = nodeEle.querySelector('setting-item')

        const title = nodeEle.querySelector('.info-title')
        const description = nodeEle.querySelector('.info-description')
        const button = nodeEle.querySelector('button.image-btn')

        if (!(button && title && description)) {
            error('ImageBtnItem getItem querySelector error')
            return undefined
        }
        title.innerHTML = this.title
        description.innerHTML = this.description
        button.onclick = () => {
            this.callback()
        }

        return nodeEle
    }
}

// 设置组件：一组item
class SettingList {
    nodeHTML = `
    <setting-list data-direction="column" is-collapsible="" data-title="">
    </setting-list>
    `

    constructor(listTitle, settingItems = []) {
        this.listTitle = listTitle
        this.settingItems = settingItems
    }

    createNode(view) {
        let nodeEle = document.createElement('div')
        nodeEle.innerHTML = this.nodeHTML
        nodeEle = nodeEle.querySelector('setting-list')
        nodeEle.setAttribute('data-title', this.listTitle)

        this.settingItems.forEach((item) => {
            nodeEle.appendChild(item)
        })
        view.appendChild(nodeEle)
    }
}

// 创建设置页流程
const onSettingCreate = async (view) => {
    try {
        // 插入设置页CSS
        if (!view.querySelector('.momotalk-setting-css')) {
            const link = document.createElement('link')
            link.type = 'text/css'
            link.rel = 'stylesheet'
            link.classList.add('momotalk-setting-css')
            link.href = `local:///${pluginPath.replaceAll('\\', '/')}/src/style/momotalk-setting.css`
            view.appendChild(link)
        }

        // 获取设置，创建item列表
        const setting = await IPC.getSetting()
        if (!setting || setting.length === 0) {
            throw Error('getSetting error')
        }
        const settingItemLists = {
            '壁纸设定': [],
            '自己的消息': [],
            '他人的消息': [],
            '会话列表': [],
            '侧边栏': [],
            '其他设定': [],
        }
        for (const key in setting) {
            const v = setting[key]
            const value = v['value']
            const title = v['title']
            const defaultValue = v['defaultValue']
            const description = v['description']
            const type = v['type']
            const group = v['group']

            if (type === 'color') {
                const colorPickerItem = new ColorPickerItem(key, value, defaultValue, title, description).getItem()
                if (colorPickerItem) {
                    settingItemLists[group]?.push(colorPickerItem)
                }
            } else if (type === 'text') {
                const textInputItem = new TextItem(key, value, defaultValue, title, description).getItem()
                if (textInputItem) {
                    settingItemLists[group]?.push(textInputItem)
                }
            } else if (type === 'button') {
                const imageBtnItem = new ImageBtnItem(key, title, description, () => {
                    IPC.chooseImage()
                }).getItem()
                if (imageBtnItem) {
                    settingItemLists[group]?.push(imageBtnItem)
                }
            }
        }

        for (const listTitle in settingItemLists) {
            new SettingList(listTitle, settingItemLists[listTitle]).createNode(view)
            log(`create list ${listTitle}, ${settingItemLists[listTitle].length} items`)
        }
    } catch (err) {
        error(err)
        error('onSettingCreate, error')
    }
}

// 打开设置界面时触发
export const onSettingWindowCreated = view => {
    onSettingCreate(view)
}
